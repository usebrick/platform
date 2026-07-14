import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { shannonEntropy } from '../math-utils';
import {  flatClassNames, classNamesFromJsx , matchAll } from '../utils';

/**
 * Math rule: Shannon entropy of text-size tokens.
 *
 * AI tends to use 2–3 sizes (text-sm, text-base, text-2xl for headings).
 * Humans use 4–6 sizes (text-xs, text-sm, text-base, text-lg, text-xl, text-2xl, text-3xl).
 *
 * Map to numeric scale (px):
 *   xs=12, sm=14, base=16, lg=18, xl=20, 2xl=24, 3xl=30, 4xl=36, 5xl=48, 6xl=60
 *
 * Threshold: ≥5 text tokens AND entropy ≤ 1.6.
 *
 * Per Shannon, C. E. (1948), ‘A Mathematical Theory of Communication’,
 * Bell System Tech. J. 27(3):379-423. Entropy as a measure of information /
 * design diversity.
 */
const TEXT_SIZE_MAP: Record<string, number> = {
  'text-xs': 12,
  'text-sm': 14,
  'text-base': 16,
  'text-lg': 18,
  'text-xl': 20,
  'text-2xl': 24,
  'text-3xl': 30,
  'text-4xl': 36,
  'text-5xl': 48,
  'text-6xl': 60,
};

const TEXT_SIZE_RE = /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)\b/g;

export const mathFontEntropyRule = createRule<RuleContext>({
  id: 'visual/math-font-entropy',
  // v0.20.0 calibration: recall 0.004, fires 0 times on self-scan
  // (verified). Disable until rewritten.
  defaultOff: true,
  category: 'visual',
  severity: 'high',
  aiSpecific: true,
  description: 'Text-size tokens show low entropy — AI uses 2–3 sizes, humans use 4–6',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const issues: Issue[] = [];
    const counts = new Map<number, number>();

    for (const cls of classNamesFromJsx(facts.v2)) {
      for (const m of matchAll(TEXT_SIZE_RE, cls.value)) {
        const v = TEXT_SIZE_MAP[m[0]];
        if (v === undefined) continue;
        counts.set(v, (counts.get(v) || 0) + 1);
      }
    }

    const { h, vocab, total } = shannonEntropy(counts);
    if (total < 6) return issues;
    if (h > 1.4) return issues;

    const anchor = flatClassNames(facts.v2)[0] ?? { line: 1, column: 1 };
    issues.push({
      ruleId: 'visual/math-font-entropy',
      category: 'visual',
      severity: 'high',
      aiSpecific: true,
      message:
        `Text-size tokens have low entropy (H=${h.toFixed(2)}, vocab=${vocab}, n=${total}). ` +
        `Review the type scale and hierarchy; repeated sizes are valid when they communicate the same role.`,
      line: anchor.line,
      column: anchor.column,
      advice:
        'Use a wider range of text sizes (text-xs, text-sm, text-lg, text-xl, text-2xl, text-3xl) for a more deliberate type scale.',
    });

    return issues;
  },
});

export default mathFontEntropyRule satisfies Rule<RuleContext>;
