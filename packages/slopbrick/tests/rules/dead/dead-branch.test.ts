import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { deadBranchRule } from '../../../src/rules/dead/dead-branch';
import type { Issue, ResolvedConfig, RuleContext } from '../../../src/types';

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    include: [],
    exclude: [],
    rules: {},
    frameworkMultipliers: {},
    ruleConfig: {},
    arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
    thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 },
    ...overrides,
  };
}

async function runRule(source: string, fileName = 'Component.tsx'): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-dead-branch-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = deadBranchRule.create(context);
    return deadBranchRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('dead/dead-branch', () => {
  it('flags if (true)', async () => {
    const source = `if (true) { console.log('a'); }\n`;
    const issues = await runRule(source);
    expect(issues.length).toBe(1);
    expect(issues[0].message).toMatch(/always true/);
  });

  it('flags if (false)', async () => {
    const source = `if (false) { console.log('a'); }\n`;
    const issues = await runRule(source);
    expect(issues.length).toBe(1);
    expect(issues[0].message).toMatch(/always false/);
  });

  it('flags while (false) at medium severity', async () => {
    const source = `while (false) { console.log('a'); }\n`;
    const issues = await runRule(source);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('medium');
  });

  it('suppresses while (true) with reachable break (event-loop pattern, v0.39.0)', async () => {
    // v0.39.0: `while (true) { break; }` is the idiomatic event-loop /
    // config-walk / hot-loop pattern. The previous behavior downgraded
    // severity but still emitted the issue, which was a false positive
    // on ~4 legitimate patterns per self-scan. v0.39.0 suppresses the
    // rule entirely when the body contains a `break` statement.
    //
    // We don't track full dataflow reachability (that's a proper
    // dataflow analysis) — just the presence of any `break` in the
    // body. This is conservative: it may miss cases where a `break`
    // is inside a nested function or behind a flag, but those are
    // rare enough that the false-negative cost is lower than the
    // false-positive cost on the event-loop pattern.
    const source = `while (true) { break; }\n`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag a real boolean expression', async () => {
    const source = `if (x > 0) { console.log('a'); }\n`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });
});
