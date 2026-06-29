import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { aiErrorsNearEofRule } from '../../../src/rules/ai/errors-near-eof';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-errors-near-eof-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = aiErrorsNearEofRule.create(context);
    return aiErrorsNearEofRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Note: this rule counts `{`/`}` characters regardless of parser context, so
// positive cases use brace characters embedded in STRING LITERALS (the real
// Yotkova 2026 pattern is unclosed-brace syntax that SWC cannot parse at all).

describe('ai/errors-near-eof', () => {
  it('flags clustered unclosed braces (in string literals) near EOF', async () => {
    // 25 lines; head has heavy `}` (60 closes), tail has heavy `{` (60 opens).
    // File overall balanced (fileImbalance = 0), but EOF chunk has 60 opens vs 0 closes.
    const head = Array.from({ length: 20 }, (_, i) => `const x${i} = "}}}";`).join('\n');
    const tail = Array.from({ length: 5 }, (_, i) => `const y${i} = "{{{{{{{{{{{{";`).join('\n');
    const source = `${head}\n${tail}`;
    const issues = await runRule(source);
    expect(issues.some(i => i.ruleId === 'ai/errors-near-eof')).toBe(true);
  });

  it('does not flag a file with balanced code throughout', async () => {
    const lines = Array.from({ length: 25 }, (_, i) => `const v${i} = ${i};`);
    const source = lines.join('\n');
    const issues = await runRule(source);
    expect(issues.filter(i => i.ruleId === 'ai/errors-near-eof')).toEqual([]);
  });

  it('does not flag files below the 20-line threshold (MIN_LINES)', async () => {
    // 10 lines of unbalanced string braces — short-circuits on lines.length < 20.
    const lines = Array.from({ length: 10 }, () => `const x = "}}}";`);
    const source = lines.join('\n');
    const issues = await runRule(source);
    expect(issues.filter(i => i.ruleId === 'ai/errors-near-eof')).toEqual([]);
  });
});
