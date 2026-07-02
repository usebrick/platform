import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import type { Category, FileScanResult, ProjectReport, ResolvedConfig, Severity } from '../types';

export const TELEMETRY_DIR = join('.slopbrick', 'flywheel');
export const TELEMETRY_FILE = 'scans.jsonl';
const MAX_TELEMETRY_BYTES = 10 * 1024 * 1024;
const MAX_ROTATED_FILES = 5;

function telemetryPath(cwd: string): string {
  return join(cwd, TELEMETRY_DIR, TELEMETRY_FILE);
}

function hashString(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function safeRelative(cwd: string, filePath: string): string {
  try {
    return relative(cwd, filePath);
  } catch {
    return filePath;
  }
}

export interface TelemetryPayload {
  timestamp: string;
  version: string;
  project: {
    componentCount: number;
    slopIndex: number;
    assemblyHealth: number;
    categoryScores: Record<Category, number>;
    p90Score: number;
    peakScore: number;
    framework?: string;
  };
  violations: Array<{
    ruleId: string;
    category: Category;
    severity: Severity;
    count: number;
  }>;
  files: Array<{
    hash: string;
    score: number;
    ruleIds: string[];
  }>;
}

function aggregateViolations(report: ProjectReport): TelemetryPayload['violations'] {
  const counts = new Map<string, { category: Category; severity: Severity; count: number }>();
  for (const issue of report.issues) {
    const existing = counts.get(issue.ruleId);
    if (existing) {
      existing.count++;
    } else {
      counts.set(issue.ruleId, {
        category: issue.category,
        severity: issue.severity,
        count: 1,
      });
    }
  }
  return [...counts.entries()]
    .map(([ruleId, meta]) => ({ ruleId, ...meta }))
    .sort((a, b) => b.count - a.count || a.ruleId.localeCompare(b.ruleId));
}

function buildFileRecords(
  cwd: string,
  report: ProjectReport,
  results: FileScanResult[],
): TelemetryPayload['files'] {
  const scoreByPath = new Map<string, number>();
  for (const component of report.components) {
    scoreByPath.set(component.filePath, component.adjustedScore);
  }

  const records: TelemetryPayload['files'] = [];
  for (const result of results) {
    const score = scoreByPath.get(result.filePath) ?? 0;
    const ruleIds = [...new Set(result.issues.map((issue) => issue.ruleId))];
    if (score <= 0 && ruleIds.length === 0) {
      continue;
    }
    records.push({
      hash: hashString(safeRelative(cwd, result.filePath)),
      score,
      ruleIds,
    });
  }
  return records;
}

function isTelemetryFile(name: string): boolean {
  return name.endsWith('.jsonl') && name.startsWith('scans');
}

function rotateTelemetry(cwd: string): void {
  const path = telemetryPath(cwd);
  if (!existsSync(path)) {
    return;
  }
  const stats = statSync(path);
  if (stats.size < MAX_TELEMETRY_BYTES) {
    return;
  }

  const dir = dirname(path);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  renameSync(path, join(dir, `scans-${timestamp}.jsonl`));

  const rotated = readdirSync(dir)
    .filter(isTelemetryFile)
    .map((name) => ({ name, mtime: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => a.mtime - b.mtime);

  while (rotated.length > MAX_ROTATED_FILES) {
    const oldest = rotated.shift();
    if (oldest) {
      rmSync(join(dir, oldest.name), { force: true });
    }
  }
}

export function readTelemetry(cwd: string): TelemetryPayload[] {
  const dir = join(cwd, TELEMETRY_DIR);
  if (!existsSync(dir)) {
    return [];
  }

  const files = readdirSync(dir)
    .filter(isTelemetryFile)
    .sort()
    .map((name) => join(dir, name));

  const payloads: TelemetryPayload[] = [];
  for (const file of files) {
    const raw = readFileSync(file, 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        payloads.push(JSON.parse(trimmed) as TelemetryPayload);
      } catch {
        // Ignore corrupt lines.
      }
    }
  }
  return payloads;
}

export function recordTelemetry(
  cwd: string,
  report: ProjectReport,
  results: FileScanResult[],
  config: ResolvedConfig,
): TelemetryPayload | undefined {
  if (config.telemetry === false) {
    return undefined;
  }

  const payload: TelemetryPayload = {
    timestamp: report.generatedAt,
    version: report.version,
    project: {
      componentCount: report.componentCount,
      // v0.15.0 U.4+: slopIndex is deprecated; the telemetry field is
      // still named slopIndex for backward compat with historical
      // payloads, but the value is now aiSlopScore (0-100, higher is
      // better).
      slopIndex: report.aiSlopScore,
      assemblyHealth: report.assemblyHealth,
      categoryScores: { ...report.categoryScores },
      p90Score: report.p90Score,
      peakScore: report.peakScore,
      framework: config.framework,
    },
    violations: aggregateViolations(report),
    files: buildFileRecords(cwd, report, results),
  };

  const path = telemetryPath(cwd);
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  rotateTelemetry(cwd);
  appendFileSync(path, JSON.stringify(payload) + '\n', 'utf-8');
  return payload;
}
