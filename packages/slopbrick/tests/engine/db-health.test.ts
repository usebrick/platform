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
      expect(result.scannedSqlFiles).toBe(0);
      expect(result.findings).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns 100/100 on a clean SQL schema', async () => {
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'migrations/001_init.sql',
        `CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL
);
CREATE INDEX posts_user_id_idx ON posts(user_id);
`,
      );
      const result = await buildDbHealth(dir, STUB_CONFIG, {});
      expect(result.dbHealth).toBe(100);
      expect(result.byRule['db/missing-fk-index']).toBe(0);
      expect(result.byRule['db/missing-not-null']).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags a missing FK index', async () => {
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'migrations/001_init.sql',
        `CREATE TABLE users (
  id SERIAL PRIMARY KEY
);
CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id)
);
`,
      );
      const result = await buildDbHealth(dir, STUB_CONFIG, {});
      expect(result.byRule['db/missing-fk-index']).toBeGreaterThanOrEqual(1);
      const missing = result.findings.find((f) => f.ruleId === 'db/missing-fk-index');
      expect(missing?.table).toBe('posts');
      expect(missing?.columnName).toBe('user_id');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags a missing NOT NULL on a required column', async () => {
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'migrations/001_init.sql',
        `CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT
);
`,
      );
      const result = await buildDbHealth(dir, STUB_CONFIG, {});
      expect(result.byRule['db/missing-not-null']).toBeGreaterThanOrEqual(1);
      const missing = result.findings.find((f) => f.ruleId === 'db/missing-not-null');
      expect(missing?.columnName).toBe('email');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags a duplicate index', async () => {
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'migrations/001_init.sql',
        `CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL
);
CREATE INDEX users_email_idx ON users(email);
CREATE INDEX users_email_alt_idx ON users(email);
`,
      );
      const result = await buildDbHealth(dir, STUB_CONFIG, {});
      expect(result.byRule['db/duplicate-index']).toBeGreaterThanOrEqual(1);
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
      // Lots of issues across multiple rules
      writeFile(
        dir,
        'src/bad.ts',
        `export const x = db.query(\`SELECT * FROM users WHERE id = \${a}\`);
export const y = db.query(\`SELECT * FROM users WHERE id = \${b}\`);
export const z = db.query(\`SELECT * FROM users WHERE id = \${c}\`);
export const w = db.query(\`SELECT * FROM users WHERE id = \${d}\`);
`,
      );
      writeFile(
        dir,
        'migrations/001.sql',
        `CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT);
CREATE TABLE posts (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id));
CREATE INDEX posts_user_id_idx ON posts(body);
CREATE INDEX posts_user_id_alt ON posts(body);
`,
      );
      const result = await buildDbHealth(dir, STUB_CONFIG, {});
      expect(result.dbHealth).toBeGreaterThanOrEqual(0);
      expect(result.dbHealth).toBeLessThanOrEqual(100);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('DB_RULE_WEIGHTS / DB_FRESHNESS_THRESHOLDS', () => {
  it('weights are monotonic with severity', () => {
    expect(DB_RULE_WEIGHTS['db/missing-fk-index']).toBeGreaterThanOrEqual(
      DB_RULE_WEIGHTS['db/enum-sprawl'],
    );
    expect(DB_RULE_WEIGHTS['db/missing-fk-index']).toBeGreaterThanOrEqual(
      DB_RULE_WEIGHTS['db/naming-inconsistency'],
    );
  });

  it('thresholds match the documented bands', () => {
    expect(DB_FRESHNESS_THRESHOLDS.low).toBe(80);
    expect(DB_FRESHNESS_THRESHOLDS.medium).toBe(60);
    expect(DB_FRESHNESS_THRESHOLDS.high).toBe(40);
  });
});
