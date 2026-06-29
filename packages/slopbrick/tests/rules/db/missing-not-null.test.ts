import { describe, expect, it } from 'vitest';
import { missingNotNullRule, moduleReady } from '../../../src/rules/db/missing-not-null';
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
  const ctx = missingNotNullRule.create(makeContext());
  return missingNotNullRule.analyze(ctx, makeFacts(source));
}

describe('db/missing-not-null', () => {
  it('flags required-identifier column without NOT NULL', async () => {
    // `id` matches the required-identifier regex but lacks NOT NULL.
    const sql = `CREATE TABLE users (id SERIAL, name TEXT);`;
    const issues = await runRule(sql);
    expect(issues.some(i => i.ruleId === 'db/missing-not-null')).toBe(true);
    expect(issues[0].message).toContain('id');
  });

  it('does not flag when every required column has NOT NULL', async () => {
    // No `id` here — `name` is the only column the rule cares about
    // (matches the required-identifier regex), and it has NOT NULL.
    const sql = `CREATE TABLE users (name TEXT NOT NULL);`;
    expect(await runRule(sql)).toHaveLength(0);
  });

  it('treats PRIMARY KEY as NOT NULL', async () => {
    // `id` has PRIMARY KEY (counts as NOT NULL); `email` is the only
    // required column without one, so exactly one finding for `email`.
    const sql = `CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT);`;
    const issues = await runRule(sql);
    expect(issues.length).toBe(1);
    expect(issues[0].message).toContain('email');
  });

  it('does not flag columns outside the required-pattern list', async () => {
    // No required-identifier column names — `title`, `content` are
    // not in the heuristic set.
    const sql = `CREATE TABLE posts (title TEXT, content TEXT);`;
    expect(await runRule(sql)).toHaveLength(0);
  });

  it('returns no findings on empty source', async () => {
    expect(await runRule('')).toHaveLength(0);
  });
});
