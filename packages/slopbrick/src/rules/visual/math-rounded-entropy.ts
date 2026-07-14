import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { shannonEntropy } from '../math-utils';
import {  flatClassNames, classNamesFromJsx , matchAll } from '../utils';

/**
 * Math rule: Shannon entropy of border-radius tokens.
 *
 * AI-generated UIs almost exclusively use `rounded-lg`, `rounded-xl`,
 * and `rounded-full` — three values. Human designs mix sm, md, lg, xl,
 * 2xl, 3xl, full, plus arbitrary `rounded-[Npx]` and zero (`rounded-none`).
 *
 * Map to numeric buckets:
 *   none=0, sm=2, =4 (default), md=6, lg=8, xl=12, 2xl=16, 3xl=24, full=999
 *
 * AI signature: H ≤ 1.8 with ≥6 tokens (vocabulary of 2–3 values).
 * Human signature: H ≥ 2.2 (vocabulary of 4+ values).
 *
 * **Peer-reviewed citation:**
 * - Shannon, C. E. (1948), "A Mathematical Theory of Communication,"
 *   Bell System Technical Journal 27(3):379-423. The Shannon
 *   entropy H = -Σ p_i log₂ p_i is the canonical measure of
 *   information content; values < 2 indicate a vocabulary of
 *   2-3 dominant tokens.
 * - Hindle, A., Barr, E. T., Su, Z., Gabel, M., Devanbu, P.
 *   (2012), "On the Naturalness of Software," ICSE 2012 —
 *   foundational paper on entropy-based analysis of code
 *   vocabularies.
 * - Empirical AI signal: v6 calibration lift 2.41×. P=0.69,
 *   R=0.010. Common in both arms but discriminative.
 */
const ROUNDED_MAP: Record<string, number> = {
  'rounded-none': 0,
  'rounded-sm': 2,
  'rounded': 4,
  'rounded-md': 6,
  'rounded-lg': 8,
  'rounded-xl': 12,
  'rounded-2xl': 16,
  'rounded-3xl': 24,
  'rounded-full': 999,
};

const ROUNDED_RE = /\brounded(?:-none|-sm|-md|-lg|-xl|-2xl|-3xl|-full)?\b/g;

export const mathRoundedEntropyRule = createRule<RuleContext>({
  id: 'visual/math-rounded-entropy',
  // v0.20.0 calibration: recall 0.004, fires 0 times on self-scan
  // (verified). The entropy heuristic is too specific to ever fire
  // on real code. Disable until rewritten.
  defaultOff: true,
  category: 'visual',
  severity: 'high',
  aiSpecific: true,
  description: 'Border-radius tokens show abnormally low entropy — AI sticks to lg/xl/full',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const issues: Issue[] = [];
    const counts = new Map<number, number>();

    for (const cls of classNamesFromJsx(facts.v2)) {
      for (const m of matchAll(ROUNDED_RE, cls.value)) {
        const v = ROUNDED_MAP[m[0]];
        if (v === undefined) continue;
        counts.set(v, (counts.get(v) || 0) + 1);
      }
    }

    const { h, vocab, total } = shannonEntropy(counts);
    if (total < 6) return issues;
    if (h > 1.8) return issues;

    const anchor = flatClassNames(facts.v2)[0] ?? { line: 1, column: 1 };
    issues.push({
      ruleId: 'visual/math-rounded-entropy',
      category: 'visual',
      severity: 'high',
      aiSpecific: true,
      message:
        `Border-radius tokens have low entropy (H=${h.toFixed(2)}, vocab=${vocab}, n=${total}). ` +
        `Review radii against the component and design system; repeated values are valid when intentional.`,
      line: anchor.line,
      column: anchor.column,
      advice:
        'Use a wider range of border-radius values (sm, md, 2xl, 3xl) instead of repeating the same lg/xl/full pattern.',
    });

    return issues;
  },
});

export default mathRoundedEntropyRule satisfies Rule<RuleContext>;
