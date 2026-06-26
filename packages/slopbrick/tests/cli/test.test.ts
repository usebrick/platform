import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  runTestScan,
  formatTestReport,
  testExitCode,
  type TestScanResult,
} from '../../src/cli/test';
import { DEFAULT_CONFIG } from '../../src/config';
import type { ResolvedConfig } from '../../src/types';

const execFileAsync = promisify(execFile);
const BIN = join(process.cwd(), 'bin', 'slopbrick.js');

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-test-cmd-'));
}

function writeFile(dir: string, rel: string, content: string): string {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf-8');
  return full;
}

function configWith(): ResolvedConfig {
  return { ...DEFAULT_CONFIG };
}

async function runBin(
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [BIN, ...args], { cwd });
    return { exitCode: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { exitCode: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('runTestScan', () => {
  it('returns a clean score for a repo without test files', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `export const a = 1;`);
      const { result } = await runTestScan(dir, configWith());
      expect(result.scannedFiles).toBe(0);
      expect(result.testIssues).toHaveLength(0);
      expect(result.testQuality.score).toBe(100);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects weak assertions and fake placeholders in test files', async () => {
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'src/foo.test.tsx',
        `
        describe('user', () => {
          it('has data', () => {
            const user = { name: 'John Doe', email: 'test@test.com', id: 1 };
            expect(user).toBeDefined();
            expect(user).toBe(user);
          });
        });
        `,
      );
      const { result } = await runTestScan(dir, configWith());
      expect(result.testIssues.length).toBeGreaterThanOrEqual(2);
      const rules = new Set(result.testIssues.map((i) => i.ruleId));
      expect(rules.has('test/weak-assertion')).toBe(true);
      expect(rules.has('test/fake-placeholder')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('low test-quality score on a noisy fixture', async () => {
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'src/button.test.tsx',
        `
        describe('a', () => {
          beforeEach(() => { return render(<App />); });
          it('a', () => { const x = 1; expect(x).toBeDefined(); });
        });
        describe('b', () => {
          beforeEach(() => { return render(<App />); });
          it('b', () => { const x = 2; expect(x).toBeTruthy(); });
        });
        describe('c', () => {
          beforeEach(() => { return render(<App />); });
          it('c', () => { const x = 3; expect(x).toBe(null); });
        });
        `,
      );
      const { result } = await runTestScan(dir, configWith());
      expect(result.testQuality.score).toBeLessThan(100);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('formatTestReport', () => {
  it('renders the score header', () => {
    const result: TestScanResult = {
      testQuality: {
        score: 88,
        totalIssues: 0,
        bySeverity: { low: 0, medium: 0, high: 0 },
        byRule: {},
        headline: 'Test quality: 88/100 (5 test files scanned)',
      },
      testIssues: [],
      scannedFiles: 5,
      include: [],
      passed: true,
    };
    const out = formatTestReport(result);
    expect(out).toContain('Test quality: 88/100');
    expect(out).toContain('No test-code issues found');
  });

  it('emits JSON when --format json is requested', () => {
    const result: TestScanResult = {
      testQuality: {
        score: 60,
        totalIssues: 1,
        bySeverity: { low: 0, medium: 1, high: 0 },
        byRule: { 'test/weak-assertion': 1 },
        headline: 'Test quality: 60/100',
      },
      testIssues: [
        {
          ruleId: 'test/weak-assertion',
          category: 'test',
          severity: 'medium',
          aiSpecific: true,
          message: 'Weak assertion at line 5',
          line: 5,
          column: 1,
        },
      ],
      scannedFiles: 1,
      include: [],
      passed: true,
    };
    const out = formatTestReport(result, { json: true });
    const parsed = JSON.parse(out) as {
      testQuality: number;
      totalIssues: number;
      byRule: Record<string, number>;
    };
    expect(parsed.testQuality).toBe(60);
    expect(parsed.totalIssues).toBe(1);
    expect(parsed.byRule['test/weak-assertion']).toBe(1);
  });
});

describe('testExitCode', () => {
  it('returns 0 in non-strict mode even with issues', () => {
    const result: TestScanResult = {
      testQuality: {
        score: 50,
        totalIssues: 1,
        bySeverity: { low: 0, medium: 1, high: 0 },
        byRule: {},
        headline: '',
      },
      testIssues: [],
      scannedFiles: 1,
      include: [],
      passed: true, // no strict
    };
    expect(testExitCode(result)).toBe(0);
  });

  it('returns 1 in strict mode when issues exist', () => {
    const result: TestScanResult = {
      testQuality: {
        score: 50,
        totalIssues: 1,
        bySeverity: { low: 0, medium: 1, high: 0 },
        byRule: {},
        headline: '',
      },
      testIssues: [],
      scannedFiles: 1,
      include: [],
      passed: false, // strict + issues
    };
    expect(testExitCode(result)).toBe(1);
  });
});

describe('slopbrick test (CLI)', () => {
  it('exits 0 and prints a clean report when no test files exist', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `export const a = 1;`);
      writeFile(dir, 'slopbrick.config.mjs', `export default { include: ['src/**/*'], exclude: [] };`);
      const { exitCode, stdout } = await runBin(['test'], dir);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Test quality');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 0 with issues when --strict is not set', async () => {
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'src/foo.test.tsx',
        `it('a', () => { const x = 1; expect(x).toBeDefined(); });`,
      );
      writeFile(dir, 'slopbrick.config.mjs', `export default { include: ['src/**/*'], exclude: [] };`);
      const { exitCode, stdout } = await runBin(['test'], dir);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Weak assertion');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 1 with --strict when issues exist', async () => {
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'src/foo.test.tsx',
        `it('a', () => { const x = 1; expect(x).toBeDefined(); });`,
      );
      writeFile(dir, 'slopbrick.config.mjs', `export default { include: ['src/**/*'], exclude: [] };`);
      const { exitCode } = await runBin(['test', '--strict'], dir);
      expect(exitCode).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits JSON output with --format json', async () => {
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'src/foo.test.tsx',
        `it('a', () => { const x = 1; expect(x).toBeDefined(); });`,
      );
      writeFile(dir, 'slopbrick.config.mjs', `export default { include: ['src/**/*'], exclude: [] };`);
      const { exitCode, stdout } = await runBin(['test', '--format', 'json'], dir);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout) as {
        testQuality: number;
        totalIssues: number;
        byRule: Record<string, number>;
      };
      expect(parsed.testQuality).toBeGreaterThanOrEqual(0);
      expect(parsed.testQuality).toBeLessThanOrEqual(100);
      expect(parsed.byRule['test/weak-assertion']).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});