import { describe, expect, it } from 'vitest';
import { missingFkIndexRule, moduleReady } from '../../../src/rules/db/missing-fk-index';
import type { Issue, RuleContext, ScanFacts } from '../../../src/types';

function makeContext(): RuleContext {
  return {
    config: {} as never,
    filePath: 'schema.sql',
    cwd: '/tmp',
  };
}

function makeFacts(source: string): ScanFacts {
  return {
    filePath: 'schema.sql',
    v2: { _source: source },
  } as unknown as ScanFacts;
}

async function runRule(source: string): Promise<Issue[]> {
  // pgsql-parser's WASM module is loaded asynchronously; we MUST
  // wait for the cached promise before parseSync() will work.
  await moduleReady;
  const ctx = missingFkIndexRule.create(makeContext());
  return missingFkIndexRule.analyze(ctx, makeFacts(source));
}

describe('db/missing-fk-index', () => {
  it('flags FK column without matching CREATE INDEX in the same file', async () => {
    const sql = `
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id)
      );
      CREATE INDEX orders_id_idx ON orders (id);
    `;
    const issues = await runRule(sql);
    expect(issues.some(i => i.ruleId === 'db/missing-fk-index')).toBe(true);
    expect(issues[0].message).toContain('orders.user_id');
  });

  it('does not flag when CREATE INDEX covers the FK column', async () => {
    const sql = `
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id)
      );
      CREATE INDEX orders_id_idx ON orders (id);
      CREATE INDEX orders_user_id_idx ON orders (user_id);
    `;
    expect(await runRule(sql)).toHaveLength(0);
  });

  it('flags multiple missing FKs and counts them', async () => {
    const sql = `
      CREATE TABLE line_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id),
        product_id INTEGER REFERENCES products(id)
      );
    `;
    const issues = await runRule(sql);
    expect(issues.length).toBe(2);
  });

  it('returns no findings when there are no FKs', async () => {
    const sql = `CREATE TABLE x (id SERIAL PRIMARY KEY, name TEXT);`;
    expect(await runRule(sql)).toHaveLength(0);
  });

  it('returns no findings on empty source', async () => {
    expect(await runRule('')).toHaveLength(0);
  });
});
