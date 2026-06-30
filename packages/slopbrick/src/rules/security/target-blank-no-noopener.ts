// Rule: security/target-blank-no-noopener
//
// Per MDN (developer.mozilla.org/en-US/docs/Web/HTML/Element/a#target),
// target="_blank" without rel="noopener" gives the opened tab a
// window.opener handle. That handle lets the destination page navigate
// the originating tab to a phishing URL — "reverse tabnabbing",
// documented browser behavior since 2014. Modern browsers default to
// noopener, but the explicit attribute is still recommended.
//
// Detection: raw source scan for `<a …>` opening tags whose attribute
// list contains target="_blank" but lacks rel="noopener" /
// rel="noreferrer". Dynamic `rel={…}` can't be statically verified, so
// we treat them as not-safe.
//
// Severity: medium. aiSpecific: false (humans forget this too, but AI
// code emits the bare target="_blank" pattern very frequently).

import type { Issue, Rule, RuleContext } from '../../types';
import { createRule } from '../rule';
import { lineOfSource } from '../utils';

// `<a` opening tag, anchored by required whitespace so `<aside>`,
// `<address>`, `<area>`, `<abbr>`, `<applet>` etc. don't false-match.
const ANCHOR_TAG_RE = /<a\s+([^>]*?)>/gi;
const TARGET_BLANK_RE = /\btarget\s*=\s*(["'])_blank\1/i;
const REL_ATTR_RE = /\brel\s*=\s*["']([^"']*)["']/i;

function hasSafeRel(attrs: string): boolean {
  const m = attrs.match(REL_ATTR_RE);
  if (!m) return false;
  const tokens = m[1]!.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.includes('noopener') || tokens.includes('noreferrer');
}

function pushIssue(out: Issue[], source: string, offset: number): void {
  out.push({
    ruleId: 'security/target-blank-no-noopener',
    category: 'security',
    severity: 'medium',
    aiSpecific: false,
    message:
      '<a target="_blank"> without rel="noopener" (or rel="noreferrer"). ' +
      'window.opener can navigate the originating tab — reverse tabnabbing.',
    advice:
      'Add rel="noopener" to the <a>. rel="noreferrer" implies noopener ' +
      'and also strips the Referer header.',
    line: lineOfSource(source, offset),
    column: 1,
  });
}

export const targetBlankNoNoopenerRule = createRule<RuleContext>({
  id: 'security/target-blank-no-noopener',
  category: 'security',
  severity: 'medium',
  aiSpecific: false,
  description:
    'Link with target="_blank" missing rel="noopener" — window.opener can ' +
    'navigate the opener tab (reverse tabnabbing, MDN).',
  create(context) { return context; },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source ?? '';
    if (!source) return issues;
    let m: RegExpExecArray | null;
    ANCHOR_TAG_RE.lastIndex = 0;
    while ((m = ANCHOR_TAG_RE.exec(source)) !== null) {
      const attrs = m[1];
      if (!TARGET_BLANK_RE.test(attrs!)) continue;
      if (hasSafeRel(attrs!)) continue;
      pushIssue(issues, source, m.index);
    }
    return issues;
  },
});

export default targetBlankNoNoopenerRule satisfies Rule<RuleContext>;
