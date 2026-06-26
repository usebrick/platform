import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { mathRoundedEntropyRule } from '../../src/rules/visual/math-rounded-entropy';
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
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-math-rounded-entropy-test-'));
  try {
    const filePath = join(dir, 'Component.tsx');
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = mathRoundedEntropyRule.create(context);
    return mathRoundedEntropyRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('visual/math-rounded-entropy', () => {
  it('fires when rounded-* tokens are dominated by one value (H = 0)', async () => {
    // 6× rounded-lg → 1 distinct, total=6, H = 0 < 1.8 → fires.
    // Calibrated at 69% precision per docs/research/v4-per-rule-pr-fpr.md.
    const source = `
function Component() {
  return (
    <>
      <div className="rounded-lg p-2">a</div>
      <div className="rounded-lg p-2">b</div>
      <div className="rounded-lg p-2">c</div>
      <div className="rounded-lg p-2">d</div>
      <div className="rounded-lg p-2">e</div>
      <div className="rounded-lg p-2">f</div>
    </>
  );
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('visual/math-rounded-entropy');
    expect(issues[0].severity).toBe('high');
  });

  it('fires when rounded-* tokens mix only lg/xl (H = 1, below threshold)', async () => {
    // 4× rounded-lg + 2× rounded-xl → 2 distinct, total=6,
    // H = -2*(0.5)log2(0.5) = 1.0 < 1.8 → fires (AI default palette).
    const source = `
function Component() {
  return (
    <>
      <div className="rounded-lg">a</div>
      <div className="rounded-lg">b</div>
      <div className="rounded-lg">c</div>
      <div className="rounded-lg">d</div>
      <div className="rounded-xl">e</div>
      <div className="rounded-xl">f</div>
    </>
  );
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(1);
  });

  it('does not fire on varied rounded-* tokens (H > 1.8)', async () => {
    // 5 distinct values (sm, md, lg, xl, 2xl), total=7.
    // H ≈ 2.24 > 1.8 → does not fire (real human designs mix values).
    const source = `
function Component() {
  return (
    <>
      <div className="rounded-sm">a</div>
      <div className="rounded-sm">b</div>
      <div className="rounded-md">c</div>
      <div className="rounded-md">d</div>
      <div className="rounded-lg">e</div>
      <div className="rounded-xl">f</div>
      <div className="rounded-2xl">g</div>
    </>
  );
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not fire below the total-count threshold (< 6 rounded-* tokens)', async () => {
    // total=5 < 6 → vocabulary/size guard, no fire even if H would be low.
    const source = `
function Component() {
  return (
    <>
      <div className="rounded-lg">a</div>
      <div className="rounded-lg">b</div>
      <div className="rounded-lg">c</div>
      <div className="rounded-xl">d</div>
      <div className="rounded-xl">e</div>
    </>
  );
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not fire at the entropy boundary (H = log2(4) = 2.0)', async () => {
    // 4 distinct rounded-* values, each used 2x → H = log2(4) = 2.0 > 1.8.
    // This is the boundary case where the rule stops firing.
    const source = `
function Component() {
  return (
    <>
      <div className="rounded-sm">a</div>
      <div className="rounded-sm">b</div>
      <div className="rounded-md">c</div>
      <div className="rounded-md">d</div>
      <div className="rounded-lg">e</div>
      <div className="rounded-lg">f</div>
      <div className="rounded-xl">g</div>
      <div className="rounded-xl">h</div>
    </>
  );
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });
});