// Rule: security/public-admin-route
//
// Catches API routes whose path contains privileged keywords
// (/admin, /internal, /debug, /staff, /_debug, /_admin, /private,
// /manage, /management) but whose handler body lacks any
// additional auth primitive. The convention "admin routes get
// double-checks" is standard — a route file with /admin in the
// path that doesn't call requireRole / requireAdmin / hasRole is
// a strong signal of a forgotten guard.
//
// Heuristic: filename + path-based detection (we already match
// server-route shapes in security/missing-auth-check; here we
// narrow by the privileged-segment regex).
//
// Severity: medium (false positives possible — the route may
// legitimately be public). Better to over-report and let the
// reviewer confirm than to miss a real exposure.
//
// aiSpecific: false (humans omit this guard too).

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

const PRIVILEGED_SEGMENT_RE =
  /(?:\/|^)(?:admin|internal|debug|staff|private|manage|management|backstage|console|moderation|trust|safety)(?:\/|$)/i;

// Match the file path (relative or absolute) — admin segment can
// appear in either the directory or filename.
function pathIsPrivileged(filePath: string): boolean {
  return PRIVILEGED_SEGMENT_RE.test(filePath);
}

const AUTH_PRIMITIVES = [
  'requireRole',
  'requireAdmin',
  'hasRole',
  'hasPermission',
  'assertRole',
  'ensureRole',
  'isAdmin',
  'requirePermission',
  'checkPermission',
  'rbac',
];

const AUTH_PRIMITIVE_RE = new RegExp(
  AUTH_PRIMITIVES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
);

function bodyMentionsRoleCheck(source: string): boolean {
  return AUTH_PRIMITIVE_RE.test(source);
}

export const publicAdminRouteRule = createRule<RuleContext>({
  id: 'security/public-admin-route',
  category: 'security',
  severity: 'medium',
  aiSpecific: false,
  description:
    'Privileged route (path contains /admin, /internal, /debug, etc.) without an additional role/permission check.',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    if (!pathIsPrivileged(facts.filePath)) return issues;

    if (bodyMentionsRoleCheck(source)) return issues;

    issues.push({
      ruleId: 'security/public-admin-route',
      category: 'security',
      severity: 'medium',
      aiSpecific: false,
      message:
        `Route path '${facts.filePath}' contains a privileged segment ` +
        '(/admin, /internal, /debug, /staff, /private, /manage, /backstage, /console, /moderation, /trust, /safety) ' +
        'but the handler body contains no role/permission check. ' +
        'A standard auth middleware may not be enough — privileged routes need an explicit role gate.',
      line: 1,
      column: 1,
      advice:
        'Add a role check at the top of the handler: ' +
        'requireRole(req, "admin"), hasPermission(req.user, "admin:write"), ' +
        'or your framework\'s equivalent. If the route is intentionally public, ' +
        'consider renaming it so the privileged-segment pattern does not apply.',
    });
    return issues;
  },
});

export default publicAdminRouteRule satisfies Rule<RuleContext>;