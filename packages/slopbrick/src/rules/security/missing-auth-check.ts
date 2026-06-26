// Rule: security/missing-auth-check
//
// Catches server route handlers that don't appear to perform any
// authentication or authorization check in their body. Heuristic:
// in any file under a recognized server-route pattern (Next.js
// `app/**/route.ts`, Next.js `pages/api/**`, Express routes
// registered with app.get/post/put/delete/use), look for a
// known auth primitive. If none are found, fire.
//
// Known auth primitives (extend as new patterns emerge):
//   - getServerSession, auth() (NextAuth)
//   - verify, jwt.verify, jsonwebtoken
//   - requireAuth, requireRole, withAuth, protect, authorize
//   - getCurrentUser, requireUser, authenticate
//
// Severity: medium (heuristic, false positives expected). The rule
// is intentionally noisy for v1 — better to over-report on
// routes that DO have auth (developer confirms) than to miss a
// real unprotected endpoint.
//
// aiSpecific: false (humans omit auth too; this is a generic
// server-route safety check, not an AI tell).

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

const AUTH_PRIMITIVES = [
  'getServerSession',
  'auth(',
  'requireAuth',
  'requireRole',
  'withAuth',
  'protect',
  'authorize',
  'verify',
  'jwt.verify',
  'jsonwebtoken',
  'getCurrentUser',
  'requireUser',
  'authenticate',
  'verifyJwt',
  'verifyToken',
  'getSession',
  'requireSession',
];

const AUTH_PRIMITIVE_RE = new RegExp(
  AUTH_PRIMITIVES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
);

// Heuristic filename patterns: matches the kind of file that
// almost certainly contains a server route handler.
const SERVER_ROUTE_FILENAME_RE =
  /(?:^|\/)(?:route\.[jt]sx?|route\.[jt]s|api[\\/][^\\/]+\.[jt]sx?|[^\\/]+\.api\.[jt]s)$/i;

function isServerRouteFile(filePath: string): boolean {
  // app/api/**, pages/api/**, src/app/api/**, src/pages/api/**, src/routes/**
  const normalized = filePath.replace(/\\/g, '/');
  return (
    /(^|\/)(app|pages)\/api\//.test(normalized) ||
    /(^|\/)(src\/)?routes\//.test(normalized) ||
    SERVER_ROUTE_FILENAME_RE.test(normalized)
  );
}

function bodyMentionsAuth(source: string): boolean {
  return AUTH_PRIMITIVE_RE.test(source);
}

function hasExportedHandler(source: string): boolean {
  // Match exported GET/POST/PUT/PATCH/DELETE/OPTIONS/HEAD handlers
  // (Next.js route handler shape) OR exported HTTP-method calls
  // (Express shape: app.get(...), router.post(...)).
  return (
    /export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/.test(
      source,
    ) ||
    /\b(?:app|router)\s*\.\s*(?:get|post|put|patch|delete|options|head)\s*\(/.test(source)
  );
}

export const missingAuthCheckRule = createRule<RuleContext>({
  id: 'security/missing-auth-check',
  category: 'security',
  severity: 'medium',
  aiSpecific: false,
  description:
    'Server route handler (Next.js route.ts / pages/api / Express route) with no detectable authentication or authorization check.',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    if (!isServerRouteFile(facts.filePath)) return issues;
    if (!hasExportedHandler(source)) return issues;
    if (bodyMentionsAuth(source)) return issues;
    issues.push({
      ruleId: 'security/missing-auth-check',
      category: 'security',
      severity: 'medium',
      aiSpecific: false,
      message:
        'Server route handler has no detectable auth/authorization check in its body. ' +
        'The endpoint may be reachable by any authenticated (or unauthenticated) user.',
      line: 1,
      column: 1,
      advice:
        'Add an auth check (e.g. getServerSession, requireAuth, jwt.verify) at the top of the handler. ' +
        'If the route is intentionally public, ignore this finding — but consider adding a comment explaining why.',
    });
    return issues;
  },
});

export default missingAuthCheckRule satisfies Rule<RuleContext>;