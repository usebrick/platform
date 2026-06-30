import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { shannonEntropy } from '../math-utils';
import {  flatClassNames, classNamesFromJsx , matchAll } from '../utils';

/**
 * Math rule: Shannon entropy of numeric spacing tokens.
 *
 * AI-generated UIs use a tiny vocabulary of spacing values — typically
 * `4` and `8` everywhere, occasionally `2`, `16`, `24`. Human designs
 * mix values from a wide scale: 3, 5, 6, 7, 9, 10, 12, 14, 16, 20, 24, 32.
 *
 * We extract every `<prefix>-<N>` where prefix is one of:
 *   p, px, py, pt, pb, pl, pr, m, mx, my, mt, mb, ml, mr, gap, gap-x, gap-y
 * and N is a positive integer (also handles arbitrary `p-[12px]`).
 *
 * Entropy:
 *   H = -Σ pᵢ log₂ pᵢ
 *   where pᵢ = count(valueᵢ) / total
 *
 * AI signature: H ≤ 1.5 with ≥10 tokens (vocabulary of 2–3 values).
 * Human signature: H ≥ 2.5 (vocabulary of 6+ values).
 */
const SPACING_PREFIX_RE = /\b(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y)-(\d+)\b/g;

export const mathSpacingEntropyRule = createRule<RuleContext>({
  id: 'visual/math-spacing-entropy',
  category: 'visual',
  severity: 'medium',
  aiSpecific: true,
  description: 'Numeric spacing tokens show abnormally low entropy — AI tends to repeat the same 2–3 spacing values',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const issues: Issue[] = [];
    const counts = new Map<number, number>();

    for (const cls of classNamesFromJsx(facts.v2)) {
      for (const m of matchAll(SPACING_PREFIX_RE, cls.value)) {
        const v = Number(m[2]);
        counts.set(v, (counts.get(v) || 0) + 1);
      }
    }

    const { h, vocab, total } = shannonEntropy(counts);
    if (total < 10) return issues;
    if (h > 1.5) return issues;

    const anchor = flatClassNames(facts.v2)[0] ?? { line: 1, column: 1 };
    issues.push({
      ruleId: 'visual/math-spacing-entropy',
      category: 'visual',
      severity: 'medium',
      aiSpecific: true,
      message:
        `Spacing tokens have low entropy (H=${h.toFixed(2)}, vocab=${vocab}, n=${total}). ` +
        `AI tends to repeat the same 2–3 spacing values; humans mix 6+ distinct sizes.`,
      line: anchor.line,
      column: anchor.column,
      advice:
        'Mix more spacing values from the design scale (e.g. 3, 5, 7, 10, 14, 20, 28) instead of repeating the same 4/8 pattern.',
    });

    return issues;
  },
});

export default mathSpacingEntropyRule satisfies Rule<RuleContext>;