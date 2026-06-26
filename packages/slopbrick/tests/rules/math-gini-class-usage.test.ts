import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { mathGiniClassUsageRule } from '../../src/rules/logic/math-gini-class-usage';
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
    thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 },
    ...overrides,
  };
}

async function runRule(source: string): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-math-gini-class-usage-test-'));
  try {
    const filePath = join(dir, 'Component.tsx');
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = mathGiniClassUsageRule.create(context);
    return mathGiniClassUsageRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('logic/math-gini-class-usage', () => {
  it('fires when CSS class usage is dominated by 1-2 classes (Gini ≥ 0.5)', async () => {
    // One class repeated 25x + 19 unique others = 20 distinct total.
    // counts = [25, 1, 1, ..., 1] (19 ones) → Gini ≈ 0.518 → fires.
    // Calibrated at 75% precision per docs/research/v4-per-rule-pr-fpr.md.
    const source = `
function Component() {
  return (
    <div className="p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 a1 a2 a3 a4 a5 a6 a7 a8 a9 a10 a11 a12 a13 a14 a15 a16 a17 a18 a19">x</div>
  );
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('logic/math-gini-class-usage');
    expect(issues[0].severity).toBe('high');
    expect(issues[0].message).toMatch(/Gini=0\.5[0-9]/);
  });

  it('does not fire on evenly-used classes (Gini ≈ 0)', async () => {
    // 20 distinct classes, each used 5x. counts = [5, 5, ..., 5] → Gini = 0.
    const source = `
function Component() {
  return (
    <div className="c1 c2 c3 c4 c5 c6 c7 c8 c9 c10 c11 c12 c13 c14 c15 c16 c17 c18 c19 c20 c1 c2 c3 c4 c5 c6 c7 c8 c9 c10 c11 c12 c13 c14 c15 c16 c17 c18 c19 c20 c1 c2 c3 c4 c5 c6 c7 c8 c9 c10 c11 c12 c13 c14 c15 c16 c17 c18 c19 c20 c1 c2 c3 c4 c5 c6 c7 c8 c9 c10 c11 c12 c13 c14 c15 c16 c17 c18 c19 c20 c1 c2 c3 c4 c5 c6 c7 c8 c9 c10 c11 c12 c13 c14 c15 c16 c17 c18 c19 c20">x</div>
  );
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not fire when there are no CSS classes', async () => {
    // counts.size = 0 < 20 → no fire (vocabulary guard).
    const source = `
function Component() {
  return <div>hello world</div>;
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not fire below the Gini threshold (≈ 0.46)', async () => {
    // Same shape as the firing case but big class repeated 20x instead of 25x.
    // counts = [20, 1, ..., 1] (19 ones, one 20) → Gini ≈ 0.463 < 0.5 → no fire.
    const source = `
function Component() {
  return (
    <div className="p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 a1 a2 a3 a4 a5 a6 a7 a8 a9 a10 a11 a12 a13 a14 a15 a16 a17 a18 a19">x</div>
  );
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not fire with < 20 distinct classes even if highly unequal', async () => {
    // Vocabulary guard: 10 distinct classes with one repeated 30x → counts.size
    // = 10 < 20 → no fire regardless of Gini.
    const source = `
function Component() {
  return (
    <div className="p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 p-4 a b c d e f g h i">x</div>
  );
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });
});