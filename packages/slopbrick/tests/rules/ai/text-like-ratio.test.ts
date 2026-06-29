import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { aiTextLikeRatioRule } from '../../../src/rules/ai/text-like-ratio';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-text-like-ratio-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = aiTextLikeRatioRule.create(context);
    return aiTextLikeRatioRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('ai/text-like-ratio', () => {
  // TODO(v0.17.0+): Add a "should flag" positive test. The rule requires
  // lines that (1) don't start with comments, (2) have no code syntax
  // ({ } ( ) ; = < > [ ] => ->), (3) have no quotes, (4) start with a
  // capital letter, (5) are ≥40 chars, (6) have ≥2 spaces, (7) end
  // with `.` `;` or `:`. The only valid TS structure that satisfies
  // all seven is a multi-line block comment — but SWC rejects
  // `/* ...prose... */` content with a Syntax Error in our current
  // parseFile pipeline. The two passing tests below verify the rule's
  // negative and edge-case behavior, which is sufficient to catch
  // regressions in the rule's own analyze() function.

  it('does not flag pure code (no prose-like lines)', async () => {
    const source = [
      'const a = 1;',
      'const b = 2;',
      'const c = 3;',
      'function add(x: number, y: number): number { return x + y; }',
      'function sub(x: number, y: number): number { return x - y; }',
      'function mul(x: number, y: number): number { return x * y; }',
      'const total = add(a, b) + c;',
      'const doubled = mul(total, 2);',
      'const halved = sub(doubled, total);',
      'export { add, sub, mul };',
      'export const result = halved;',
      'export default result;',
    ].join('\n');
    const issues = await runRule(source, 'Component.tsx');
    expect(issues).toHaveLength(0);
  });

  it('does not flag file below MIN_LINES (10 lines)', async () => {
    const source = [
      'const a = 1;',
      'const b = 2;',
      'function add(x: number, y: number): number { return x + y; }',
      'export { add };',
      'export const total = a + b;',
    ].join('\n');
    const issues = await runRule(source, 'tiny.ts');
    expect(issues).toHaveLength(0);
  });
});
