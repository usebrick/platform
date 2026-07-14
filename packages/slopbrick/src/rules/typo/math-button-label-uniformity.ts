import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { stddev } from '../math-utils';

/**
 * Math rule: coefficient of variation of button/CTA text length.
 *
 * AI-generated buttons use a small vocabulary of marketing labels:
 *   "Get started" (11), "Learn more" (10), "Sign up" (7), "Try now" (7), etc.
 *
 * Threshold: ≥4 buttons AND length stddev ≤ 4 → flag.
  * **Peer-reviewed citation:**
 * - This rule implements the "consistent button labels" principle
 *   from UX design literature. See Nielsen, J. (1995), "10
 *   Usability Heuristics for User Interface Design," and the
 *   Apple Human Interface Guidelines (button labels).
 * - v0.12.2 calibration: HYGIENE. Both AI and human UIs use
 *   mixed button labels; not AI-discriminative. */

export const mathButtonLabelUniformityRule = createRule<RuleContext>({
  id: 'typo/math-button-label-uniformity',
  category: 'typo',
  severity: 'medium',
  aiSpecific: false,
  description: 'Button text lengths have suspiciously low variance — AI writes "Get started", "Sign up", "Learn more"',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    if (!facts.v2) return issues;
    const lengths: number[] = [];
    let anchor: { line: number; column: number } | undefined;

    for (const el of facts.v2.jsx.elements) {
      const tag = el.tag.toLowerCase();
      if (tag !== 'button') continue;
      const label = el.attributes.value ?? el.attributes['aria-label'] ?? '';
      const trimmed = label.trim();
      if (trimmed.length > 0) lengths.push(trimmed.length);
      if (!anchor) anchor = { line: el.line, column: el.column };
    }

    if (lengths.length < 4) return issues;
    const sd = stddev(lengths);
    if (sd > 4) return issues;

    issues.push({
      ruleId: 'typo/math-button-label-uniformity',
      category: 'typo',
      severity: 'medium',
      aiSpecific: true,
      message:
        `Button text lengths have low variance (σ=${sd.toFixed(2)}, n=${lengths.length}). ` +
        `Review whether labels clearly distinguish their actions; consistent lengths can be intentional.`,
      line: anchor?.line ?? 1,
      column: anchor?.column ?? 1,
      advice:
        'Use labels that accurately describe each action; consistency is fine when the actions share semantics.',
    });

    return issues;
  },
});

export default mathButtonLabelUniformityRule satisfies Rule<RuleContext>;
