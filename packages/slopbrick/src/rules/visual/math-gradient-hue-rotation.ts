import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { circularDelta } from '../math-utils';
import {  flatClassNames, classNamesFromJsx , matchAll } from '../utils';

/**
 * Math rule: mean hue rotation between gradient endpoints.
 * Tailwind palette hues (HSL degrees):
 *   rose=350, pink=330, fuchsia=292, purple=270, violet=262, indigo=240,
 *   blue=217, sky=199, cyan=189, teal=173, emerald=152, green=142,
 *   lime=85, yellow=49, amber=39, orange=25, red=0, slate=215, gray=0,
 *   zinc=240, neutral=0, stone=30
 * AI gradient of choice: violet → fuchsia (262 → 292 = 30°),
 * indigo → purple (240 → 270 = 30°), purple → pink (270 → 330 = 60°).
 * Mean rotation across the file is typically ≤ 30°.
 * Human designs use larger rotations (60–180°): blue → amber (199 → 39 = 160°),
 * red → teal (0 → 173 = 173°), emerald → indigo (152 → 240 = 88°).
 */
const HUE_BY_COLOR: Record<string, number> = {
  rose: 350,
  pink: 330,
  fuchsia: 292,
  purple: 270,
  violet: 262,
  indigo: 240,
  blue: 217,
  sky: 199,
  cyan: 189,
  teal: 173,
  emerald: 152,
  green: 142,
  lime: 85,
  yellow: 49,
  amber: 39,
  orange: 25,
  red: 0,
  slate: 215,
  gray: 0,
  zinc: 240,
  neutral: 0,
  stone: 30,
};

const GRADIENT_RE = /\b(?:from|via|to)-([a-z]+)-(\d{2,3})\b/g;

export const mathGradientHueRotationRule = createRule<RuleContext>({
  id: 'visual/math-gradient-hue-rotation',
  category: 'visual',
  severity: 'high',
  aiSpecific: true,
  description: 'Gradients cluster around small hue rotations (≤30°), the AI violet-to-fuchsia tell',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const rotations: number[] = [];
    const tokens = classNamesFromJsx(facts.v2);

    for (const cls of tokens) {
      const pairs: Array<{ color: string; shade: number }> = [];
      for (const m of matchAll(GRADIENT_RE, cls.value)) {
        const color = m[1];
        const shade = Number(m[2]);
        if (!(color in HUE_BY_COLOR)) continue;
        pairs.push({ color, shade });
      }
      for (let i = 1; i < pairs.length; i++) {
        const a = HUE_BY_COLOR[pairs[i - 1].color];
        const b = HUE_BY_COLOR[pairs[i].color];
        rotations.push(circularDelta(a, b));
      }
    }

    if (rotations.length < 3) return issues;
    const mean = rotations.reduce((s, v) => s + v, 0) / rotations.length;
    if (mean > 25) return issues;

    const anchor = flatClassNames(facts.v2)[0] ?? { line: 1, column: 1 };
    issues.push({
      ruleId: 'visual/math-gradient-hue-rotation',
      category: 'visual',
      severity: 'high',
      aiSpecific: true,
      message:
        `Gradients have a mean hue rotation of ${mean.toFixed(1)}° across ${rotations.length} pairs. ` +
        `AI tends to cluster gradients in a narrow hue band (violet↔fuchsia, 30°); humans use 60–180° rotations.`,
      line: anchor.line,
      column: anchor.column,
      advice:
        'Use wider hue spans across gradients (e.g. blue→amber, emerald→indigo) to break the violet-fuchsia monotony.',
    });

    return issues;
  },
});

export default mathGradientHueRotationRule satisfies Rule<RuleContext>;