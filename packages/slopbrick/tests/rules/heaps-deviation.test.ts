import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../src/engine/visitor';
import { heapsDeviationRule } from '../../src/rules/logic/heaps-deviation';
import { RULE_HINTS } from '../../src/snippet/data';
import type { Issue, ResolvedConfig, RuleContext } from '../../src/types';

function makeConfig(): ResolvedConfig {
  return {
    include: [],
    exclude: [],
    rules: {},
    frameworkMultipliers: {},
    ruleConfig: {},
    arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
    thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 },
  };
}

async function runRule(source: string): Promise<Issue[]> {
  const cwd = mkdtempSync(join(tmpdir(), 'slopbrick-heaps-deviation-test-'));
  try {
    const filePath = join(cwd, 'source.ts');
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd };
    return heapsDeviationRule.analyze(heapsDeviationRule.create(context), facts);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

describe('logic/heaps-deviation wording', () => {
  it('frames the non-AI signal as source-code hygiene, not authorship evidence', async () => {
    const source = Array.from({ length: 80 }, () => 'const token = token;').join('\n');
    const [issue] = await runRule(source);

    expect(issue).toBeDefined();
    expect(issue?.ruleId).toBe('logic/heaps-deviation');
    expect(issue?.aiSpecific).toBe(false);
    expect(issue?.severity).toBe('medium');
    expect(issue?.message).toMatch(/vocabulary|source-code|statistical/i);
    expect(issue?.message).toMatch(/not (proof|an) authorship|not an authorship verdict/i);
    expect(issue?.message).not.toMatch(/LLM-generated|LLM-style|verify authorship/i);
    expect(issue?.advice).toMatch(/structural|source-code|identifier vocabulary/i);
    expect(issue?.advice).toMatch(/not (proof|an) authorship|not an authorship verdict/i);
    expect(issue?.advice).not.toMatch(/LLM-style|verify authorship/i);

    expect(heapsDeviationRule.description).toMatch(/hygiene|source-code|statistical/i);
    expect(heapsDeviationRule.description).toMatch(/not an authorship verdict/i);
    expect(heapsDeviationRule.description).not.toMatch(/LLM indicator/i);
    expect(RULE_HINTS['logic/heaps-deviation']).toMatch(/hygiene|source-code|structural/i);
    expect(RULE_HINTS['logic/heaps-deviation']).toMatch(/not (proof|an) authorship|not an authorship verdict/i);
    expect(RULE_HINTS['logic/heaps-deviation']).not.toMatch(/LLM-style|verify authorship/i);
  });
});
