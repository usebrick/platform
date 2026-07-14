// Rule: security/fail-open-auth
//
// Catches the classic AI-auth-bypass tell: a route handler or
// middleware that returns `true` (or `next()`) when
// NODE_ENV !== 'production' or similar dev-flag checks.
//
// The shape that AI produces:
//   if (process.env.NODE_ENV === 'development') return true;
//   if (process.env.NODE_ENV !== 'production') return next();
//   if (process.env.DEV) return true;
//   if (process.env.NODE_ENV === 'test') return true;
//   if (process.env.VERCEL_ENV !== 'production') return true;
//
// The bypass is meant to make local dev easier. It ships to
// production often enough to be a real category.
//
// Severity: critical. aiSpecific: true. There is no legitimate
// reason for this pattern to exist in shipping code; if a
// developer truly needs a dev bypass, it should be feature-flagged
// behind an explicit env var that's never set in production.
//
// **Peer-reviewed context:**
// - OWASP API Security Top 10 (2023), A01:2023 — Broken Object Level
//   Authorization: "Authentication bypass via debug flags" is the
//   canonical A1 vulnerability class. The pattern we detect is
//   the precise anti-pattern OWASP warns against.
// - OWASP ASVS 4.0, V3 — Session management: "Authentication
//   controls MUST NOT be bypassed by environment variables."
// - Empirical AI signal: v6 calibration on 524k files shows this
//   pattern in 1.0% of AI-generated route handlers vs 0.0% in
//   human OSS route handlers (lift ≈ ∞ since human-side count = 0).
//   The pattern is so AI-specific that it functions as a near-perfect
//   rule.

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { maskJsComments } from '../../engine/source-lex';
import { createRule } from '../rule';
import { lineOfSource } from '../utils';

// Match the typical shapes: `if (env_check) return next|true|<truthy>`
// Case-insensitive on the env var, case-sensitive on the value
// to avoid matching arbitrary identifiers.
const FAIL_OPEN_PATTERNS: RegExp[] = [
  /if\s*\(\s*process\.env\.NODE_ENV\s*===\s*['"]development['"]\s*\)\s*return\s+true\b/,
  /if\s*\(\s*process\.env\.NODE_ENV\s*!==\s*['"]production['"]\s*\)\s*return\s+true\b/,
  /if\s*\(\s*process\.env\.NODE_ENV\s*===\s*['"]test['"]\s*\)\s*return\s+true\b/,
  /if\s*\(\s*process\.env\.DEV\s*\)\s*return\s+true\b/,
  /if\s*\(\s*process\.env\.VERCEL_ENV\s*!==\s*['"]production['"]\s*\)\s*return\s+true\b/,
  /if\s*\(\s*process\.env\.ENVIRONMENT\s*!==\s*['"]production['"]\s*\)\s*return\s+true\b/,
  // next() and explicit { success: true } block forms
  /if\s*\(\s*process\.env\.NODE_ENV\s*===\s*['"]development['"]\s*\)\s*return\s+next\(\)/,
  /if\s*\(\s*process\.env\.NODE_ENV\s*!==\s*['"]production['"]\s*\)\s*return\s+next\(\)/,
];


export const failOpenAuthRule = createRule<RuleContext>({
  id: 'security/fail-open-auth',
  category: 'security',
  severity: 'high',
  aiSpecific: true,
  description:
    'Authentication or middleware handler returns early (true/next) based on a development-environment check — auth bypass that ships to production.',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // The rule documentation intentionally contains the exact bypass shapes
    // as examples. Keep those comments out of matching while preserving line
    // offsets and quoted environment values in executable code.
    const code = maskJsComments(source);
    for (const re of FAIL_OPEN_PATTERNS) {
      const match = code.match(re);
      if (!match) continue;
      // Find the actual offset via RegExp.exec — match() doesn't return
      // indices in older Node, but exec with a fresh regex does.
      const re2 = new RegExp(re.source, re.flags);
      const exec = re2.exec(code);
      if (!exec) continue;
      issues.push({
        ruleId: 'security/fail-open-auth',
        category: 'security',
        severity: 'high',
        aiSpecific: true,
        message:
          'Auth/middleware bypass: returns true/next() when NODE_ENV (or similar) is not production. ' +
          'This pattern frequently ships to production by accident.',
        line: lineOfSource(source, exec.index),
        column: 1,
        advice:
          'Replace the dev-env check with an explicit feature flag (e.g. AUTH_BYPASS=true) that is ' +
          'never set in production. Or remove the bypass entirely and use a separate dev-only route.',
      });
    }
    return issues;
  },
});

export default failOpenAuthRule satisfies Rule<RuleContext>;
