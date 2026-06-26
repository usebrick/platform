import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  runDbScan,
  formatDbReport,
  dbExitCode,
  type DbScanResult,
} from '../../src/cli/db';

const execFileAsync = promisify(execFile);
const BIN = join(process.cwd(), 'bin', 'slopbrick.js');

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-db-cmd-'));
}
function writeFile(dir: string, rel: string, content: string): string {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf-8');
  return full;
}

function stubResult(): DbScanResult {
  return {
    result: {
      dbHealth: 95,
      dbDrift: 'low',
      scannedSqlFiles: 1,
      scannedTsFiles: 0,
      findings: [],
      byRule: {
        'db/missing-fk-index': 0,
        'db/duplicate-index': 0,
        'db/missing-not-null': 0,
        'db/enum-sprawl': 0,
        'db/naming-inconsistency': 0,
        'db/sql-concat': 0,
      },
    },
    scan: {} as never,
  };
}

describe('dbExitCode', () => {
  it('returns 0 for low/medium regardless of --strict', () => {
    const r = stubResult();
    r.result.dbDrift = 'low';
    expect(dbExitCode(r, { strict: true })).toBe(0);
    r.result.dbDrift = 'medium';
    expect(dbExitCode(r, { strict: true })).toBe(0);
  });

  it('returns 1 for high/critical with --strict', () => {
    const r = stubResult();
    r.result.dbDrift = 'high';
    expect(dbExitCode(r, { strict: true })).toBe(1);
    r.result.dbDrift = 'critical';
    expect(dbExitCode(r, { strict: true })).toBe(1);
  });

  it('returns 0 for high without --strict', () => {
    const r = stubResult();
    r.result.dbDrift = 'high';
    expect(dbExitCode(r, { strict: false })).toBe(0);
  });
});

describe('formatDbReport', () => {
  it('pretty output includes score, drift, and per-rule counts', () => {
    const r = stubResult();
    const out = formatDbReport(r);
    expect(out).toMatch(/Database Health:\s*95\/100/);
    expect(out).toMatch(/dbDrift:\s*low/);
    expect(out).toMatch(/db\/missing-fk-index/);
    expect(out).toMatch(/db\/duplicate-index/);
    expect(out).toMatch(/db\/missing-not-null/);
    expect(out).toMatch(/db\/enum-sprawl/);
    expect(out).toMatch(/db\/naming-inconsistency/);
    expect(out).toMatch(/db\/sql-concat/);
  });

  it('JSON output has all required fields', () => {
    const r = stubResult();
    const json = JSON.parse(formatDbReport(r, { json: true })) as Record<string, unknown>;
    expect(json.dbHealth).toBe(95);
    expect(json.dbDrift).toBe('low');
    expect(typeof json.scannedSqlFiles).toBe('number');
    expect(typeof json.scannedTsFiles).toBe('number');
    expect((json.byRule as Record<string, number>)['db/missing-fk-index']).toBe(0);
  });

  it('markdown output has table + findings section', () => {
    const r = stubResult();
    const md = formatDbReport(r, { markdown: true });
    expect(md).toMatch(/^## Database Health:/m);
    expect(md).toMatch(/^\| Rule \| Count \| Weight \|$/m);
  });
});

describe('slopbrick db (CLI)', () => {
  it('end-to-end via binary on a tiny fixture', async () => {
    const dir = freshDir();
    try {
      mkdirSync(join(dir, 'migrations'), { recursive: true });
      writeFile(
        dir,
        'migrations/001_init.sql',
        `CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT NOT NULL);
`,
      );
      const { stdout, exitCode } = await execFileAsync('node', [BIN, 'db'], { cwd: dir })
        .then((r) => ({ exitCode: 0, stdout: r.stdout, stderr: r.stderr }))
        .catch((err: { code?: number; stdout?: string; stderr?: string }) => ({
          exitCode: err.code ?? 1,
          stdout: err.stdout ?? '',
          stderr: err.stderr ?? '',
        }));
      expect(stdout).toMatch(/Database Health:/);
      expect(stdout).toMatch(/dbDrift:/);
      expect(exitCode).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);

  it('emits valid JSON with --format json', async () => {
    const dir = freshDir();
    try {
      mkdirSync(join(dir, 'migrations'), { recursive: true });
      writeFile(
        dir,
        'migrations/001_init.sql',
        `CREATE TABLE users (id SERIAL PRIMARY KEY);`,
      );
      const { stdout } = await execFileAsync('node', [BIN, 'db', '--format', 'json'], { cwd: dir })
        .then((r) => ({ exitCode: 0, stdout: r.stdout, stderr: r.stderr }))
        .catch((err: { code?: number; stdout?: string; stderr?: string }) => ({
          exitCode: err.code ?? 1,
          stdout: err.stdout ?? '',
          stderr: err.stderr ?? '',
        }));
      const parsed = JSON.parse(stdout) as {
        dbHealth: number;
        dbDrift: string;
        scannedSqlFiles: number;
        scannedTsFiles: number;
        byRule: Record<string, number>;
        findings: unknown[];
      };
      expect(parsed.dbHealth).toBeGreaterThanOrEqual(0);
      expect(parsed.dbHealth).toBeLessThanOrEqual(100);
      expect(['low', 'medium', 'high', 'critical']).toContain(parsed.dbDrift);
      expect(typeof parsed.scannedSqlFiles).toBe('number');
      expect(Array.isArray(parsed.findings)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);

  it('flags multiple missing FK indexes; --strict exits 1 when drift reaches high', async () => {
    const dir = freshDir();
    try {
      mkdirSync(join(dir, 'migrations'), { recursive: true });
      // Two tables with FK references but no indexes → enough weight to
      // land in 'high' drift (>= 40 < 60) and trigger --strict exit 1.
      writeFile(
        dir,
        'migrations/001_init.sql',
        `CREATE TABLE users (id SERIAL PRIMARY KEY);
CREATE TABLE posts (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id));
CREATE TABLE comments (id SERIAL PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id), author_id INTEGER NOT NULL REFERENCES users(id));
`,
      );
      const { exitCode } = await execFileAsync('node', [BIN, 'db', '--strict'], { cwd: dir })
        .then((r) => ({ exitCode: 0, stdout: r.stdout, stderr: r.stderr }))
        .catch((err: { code?: number; stdout?: string; stderr?: string }) => ({
          exitCode: err.code ?? 1,
          stdout: err.stdout ?? '',
          stderr: err.stderr ?? '',
        }));
      expect(exitCode).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});
