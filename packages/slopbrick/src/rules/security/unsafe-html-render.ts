// Rule: security/unsafe-html-render
//
// Catches `dangerouslySetInnerHTML={{ __html: <expression> }}` where
// the value is anything other than a static string literal. AI code
// regularly interpolates user input (comments, bios, search
// snippets) into dangerouslySetInnerHTML without sanitization,
// opening XSS / stored-XSS / account-takeover paths.
//
// Detection: scan the raw source for dangerouslySetInnerHTML usage
// and inspect the value. Static literals are fine (the developer
// controls them); expressions, template literals, and identifiers
// are flagged.
//
// Severity: high. aiSpecific: false (the literal-in-dict pattern is
// a tell of AI-generated React code; humans writing production
// components almost always use DOMPurify/sanitize-html wrappers).

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { lineOfSource } from '../utils';

// Match the `dangerouslySetInnerHTML={{ __html: VALUE }} />` shape.
// We can't easily capture VALUE with a single regex because backtick
// template literals can contain `}` (e.g. `${name}`). So we capture
// everything up to the closing `}}` of the JSX expression, then
// trim whitespace and split off the actual VALUE at the first `}}`.
const DANGEROUS_RE =
  /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:\s*([\s\S]+?)\}\s*\}\s*[\s/]/g;


function isStaticLiteral(value: string): boolean {
  const trimmed = value.trim();
  // Single or double-quoted string literal with NO template
  // interpolation: 'foo' or "foo".
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return true;
  }
  // Backtick template literal with no ${...} interpolation is also
  // a static literal from a sanitization standpoint (we can't
  // sanitize the content, but there's no user input flowing in).
  if (
    trimmed.startsWith('`') &&
    trimmed.endsWith('`') &&
    !/\$\{/.test(trimmed)
  ) {
    return true;
  }
  return false;
}

export const unsafeHtmlRenderRule = createRule<RuleContext>({
  id: 'security/unsafe-html-render',
  category: 'security',
  severity: 'high',
  aiSpecific: false,
  description:
    'dangerouslySetInnerHTML used with a non-literal value (variable, template literal, expression) — unsanitized HTML injection risk.',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    DANGEROUS_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DANGEROUS_RE.exec(source)) !== null) {
      const value = m[1];
      if (isStaticLiteral(value)) continue;
      issues.push({
        ruleId: 'security/unsafe-html-render',
        category: 'security',
        severity: 'high',
        aiSpecific: false,
        message:
          'dangerouslySetInnerHTML fed a non-literal value (variable, template, or expression) — unsanitized HTML will be rendered.',
        line: lineOfSource(source, m.index),
        column: 1,
        advice:
          'Sanitize the input with DOMPurify (or your framework\'s sanitizer) before passing it to dangerouslySetInnerHTML, ' +
          'or replace dangerouslySetInnerHTML with a children prop that React escapes automatically.',
      });
    }
    return issues;
  },
});

export default unsafeHtmlRenderRule satisfies Rule<RuleContext>;