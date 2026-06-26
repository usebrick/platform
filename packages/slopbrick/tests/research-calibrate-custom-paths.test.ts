// v0.5.2: smoke test for calibrate with custom positive/negative dirs.
//
// Verifies that `research calibrate --positive-dir <p> --negative-dir <n>`
// works with paths outside the default baseline location.

import { describe, expect, it } from 'vitest';
import { calibrate } from '../src/research/calibrator';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('research calibrate — custom corpus paths (v0.5.2)', () => {
  it('accepts custom positive and negative directories', async () => {
    // Build minimal corpora in temp dirs.
    const tmp = mkdtempSync(join(tmpdir(), 'slopbrick-cal-'));
    const positiveDir = join(tmp, 'pos');
    const negativeDir = join(tmp, 'neg');
    mkdirSync(positiveDir, { recursive: true });
    mkdirSync(negativeDir, { recursive: true });
    // Write positive (AI-like: hardcoded color, arbitrary spacing) and
    // negative (human-like: tokenized) files so at least one rule fires.
    for (let i = 0; i < 5; i++) {
      writeFileSync(
        join(positiveDir, `ai-${i}.tsx`),
        `export const C${i} = () => <div style={{ padding: '13px', background: '#3b82f6', borderRadius: '7px' }}>x</div>;`,
      );
      writeFileSync(
        join(negativeDir, `human-${i}.tsx`),
        `export const C${i} = () => <div className="p-4 bg-primary rounded-md">x</div>;`,
      );
    }
    try {
      const report = await calibrate(tmp, {
        positiveDir,
        negativeDir,
        positiveLimit: 3,
        negativeLimit: 3,
      });
      expect(report.positiveFileCount).toBe(3);
      expect(report.negativeFileCount).toBe(3);
      expect(Array.isArray(report.rules)).toBe(true);
      expect(report.rules.length).toBeGreaterThan(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);

  it('throws a clear error when a custom corpus path does not exist', async () => {
    await expect(
      calibrate('/tmp', {
        positiveDir: '/tmp/__definitely_missing_positive__',
        negativeDir: '/tmp/__definitely_missing_negative__',
      }),
    ).rejects.toThrow(/not found/);
  });
});