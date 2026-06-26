import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);
const BIN = join(process.cwd(), 'bin', 'slopbrick.js');

import {
  loadSignalStrength,
  getSignalStrength,
  isReliableSignal,
} from '../src/rules/signal-strength';
import type { Issue } from '../src/types';

describe('signal-strength loader', () => {
  it('loads the checked-in metadata for at least 20 rules', () => {
    const all = loadSignalStrength();
    expect(Object.keys(all).length).toBeGreaterThanOrEqual(20);
  });

  it('returns metadata for a known rule', () => {
    const s = getSignalStrength('visual/math-default-font');
    expect(s).toBeDefined();
    expect(s!.precision).toBeGreaterThan(0);
    expect(s!.recall).toBeGreaterThanOrEqual(0);
    expect(typeof s!.lastCalibratedAt).toBe('string');
  });

  it('returns undefined for an unknown rule', () => {
    expect(getSignalStrength('does/not-exist')).toBeUndefined();
  });

  it('isReliableSignal flags low precision', () => {
    expect(isReliableSignal({ precision: 0.1, recall: 0.5, fpRate: 0.4, ratio: 1.25, lastCalibratedAt: 'x' })).toBe(false);
    expect(isReliableSignal({ precision: 0.9, recall: 0.5, fpRate: 0.05, ratio: 10, lastCalibratedAt: 'x' })).toBe(true);
    expect(isReliableSignal({ precision: 0.7, recall: 0.05, fpRate: 0.02, ratio: 2.5, lastCalibratedAt: 'x' })).toBe(false);
  });

  it('treats missing signalStrength as reliable (no flag)', () => {
    expect(isReliableSignal(undefined)).toBe(true);
  });
});

describe('Issue interface accepts signalStrength', () => {
  it('a typed Issue can carry the optional signalStrength field', () => {
    const issue: Issue = {
      ruleId: 'visual/math-default-font',
      category: 'visual',
      severity: 'high',
      aiSpecific: true,
      message: 'msg',
      line: 1,
      column: 1,
      signalStrength: getSignalStrength('visual/math-default-font'),
    };
    expect(issue.signalStrength?.precision).toBeGreaterThan(0);
  });
});

describe('slopbrick rules --show-signal-strength', () => {
  function createTmp(): string {
    return mkdtempSync(join(tmpdir(), 'slopbrick-signal-'));
  }

  async function runBin(args: string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await execFileAsync('node', [BIN, ...args], { cwd });
      return { exitCode: 0, stdout, stderr };
    } catch (err) {
      const e = err as { code?: number; stdout?: string; stderr?: string };
      return { exitCode: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
    }
  }

  it('prints a precision/recall table sorted by ratio descending', async () => {
    const dir = createTmp();
    try {
      const { exitCode, stdout } = await runBin(['rules', '--show-signal-strength'], dir);
      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/signal-strength/);
      expect(stdout).toMatch(/precision/);
      expect(stdout).toMatch(/recall/);
      // Should mention a known rule from the JSON file
      expect(stdout).toContain('visual/math-default-font');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits JSON when --json is combined with --show-signal-strength', async () => {
    const dir = createTmp();
    try {
      const { exitCode, stdout } = await runBin(['rules', '--show-signal-strength', '--json'], dir);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
      // Each entry should have ruleId + strength
      const first = parsed.find((r: { id: string }) => r.id === 'visual/math-default-font');
      expect(first).toBeDefined();
      expect(first.strength.precision).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});