import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  runPatternsScan,
  formatPatternsReport,
  patternsExitCode,
} from '../../src/cli/patterns';
import { DEFAULT_CONFIG } from '../../src/config';
import type { ResolvedConfig } from '../../src/types';

const execFileAsync = promisify(execFile);
const BIN = join(process.cwd(), 'bin', 'slopbrick.js');

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-patterns-cli-'));
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

describe('runPatternsScan', () => {
  it('returns 100/100 for a clean project', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/clean.ts', 'const x = 1;\n');
      const result = await runPatternsScan(dir, configWith(['src/**/*.ts']));
      expect(result.report.score).toBe(100);
      expect(result.report.doNotCreate).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags a fragmented project with a lower score', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/ConfirmModal.tsx', '');
      writeFile(dir, 'src/AlertDialog.tsx', '');
      writeFile(dir, 'src/Drawer.tsx', '');
      const result = await runPatternsScan(dir, configWith(['src/**/*.tsx']));
      expect(result.report.score).toBeLessThan(100);
      expect(result.report.byCategory.modal.count).toBe(3);
      expect(result.report.doNotCreate.length).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('respects the maxFiles cap', async () => {
    const dir = freshDir();
    try {
      for (let i = 0; i < 5; i++) {
        writeFile(dir, `src/Modal${i}.tsx`, '');
      }
      const result = await runPatternsScan(
        dir,
        configWith(['src/**/*.tsx']),
        { maxFiles: 2 },
      );
      expect(result.report.scannedFiles).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns a generatedAt timestamp in ISO format', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', '');
      const result = await runPatternsScan(dir, configWith(['src/**/*.ts']));
      expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports the format the user requested', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', '');
      const result = await runPatternsScan(
        dir,
        configWith(['src/**/*.ts']),
        { format: 'json' },
      );
      expect(result.format).toBe('json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('formatPatternsReport — text', () => {
  it('renders a clean report with the headline + all 8 categories', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/clean.ts', '');
      const result = await runPatternsScan(dir, configWith(['src/**/*.ts']));
      const out = formatPatternsReport(result);
      expect(out).toContain('Repository Pattern Fragmentation: 100/100');
      expect(out).toContain('Modal systems');
      expect(out).toContain('Button variants');
      expect(out).toContain('Auth patterns');
      expect(out).toContain('API clients');
      expect(out).toContain('State libraries');
      expect(out).toContain('Form libraries');
      expect(out).toContain('Toast systems');
      expect(out).toContain('Card variants');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('renders a fragmented report with recommendations', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/ConfirmModal.tsx', '');
      writeFile(dir, 'src/AlertDialog.tsx', '');
      writeFile(dir, 'src/Drawer.tsx', '');
      const result = await runPatternsScan(dir, configWith(['src/**/*.tsx']));
      const out = formatPatternsReport(result);
      expect(out).toContain('Recommendations');
      expect(out).toContain('doNotCreate');
      expect(out).toContain('ConfirmModal');
      expect(out).toContain('⚠ +');
      expect(out).toContain('Top duplicated patterns');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('omits the doNotCreate section when nothing is fragmented', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/clean.ts', '');
      const result = await runPatternsScan(dir, configWith(['src/**/*.ts']));
      const out = formatPatternsReport(result);
      expect(out).not.toContain('Recommendations');
      expect(out).not.toContain('doNotCreate');
      expect(out).not.toContain('Top duplicated');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('formatPatternsReport — json', () => {
  it('emits valid JSON with all expected top-level fields', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/ConfirmModal.tsx', '');
      writeFile(dir, 'src/AlertDialog.tsx', '');
      const result = await runPatternsScan(
        dir,
        configWith(['src/**/*.tsx']),
        { format: 'json' },
      );
      const out = formatPatternsReport(result);
      const parsed = JSON.parse(out) as {
        patternFragmentation: number;
        scannedFiles: number;
        identifierCount: number;
        uxPatternCount: number;
        byCategory: Record<string, { count: number; weight: number; patterns: string[] }>;
        doNotCreate: string[];
      };
      expect(parsed.patternFragmentation).toBeLessThan(100);
      expect(parsed.scannedFiles).toBe(2);
      expect(parsed.uxPatternCount).toBe(2);
      expect(parsed.byCategory.modal).toBeDefined();
      expect(parsed.byCategory.modal.count).toBe(2);
      expect(parsed.byCategory.modal.weight).toBe(10);
      expect(parsed.byCategory.modal.patterns).toEqual(['AlertDialog', 'ConfirmModal']);
      expect(parsed.doNotCreate.length).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('includes all 8 categories in byCategory, even when count is 0', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/clean.ts', '');
      const result = await runPatternsScan(
        dir,
        configWith(['src/**/*.ts']),
        { format: 'json' },
      );
      const parsed = JSON.parse(formatPatternsReport(result)) as {
        byCategory: Record<string, unknown>;
      };
      const expected = ['modal', 'button', 'auth', 'api', 'state', 'forms', 'toast', 'card'];
      for (const cat of expected) {
        expect(parsed.byCategory[cat]).toBeDefined();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('formatPatternsReport — markdown', () => {
  it('emits a markdown table with all 8 categories', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/ConfirmModal.tsx', '');
      const result = await runPatternsScan(
        dir,
        configWith(['src/**/*.tsx']),
        { format: 'markdown' },
      );
      const out = formatPatternsReport(result);
      expect(out).toContain('## Pattern Fragmentation:');
      expect(out).toContain('| Category | Count | Baseline | Excess |');
      expect(out).toContain('| Modal systems |');
      expect(out).toContain('| Button variants |');
      expect(out).toContain('| Card variants |');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('includes the recommendations + Top Duplicates sections when fragmented', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/ConfirmModal.tsx', '');
      writeFile(dir, 'src/AlertDialog.tsx', '');
      writeFile(dir, 'src/Drawer.tsx', '');
      const result = await runPatternsScan(
        dir,
        configWith(['src/**/*.tsx']),
        { format: 'markdown' },
      );
      const out = formatPatternsReport(result);
      expect(out).toContain('### Recommendations');
      expect(out).toContain('### Top Duplicates');
      expect(out).toContain('**modal**');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('patternsExitCode', () => {
  it('always returns 0 in v1 (informational)', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', '');
      const result = await runPatternsScan(dir, configWith(['src/**/*.ts']));
      expect(patternsExitCode(result)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns 0 even when the project is heavily fragmented', async () => {
    const dir = freshDir();
    try {
      for (let i = 0; i < 5; i++) {
        writeFile(dir, `src/Modal${i}.tsx`, '');
      }
      const result = await runPatternsScan(dir, configWith(['src/**/*.tsx']));
      expect(patternsExitCode(result)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runPatternsScan with on-disk fixtures', () => {
  it('scores 100 for the clean-app fixture', async () => {
    const fixtureDir = join(__dirname, '..', 'fixtures', 'patterns', 'clean-app');
    const result = await runPatternsScan(fixtureDir, configWith(['src/**/*.{ts,tsx}']));
    expect(result.report.score).toBe(100);
  });

  it('scores < 100 for the fragmented-app fixture', async () => {
    const fixtureDir = join(__dirname, '..', 'fixtures', 'patterns', 'fragmented-app');
    const result = await runPatternsScan(fixtureDir, configWith(['src/**/*.{ts,tsx}']));
    expect(result.report.score).toBeLessThan(100);
    expect(result.report.doNotCreate.length).toBeGreaterThanOrEqual(4);
  });
});

// Note: We deliberately don't add a "slopbrick patterns (CLI)" describe
// block that shells out to bin/slopbrick.js. The subcommand isn't yet
// registered in src/cli/program.ts (Phase 5/7 are still working on that
// file). Once the registration lands, those CLI smoke tests will live
// here. The lib-level runPatternsScan/formatPatternsReport/patternsExitCode
// tests above cover the surface that program.ts will wire up.
