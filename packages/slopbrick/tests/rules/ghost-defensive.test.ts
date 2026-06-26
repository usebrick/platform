import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { ghostDefensiveRule } from '../../src/rules/logic/ghost-defensive';
import type { Issue, ResolvedConfig, RuleContext } from '../../src/types';

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    include: [],
    exclude: [],
    rules: {},
    frameworkMultipliers: {},
    ruleConfig: {},
    arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
    thresholds: {
      meanSlop: 0,
      p90Slop: 0,
      individualSlopThreshold: 0,
    },
    ...overrides,
  };
}

async function runRule(source: string): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-ghost-defensive-test-'));
  try {
    const filePath = join(dir, 'Component.tsx');
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = ghostDefensiveRule.create(context);
    return ghostDefensiveRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('logic/ghost-defensive', () => {
  it('flags 3+ deep optional-chain-like expressions', async () => {
    // Three independent deep && guards in the same file = the AI
    // signature (rule requires \u22653 candidates before firing).
    const source = `
function a(x) { return x && x.foo && x.foo.bar && x.foo.bar.baz; }
function b(y) { return y && y.foo && y.foo.bar && y.foo.bar.baz; }
function c(z) { return z && z.foo && z.foo.bar && z.foo.bar.baz; }
`;
    const issues = await runRule(source);
    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(issues[0].ruleId).toBe('logic/ghost-defensive');
  });

  it('does not fire when only 1-2 deep guards are present', async () => {
    // Below the threshold of 3.
    const source = `
function a(x) { return x && x.foo && x.foo.bar && x.foo.bar.baz; }
function b(y) { return y && y.foo && y.foo.bar && y.foo.bar.baz; }
`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag shallow expressions', async () => {
    const source = `
function a(x) { return x && x.foo; }
function b(y) { return y && y.foo; }
function c(z) { return z && z.foo; }
`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });
});
