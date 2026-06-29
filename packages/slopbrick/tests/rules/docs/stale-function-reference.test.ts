import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { staleFunctionReferenceRule } from '../../../src/rules/docs/stale-function-reference';
import type { Issue, ResolvedConfig, RuleContext, ScanFacts } from '../../../src/types';

function makeConfig(): ResolvedConfig {
  return {
    include: [], exclude: [], rules: {}, frameworkMultipliers: {},
    ruleConfig: {}, arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
    thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 },
    spacingScale: [], radiusScale: [], clampAllowlist: [], allowedImports: [],
    prScoreThreshold: 0, testIntelligence: { missingEdgeCase: false },
    categoryWeights: {} as ResolvedConfig['categoryWeights'],
    projectMemory: false, telemetry: false,
  };
}

function makeFacts(filePath: string, source: string): ScanFacts {
  return { filePath, v2: { _source: source } as unknown as ScanFacts['v2'] };
}

async function runRule(source: string, exports: Record<string, string>): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-stale-fn-test-'));
  try {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(
      join(dir, 'src', 'utils.ts'),
      Object.entries(exports).map(([k, v]) => `export ${v} ${k};`).join('\n'),
    );
    const filePath = join(dir, 'README.md');
    writeFileSync(filePath, source);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = staleFunctionReferenceRule.create(context);
    return staleFunctionReferenceRule.analyze(ruleContext, makeFacts(filePath, source));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe('docs/stale-function-reference', () => {
  it('flags an identifier in a calling context with no matching export', async () => {
    // Span must be JUST an identifier (no parens inside backticks);
    // a `(` must appear within 50 chars AFTER the span.
    const md = 'Use the `multiply` helper: multiply(2, 3) returns the product.';
    const issues = await runRule(md, { add: 'function', subtract: 'function' });
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe('docs/stale-function-reference');
    expect(issues[0].message).toContain('multiply');
  });

  it('does not flag a calling reference to an exported function', async () => {
    const issues = await runRule(
      'Use the `add` helper: add(2, 3) returns the sum.',
      { add: 'function', subtract: 'function' },
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag bare inline code without a calling context', async () => {
    const issues = await runRule(
      'The `multiply` symbol is exported and well-tested.',
      { multiply: 'function' },
    );
    expect(issues).toHaveLength(0);
  });

  it('does not flag reserved/common words even with a calling context', async () => {
    const issues = await runRule('Use `if (x) { ... }` to branch.', {});
    expect(issues).toHaveLength(0);
  });

  it('does not flag identifiers shorter than 3 chars', async () => {
    const issues = await runRule('Use the `ab` helper: ab(1) starts the engine.', {});
    expect(issues).toHaveLength(0);
  });

  it('flags only the missing one when both missing and present exports are referenced', async () => {
    const issues = await runRule(
      'Use `add` first, then `missingFn` later: add(1) then missingFn(2).',
      { add: 'function' },
    );
    expect(issues.length).toBe(1);
    expect(issues[0].message).toContain('missingFn');
  });
});
