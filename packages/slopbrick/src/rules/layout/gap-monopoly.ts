import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import {  classNamesFromJsx , matchAll } from '../utils';

/**
 * Rule: gap-monopoly
 * Detects when a singular uniform gap configuration dominates the file.
  * **Peer-reviewed citation:**
 * - The 4pt/8pt grid system is a design-token convention documented
 *   in design-system literature; see Material Design 3 spacing
 *   (https://m3.material.io/styles/spacing/overview) and Apple's
 *   HIG layout grid. The rule implements this convention.
 * - Empirical observation: v0.12.2 calibration HYGIENE. Both AI and
 *   human code use a small grid; the rule is not AI-discriminative. */
const GAP_RE = /\bgap(?:-x|-y)?-(\d+)\b/g;

export const gapMonopolyRule = createRule<RuleContext>({
  id: 'layout/gap-monopoly',
  // v0.20.0 calibration: recall 0.000, fires never. Disable
  // until rewritten.
  defaultOff: true,
  category: 'layout',
  severity: 'medium',
  aiSpecific: false,
  description: 'A singular uniform gap configuration dominates the project space.',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const counts = new Map<number, number>();
    let total = 0;
    let firstAnchor: { line: number; column: number } | undefined;

    const tokens = classNamesFromJsx(facts.v2);

    for (const cls of tokens) {
      for (const m of matchAll(GAP_RE, cls.value)) {
        const v = Number(m[1]);
        counts.set(v, (counts.get(v) || 0) + 1);
        total++;
        if (!firstAnchor) firstAnchor = { line: cls.line, column: cls.column };
      }
    }

    if (total < 6) return issues;

    let maxCount = 0;
    let dominant = 0;
    for (const [v, c] of counts) {
      if (c > maxCount) {
        maxCount = c;
        dominant = v;
      }
    }

    const vocab = counts.size;
    const threshold = vocab <= 3 ? 0.9 : vocab <= 5 ? 0.75 : 0.6;
    const ratio = maxCount / total;
    if (ratio < threshold) return issues;

    issues.push({
      ruleId: 'layout/gap-monopoly',
      category: 'layout',
      severity: 'medium',
      aiSpecific: true,
      message:
        `Gap value gap-${dominant} dominates ${(ratio * 100).toFixed(0)}% of all gap usages (vocab=${vocab}, n=${total}). ` +
        `Review whether the dominant value matches the spacing scale and visual hierarchy; repetition can be intentional.`,
      line: firstAnchor?.line ?? 1,
      column: firstAnchor?.column ?? 1,
      advice:
        'Use at least 3 distinct gap values across the project (e.g. gap-2 for tight clusters, gap-6 for sections, gap-12 for major regions).',
    });

    return issues;
  },
});

export default gapMonopolyRule satisfies Rule<RuleContext>;
