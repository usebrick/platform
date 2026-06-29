import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { evalRule } from '../../../src/rules/security/eval';
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

async function runRule(source: string, fileName = 'server.ts'): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-eval-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = evalRule.create(context);
    return evalRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('security/eval', () => {
  it('flags bare eval() call', async () => {
    const source = 'const result = eval(userInput);';
    const issues = await runRule(source);
    expect(issues.some((i) => i.ruleId === 'security/eval')).toBe(true);
  });

  it('flags new Function() call', async () => {
    const source = 'const fn = new Function("a", "return a + 1");';
    const issues = await runRule(source);
    expect(issues.some((i) => i.ruleId === 'security/eval')).toBe(true);
  });

  it('flags window.eval() qualified call', async () => {
    const source = 'const result = window.eval(inputString);';
    const issues = await runRule(source);
    expect(issues.some((i) => i.ruleId === 'security/eval')).toBe(true);
  });

  it('flags globalThis.eval() qualified call', async () => {
    const source = 'const result = globalThis.eval(payload);';
    const issues = await runRule(source);
    expect(issues.some((i) => i.ruleId === 'security/eval')).toBe(true);
  });

  it('does not flag a line comment that mentions eval()', async () => {
    const source = '// TODO: avoid eval() in this file\nconst x = 1;';
    const issues = await runRule(source);
    expect(issues.filter((i) => i.ruleId === 'security/eval')).toEqual([]);
  });

  it('does not flag a block comment that mentions eval()', async () => {
    const source = '/* we used to use eval() here */\nconst x = 1;';
    const issues = await runRule(source);
    expect(issues.filter((i) => i.ruleId === 'security/eval')).toEqual([]);
  });

  it('does not flag eval referenced in a string literal', async () => {
    const source = 'const msg = "do not use eval() here";\nconst x = 1;';
    const issues = await runRule(source);
    expect(issues.filter((i) => i.ruleId === 'security/eval')).toEqual([]);
  });

  it('does not flag empty source', async () => {
    const issues = await runRule('');
    expect(issues.filter((i) => i.ruleId === 'security/eval')).toEqual([]);
  });
});
