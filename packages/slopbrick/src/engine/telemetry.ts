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
import type { MemoryPatternInventory, MemoryPatternMatch } from '@usebrick/engine';

export const TELEMETRY_DIR = join('.slopbrick', 'flywheel');
export const TELEMETRY_FILE = 'scans.jsonl';
const MAX_TELEMETRY_BYTES = 10 * 1024 * 1024;
const MAX_ROTATED_FILES = 5;
// v0.41.0 (Sprint 2, task 2a.1): cap the per-category pattern-name
// list inside the inventory summary to keep individual JSONL lines
// bounded. The full list survives in `.slopbrick/inventory.json`;
// this is just enough state for `slopbrick drift --since <date>`
// to compute set-diffs without re-scanning. The cap of 50 was
// chosen so a worst-case inventory (50 patterns × 8 categories)
// adds ~10 KiB per JSONL line — well within the 10 MiB rotation
// budget for the 2116+-scan corpus.
const TELEMETRY_INVENTORY_NAME_CAP = 50;

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
  /**
   * v0.41.0 (Sprint 2, task 2a.1): one-line inventory summary per
   * scan. Lets `slopbrick drift --since <date>` answer "which
   * patterns were introduced or removed since the baseline"
   * without re-running a scan, because `scans.jsonl` carries
   * enough state to compute the set diff directly. The schema is
   * **additive** — payloads written by v0.40.x readers will
   * simply omit this field; readers (e.g. `runDriftOverTime` in
   * Sprint 2a.2/2a.5) must `?.` it.
   *
   * Shape: a per-category count plus a sorted, deduplicated
   * name list. `patternNames` is capped at 50 entries per
   * category (see `TELEMETRY_INVENTORY_NAME_CAP`) to keep
   * telemetry line size bounded.
   */
  inventory?: TelemetryInventorySummary;
}

/**
 * Per-scan inventory summary carried in `scans.jsonl`. Distinct
 * from `.slopbrick/inventory.json`, which is the full
 * `InventoryFile` (includes per-component fingerprints). The
 * telemetry summary is intentionally tiny — pattern names per
 * category — so 2116+ historical scans (the v0.41.0 corpus)
 * stay under ~10 MiB before rotation.
 */
export interface TelemetryInventorySummary {
  /**
   * Number of files scanned for the inventory. May be lower than
   * `project.componentCount` if discovery filtered out non-source
   * files.
   */
  scannedFiles: number;
  /**
   * Distinct pattern count per category. Categories with zero
   * patterns are omitted to keep the JSON compact.
   */
  patternCounts: Record<string, number>;
  /**
   * Distinct pattern names per category, sorted lexicographically
   * for stable diffs. Capped at 50 entries per category to
   * bound telemetry line size; the full list survives in
   * `.slopbrick/inventory.json`.
   */
  patternNames: Record<string, string[]>;
}

/**
 * Project the full `MemoryPatternInventory` down to a compact
 * summary suitable for a telemetry JSONL line. The projection is
 * deterministic: `patternNames` is sorted lexicographically and
 * the iteration order of `patternCounts` / `patternNames` keys
 * preserves the order of `Object.entries(inventory.patterns)`
 * (V8 preserves insertion order for string keys).
 *
 * Categories with zero patterns are **omitted entirely** from both
 * `patternCounts` and `patternNames` — a project with 0 modals
 * and 1 button doesn't pay for the empty `modal` entry on every
 * scan. This keeps the JSONL line size bounded across the 2116+
 * historical scans in the v0.41.0 corpus.
 */
export function buildInventorySummary(
  inventory: MemoryPatternInventory,
): TelemetryInventorySummary {
  const patternCounts: Record<string, number> = {};
  const patternNames: Record<string, string[]> = {};
  for (const [category, matches] of Object.entries(inventory.patterns) as Array<
    [keyof MemoryPatternInventory['patterns'], ReadonlyArray<MemoryPatternMatch>]
  >) {
    if (matches.length === 0) continue;
    const names = Array.from(new Set(matches.map((m) => m.name))).sort();
    patternCounts[category] = names.length;
    patternNames[category] = names.slice(0, TELEMETRY_INVENTORY_NAME_CAP);
  }
  return {
    scannedFiles: inventory.scannedFiles,
    patternCounts,
    patternNames,
  };
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
  // v0.41.0 (Sprint 2, task 2a.1): when the caller has already
  // computed the pattern inventory (persistRun.ts does, via
  // `buildPatternInventory`), pass it in so the telemetry payload
  // gets a compact per-category pattern summary. Optional: callers
  // without an inventory (mostly tests) get the legacy shape
  // unchanged — `payload.inventory` stays undefined and the JSONL
  // line omits the field.
  inventory?: MemoryPatternInventory,
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
      // payloads, but the value is now aiSlopScore (raw slop amount,
      // 0-100; lower is better).
      slopIndex: report.aiSlopScore,
      assemblyHealth: report.assemblyHealth,
      categoryScores: { ...report.categoryScores },
      p90Score: report.p90Score,
      peakScore: report.peakScore,
      framework: config.framework,
    },
    violations: aggregateViolations(report),
    files: buildFileRecords(cwd, report, results),
    // v0.41.0 (Sprint 2, task 2a.1): the inventory summary is
    // additive — omitting it (legacy callers) keeps the JSONL line
    // shape identical to v0.40.x payloads, so old readers stay
    // green. New readers (`slopbrick drift --since <date>` in
    // Sprint 2a.2) treat the field as optional and fall back to
    // a re-scan when it's missing.
    ...(inventory ? { inventory: buildInventorySummary(inventory) } : {}),
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
