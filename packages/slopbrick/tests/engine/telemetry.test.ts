import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordTelemetry, readTelemetry, TELEMETRY_DIR, TELEMETRY_FILE } from '../../src/engine/telemetry';
import type { FileScanResult, ProjectReport, ResolvedConfig } from '../../src/types';

function makeResult(filePath: string, issues: FileScanResult['issues'] = []): FileScanResult {
  return {
    filePath,
    componentCount: 1,
    issues,
    gapValues: [],
    styleSources: [],
  };
}

function makeReport(overrides: Partial<ProjectReport> = {}): ProjectReport {
  return {
    version: '0.6.0',
    generatedAt: '2026-06-17T00:00:00.000Z',
    aiQuality: 5, engineeringHygiene: 5, security: 5, repositoryHealth: 5,
    assemblyHealth: 95,
    totalScore: 5,
    categoryScores: {
      visual: 0,
      typo: 0,
      wcag: 5,
      layout: 0,
      component: 0,
      logic: 0,
      arch: 0,
      perf: 0,
      security: 0,      test: 0,    docs: 0,    db: 0,    ai: 0,    context: 0,    product: 0,    i18n: 0,},
    p90Score: 10,
    peakScore: 20,
    boundaryScore: 0,
    contextScore: 0,
    visualScore: 0,
    componentCount: 2,
    fileCount: 1,
    thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
    components: [
      { filePath: '/project/src/A.tsx', rawScore: 5, componentScore: 10, adjustedScore: 10, componentCount: 1 },
      { filePath: '/project/src/B.tsx', rawScore: 0, componentScore: 0, adjustedScore: 0, componentCount: 1 },
    ],
    issues: [
      {
        ruleId: 'wcag/target-size',
        category: 'wcag',
        severity: 'high',
        aiSpecific: false,
        filePath: '/project/src/A.tsx',
        message: 'target size issue',
        line: 10,
        column: 5,
      },
    ],
    ...overrides,
  };
}

const baseConfig: ResolvedConfig = {
  framework: 'react',
  include: [],
  exclude: [],
  rules: { 'wcag/target-size': 'high' },
  frameworkMultipliers: {},
  ruleConfig: {},
  thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
  arbitraryValueAllowlist: [],
  wcag: { targetSizeExemptSelectors: [] },
};

describe('telemetry', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'slopbrick-telemetry-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('writes an anonymized scan payload to the flywheel JSONL file', () => {
    const report = makeReport();
    const results = [
      makeResult('/project/src/A.tsx', report.issues),
      makeResult('/project/src/B.tsx'),
    ];

    const payload = recordTelemetry(cwd, report, results, baseConfig);
    expect(payload).toBeDefined();

    const logPath = join(cwd, TELEMETRY_DIR, TELEMETRY_FILE);
    const lines = readFileSync(logPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.version).toBe('0.6.0');
    expect(parsed.project.componentCount).toBe(2);
    expect(parsed.project.framework).toBe('react');
    expect(parsed.project.slopIndex).toBe(5);
    expect(parsed.violations).toEqual([
      { ruleId: 'wcag/target-size', category: 'wcag', severity: 'high', count: 1 },
    ]);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0].score).toBe(10);
    expect(parsed.files[0].ruleIds).toEqual(['wcag/target-size']);
    expect(typeof parsed.files[0].hash).toBe('string');
    expect(parsed.files[0].hash.length).toBe(16);
  });

  it('appends subsequent scans to the same JSONL file', () => {
    const report1 = makeReport();
    const report2 = makeReport({ generatedAt: '2026-06-17T01:00:00.000Z' });
    const results = [makeResult('/project/src/A.tsx', report1.issues), makeResult('/project/src/B.tsx')];

    recordTelemetry(cwd, report1, results, baseConfig);
    recordTelemetry(cwd, report2, results, baseConfig);

    const logPath = join(cwd, TELEMETRY_DIR, TELEMETRY_FILE);
    const lines = readFileSync(logPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
  });

  it('skips writing when telemetry is disabled', () => {
    const report = makeReport();
    const results = [makeResult('/project/src/A.tsx')];
    const config: ResolvedConfig = { ...baseConfig, telemetry: false };

    const payload = recordTelemetry(cwd, report, results, config);
    expect(payload).toBeUndefined();

    const logPath = join(cwd, TELEMETRY_DIR, TELEMETRY_FILE);
    expect(() => readFileSync(logPath, 'utf-8')).toThrow();
  });

  it('creates the flywheel directory when missing', () => {
    const report = makeReport();
    const results = [makeResult('/project/src/A.tsx')];

    recordTelemetry(cwd, report, results, baseConfig);

    const logPath = join(cwd, TELEMETRY_DIR, TELEMETRY_FILE);
    expect(readFileSync(logPath, 'utf-8').trim()).toBeTruthy();
  });

  it('reads back telemetry payloads', () => {
    const report1 = makeReport();
    const report2 = makeReport({ generatedAt: '2026-06-17T02:00:00.000Z', slopIndex: 7 });
    const results = [makeResult('/project/src/A.tsx', report1.issues), makeResult('/project/src/B.tsx')];

    recordTelemetry(cwd, report1, results, baseConfig);
    recordTelemetry(cwd, report2, results, baseConfig);

    const payloads = readTelemetry(cwd);
    expect(payloads).toHaveLength(2);
    expect(payloads[0].project.slopIndex).toBe(5);
    expect(payloads[1].project.slopIndex).toBe(7);
  });

  it('rotates the telemetry file when it exceeds the size cap', () => {
    const report = makeReport();
    const results = [makeResult('/project/src/A.tsx', report.issues), makeResult('/project/src/B.tsx')];

    // Pre-fill the log to just under the cap so the next append triggers rotation.
    const logPath = join(cwd, TELEMETRY_DIR, TELEMETRY_FILE);
    mkdirSync(join(cwd, TELEMETRY_DIR), { recursive: true });
    const filler = ' '.repeat(10 * 1024 * 1024 - 1);
    writeFileSync(logPath, `${filler}\n`, 'utf-8');

    recordTelemetry(cwd, report, results, baseConfig);

    const dir = join(cwd, TELEMETRY_DIR);
    const files = readdirSync(dir).filter((name) => name.endsWith('.jsonl'));
    expect(files.length).toBeGreaterThanOrEqual(2);
    const current = readFileSync(logPath, 'utf-8').trim();
    expect(current).toContain('"version":"0.6.0"');
  });
});
