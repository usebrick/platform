import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { mathColorClusterRule } from '../../src/rules/visual/math-color-cluster';
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
    thresholds: {
      meanSlop: 0,
      p90Slop: 0,
      individualSlopThreshold: 0,
    },
    ...overrides,
  };
}

async function runRule(source: string): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-math-color-cluster-test-'));
  try {
    const filePath = join(dir, 'Component.tsx');
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = mathColorClusterRule.create(context);
    return mathColorClusterRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('visual/math-color-cluster', () => {
  it('flags \u22655 hex colors in className arbitrary values clustered in a single hue family (\u226490\u00b0 spread)', async () => {
    // All violet/fuchsia cluster \u2014 the AI default-palette tell. Hex colors
    // are inside Tailwind arbitrary values (bg-[#...]) which the rule
    // scans via flatClassNames.
    const source = `
function Component() {
  return (
    <>
      <div className="bg-[#a855f7]">a</div>
      <div className="bg-[#c026d3]">b</div>
      <div className="bg-[#d946ef]">c</div>
      <div className="bg-[#e879f9]">d</div>
      <div className="bg-[#f0abfc]">e</div>
    </>
  );
}`;
    const issues = await runRule(source);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].ruleId).toBe('visual/math-color-cluster');
    expect(issues[0].severity).toBe('high');
  });

  it('does not flag varied hues (spread > 90\u00b0)', async () => {
    // Three hue families: red, blue, green \u2014 spread > 90\u00b0.
    const source = `
function Component() {
  return (
    <>
      <div className="bg-[#dc2626]">a</div>
      <div className="bg-[#2563eb]">b</div>
      <div className="bg-[#16a34a]">c</div>
      <div className="bg-[#ca8a04]">d</div>
      <div className="bg-[#9333ea]">e</div>
    </>
  );
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag fewer than 5 colors', async () => {
    const source = `
function Component() {
  return (
    <>
      <div className="bg-[#a855f7]">a</div>
      <div className="bg-[#c026d3]">b</div>
      <div className="bg-[#d946ef]">c</div>
    </>
  );
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag when colors are grayscale (low saturation)', async () => {
    // Grays have max-min < 30 and are skipped by the saturation guard.
    const source = `
function Component() {
  return (
    <>
      <div className="bg-[#ffffff]">a</div>
      <div className="bg-[#cccccc]">b</div>
      <div className="bg-[#999999]">c</div>
      <div className="bg-[#666666]">d</div>
      <div className="bg-[#333333]">e</div>
    </>
  );
}`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });
});
