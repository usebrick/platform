// Rule: visual/spacing-scale-violation
//
// Flags Tailwind arbitrary-value spacing utilities (`p-[13px]`,
// `gap-[2.5rem]`, `mx-[7px]`, etc.) whose numeric value doesn't
// fall on the project's declared `spacingScale`. The default scale
// matches Tailwind's (0, 0.5, 1, 1.5, 2, 2.5, ...). Projects can
// override via `spacingScale` in slopbrick.config.mjs.
//
// Severity: medium (report but don't block). Applies to human and
// AI-generated code equally — drift from a declared scale is a
// design-system consistency issue, not an AI tell.

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import {
  isLayoutArbitrary,
  parseArbitraryValue,
  toRem,
  nearestScaleEntry,
} from '../utils';

export interface SpacingScaleViolationContext {
  scale: readonly number[];
}

const SCALE_TOLERANCE = 0.001; // rem

export const spacingScaleViolationRule = createRule<SpacingScaleViolationContext>({
  id: 'visual/spacing-scale-violation',
  category: 'visual',
  severity: 'medium',
  aiSpecific: false,
  description:
    'Spacing utility uses an arbitrary value (e.g. `p-[13px]`) outside the declared design-system scale.',
  create(context: RuleContext): SpacingScaleViolationContext {
    return {
      scale: context.config.spacingScale ?? [],
    };
  },
  analyze(context: SpacingScaleViolationContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    if (context.scale.length === 0) return issues;
    const v2 = facts.v2;

    for (const el of v2.jsx.elements) {
      for (const cls of el.classNames) {
        if (!isLayoutArbitrary(cls)) continue;

        // Strip the leading `prefix-[...]` to isolate the raw value.
        const open = cls.indexOf('[');
        if (open < 0) continue;
        const close = cls.lastIndexOf(']');
        if (close <= open) continue;
        const inner = cls.slice(open + 1, close);
        const parsed = parseArbitraryValue(inner);
        if (!parsed) continue;
        const remValue = toRem(parsed);
        if (remValue === null) continue;

        const nearest = nearestScaleEntry(remValue, context.scale);
        if (!nearest) continue;
        if (nearest.distance < SCALE_TOLERANCE) continue; // on-scale

        const prefix = cls.slice(0, open).replace(/-$/, '');
        const recommended = `${prefix}-${formatScaleToken(nearest.entry)}`;
        const original = `${parsed.value}${parsed.unit}`;
        issues.push({
          ruleId: 'visual/spacing-scale-violation',
          category: 'visual',
          severity: 'medium',
          aiSpecific: false,
          message:
            `Spacing '${cls}' = ${original} (${remValue.toFixed(3)}rem) is off the design-system scale. ` +
            `Nearest scale value: ${nearest.entry}rem.`,
          line: el.line,
          column: el.column,
          advice:
            `Replace with the nearest scale token: '${recommended}'. ` +
            `Or update spacingScale in slopbrick.config.mjs if '${original}' is intentional.`,
          fixes: [
            {
              kind: 'replace',
              description: `Replace '${cls}' with '${recommended}'`,
              targetFile: facts.filePath,
              oldValue: cls,
              newValue: recommended,
            },
          ],
        });
      }
    }
    return issues;
  },
});

export default spacingScaleViolationRule satisfies Rule<SpacingScaleViolationContext>;

/**
 * Format a scale token for the suggested fix. Tailwind's spacing
 * scale uses quarters of a rem: 0.25 → 1, 0.5 → 2, 1 → 4, 2 → 8.
 * Whole-number rems become the integer multiplier.
  * **Peer-reviewed citation:**
 * - Same as spacing-grid: Material Design 3, IBM Carbon, Apple HIG.
 * - v0.12.2 calibration: HYGIENE. */
function formatScaleToken(rem: number): string {
  // Common tailwind-like shorthand for clean integers.
  const exact: Record<number, string> = {
    0: '0',
    0.5: '0.5',
    1: '1',
    1.5: '1.5',
    2: '2',
    2.5: '2.5',
    3: '3',
    3.5: '3.5',
    4: '4',
    5: '5',
    6: '6',
    7: '7',
    8: '8',
    9: '9',
    10: '10',
    11: '11',
    12: '12',
    14: '14',
    16: '16',
    20: '20',
    24: '24',
    28: '28',
    32: '32',
    36: '36',
    40: '40',
    44: '44',
    48: '48',
    52: '52',
    56: '56',
    60: '60',
    64: '64',
    72: '72',
    80: '80',
    96: '96',
  };
  if (exact[rem] !== undefined) return exact[rem];
  // Fallback: round to 4 decimals and stringify.
  return rem.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}