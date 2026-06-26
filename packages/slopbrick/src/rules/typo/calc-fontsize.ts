import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import {  STYLE_BLOCK_RE, lineOfSource , matchAll } from '../utils';

/**
 * Rule: calc-fontsize
 *
 * Mathematical `calc()` assigned to `font-size` without a design token
 * baseline.
 */
const FONT_SIZE_RE = /\bfont-size\s*:\s*[^;]*\bcalc\s*\(/i;


export const calcFontsizeRule = createRule<RuleContext>({
  id: 'typo/calc-fontsize',
  category: 'typo',
  severity: 'medium',
  aiSpecific: false,
  description: 'Mathematical `calc()` assigned to `font-size` lacking a design token baseline.',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];

    if (facts.v2) {
      const source = facts.v2._source ?? '';
      for (const blockMatch of matchAll(STYLE_BLOCK_RE, source)) {
        if (!FONT_SIZE_RE.test('{' + blockMatch[1] + '}')) continue;
        const blockLine = lineOfSource(source, blockMatch.index);
        issues.push({
          ruleId: 'typo/calc-fontsize',
          category: 'typo',
          severity: 'medium',
          aiSpecific: false,
          message:
            `font-size uses calc() — this locks typography to a specific scale step instead of using a design token.`,
          line: blockLine,
          column: 1,
          advice:
            'Use a design token (`var(--font-size-lg)`) or `clamp(min, fluid, max)` for responsive typography.',
        });
      }
      return issues;
    }

    return issues;
  },
});

export default calcFontsizeRule satisfies Rule<RuleContext>;