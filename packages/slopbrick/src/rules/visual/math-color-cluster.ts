import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { circularDelta } from '../math-utils';
import {  flatClassNames, classNamesFromJsx , matchAll } from '../utils';

/**
 * Math rule: hex/rgb color hue clustering.
 * AI vibe-coded files tend to use a tight palette — colors all clustered
 * in the violet/fuchsia band. Real human designers use varied hues.
 * Approach:
 *   1. Extract every `#RRGGBB` / `#RGB` literal
 *   2. Convert each to HSL and extract hue (degrees)
 *   3. Find max circular distance between any two hues in the file
 *   4. If file uses ≥5 colors AND max hue spread < 90°, flag
 * Threshold: ≥5 colors AND max spread ≤ 90° (a single hue family).
 */

const HEX_COLOR_RE = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.toLowerCase();
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b];
}

function rgbToHue([r, g, b]: [number, number, number]): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d === 0) return 0; // gray
  let h = 0;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return h;
}

export const mathColorClusterRule = createRule<RuleContext>({
  id: 'visual/math-color-cluster',
  category: 'visual',
  severity: 'high',
  aiSpecific: true,
  description: 'Hex colors cluster in a tight hue range (≤90° spread) — AI default-palette tell',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const hues: number[] = [];
    let firstAnchor: { line: number; column: number } | undefined;

    const tokens = flatClassNames(facts.v2);

    for (const cls of tokens) {
      for (const m of matchAll(HEX_COLOR_RE, cls.value)) {
        const rgb = hexToRgb(m[1]);
        if (!rgb) continue;
        const h = rgbToHue(rgb);
        const [r, g, b] = rgb;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max - min < 30) continue;
        hues.push(h);
        if (!firstAnchor) firstAnchor = { line: cls.line, column: cls.column };
      }
    }

    if (hues.length < 5) return issues;

    let maxSpread = 0;
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        const d = circularDelta(hues[i], hues[j]);
        if (d > maxSpread) maxSpread = d;
      }
    }

    if (maxSpread > 90) return issues;

    issues.push({
      ruleId: 'visual/math-color-cluster',
      category: 'visual',
      severity: 'high',
      aiSpecific: true,
      message:
        `${hues.length} hex colors span only ${maxSpread.toFixed(0)}° of hue space. ` +
        `AI defaults to a tight palette (often violet-fuchsia only); humans use varied hues.`,
      line: firstAnchor?.line ?? 1,
      column: firstAnchor?.column ?? 1,
      advice:
        'Use at least 3 distinct hue families (e.g. blue + amber + green) instead of clustering every color in the violet/fuchsia band.',
    });

    return issues;
  },
});

export default mathColorClusterRule satisfies Rule<RuleContext>;