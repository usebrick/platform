import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { aiAnyDensityRule } from '../../../src/rules/ai/any-density';
import { mathAnyDensityRule } from '../../../src/rules/logic/math-any-density';
import type { Issue, ResolvedConfig, Rule, RuleContext } from '../../../src/types';

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

async function runRule(
  rule: Rule<RuleContext>,
  source: string,
  fileName = 'Component.tsx',
): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-any-density-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = rule.create(context);
    return rule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runCanonical(source: string, fileName = 'Component.tsx'): Promise<Issue[]> {
  return runRule(aiAnyDensityRule, source, fileName);
}

function runLegacyLineDensity(source: string, fileName = 'Component.tsx'): Promise<Issue[]> {
  return runRule(mathAnyDensityRule, source, fileName);
}

describe('ai/any-density', () => {
  it('flags TSX file with high `any` annotation density', async () => {
    const source = [
      'const a: any = 1;',
      'const b: any = 2;',
      'const c: any = 3;',
      'const d: any = 4;',
      'const e: any = 5;',
      'const f: any = 6;',
      'function foo(): any { return null; }',
      'function bar(): any { return null; }',
      'function baz(x: any): any { return x; }',
    ].join('\n');
    const issues = await runCanonical(source);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe('ai/any-density');
    expect(issues[0].aiSpecific).toBe(true);
  });

  it('does not flag TSX file with no `any` annotations', async () => {
    const source = [
      'const a: number = 1;',
      'const b: number = 2;',
      'const c: number = 3;',
      'const d: number = 4;',
      'const e: number = 5;',
      'function foo(): number { return 1; }',
      'function bar(): number { return 2; }',
    ].join('\n');
    const issues = await runCanonical(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag non-TS/TSX files (rule is TS-only)', async () => {
    const source = 'const a: any = 1;\n'.repeat(20);
    const issues = await runCanonical(source, 'script.js');
    expect(issues).toHaveLength(0);
  });

  it('does not flag TSX files below the declaration threshold', async () => {
    // 3 declarations only — below MIN_DECLARATIONS (5)
    const source = 'const a: any = 1;\nconst b: any = 2;\nconst c: any = 3;';
    const issues = await runCanonical(source);
    expect(issues).toHaveLength(0);
  });

  it('does not elevate line density when type-bearing declaration ratio is low', async () => {
    const source = [
      ...Array.from({ length: 6 }, (_, i) => `const escape${i}: any = input${i};`),
      ...Array.from({ length: 30 }, (_, i) => `const typed${i}: number = ${i};`),
    ].join('\n');
    expect(await runCanonical(source)).toEqual([]);
    expect(await runLegacyLineDensity(source)).toHaveLength(1);
  });

  it('retains declaration-bearing any forms the line-only rule misses', async () => {
    const source = [
      'const a = input as any;', 'const b = output as any;',
      'const c = parse<any>(raw);', 'const d = read<any>(raw);',
      'const e: any = raw;', 'const typed: string = "ok";',
    ].join('\n');
    expect(await runCanonical(source)).toHaveLength(1);
  });

  it('uses quality-only public framing', async () => {
    const source = [
      'const a = input as any;', 'const b = output as any;',
      'const c = parse<any>(raw);', 'const d = read<any>(raw);',
      'const e: any = raw;', 'const typed: string = "ok";',
    ].join('\n');
    const issues = await runCanonical(source);

    expect(aiAnyDensityRule.description).toBe(
      'A high share of TypeScript declarations use `any`, weakening static type checks.',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toBe(
      '`any` appears in 83% of type-bearing declarations (5 `any` uses / 6 declarations). ' +
      'Review whether each escape hatch is necessary.',
    );
    expect(issues[0]?.advice).toBe(
      'Replace `any` with a precise type, `unknown` plus narrowing, or a documented boundary type. ' +
      'Keep an escape hatch only when the surrounding contract cannot be represented safely.',
    );

    const publicText = [
      aiAnyDensityRule.description,
      issues[0]?.message,
      issues[0]?.advice,
    ].join(' ').toLowerCase();
    for (const forbidden of ['AI', 'LLM', 'model', 'human', 'authorship', 'fingerprint']) {
      expect(publicText).not.toContain(forbidden.toLowerCase());
    }
  });
});
