import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { aiLogRankHistogramRule } from '../../../src/rules/ai/log-rank-histogram';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-log-rank-histogram-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = aiLogRankHistogramRule.create(context);
    return aiLogRankHistogramRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('ai/log-rank-histogram', () => {
  it('does not flag small files (below MIN_TOKEN_COUNT=100)', async () => {
    // ~30 tokens — too few for the rule to fire.
    const source = [
      'function a() { return 1; }',
      'function b() { return 2; }',
      'function c() { return 3; }',
      'function d() { return 4; }',
      'function e() { return 5; }',
      'function f() { return 6; }',
      'function g() { return 7; }',
      'function h() { return 8; }',
      'function i() { return 9; }',
      'function j() { return 10; }',
    ].join('\n');
    const issues = await runRule(source);
    expect(issues.filter((i) => i.ruleId === 'ai/log-rank-histogram')).toEqual([]);
  });

  it('does not flag repetitive code (rule is unreachable with within-file corpus)', async () => {
    // 105+ tokens, only ~3 unique. The within-file frequency distribution
    // puts everything in the top-10 bucket, so pTop1000 (rank 100-1000
    // bucket) ≈ 0 and the rule short-circuits.
    const source = ('function f() { return 1; }\n').repeat(40);
    const issues = await runRule(source);
    expect(issues.filter((i) => i.ruleId === 'ai/log-rank-histogram')).toEqual([]);
  });

  it('does not flag empty source', async () => {
    const issues = await runRule('');
    expect(issues.filter((i) => i.ruleId === 'ai/log-rank-histogram')).toEqual([]);
  });
});
