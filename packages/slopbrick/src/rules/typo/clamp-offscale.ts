import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import {  STYLE_BLOCK_RE, lineOfSource , matchAll } from '../utils';

/**
 * Rule: clamp-offscale
 *
 * Responsive typography `clamp()` sizes deviating >20% from baseline.
 */
const STANDARD_SIZES_PX = [12, 14, 16, 18, 20, 24, 30, 36, 48];
const CLAMP_RE = /\bfont-size\s*:\s*clamp\s*\(\s*([\d.]+)(px|rem)\s*,\s*[^,]+,\s*([\d.]+)(px|rem)/i;

function isOffScale(valuePx: number): boolean {
  for (const std of STANDARD_SIZES_PX) {
    if (Math.abs(valuePx - std) / std <= 0.20) return false;
  }
  return true;
}


export const clampOffscaleRule = createRule<RuleContext>({
  id: 'typo/clamp-offscale',
  category: 'typo',
  severity: 'medium',
  aiSpecific: false,
  description: 'Responsive typography `clamp()` sizes deviating >20% from baseline design scale.',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];

    if (facts.v2) {
      const source = facts.v2._source ?? '';
      for (const blockMatch of matchAll(STYLE_BLOCK_RE, source)) {
        const m = CLAMP_RE.exec('{' + blockMatch[1] + '}');
        if (!m) continue;
        const minVal = parseFloat(m[1]);
        const maxVal = parseFloat(m[3]);
        const minUnit = m[2];
        const maxUnit = m[4];
        const minPx = minUnit === 'rem' ? minVal * 16 : minVal;
        const maxPx = maxUnit === 'rem' ? maxVal * 16 : maxVal;
        if (isOffScale(minPx) || isOffScale(maxPx)) {
          const blockLine = lineOfSource(source, blockMatch.index);
          issues.push({
            ruleId: 'typo/clamp-offscale',
            category: 'typo',
            severity: 'medium',
            aiSpecific: false,
            message:
              `font-size clamp(${minVal}${minUnit}, ..., ${maxVal}${maxUnit}) deviates >20% from the design scale.`,
            line: blockLine,
            column: 1,
            advice:
              'Anchor clamp() values to standard sizes (12, 14, 16, 18, 20, 24, 30, 36, 48) so they remain on the design grid.',
          });
        }
      }
      return issues;
    }

    return issues;
  },
});

export default clampOffscaleRule satisfies Rule<RuleContext>;