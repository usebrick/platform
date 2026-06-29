import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { shannonEntropy } from '../math-utils';
import {  flatClassNames, classNamesFromJsx , matchAll } from '../utils';

/**
 * Math rule: Shannon entropy of grid-cols-N values.
 *
 * AI-generated dashboards use the same column count for every grid section:
 * `grid-cols-3` everywhere (the "three-column cards" tell). Human designs
 * mix 2, 3, 4, 6 depending on content density.
 *
 * Threshold: ≥4 grid-cols tokens AND entropy ≤ 1.0.
 *
 * Per Shannon, C. E. (1948), ‘A Mathematical Theory of Communication’,
 * Bell System Tech. J. 27(3):379-423; Müller-Brockmann, J. (1981),
 * *Grid Systems in Graphic Design*, Niggli. Entropy as a measure of
 * grid-system diversity.
 */
const GRID_COLS_RE = /\bgrid-cols-(\d+)\b/g;

export const mathGridUniformityRule = createRule<RuleContext>({
  id: 'layout/math-grid-uniformity',
  category: 'layout',
  severity: 'high',
  aiSpecific: true,
  description: 'grid-cols-N tokens show low entropy — AI uses one column count everywhere, humans vary',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const counts = new Map<number, number>();
    let firstAnchor: { line: number; column: number } | undefined;

    if (facts.v2) {
      for (const cls of classNamesFromJsx(facts.v2)) {
        for (const m of matchAll(GRID_COLS_RE, cls.value)) {
          const n = Number(m[1]);
          if (n < 1 || n > 12) continue;
          counts.set(n, (counts.get(n) || 0) + 1);
          if (!firstAnchor) firstAnchor = { line: cls.line, column: cls.column };
        }
      }
    }

    const { h, vocab, total } = shannonEntropy(counts);
    if (total < 4) return issues;
    if (h > 1.0) return issues;

    const anchor = facts.v2
      ? flatClassNames(facts.v2)[0]
      : { line: 1, column: 1 };
    issues.push({
      ruleId: 'layout/math-grid-uniformity',
      category: 'layout',
      severity: 'high',
      aiSpecific: true,
      message:
        `grid-cols-N tokens have low entropy (H=${h.toFixed(2)}, vocab=${vocab}, n=${total}). ` +
        `AI repeats the same column count (often grid-cols-3); humans mix 2/3/4/6 depending on content.`,
      line: anchor.line,
      column: anchor.column,
      advice:
        'Vary the grid column count across sections (e.g. grid-cols-2 for one feature, grid-cols-4 for another) instead of repeating grid-cols-3.',
    });

    return issues;
  },
});

export default mathGridUniformityRule satisfies Rule<RuleContext>;