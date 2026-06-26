import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { spacingScaleViolationRule } from '../../src/rules/visual/spacing-scale-violation';
import { radiusScaleViolationRule } from '../../src/rules/visual/radius-scale-violation';
import {
  parseArbitraryValue,
  toRem,
  nearestScaleEntry,
  isRadiusArbitrary,
} from '../../src/rules/utils';
import type { ResolvedConfig, RuleContext } from '../../src/types';

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

// Local any-typed rule alias so the helper accepts both
// spacingScaleViolationRule and radiusScaleViolationRule without
// fighting TypeScript over the Context generic.
type AnyRule = {
  create: (ctx: RuleContext) => any;
  analyze: (ctx: any, facts: any) => Array<{ ruleId: string; message: string; fixes?: Array<{ newValue?: string }> }>;
};

async function runRule(
  source: string,
  rule: AnyRule,
  config: ResolvedConfig,
  fileName = 'Component.tsx',
): Promise<Array<{ ruleId: string; message: string; fixes?: Array<{ newValue?: string }> }>> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-scale-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = rule.create(context);
    return rule.analyze(ruleContext, facts) as Array<{ ruleId: string; message: string; fixes?: Array<{ newValue: string }> }>;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---- parseArbitraryValue + toRem ---------------------------------------

describe('parseArbitraryValue', () => {
  it('parses px values', () => {
    expect(parseArbitraryValue('13px')).toEqual({ value: 13, unit: 'px' });
  });
  it('parses rem values', () => {
    expect(parseArbitraryValue('2.5rem')).toEqual({ value: 2.5, unit: 'rem' });
  });
  it('parses em values', () => {
    expect(parseArbitraryValue('1em')).toEqual({ value: 1, unit: 'em' });
  });
  it('parses % values', () => {
    expect(parseArbitraryValue('50%')).toEqual({ value: 50, unit: '%' });
  });
  it('returns null for non-numeric values', () => {
    expect(parseArbitraryValue('auto')).toBeNull();
    expect(parseArbitraryValue('inherit')).toBeNull();
    expect(parseArbitraryValue('currentColor')).toBeNull();
  });
  it('returns null for unknown units', () => {
    expect(parseArbitraryValue('13vh')).toBeNull();
  });
});

describe('toRem', () => {
  it('converts px assuming 1rem=16px', () => {
    expect(toRem({ value: 16, unit: 'px' })).toBe(1);
    expect(toRem({ value: 8, unit: 'px' })).toBe(0.5);
  });
  it('passes through rem/em', () => {
    expect(toRem({ value: 2.5, unit: 'rem' })).toBe(2.5);
    expect(toRem({ value: 1, unit: 'em' })).toBe(1);
  });
  it('returns null for percentages', () => {
    expect(toRem({ value: 50, unit: '%' })).toBeNull();
  });
});

describe('nearestScaleEntry', () => {
  it('returns exact match with zero distance', () => {
    expect(nearestScaleEntry(1, [0, 0.5, 1, 2])).toEqual({ entry: 1, distance: 0 });
  });
  it('returns the closest entry', () => {
    expect(nearestScaleEntry(1.3, [0, 0.5, 1, 1.5, 2])?.entry).toBe(1.5);
    expect(nearestScaleEntry(0.7, [0, 0.5, 1, 1.5])?.entry).toBe(0.5);
  });
  it('skips non-numeric entries ("full")', () => {
    const result = nearestScaleEntry(1, [0, 0.5, 1, 'full']);
    expect(result?.entry).toBe(1);
  });
  it('returns null when scale is empty', () => {
    expect(nearestScaleEntry(1, [])).toBeNull();
  });
  it('returns null when scale has only non-numeric entries', () => {
    expect(nearestScaleEntry(1, ['full'])).toBeNull();
  });
});

describe('isRadiusArbitrary', () => {
  it('matches rounded arbitrary values', () => {
    expect(isRadiusArbitrary('rounded-[7px]')).toBe(true);
    expect(isRadiusArbitrary('rounded-[1.5rem]')).toBe(true);
  });
  it('matches directional rounded arbitrary values', () => {
    expect(isRadiusArbitrary('rounded-t-[2px]')).toBe(true);
    expect(isRadiusArbitrary('rounded-tl-[0.5rem]')).toBe(true);
    expect(isRadiusArbitrary('rounded-br-[3px]')).toBe(true);
  });
  it('does not match named tokens', () => {
    expect(isRadiusArbitrary('rounded-lg')).toBe(false);
    expect(isRadiusArbitrary('rounded-full')).toBe(false);
  });
  it('does not match unrelated classes', () => {
    expect(isRadiusArbitrary('p-2')).toBe(false);
    expect(isRadiusArbitrary('text-[14px]')).toBe(false);
  });
});

// ---- spacing-scale-violation ------------------------------------------

describe('spacing-scale-violation', () => {
  it('does nothing when scale is empty', async () => {
    const source = `<div className="p-[13px]" />`;
    const issues = await runRule(
      source,
      spacingScaleViolationRule,
      makeConfig({ spacingScale: [] }),
    );
    expect(issues).toHaveLength(0);
  });

  it('flags p-[13px] as off-scale (Tailwind default)', async () => {
    const source = `<div className="p-[13px]" />`;
    const issues = await runRule(
      source,
      spacingScaleViolationRule,
      makeConfig({
        spacingScale: [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 6, 8, 12, 16],
      }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('visual/spacing-scale-violation');
    expect(issues[0].message).toContain('p-[13px]');
    expect(issues[0].message).toContain('13px');
    expect(issues[0].fixes?.[0]?.newValue).toBe('p-1');
  });

  it('does not flag on-scale values', async () => {
    const source = `<div className="p-4 m-2 gap-1" />`;
    const issues = await runRule(
      source,
      spacingScaleViolationRule,
      makeConfig({
        spacingScale: [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5, 4],
      }),
    );
    expect(issues).toHaveLength(0);
  });

  it('flags multiple spacing utilities independently', async () => {
    const source = `<div className="p-[7px] m-[9px] gap-[1.75rem]" />`;
    const issues = await runRule(
      source,
      spacingScaleViolationRule,
      makeConfig({
        spacingScale: [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 6, 8, 12, 16],
      }),
    );
    expect(issues).toHaveLength(3);
    const fixes = issues.map((i) => i.fixes?.[0]?.newValue);
    expect(fixes).toContain('p-0.5'); // 7px ≈ 0.4375rem → nearest 0.5
    expect(fixes).toContain('m-0.5'); // 9px ≈ 0.5625rem → nearest 0.5
    expect(fixes).toContain('gap-1.5'); // 1.75rem → ties with 2, first match wins
  });

  it('handles directional spacing utilities', async () => {
    const source = `<div className="px-[7px] my-[3px] space-x-[13px]" />`;
    const issues = await runRule(
      source,
      spacingScaleViolationRule,
      makeConfig({
        spacingScale: [0, 0.5, 1, 1.5, 2, 4, 8, 16],
      }),
    );
    expect(issues).toHaveLength(3);
  });

  it('emits an advice line that names the nearest scale value', async () => {
    const source = `<div className="p-[17px]" />`;
    const issues = await runRule(
      source,
      spacingScaleViolationRule,
      makeConfig({
        spacingScale: [0, 0.5, 1, 1.5, 2, 4, 6, 8, 12, 16],
      }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/Nearest scale value: 1rem/);
  });
});

// ---- radius-scale-violation -------------------------------------------

describe('radius-scale-violation', () => {
  it('does nothing when scale is empty', async () => {
    const source = `<div className="rounded-[7px]" />`;
    const issues = await runRule(
      source,
      radiusScaleViolationRule,
      makeConfig({ radiusScale: [] }),
    );
    expect(issues).toHaveLength(0);
  });

  it('flags rounded-[7px] as off-scale', async () => {
    const source = `<div className="rounded-[7px]" />`;
    const issues = await runRule(
      source,
      radiusScaleViolationRule,
      makeConfig({
        radiusScale: [0, 0.125, 0.25, 0.375, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 'full'],
      }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('visual/radius-scale-violation');
    expect(issues[0].message).toContain('rounded-[7px]');
    // 7px = 0.4375rem → nearest 0.375 → 'md'
    expect(issues[0].fixes?.[0]?.newValue).toBe('rounded-md');
  });

  it('does not flag canonical radius tokens', async () => {
    const source = `<div className="rounded-md rounded-lg rounded-2xl rounded-full" />`;
    const issues = await runRule(
      source,
      radiusScaleViolationRule,
      makeConfig({
        radiusScale: [0, 0.125, 0.25, 0.375, 0.5, 0.75, 1, 1.5, 2, 3, 4, 'full'],
      }),
    );
    expect(issues).toHaveLength(0);
  });

  it('flags directional radius utilities', async () => {
    const source = `<div className="rounded-t-[7px] rounded-br-[5rem]" />`;
    const issues = await runRule(
      source,
      radiusScaleViolationRule,
      makeConfig({
        radiusScale: [0, 0.125, 0.25, 0.375, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 'full'],
      }),
    );
    expect(issues).toHaveLength(2);
    expect(issues[0].fixes?.[0]?.newValue).toContain('rounded-t-');
    expect(issues[1].fixes?.[0]?.newValue).toContain('rounded-br-');
  });

  it('converts px and rem consistently', async () => {
    // 32px and 2rem are the same value in canonical terms.
    const source = `<div className="rounded-[32px] rounded-[2rem]" />`;
    const issues = await runRule(
      source,
      radiusScaleViolationRule,
      makeConfig({
        radiusScale: [0, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 'full'],
      }),
    );
    // Both should be on-scale (2rem is in the scale). Expect 0 violations.
    expect(issues).toHaveLength(0);
  });

  it('skips percentage values (border-radius: 50%)', async () => {
    const source = `<div className="rounded-[50%]" />`;
    const issues = await runRule(
      source,
      radiusScaleViolationRule,
      makeConfig({
        radiusScale: [0, 0.5, 1, 1.5, 2, 'full'],
      }),
    );
    expect(issues).toHaveLength(0);
  });
});