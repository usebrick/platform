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

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
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
    for (const re of FAIL_OPEN_PATTERNS) {
      const match = source.match(re);
      if (!match) continue;
      // Find the actual offset via RegExp.exec — match() doesn't return
      // indices in older Node, but exec with a fresh regex does.
      const re2 = new RegExp(re.source, re.flags);
      const exec = re2.exec(source);
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