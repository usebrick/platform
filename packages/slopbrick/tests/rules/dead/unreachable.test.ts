import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { unreachableRule } from '../../../src/rules/dead/unreachable';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-unreachable-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = unreachableRule.create(context);
    return unreachableRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('dead/unreachable', () => {
  it('flags a statement after return', async () => {
    const source = `function foo() {\n  return 1;\n  console.log('never runs');\n}\n`;
    const issues = await runRule(source);
    expect(issues.length).toBe(1);
    expect(issues[0].message).toContain('Unreachable after return');
  });

  it('flags a statement after throw', async () => {
    const source = `function foo() {\n  throw new Error('x');\n  const y = 1;\n}\n`;
    const issues = await runRule(source);
    expect(issues.length).toBe(1);
    expect(issues[0].message).toContain('Unreachable after throw');
  });

  it('does NOT flag statements when return is inside a nested if', async () => {
    // The helper only walks top-level function-body statements.
    // `if (x) return;` is in a nested block, so `foo()` IS reachable.
    const source = `function bar() {\n  if (x) return;\n  foo();\n}\n`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag a function with no return', async () => {
    const source = `function foo() {\n  const x = 1;\n  return x;\n}\n`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('emits the unreachable statement at high severity', async () => {
    const source = `function foo() {\n  return 1;\n  const y = 2;\n}\n`;
    const issues = await runRule(source);
    expect(issues[0].severity).toBe('high');
  });

  it('does not flag cleanup in a finally block', async () => {
    const issues = await runRule('function f(){ try { work(); } finally { cleanup(); } }');
    expect(issues).toHaveLength(0);
  });

  it.each([
    ['alternate syntax', 'function f(){ throw new Error("x"); }'],
    ['baseline', 'function f(){ return compute(); }'],
    ['comment adjacent', '// return; cleanup();\nfunction f(){ cleanup(); }'],
    ['near miss', 'function f(){ if(false){ cleanup(); } }'],
    ['regression safe', 'function f(){ for(;;){ break; } cleanup(); }'],
  ])('does not flag the %s transfer control', async (_label, source) => {
    expect(await runRule(source)).toHaveLength(0);
  });
});
