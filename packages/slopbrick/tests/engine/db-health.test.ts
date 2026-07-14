import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildDbHealth,
  DB_RULE_WEIGHTS,
  DB_FRESHNESS_THRESHOLDS,
} from '../../src/engine/db-health';
import { runScan } from '../../src/cli/scan';

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-db-'));
}
function writeFile(dir: string, rel: string, content: string): string {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf-8');
  return full;
}

function git(dir: string, ...args: string[]): void {
  execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
}

const STUB_CONFIG = {
  include: ['src/**/*.{ts,tsx,js,jsx}'],
  exclude: ['**/*.test.ts'],
  rules: {},
} as any;

describe('buildDbHealth (end-to-end)', () => {
  it('returns 100/100 (low) on an empty project', async () => {
    const dir = freshDir();
    try {
      const result = await buildDbHealth(dir, STUB_CONFIG, {});
      expect(result.dbHealth).toBe(100);
      expect(result.dbDrift).toBe('low');
      expect(result.scannedTsFiles).toBe(0);
      expect(result.findings).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags a template-literal SQL concat in TS', async () => {
    const dir = freshDir();
    try {
      mkdirSync(join(dir, 'src'), { recursive: true });
      writeFile(
        dir,
        'src/queries.ts',
        `export function getUser(id: number) {
  return db.query(\`SELECT * FROM users WHERE id = \${id}\`);
}
`,
      );
      const result = await buildDbHealth(dir, STUB_CONFIG, {});
      expect(result.byRule['db/sql-concat']).toBeGreaterThanOrEqual(1);
      const concat = result.findings.find((f) => f.ruleId === 'db/sql-concat');
      expect(concat?.dbFile).toMatch(/queries\.ts$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('clamps the score to [0, 100]', async () => {
    const dir = freshDir();
    try {
      mkdirSync(join(dir, 'src'), { recursive: true });
      // Many sql-concat findings across multiple files
      for (const [file, vars] of Object.entries({ a: 'a', b: 'b', c: 'c', d: 'd' })) {
        writeFile(
          dir,
          `src/${file}.ts`,
          `export const ${file} = db.query(\`SELECT * FROM users WHERE id = \${${vars}}\`);`,
        );
      }
      const result = await buildDbHealth(dir, STUB_CONFIG, {});
      expect(result.dbHealth).toBeGreaterThanOrEqual(0);
      expect(result.dbHealth).toBeLessThanOrEqual(100);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('analyzes only the exact selected paths when an explicit selection is provided', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/clean.ts', 'export const clean = true;\n');
      writeFile(
        dir,
        'src/omitted.ts',
        'export const omitted = db.query(`SELECT * FROM users WHERE id = ${id}`);\n',
      );

      const result = await buildDbHealth(dir, STUB_CONFIG, {
        selectedFilePaths: ['src/clean.ts'],
      });

      expect(result.scannedTsFiles).toBe(1);
      expect(result.dbHealth).toBe(100);
      expect(result.findings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats an explicitly empty selection as authoritative', async () => {
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'src/rediscovered.ts',
        'export const rediscovered = db.query(`SELECT * FROM users WHERE id = ${id}`);\n',
      );

      const result = await buildDbHealth(dir, STUB_CONFIG, {
        selectedFilePaths: [],
      });

      expect(result.scannedTsFiles).toBe(0);
      expect(result.findings).toEqual([]);
      expect(result.dbHealth).toBe(100);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('normalizes, de-duplicates, sorts, and filters exact selected paths deterministically', async () => {
    const dir = freshDir();
    try {
      const finding = writeFile(
        dir,
        'src/a-finding.ts',
        'export const finding = db.query(`SELECT * FROM users WHERE id = ${id}`);\n',
      );
      const clean = writeFile(dir, 'src/b-clean.tsx', 'export const clean = <div />;\n');
      const unsupported = writeFile(
        dir,
        'src/c-unsupported.py',
        'query = f"SELECT * FROM users WHERE id = {user_id}"\n',
      );
      const legacyJs = writeFile(
        dir,
        'src/d-out-of-contract.js',
        'export const finding = db.query(`SELECT * FROM users WHERE id = ${id}`);\n',
      );
      const legacyJsx = writeFile(
        dir,
        'src/e-out-of-contract.jsx',
        'export const finding = db.query(`SELECT * FROM users WHERE id = ${id}`);\n',
      );

      const first = await buildDbHealth(dir, STUB_CONFIG, {
        selectedFilePaths: [
          clean,
          legacyJsx,
          'src/a-finding.ts',
          unsupported,
          finding,
          legacyJs,
          clean,
        ],
      });
      const second = await buildDbHealth(dir, STUB_CONFIG, {
        selectedFilePaths: [legacyJs, finding, clean, legacyJsx, 'src/a-finding.ts'],
      });

      expect(first).toEqual(second);
      expect(first.scannedTsFiles).toBe(2);
      expect(first.findings.map((entry) => entry.dbFile)).toEqual(['src/a-finding.ts']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('counts only successfully read candidates inside the maxFiles window', async () => {
    const dir = freshDir();
    try {
      mkdirSync(join(dir, 'src', 'a-unreadable.ts'), { recursive: true });
      writeFile(
        dir,
        'src/b-finding.ts',
        'export const finding = db.query(`SELECT * FROM users WHERE id = ${id}`);\n',
      );
      writeFile(dir, 'src/c-outside-cap.ts', 'export const clean = true;\n');

      const result = await buildDbHealth(dir, STUB_CONFIG, {
        selectedFilePaths: [
          'src/c-outside-cap.ts',
          'src/b-finding.ts',
          'src/a-unreadable.ts',
        ],
        maxFiles: 2,
      });

      expect(result.scannedTsFiles).toBe(1);
      expect(result.findings).toHaveLength(1);
      expect(result.dbHealth).toBe(75);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses the post-maxFiles analyzed population for counts and score normalization', async () => {
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'src/a-finding.ts',
        'export const finding = db.query(`SELECT * FROM users WHERE id = ${id}`);\n',
      );
      writeFile(dir, 'src/b-clean.ts', 'export const clean = true;\n');

      const result = await buildDbHealth(dir, STUB_CONFIG, {
        selectedFilePaths: ['src/b-clean.ts', 'src/a-finding.ts'],
        maxFiles: 1,
      });

      expect(result.scannedTsFiles).toBe(1);
      expect(result.findings).toHaveLength(1);
      expect(result.dbHealth).toBe(75);
      expect(result.dbDrift).toBe('medium');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('honors canonical config include and exclude rules during standalone discovery', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/clean.ts', 'export const clean = true;\n');
      writeFile(
        dir,
        'src/excluded.ts',
        'export const excluded = db.query(`SELECT * FROM users WHERE id = ${id}`);\n',
      );
      writeFile(
        dir,
        'lib/outside.ts',
        'export const outside = db.query(`SELECT * FROM users WHERE id = ${id}`);\n',
      );

      const result = await buildDbHealth(dir, {
        ...STUB_CONFIG,
        include: ['src/**/*.ts'],
        exclude: ['src/excluded.ts'],
      });

      expect(result.scannedTsFiles).toBe(1);
      expect(result.findings).toEqual([]);
      expect(result.dbHealth).toBe(100);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('honors repository self-scan exclusions during standalone discovery', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/clean.ts', 'export const clean = true;\n');
      writeFile(
        dir,
        'src/rules/excluded.ts',
        'export const excluded = db.query(`SELECT * FROM users WHERE id = ${id}`);\n',
      );

      const result = await buildDbHealth(dir, {
        ...STUB_CONFIG,
        include: ['src/**/*.ts'],
        selfScan: { excludePaths: ['src/rules/**'] },
      });

      expect(result.scannedTsFiles).toBe(1);
      expect(result.findings).toEqual([]);
      expect(result.dbHealth).toBe(100);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps report DB enrichment inside the main scan selection', async () => {
    const dir = freshDir();
    try {
      const clean = writeFile(dir, 'src/clean.ts', 'export const clean = true;\n');
      writeFile(
        dir,
        'src/omitted.ts',
        'export const omitted = db.query(`SELECT * FROM users WHERE id = ${id}`);\n',
      );

      const scan = await runScan(
        { workspace: dir, quiet: true, telemetry: false },
        [clean],
      );

      expect(scan.scanStats.requested).toBe(1);
      expect(scan.report.dbFindings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('retains DB enrichment from the pre-cache selection on a fully cached incremental rerun', async () => {
    const dir = freshDir();
    try {
      const finding = writeFile(
        dir,
        'src/finding.ts',
        'export const finding = db.query(`SELECT * FROM users WHERE id = ${id}`);\n',
      );
      const cachePath = join(dir, '.slopbrick-incremental-cache.json');
      const options = {
        workspace: dir,
        quiet: true,
        telemetry: false,
        incremental: true,
        cachePath,
      } as const;

      const first = await runScan(options, [finding]);
      const second = await runScan(options, [finding]);

      expect(first.report.dbFindings).toHaveLength(1);
      expect(second.scanStats).toMatchObject({ requested: 1, analyzed: 0, skipped: 1 });
      expect(second.scanStats.status).toBe('partial');
      expect(second.report.dbFindings?.map((entry) => entry.dbFile)).toEqual(['src/finding.ts']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps DB enrichment inside a narrow Git working-tree selection', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/selected.ts', 'export const selected = 1;\n');
      writeFile(
        dir,
        'src/unselected.ts',
        'export const unselected = db.query(`SELECT * FROM users WHERE id = ${id}`);\n',
      );
      git(dir, 'init');
      git(dir, 'config', 'user.email', 'slopbrick-tests@example.invalid');
      git(dir, 'config', 'user.name', 'SlopBrick Tests');
      git(dir, 'add', 'src/selected.ts', 'src/unselected.ts');
      git(dir, 'commit', '-m', 'fixture');
      writeFile(dir, 'src/selected.ts', 'export const selected = 2;\n');

      const scan = await runScan({
        workspace: dir,
        quiet: true,
        telemetry: false,
        changed: true,
      });

      expect(scan.scanStats.requested).toBe(1);
      expect(scan.report.dbFindings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('DB_RULE_WEIGHTS / DB_FRESHNESS_THRESHOLDS', () => {
  it('sql-concat has a weight', () => {
    expect(DB_RULE_WEIGHTS['db/sql-concat']).toBe(5);
  });

  it('thresholds match the documented bands', () => {
    expect(DB_FRESHNESS_THRESHOLDS.low).toBe(80);
    expect(DB_FRESHNESS_THRESHOLDS.medium).toBe(60);
    expect(DB_FRESHNESS_THRESHOLDS.high).toBe(40);
  });
});
