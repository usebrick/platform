import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import {  STYLE_BLOCK_RE, lineOfSource , matchAll } from '../utils';

/**
 * Rule: clamp-soup
 *
 * Unrealistic, un-aliased viewport configurations in inline styles.
 * AI vibe-coded styles use `clamp(1rem, 10vw, 5rem)` which spans an
 * enormous range without intermediate breakpoints.
 *
 * Threshold: any `font-size` or `width`/`height` clamp where the ratio
 * of max to min exceeds 4×.
 */
const CLAMP_RE = /\b(?:font-size|width|height|padding|margin|gap)\s*:\s*clamp\s*\(\s*([\d.]+)(px|rem|%)\s*,\s*[^,]+,\s*([\d.]+)(px|rem|%)\s*\)/i;

function toPx(val: number, unit: string): number {
  if (unit === 'rem') return val * 16;
  if (unit === '%') return val;
  return val;
}


export const clampSoupRule = createRule<RuleContext>({
  id: 'visual/clamp-soup',
  category: 'visual',
  severity: 'high',
  aiSpecific: true,
  description: 'Unrealistic, un-aliased viewport configurations in inline styles (e.g., `clamp(1rem, 10vw, 5rem)`).',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];

    if (facts.v2) {
      const source = facts.v2._source ?? '';
      for (const blockMatch of matchAll(STYLE_BLOCK_RE, source)) {
        const blockSource = blockMatch[1];
        const blockLine = lineOfSource(source, blockMatch.index);
        const m = CLAMP_RE.exec(blockSource);
        if (!m) continue;
        const minPx = toPx(parseFloat(m[1]), m[2]);
        const maxPx = toPx(parseFloat(m[3]), m[4]);
        if (maxPx / minPx > 4) {
          issues.push({
            ruleId: 'visual/clamp-soup',
            category: 'visual',
            severity: 'high',
            aiSpecific: true,
            message:
              `clamp(${m[1]}${m[2]}, ..., ${m[3]}${m[4]}) spans a ${(maxPx / minPx).toFixed(1)}× range — un-aliased viewport config.`,
            line: blockLine,
            column: 1,
            advice:
              'Use design-system aliases (`--text-fluid-sm`, `--text-fluid-lg`) with bounded ranges (typically 2× max).',
          });
        }
      }
      return issues;
    }

    return issues;
  },
});

export default clampSoupRule satisfies Rule<RuleContext>;