import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import {  classNamesFromJsx , matchAll } from '../utils';

/**
 * Rule: gap-monopoly
 * Detects when a singular uniform gap configuration dominates the file.
 */
const GAP_RE = /\bgap(?:-x|-y)?-(\d+)\b/g;

export const gapMonopolyRule = createRule<RuleContext>({
  id: 'layout/gap-monopoly',
  category: 'layout',
  severity: 'medium',
  aiSpecific: true,
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
        `AI defaults to one gap value; humans mix gap-2/4/6/8 for hierarchy.`,
      line: firstAnchor?.line ?? 1,
      column: firstAnchor?.column ?? 1,
      advice:
        'Use at least 3 distinct gap values across the project (e.g. gap-2 for tight clusters, gap-6 for sections, gap-12 for major regions).',
    });

    return issues;
  },
});

export default gapMonopolyRule satisfies Rule<RuleContext>;