import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { aiSegmentSurprisalCvRule } from '../../../src/rules/ai/segment-surprisal-cv';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-segment-surprisal-cv-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = aiSegmentSurprisalCvRule.create(context);
    return aiSegmentSurprisalCvRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('ai/segment-surprisal-cv', () => {
  it('flags large files with suspiciously uniform per-window cross-entropy', async () => {
    // 240+ tokens. With the within-file trigram LM, every segment scores
    // the same (CV ≈ 0, maxSlope ≈ 0) — below both the 0.10 CV and
    // 0.5 maxSlope thresholds.
    const source = ('function f() { return 1; }\n').repeat(100);
    const issues = await runRule(source);
    const issue = issues.find((i) => i.ruleId === 'ai/segment-surprisal-cv');
    expect(issue).toBeDefined();
    expect(`${issue?.message}\n${issue?.advice}`).not.toMatch(/LLM|human code|verify authorship/i);
  });

  it('does not flag small files (below MIN_TOKEN_COUNT=200)', async () => {
    const source = ('function f() { return 1; }\n').repeat(20);
    const issues = await runRule(source);
    expect(issues.filter((i) => i.ruleId === 'ai/segment-surprisal-cv')).toEqual([]);
  });

  it('does not flag empty source', async () => {
    const issues = await runRule('');
    expect(issues.filter((i) => i.ruleId === 'ai/segment-surprisal-cv')).toEqual([]);
  });
});
