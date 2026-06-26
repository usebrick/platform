import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  runBusinessLogicScan,
  formatBusinessLogicScan,
  businessLogicExitCode,
} from '../../src/cli/business-logic';
import { DEFAULT_CONFIG } from '../../src/config';
import type { ResolvedConfig } from '../../src/types';

const execFileAsync = promisify(execFile);
const BIN = join(process.cwd(), 'bin', 'slopbrick.js');

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-business-logic-'));
}

function writeFile(dir: string, rel: string, content: string): string {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf-8');
  return full;
}

function configWith(include: string[]): ResolvedConfig {
  return {
    ...DEFAULT_CONFIG,
    include,
    exclude: [],
  };
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

describe('runBusinessLogicScan', () => {
  it('returns 100/100 for a clean project', async () => {
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'src/clean.ts',
        `const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });\nexport const formatPrice = (p: number) => fmt.format(p);\n`,
      );
      const result = await runBusinessLogicScan(dir, configWith(['src/**/*.ts']));
      expect(result.report.score).toBe(100);
      expect(result.report.issues).toHaveLength(0);
      expect(result.scannedFilePaths.length).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags a pricing issue (Math.round)', async () => {
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'src/pricing.ts',
        'const c = Math.round(price * 100) / 100;\n',
      );
      const result = await runBusinessLogicScan(dir, configWith(['src/**/*.ts']));
      expect(result.issues.length).toBeGreaterThanOrEqual(1);
      const pricing = result.issues.find(
        (i) => i.ruleId === 'business-logic/math-round-cents',
      );
      expect(pricing).toBeDefined();
      expect(pricing?.category).toBe('pricing');
      expect(result.report.score).toBeLessThan(100);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags multiple categories and aggregates weights', async () => {
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'src/pricing.ts',
        'const c = Math.round(price * 100) / 100;\n',
      );
      writeFile(
        dir,
        'src/form.ts',
        'const schema = z.object({ name: z.string() });\n',
      );
      writeFile(
        dir,
        'src/date.ts',
        "const start = new Date('2020-01-01');\n",
      );
      const result = await runBusinessLogicScan(dir, configWith(['src/**/*.ts']));
      expect(result.report.byCategory.pricing).toBeGreaterThanOrEqual(1);
      expect(result.report.byCategory.validation).toBeGreaterThanOrEqual(1);
      expect(result.report.byCategory.formatting).toBeGreaterThanOrEqual(1);
      // 3 + 2 + 1 = 6 weight, 3 files → 100 - (6/3)*100 = -100 → 0
      expect(result.report.score).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('respects the maxFiles cap', async () => {
    const dir = freshDir();
    try {
      for (let i = 0; i < 5; i++) {
        writeFile(dir, `src/file${i}.ts`, 'const c = Math.round(price * 100) / 100;\n');
      }
      const result = await runBusinessLogicScan(
        dir,
        configWith(['src/**/*.ts']),
        { maxFiles: 2 },
      );
      expect(result.scannedFilePaths.length).toBe(2);
      expect(result.issues.length).toBeGreaterThanOrEqual(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips files that cannot be read', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', 'const c = Math.round(price * 100) / 100;\n');
      const result = await runBusinessLogicScan(
        dir,
        configWith(['src/**/*.ts', 'src/missing/**/*.ts']),
      );
      expect(result.scannedFilePaths.length).toBeGreaterThanOrEqual(1);
      expect(result.issues.length).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits issues with relPath-style filePath (portable JSON)', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/sub/pricing.ts', 'const c = Math.round(price * 100) / 100;\n');
      const result = await runBusinessLogicScan(dir, configWith(['src/**/*.ts']));
      expect(result.issues[0]?.filePath).toBe('src/sub/pricing.ts');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('formatBusinessLogicScan', () => {
  it('renders a clean text report with a checkmark', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/clean.ts', 'const x = 1;\n');
      const result = await runBusinessLogicScan(dir, configWith(['src/**/*.ts']));
      const out = formatBusinessLogicScan(result);
      expect(out).toContain('Business Logic Coherence: 100/100');
      expect(out).toContain('No business-logic anti-patterns detected');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('renders a populated text report with per-category sections', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/p.ts', 'const c = Math.round(price * 100) / 100;\n');
      writeFile(dir, 'src/f.ts', 'const schema = z.object({ name: z.string() });\n');
      const result = await runBusinessLogicScan(dir, configWith(['src/**/*.ts']));
      const out = formatBusinessLogicScan(result);
      expect(out).toContain('Pricing');
      expect(out).toContain('Validation');
      expect(out).toContain('business-logic/math-round-cents');
      expect(out).toContain('Total weight');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits valid JSON for --format json', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/p.ts', 'const c = Math.round(price * 100) / 100;\n');
      const result = await runBusinessLogicScan(dir, configWith(['src/**/*.ts']));
      const json = formatBusinessLogicScan(result, { format: 'json' });
      const parsed = JSON.parse(json) as {
        score: number;
        scannedFiles: number;
        byCategory: Record<string, number>;
        weight: number;
        issues: Array<{ ruleId: string; category: string }>;
      };
      expect(parsed.score).toBeLessThan(100);
      expect(parsed.scannedFiles).toBe(1);
      expect(parsed.byCategory.pricing).toBeGreaterThanOrEqual(1);
      expect(parsed.weight).toBeGreaterThanOrEqual(3);
      expect(parsed.issues[0]?.ruleId).toBe('business-logic/math-round-cents');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits a markdown table for --format markdown', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/p.ts', 'const c = Math.round(price * 100) / 100;\n');
      const result = await runBusinessLogicScan(dir, configWith(['src/**/*.ts']));
      const md = formatBusinessLogicScan(result, { format: 'markdown' });
      expect(md).toContain('## Business Logic Coherence:');
      expect(md).toContain('| Category | Issues | Weight |');
      expect(md).toContain('### Pricing');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('businessLogicExitCode', () => {
  it('always returns 0 in v1 (informational)', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/p.ts', 'const c = Math.round(price * 100) / 100;\n');
      const result = await runBusinessLogicScan(dir, configWith(['src/**/*.ts']));
      expect(businessLogicExitCode(result)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('slopbrick business-logic (CLI)', () => {
  it('exits 0 with a clean text report', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/clean.ts', 'const x = 1;\n');
      writeFile(
        dir,
        'slopbrick.config.mjs',
        `export default { include: ['src/**/*.ts'], exclude: [] };`,
      );
      const { exitCode, stdout } = await runBin(['business-logic'], dir);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Business Logic Coherence: 100/100');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 0 even when issues are found (informational in v1)', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/p.ts', 'const c = Math.round(price * 100) / 100;\n');
      writeFile(
        dir,
        'slopbrick.config.mjs',
        `export default { include: ['src/**/*.ts'], exclude: [] };`,
      );
      const { exitCode, stdout } = await runBin(['business-logic'], dir);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('business-logic/math-round-cents');
      expect(stdout).toContain('Pricing');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits JSON output with --format json', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/p.ts', 'const c = Math.round(price * 100) / 100;\n');
      writeFile(
        dir,
        'slopbrick.config.mjs',
        `export default { include: ['src/**/*.ts'], exclude: [] };`,
      );
      const { exitCode, stdout } = await runBin(['business-logic', '--format', 'json'], dir);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout) as { score: number; byCategory: Record<string, number> };
      expect(parsed.score).toBeLessThan(100);
      expect(parsed.byCategory.pricing).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits markdown output with --format markdown', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/p.ts', 'const c = Math.round(price * 100) / 100;\n');
      writeFile(
        dir,
        'slopbrick.config.mjs',
        `export default { include: ['src/**/*.ts'], exclude: [] };`,
      );
      const { exitCode, stdout } = await runBin(['business-logic', '--format', 'markdown'], dir);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('## Business Logic Coherence:');
      expect(stdout).toContain('| Pricing |');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});