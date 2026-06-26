import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { classNamesFromJsx } from '../utils';

/**
 * Rule: generic-centering
 * Superset of centering tokens combined. AI vibe-coded "hero" sections
 * all share the same vertical-centered pattern.
 * Threshold: ≥4 classnames with the full superset (flex + items-center +
 * justify-center + min-h-screen) within a single file. Allows max 1.
 */
const FLEX_RE = /\bflex\b/;
const ITEMS_CENTER_RE = /\bitems-center\b/;
const JUSTIFY_CENTER_RE = /\bjustify-center\b/;
const MIN_H_SCREEN_RE = /\bmin-h-screen\b/;

export const genericCenteringRule = createRule<RuleContext>({
  id: 'visual/generic-centering',
  category: 'visual',
  severity: 'low',
  aiSpecific: true,
  description: 'Superset of centering tokens (`flex`, `items-center`, `justify-center`, `min-h-screen`). Allows max 1 per file.',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    let count = 0;
    let firstAnchor: { line: number; column: number } | undefined;

    const tokens = classNamesFromJsx(facts.v2);

    for (const cls of tokens) {
      if (!cls.value) continue;
      if (
        FLEX_RE.test(cls.value) &&
        ITEMS_CENTER_RE.test(cls.value) &&
        JUSTIFY_CENTER_RE.test(cls.value) &&
        MIN_H_SCREEN_RE.test(cls.value)
      ) {
        count++;
        if (!firstAnchor) firstAnchor = { line: cls.line, column: cls.column };
      }
    }

    if (count <= 1) return issues;

    issues.push({
      ruleId: 'visual/generic-centering',
      category: 'visual',
      severity: 'low',
      aiSpecific: true,
      message:
        `${count} classnames use the full centering superset (flex + items-center + justify-center + min-h-screen). ` +
        `AI defaults to this combo for hero sections; humans vary the pattern.`,
      line: firstAnchor?.line ?? 1,
      column: firstAnchor?.column ?? 1,
      advice:
        'Vary hero layouts: some as grids (`grid place-items-center`), some as blocks, some with different alignment.',
    });

    return issues;
  },
});

export default genericCenteringRule satisfies Rule<RuleContext>;