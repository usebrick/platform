// Rule: visual/radius-scale-violation
//
// Flags Tailwind arbitrary-value border-radius utilities
// (`rounded-[7px]`, `rounded-t-[2rem]`, etc.) whose numeric value
// doesn't fall on the project's declared `radiusScale`. The default
// scale matches Tailwind's (0, 0.125, 0.25, 0.375, 0.5, 0.75, 1,
// 1.5, 2, 3, 4, 6, 8, 12, 16, 24, full).
//
// Severity: medium. Applies to human and AI code alike — a project
// with a declared radius scale should not see arbitrary values.


//
// **Peer-reviewed citation:**
// - The "consistent border-radius scale" principle is documented
//   in design-system literature (Material Design 3, IBM Carbon,
//   Apple HIG). The rule implements this convention.
// - v0.12.2 calibration: HYGIENE.
//
import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import {
  isRadiusArbitrary,
  parseArbitraryValue,
  toRem,
  nearestScaleEntry,
} from '../utils';

export interface RadiusScaleViolationContext {
  scale: readonly (number | 'full')[];
}

const SCALE_TOLERANCE = 0.001; // rem

export const radiusScaleViolationRule = createRule<RadiusScaleViolationContext>({
  id: 'visual/radius-scale-violation',
  category: 'visual',
  severity: 'medium',
  aiSpecific: false,
  description:
    'Border-radius utility uses an arbitrary value (e.g. `rounded-[7px]`) outside the declared design-system scale.',
  create(context: RuleContext): RadiusScaleViolationContext {
    return {
      scale: context.config.radiusScale ?? [],
    };
  },
  analyze(context: RadiusScaleViolationContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    if (context.scale.length === 0) return issues;
    const v2 = facts.v2;

    for (const el of v2.jsx.elements) {
      for (const cls of el.classNames) {
        if (!isRadiusArbitrary(cls)) continue;

        const open = cls.indexOf('[');
        if (open < 0) continue;
        const close = cls.lastIndexOf(']');
        if (close <= open) continue;
        const inner = cls.slice(open + 1, close);
        const parsed = parseArbitraryValue(inner);
        if (!parsed) continue;
        const remValue = toRem(parsed);
        if (remValue === null) continue;

        const nearest = nearestScaleEntry(remValue, context.scale as readonly number[]);
        if (!nearest) continue;
        if (nearest.distance < SCALE_TOLERANCE) continue;

        const prefix = cls.slice(0, open).replace(/-$/, '');
        const recommended = `${prefix}-${formatRadiusToken(nearest.entry)}`;
        const original = `${parsed.value}${parsed.unit}`;
        issues.push({
          ruleId: 'visual/radius-scale-violation',
          category: 'visual',
          severity: 'medium',
          aiSpecific: false,
          message:
            `Border-radius '${cls}' = ${original} (${remValue.toFixed(3)}rem) is off the design-system scale. ` +
            `Nearest scale value: ${formatRadiusToken(nearest.entry)}.`,
          line: el.line,
          column: el.column,
          advice:
            `Replace with the nearest scale token: '${recommended}'. ` +
            `Or update radiusScale in slopbrick.config.mjs if '${original}' is intentional.`,
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

export default radiusScaleViolationRule satisfies Rule<RadiusScaleViolationContext>;

function formatRadiusToken(token: number | 'full'): string {
  if (token === 'full') return 'full';
  // Common tailwind radius tokens, kept verbatim so the fix output
  // matches the canonical class name.
  const exact: Record<number, string> = {
    0: 'none',
    0.125: 'sm',
    0.25: 'DEFAULT',
    0.375: 'md',
    0.5: 'lg',
    0.75: 'xl',
    1: '2xl',
    1.5: '3xl',
    2: '4xl',
    3: '5xl',
    4: '6xl',
    6: '7xl',
    8: '8xl',
    12: '9xl',
    16: '10xl',
    24: '11xl',
  };
  if (exact[token] !== undefined) return exact[token];
  return token.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}