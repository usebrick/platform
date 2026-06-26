import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { mathConsoleLogStormRule } from '../../src/rules/logic/math-console-log-storm';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-console-log-storm-test-'));
  try {
    const filePath = join(dir, 'Component.tsx');
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = mathConsoleLogStormRule.create(context);
    return mathConsoleLogStormRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('logic/math-console-log-storm', () => {
  it('flags 5+ console.log calls clustered in a 30-line window', async () => {
    const source = `
function Component() {
  useEffect(() => {
    console.log('a');
    console.log('b');
    console.log('c');
    console.log('d');
    console.log('e');
    console.log('f');
  }, []);
  return <div />;
}`;
    const issues = await runRule(source);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe('logic/math-console-log-storm');
    expect(issues[0].severity).toBe('high');
    expect(issues[0].aiSpecific).toBe(true);
  });

  it('does not flag when console.logs are spread across the file', async () => {
    // 5 logs but separated by \u226530 lines each \u2014 not a "storm" pattern.
    const lines: string[] = ['function Component() {'];
    for (let i = 0; i < 5; i++) {
      lines.push(`  console.log('line ${i}');`);
      // Pad 35 blank lines between each.
      for (let j = 0; j < 35; j++) lines.push('');
    }
    lines.push('  return <div />;', '}');
    const source = lines.join('\n');
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag fewer than 5 console.log calls', async () => {
    const source = `
function Component() {
  useEffect(() => {
    console.log('a');
    console.log('b');
    console.log('c');
    console.log('d');
  }, []);
  return <div />;
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag files with no console.log', async () => {
    const source = `
function Component() {
  const x = 1;
  return <div>{x}</div>;
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });
});
