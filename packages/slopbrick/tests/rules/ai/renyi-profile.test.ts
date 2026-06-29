import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { aiRenyiProfileRule } from '../../../src/rules/ai/renyi-profile';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-renyi-profile-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = aiRenyiProfileRule.create(context);
    return aiRenyiProfileRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('ai/renyi-profile', () => {
  it('flags repetitive code (mass concentration — H_2/H_1 > 0.85 + H_inf/H_1 > 0.95)', async () => {
    // 90 tokens, only 2 unique (`function`, `return`). Both ratios hit 1.0.
    const source = ('function f() { return 1; }\n').repeat(30);
    const issues = await runRule(source);
    expect(issues.some((i) => i.ruleId === 'ai/renyi-profile')).toBe(true);
  });

  it('does not flag diverse code (heavy rare-token tail keeps H_2/H_1 low)', async () => {
    // 60 lines, each with a unique long identifier — uniform distribution,
    // H_2/H_1 ≈ 0.58, H_inf/H_1 ≈ 0.30, well below the AI threshold.
    const lines: string[] = [];
    for (let i = 0; i < 60; i++) {
      lines.push(`const variable_${i}_name_${i}_unique_${i} = value_${i}_${i + 1};`);
    }
    const issues = await runRule(lines.join('\n'));
    expect(issues.filter((i) => i.ruleId === 'ai/renyi-profile')).toEqual([]);
  });

  it('does not flag small files (below MIN_TOKEN_COUNT=50)', async () => {
    const source = 'const x = 1;\nfunction foo() { return x; }';
    const issues = await runRule(source);
    expect(issues.filter((i) => i.ruleId === 'ai/renyi-profile')).toEqual([]);
  });
});
