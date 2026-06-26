import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { spacingScaleViolationRule } from '../../src/rules/visual/spacing-scale-violation';
import type { Issue, ResolvedConfig, RuleContext } from '../../src/types';

/**
 * v0.10 Phase 4 — defensive coverage for `visual/spacing-scale-violation`.
 *
 * Calibration: 44% precision in v4 (MIXED); rule is `defaultOff` pending a
 * recalibration sweep. Tests assert defensible behavior over fire frequency.
 *
 * Math foundation: see `docs/research/math-foundations-for-slopbrick.md`
 * §3.3 — arbitrary-value distance from a declared design-token scale.
 */

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

async function runRule(
  source: string,
  config: ResolvedConfig,
  fileName = 'Component.tsx',
): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-spacing-scale-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = spacingScaleViolationRule.create(context);
    return spacingScaleViolationRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Default Tailwind-derived spacing scale (in rem). Matches the project's
// documented default in `slopbrick.config.mjs`.
const TAILWIND_SCALE = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 6, 8, 12, 16];

describe('visual/spacing-scale-violation', () => {
  it('fires on an off-scale arbitrary value (p-[13px])', async () => {
    const source = `<div className="p-[13px]" />`;
    const issues = await runRule(source, makeConfig({ spacingScale: TAILWIND_SCALE }));
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('visual/spacing-scale-violation');
    expect(issues[0].severity).toBe('medium');
    expect(issues[0].message).toContain('p-[13px]');
    // 13px → 0.8125rem → nearest Tailwind entry 1rem → suggested `p-1`.
    expect(issues[0].fixes?.[0]?.newValue).toBe('p-1');
  });

  it('does not fire when values are scale-aligned (p-4 m-2 gap-1)', async () => {
    const source = `<div className="p-4 m-2 gap-1" />`;
    const issues = await runRule(source, makeConfig({ spacingScale: TAILWIND_SCALE }));
    expect(issues).toHaveLength(0);
  });

  it('does not fire when an arbitrary value lands exactly on a scale entry (p-[16px])', async () => {
    // 16px = 1rem, which is on the Tailwind scale. SCALE_TOLERANCE is 0.001rem
    // so this should be a no-op despite being syntactically arbitrary.
    const source = `<div className="p-[16px]" />`;
    const issues = await runRule(source, makeConfig({ spacingScale: TAILWIND_SCALE }));
    expect(issues).toHaveLength(0);
  });

  it('does not fire on arbitrary values when the scale is empty (declarative opt-in)', async () => {
    // Default behavior: empty spacingScale = "we deliberately don't enforce
    // a scale". The rule short-circuits rather than firing on every arbitrary
    // value in the codebase.
    const source = `<div className="p-[13px] m-[7px] gap-[42rem]" />`;
    const issues = await runRule(source, makeConfig({ spacingScale: [] }));
    expect(issues).toHaveLength(0);
  });
});