import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import {  classNamesFromJsx , matchAll } from '../utils';

/**
 * Rule: forced-layout
 * Detects repetitive structural nesting defaulting to `flex flex-col gap-4`.
 */
const FLEX_COL_GAP_RE = /\bflex\b[^\s"]*\s+\bflex-col\b[^\s"]*\s+\bgap-(\d+)\b/g;

export const forcedLayoutRule = createRule<RuleContext>({
  id: 'layout/forced-layout',
  category: 'layout',
  severity: 'medium',
  aiSpecific: true,
  description: 'Repetitive structural nesting defaulting to `flex flex-col gap-4`.',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];

    let flexCount = 0;
    let flexColGapCount = 0;
    let firstAnchor: { line: number; column: number } | undefined;
    let dominantGap = 0;
    const gapHist = new Map<number, number>();

    const tokens = classNamesFromJsx(facts.v2);

    for (const cls of tokens) {
      if (/\bflex\b/.test(cls.value)) {
        flexCount++;
        if (!firstAnchor) firstAnchor = { line: cls.line, column: cls.column };
      }
      for (const m of matchAll(FLEX_COL_GAP_RE, cls.value)) {
        flexColGapCount++;
        const v = Number(m[1]);
        gapHist.set(v, (gapHist.get(v) || 0) + 1);
      }
    }

    if (flexCount < 6) return issues;
    const ratio = flexColGapCount / flexCount;
    if (ratio < 0.8) return issues;

    let maxCount = 0;
    for (const [v, c] of gapHist) {
      if (c > maxCount) {
        maxCount = c;
        dominantGap = v;
      }
    }

    issues.push({
      ruleId: 'layout/forced-layout',
      category: 'layout',
      severity: 'medium',
      aiSpecific: true,
      message:
        `${flexColGapCount}/${flexCount} flex containers (${(ratio * 100).toFixed(0)}%) use the ` +
        `\`flex flex-col gap-${dominantGap}\` triple. AI defaults to this combo; humans vary.`,
      line: firstAnchor?.line ?? 1,
      column: firstAnchor?.column ?? 1,
      advice:
        'Vary structural patterns: some containers as grids (`grid grid-cols-3`), some as horizontal flex, some as blocks. Mix gap values for hierarchy.',
    });

    return issues;
  },
});

export default forcedLayoutRule satisfies Rule<RuleContext>;