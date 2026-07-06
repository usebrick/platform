import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  runMaintenanceCostScan,
  formatMaintenanceCostReport,
  maintenanceCostExitCode,
  type MaintenanceCostScanResult,
} from '../../src/cli/maintenance-cost';

const execFileAsync = promisify(execFile);
const BIN = join(process.cwd(), 'bin', 'slopbrick.js');

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-maint-cost-'));
}

function writeFile(dir: string, rel: string, content: string): string {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf-8');
  return full;
}

function stubResult(): MaintenanceCostScanResult {
  // Hand-build a low-bucket result so the exit-code tests don't have
  // to run a real scan. Mirrors the shape produced by
  // `runMaintenanceCostScan` after the engine aggregation.
  return {
    result: {
      cost: 'low',
      health: 92,
      monthlyUSD: 350,
      axes: [
        { axis: 'slopIndex', label: 'AI Slop Score (raw)', health: 95, source: '100 - aiSlopScore (5.0) → inverted to cleanliness' },
        { axis: 'architectureConsistency', label: 'Architecture Consistency', health: 100, source: 'direct' },
        { axis: 'aiSecurityRisk', label: 'AI Security Risk', health: 100, source: 'low → 100' },
        { axis: 'constitutionDrift', label: 'Constitution Drift', health: 100, source: 'default' },
        { axis: 'designTokenDrift', label: 'Design Token Drift', health: 100, source: 'default' },
        { axis: 'highSeverityPenalty', label: 'High-Severity Issues', health: 100, source: 'no high-severity' },
      ],
      advice: 'Maintenance cost is low. Continue current practices; revisit quarterly.',
    },
    scan: {} as never,
  };
}

describe('maintenanceCostExitCode', () => {
  it('exits 0 in the low bucket regardless of --strict', () => {
    const r = stubResult();
    r.result.cost = 'low';
    expect(maintenanceCostExitCode(r, { strict: true })).toBe(0);
    expect(maintenanceCostExitCode(r, { strict: false })).toBe(0);
  });

  it('exits 0 in the medium bucket without --strict', () => {
    const r = stubResult();
    r.result.cost = 'medium';
    expect(maintenanceCostExitCode(r, { strict: false })).toBe(0);
  });

  it('exits 0 in the medium bucket with --strict (per the spec)', () => {
    const r = stubResult();
    r.result.cost = 'medium';
    // Medium is informational even with --strict — only high/critical fail
    expect(maintenanceCostExitCode(r, { strict: true })).toBe(0);
  });

  it('exits 1 in the high bucket with --strict', () => {
    const r = stubResult();
    r.result.cost = 'high';
    expect(maintenanceCostExitCode(r, { strict: true })).toBe(1);
  });

  it('exits 1 in the critical bucket with --strict', () => {
    const r = stubResult();
    r.result.cost = 'critical';
    expect(maintenanceCostExitCode(r, { strict: true })).toBe(1);
  });

  it('exits 0 in the high bucket without --strict', () => {
    const r = stubResult();
    r.result.cost = 'high';
    expect(maintenanceCostExitCode(r, { strict: false })).toBe(0);
  });
});

describe('formatMaintenanceCostReport', () => {
  it('pretty output includes the bucket, health, USD estimate, and per-axis breakdown', () => {
    const r = stubResult();
    const out = formatMaintenanceCostReport(r);
    expect(out).toMatch(/AI Maintenance Cost:\s*LOW/);
    expect(out).toMatch(/health 92\/100/);
    expect(out).toMatch(/~\$350\/month/);
    expect(out).toMatch(/AI Slop Score/);
    expect(out).toMatch(/Architecture Consistency/);
    expect(out).toMatch(/AI Security Risk/);
    expect(out).toMatch(/Constitution Drift/);
    expect(out).toMatch(/Design Token Drift/);
  });

  it('JSON output has all required fields', () => {
    const r = stubResult();
    const json = JSON.parse(formatMaintenanceCostReport(r, { json: true })) as Record<string, unknown>;
    expect(json.cost).toBe('low');
    expect(json.health).toBe(92);
    expect(json.monthlyUSD).toBe(350);
    expect(Array.isArray(json.axes)).toBe(true);
    expect((json.axes as unknown[]).length).toBe(6);
    expect(typeof json.advice).toBe('string');
  });
});

describe('runMaintenanceCostScan', () => {
  it('end-to-end via CLI binary on a tiny fixture', async () => {
    const dir = freshDir();
    try {
      // Tiny "messy" file — slopIndex will be high → cost lands in high/critical
      writeFile(
        dir,
        'src/foo.tsx',
        `import React from 'react';
export const Foo = () => {
  return <div className="p-[13px] m-[7px] rounded-[3px] bg-[#abc]" style={{position:'absolute',left:13,top:13}}>
    <span style={{color:'#fff',fontSize:13}}>x</span>
  </div>;
};
`,
      );
      writeFile(dir, 'slopbrick.config.mjs', `export default { include: ['src/**/*'], exclude: [] };`);
      const { exitCode, stdout } = await execFileAsync('node', [BIN, 'maintenance-cost'], { cwd: dir })
        .then((r) => ({ exitCode: 0, stdout: r.stdout, stderr: r.stderr }))
        .catch((err: { code?: number; stdout?: string; stderr?: string }) => ({
          exitCode: err.code ?? 1,
          stdout: err.stdout ?? '',
          stderr: err.stderr ?? '',
        }));
      // We just check the format is right — the bucket depends on the
      // engine's interpretation of the fixture, which can change.
      expect(stdout).toMatch(/AI Maintenance Cost:/);
      expect(stdout).toMatch(/health \d+\/100/);
      expect(stdout).toMatch(/\/month/);
      // Per-axis breakdown lines
      expect(stdout).toMatch(/AI Slop Score/);
      expect(stdout).toMatch(/Architecture Consistency/);
      expect(stdout).toMatch(/AI Security Risk/);
      // exit code is 0 (informational) or 1 (with --strict) — not 2
      expect([0, 1]).toContain(exitCode);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);

  it('emits valid JSON with --format json', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/foo.ts', `export const x = 1;\n`);
      writeFile(dir, 'slopbrick.config.mjs', `export default { include: ['src/**/*'], exclude: [] };`);
      const { exitCode, stdout } = await execFileAsync(
        'node',
        [BIN, 'maintenance-cost', '--format', 'json'],
        { cwd: dir },
      )
        .then((r) => ({ exitCode: 0, stdout: r.stdout, stderr: r.stderr }))
        .catch((err: { code?: number; stdout?: string; stderr?: string }) => ({
          exitCode: err.code ?? 1,
          stdout: err.stdout ?? '',
          stderr: err.stderr ?? '',
        }));
      const parsed = JSON.parse(stdout) as {
        cost: string;
        health: number;
        monthlyUSD: number;
        axes: unknown[];
        advice: string;
      };
      expect(['low', 'medium', 'high', 'critical']).toContain(parsed.cost);
      expect(parsed.health).toBeGreaterThanOrEqual(0);
      expect(parsed.health).toBeLessThanOrEqual(100);
      expect(parsed.monthlyUSD).toBeGreaterThanOrEqual(0);
      expect(parsed.axes.length).toBe(6);
      expect(typeof parsed.advice).toBe('string');
      expect([0, 1]).toContain(exitCode);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});
