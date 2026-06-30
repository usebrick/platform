import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { unusedParameterRule } from '../../../src/rules/dead/unused-parameter';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-unused-param-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = unusedParameterRule.create(context);
    return unusedParameterRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('dead/unused-parameter', () => {
  it('flags a function parameter that is never read', async () => {
    const source = `function foo(unused, used) {\n  return used + 1;\n}\n`;
    const issues = await runRule(source);
    const unused = issues.find((i) => i.message.includes('unused'));
    expect(unused).toBeDefined();
  });

  it('does not flag a function parameter that IS read', async () => {
    const source = `function foo(used) {\n  return used + 1;\n}\n`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag an _-prefixed parameter', async () => {
    const source = `function foo(_unused) {\n  return 1;\n}\n`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag a `props` parameter (component convention)', async () => {
    const source = `function Component(props) {\n  return <div />;\n}\n`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });
});
