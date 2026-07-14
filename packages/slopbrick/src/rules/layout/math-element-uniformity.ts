import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * Math rule: uniformity of interactive element counts per file.
 *
 * For each file, count how many `<button>`, `<input>`, and `<select>` elements
 * appear via `interactiveElements`. Compute the ratio max / (min + 1).
 *
 * AI signature: dashboards with N buttons, N inputs, N selects (uniform).
 * Ratio ≤ 3 with min ≥ 2.
 *
 * Human signature: lopsided (1 button, 12 inputs in a long form, etc.).
 * Ratio > 3.
 */
export const mathElementUniformityRule = createRule<RuleContext>({
  id: 'layout/math-element-uniformity',
  category: 'layout',
  severity: 'medium',
  aiSpecific: true,
  description: 'Interactive element counts are suspiciously uniform (max/min ≤ 3)',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const counts: Record<string, number> = { button: 0, input: 0, select: 0 };
    let anchor: { line: number; column: number } | undefined;

    if (facts.v2) {
      for (const el of facts.v2.jsx.elements) {
        const tag = el.tag.toLowerCase();
        if (tag === 'button') counts.button!++;
        else if (tag === 'input') counts.input!++;
        else if (tag === 'select') counts.select!++;
        if (!anchor) anchor = { line: el.line, column: el.column };
      }
    }

    const values = [counts.button, counts.input, counts.select]
      .filter((v): v is number => typeof v === 'number' && v > 0);
    if (values.length < 2) return issues;
    const max = Math.max(...values);
    const min = Math.min(...values);
    if (min < 2) return issues;
    const ratio = max / (min + 1);
    if (ratio > 3) return issues;

    issues.push({
      ruleId: 'layout/math-element-uniformity',
      category: 'layout',
      severity: 'high',
      aiSpecific: true,
      message:
        `Interactive elements are suspiciously uniform: ` +
        `buttons=${counts.button}, inputs=${counts.input}, selects=${counts.select} ` +
        `(max/min ratio ${ratio.toFixed(2)}). Review whether the distribution fits the product's content and interaction needs; this statistic is not an authorship verdict.`,
      line: anchor?.line ?? 1,
      column: anchor?.column ?? 1,
      advice:
        'Review whether the counts fit the form or dashboard. Do not add or remove controls solely to change this distribution statistic.',
    });

    return issues;
  },
});

export default mathElementUniformityRule satisfies Rule<RuleContext>;
