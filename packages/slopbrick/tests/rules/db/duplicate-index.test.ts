import { describe, expect, it } from 'vitest';
import { duplicateIndexRule, moduleReady } from '../../../src/rules/db/duplicate-index';
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
  await moduleReady;
  const ctx = duplicateIndexRule.create(makeContext());
  return duplicateIndexRule.analyze(ctx, makeFacts(source));
}

describe('db/duplicate-index', () => {
  it('flags two CREATE INDEX on the same column list', async () => {
    const sql = `
      CREATE INDEX idx_a_users_email ON users (email);
      CREATE INDEX idx_b_users_email ON users (email);
    `;
    const issues = await runRule(sql);
    expect(issues.length).toBe(1);
    expect(issues[0].ruleId).toBe('db/duplicate-index');
    expect(issues[0].message).toContain('email');
  });

  it('does not flag two CREATE INDEX on different column lists', async () => {
    const sql = `
      CREATE INDEX idx_a ON users (email);
      CREATE INDEX idx_b ON users (created_at);
    `;
    expect(await runRule(sql)).toHaveLength(0);
  });

  it('treats column order as irrelevant (sorted normalization)', async () => {
    const sql = `
      CREATE INDEX idx_a ON users (email, created_at);
      CREATE INDEX idx_b ON users (created_at, email);
    `;
    expect((await runRule(sql)).length).toBeGreaterThanOrEqual(1);
  });

  it('returns no findings on empty source', async () => {
    expect(await runRule('')).toHaveLength(0);
  });
});
