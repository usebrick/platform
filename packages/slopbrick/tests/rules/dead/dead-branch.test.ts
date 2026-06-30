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

  it('downgrades while (true) to low severity (legitimate event loop)', async () => {
    const source = `while (true) { break; }\n`;
    const issues = await runRule(source);
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('low');
    expect(issues[0].message).toMatch(/Infinite loop/);
  });

  it('does not flag a real boolean expression', async () => {
    const source = `if (x > 0) { console.log('a'); }\n`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });
});
