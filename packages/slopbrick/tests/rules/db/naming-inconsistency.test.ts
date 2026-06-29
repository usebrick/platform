import { describe, expect, it } from 'vitest';
import { namingInconsistencyRule, moduleReady } from '../../../src/rules/db/naming-inconsistency';
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
  const ctx = namingInconsistencyRule.create(makeContext());
  return namingInconsistencyRule.analyze(ctx, makeFacts(source));
}

// Quoted ("...") identifiers preserve case — unquoted ones get
// lowercased by Postgres before storage, so the rule can't distinguish
// snake_case from camelCase for unquoted names. The test SQL uses
// quoted identifiers deliberately.

const MIXED_QUOTED = `
  CREATE TYPE "snake_status" AS ENUM ('a','b','c');
  CREATE TYPE "camelStatus" AS ENUM ('x','y','z');
  CREATE TYPE "another_snake" AS ENUM ('p','q','r');
  CREATE TYPE "anotherCamel" AS ENUM ('s','t','u');
`;

const PURE_SNAKE_QUOTED = `
  CREATE TYPE "snake_status" AS ENUM ('a','b','c');
  CREATE TYPE "another_snake" AS ENUM ('x','y','z');
  CREATE TYPE "third_snake" AS ENUM ('p','q','r');
`;

const BELOW_THRESHOLD = `
  CREATE TYPE "snake_one" AS ENUM ('a','b','c');
  CREATE TYPE "another_snake" AS ENUM ('x','y','z');
  CREATE TYPE "third_snake" AS ENUM ('p','q','r');
  CREATE TYPE "oneCamel" AS ENUM ('q','r','s');
`;

describe('db/naming-inconsistency', () => {
  it('flags when snake_case and camelCase both appear at volume', async () => {
    const issues = await runRule(MIXED_QUOTED);
    expect(issues.some(i => i.ruleId === 'db/naming-inconsistency')).toBe(true);
  });

  it('does not flag a pure snake_case file (with quoted names)', async () => {
    expect(await runRule(PURE_SNAKE_QUOTED)).toHaveLength(0);
  });

  it('does not flag when one style is below the threshold', async () => {
    // Only one camelCase identifier (oneCamel) — below the
    // `camelCount >= 2` gate.
    expect(await runRule(BELOW_THRESHOLD)).toHaveLength(0);
  });

  it('returns no findings on empty source', async () => {
    expect(await runRule('')).toHaveLength(0);
  });
});
