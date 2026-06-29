import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { aiAnyDensityRule } from '../../../src/rules/ai/any-density';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-any-density-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = aiAnyDensityRule.create(context);
    return aiAnyDensityRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
    const issues = await runRule(source);
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
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag non-TS/TSX files (rule is TS-only)', async () => {
    const source = 'const a: any = 1;\n'.repeat(20);
    const issues = await runRule(source, 'script.js');
    expect(issues).toHaveLength(0);
  });

  it('does not flag TSX files below the declaration threshold', async () => {
    // 3 declarations only — below MIN_DECLARATIONS (5)
    const source = 'const a: any = 1;\nconst b: any = 2;\nconst c: any = 3;';
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });
});
