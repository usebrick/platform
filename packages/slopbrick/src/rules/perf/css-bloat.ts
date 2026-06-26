import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { classNamesFromJsx } from '../utils';

/**
 * Rule: css-bloat
 * Duplicate raw style blocks or Tailwind token strings repeated >5
 * times across distinct files.
 */

export const cssBloatRule = createRule<RuleContext>({
  id: 'perf/css-bloat',
  category: 'perf',
  severity: 'low',
  aiSpecific: false,
  description: 'Duplicate raw style blocks or Tailwind token strings repeated >5 times across distinct files.',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const counts = new Map<string, number>();
    let firstAnchor: { line: number; column: number } | undefined;

    const tokens = classNamesFromJsx(facts.v2);

    for (const cls of tokens) {
      if (!cls.value || cls.value.length < 10) continue;
      const v = cls.value.trim();
      counts.set(v, (counts.get(v) || 0) + 1);
      if (!firstAnchor) firstAnchor = { line: cls.line, column: cls.column };
    }

    let maxRepeat = 0;
    let maxString = '';
    for (const [v, c] of counts) {
      if (c > maxRepeat) {
        maxRepeat = c;
        maxString = v;
      }
    }

    if (maxRepeat < 5) return issues;

    issues.push({
      ruleId: 'perf/css-bloat',
      category: 'perf',
      severity: 'low',
      aiSpecific: false,
      message:
        `Class string \`${maxString.slice(0, 50)}${maxString.length > 50 ? '...' : ''}\` ` +
        `is duplicated ${maxRepeat} times in this file.`,
      line: firstAnchor?.line ?? 1,
      column: firstAnchor?.column ?? 1,
      advice:
        'Extract to a CSS variable (`--surface-card`) or a component prop. Repeating the same utility class string 5+ times bloats the bundle.',
    });

    return issues;
  },
});

export default cssBloatRule satisfies Rule<RuleContext>;