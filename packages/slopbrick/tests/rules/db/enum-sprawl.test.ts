import { describe, expect, it } from 'vitest';
import { enumSprawlRule, moduleReady } from '../../../src/rules/db/enum-sprawl';
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
  const ctx = enumSprawlRule.create(makeContext());
  return enumSprawlRule.analyze(ctx, makeFacts(source));
}

const ENUM_SMALL = `CREATE TYPE mood AS ENUM ('happy', 'sad', 'meh');`;
const ENUM_BIG = `CREATE TYPE mood AS ENUM ('a','b','c','d','e','f','g','h','i','j','k','l','m');`;

describe('db/enum-sprawl', () => {
  it('does not flag an enum within the 12-value cap', async () => {
    expect(await runRule(ENUM_SMALL)).toHaveLength(0);
  });

  it('flags an enum with more than 12 values', async () => {
    const issues = await runRule(ENUM_BIG);
    expect(issues.length).toBe(1);
    expect(issues[0].ruleId).toBe('db/enum-sprawl');
    expect(issues[0].message).toContain('13 values');
  });

  it('does not flag unrelated DDL', async () => {
    const sql = `CREATE TABLE x (id SERIAL PRIMARY KEY);`;
    expect(await runRule(sql)).toHaveLength(0);
  });

  it('returns no findings on empty source', async () => {
    expect(await runRule('')).toHaveLength(0);
  });
});
