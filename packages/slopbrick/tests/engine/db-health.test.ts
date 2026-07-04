import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildDbHealth,
  DB_RULE_WEIGHTS,
  DB_FRESHNESS_THRESHOLDS,
} from '../../src/engine/db-health';

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-db-'));
}
function writeFile(dir: string, rel: string, content: string): string {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf-8');
  return full;
}

const STUB_CONFIG = {
  include: [],
  exclude: [],
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