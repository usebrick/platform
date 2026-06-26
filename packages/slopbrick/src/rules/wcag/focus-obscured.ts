import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * Rule: focus-obscured
 * Sticky/fixed positioning that may obscure focused siblings. WCAG 2.4.11.
 */
const FIXED_RE = /\b(?:fixed|sticky)\b/;
const SPACER_RE = /\bfixed-(?:width|height)|sticky-(?:top|bottom|left|right)/;

export const focusObscuredRule = createRule<RuleContext>({
  id: 'wcag/focus-obscured',
  category: 'wcag',
  severity: 'low',
  aiSpecific: false,
  description: 'Sticky/fixed positioning that hides focused siblings.',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    // Dedupe by class-signature, not per-file: when the same fixed/sticky
    // class signature appears on multiple elements (e.g. `<header className="fixed" />`
    // repeated across the page), report it once. Different class strings on
    // different elements each get their own report — that's the actionable
    // signal for an engineer fixing WCAG 2.4.11.
    const seen = new Set<string>();
    let firstAnchor: { line: number; column: number } | undefined;

    for (const el of facts.v2.jsx.elements) {
      const cls = el.classNames.join(' ');
      if (!cls) continue;
      if (!FIXED_RE.test(cls)) continue;
      if (SPACER_RE.test(cls)) continue;

      if (seen.has(cls)) continue;
      seen.add(cls);

      const anchor = { line: el.line, column: el.column };
      if (!firstAnchor) firstAnchor = anchor;

      issues.push({
        ruleId: 'wcag/focus-obscured',
        category: 'wcag',
        severity: 'low',
        aiSpecific: false,
        message: 'Element uses fixed/sticky positioning which may obscure focused siblings',
        line: anchor.line,
        column: anchor.column,
        advice: 'Ensure focused elements are not hidden behind fixed or sticky wrappers.',
      });
    }

    return issues;
  },
});

export default focusObscuredRule satisfies Rule<RuleContext>;