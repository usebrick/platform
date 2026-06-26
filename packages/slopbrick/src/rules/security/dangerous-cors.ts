// Rule: security/dangerous-cors
//
// Catches `Access-Control-Allow-Origin: *` and `cors({ origin: '*' })` /
// `cors({ origin: true })` configurations. The wildcard origin
// with credentials is a CSRF / data-exfiltration primitive that
// AI commonly emits because "wide-open CORS" is the easiest
// configuration that doesn't 404 the browser preflight.
//
// Detection (raw source scan):
//   1. HTTP header literal: 'Access-Control-Allow-Origin', '*'
//   2. Express cors() options: origin: '*' or origin: true or
//      origin: (origin, cb) => cb(null, true) — the latter two
//      echo the request origin back (functionally equivalent to *)
//   3. Next.js route handler / middleware setting the header to '*'
//
// Severity: medium (high if combined with credentials: true,
// but we don't try to detect that combination in v1).
//
// aiSpecific: true (the wildcard pattern is rare in human code;
// AI tutorials and prototypes default to it).

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { lineOfSource } from '../utils';

const HEADER_LITERAL_RE =
  /['"]Access-Control-Allow-Origin['"]\s*[,:=]\s*['"]\*['"]/g;

// origin: '*' / origin: true / origin: <any-var> inside a cors() call.
// Match `cors({...})` blocks and look for `origin: <bad-value>`.
const CORS_BLOCK_RE = /\bcors\s*\(\s*\{([^}]*)\}\s*\)/g;
const ORIGIN_FIELD_RE = /\borigin\s*:\s*(['"`])([^'"`]+)\1/g;
// Variable form: `origin: someVar` — without quotes.
const ORIGIN_VAR_RE = /\borigin\s*:\s*(?!['"`])([A-Za-z_$][\w$]*)/g;

const BAD_ORIGIN_VALUES = new Set(['*', 'true']);


function scanForWildcardCors(source: string): Array<{ message: string; line: number }> {
  const hits: Array<{ message: string; line: number }> = [];
  // Header literal.
  HEADER_LITERAL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HEADER_LITERAL_RE.exec(source)) !== null) {
    hits.push({
      message:
        "Wildcard CORS header: 'Access-Control-Allow-Origin: *'. " +
        'Any origin can read responses. If credentials are also enabled this is a CSRF primitive.',
      line: lineOfSource(source, m.index),
    });
  }
  // cors({ origin: '...' }) or cors({ origin: true }) — string or boolean literal.
  CORS_BLOCK_RE.lastIndex = 0;
  while ((m = CORS_BLOCK_RE.exec(source)) !== null) {
    const inner = m[1];
    const blockStart = m.index + m[0].indexOf(inner);
    ORIGIN_FIELD_RE.lastIndex = 0;
    let m2: RegExpExecArray | null;
    while ((m2 = ORIGIN_FIELD_RE.exec(inner)) !== null) {
      const value = m2[2].trim();
      if (BAD_ORIGIN_VALUES.has(value)) {
        hits.push({
          message:
            value === '*'
              ? "Wildcard CORS in cors() options: origin: '*'. Any origin allowed."
              : "Reflective CORS: origin: true echoes the request origin. Functionally wildcard.",
          line: lineOfSource(source, blockStart + m2.index),
        });
      }
    }
    // Variable form (no quotes).
    ORIGIN_VAR_RE.lastIndex = 0;
    let m3: RegExpExecArray | null;
    while ((m3 = ORIGIN_VAR_RE.exec(inner)) !== null) {
      const ident = m3[1];
      // Whitelist of names that are conventionally *not* wildcards.
      if (/^(allowed|whitelist|origins|domain|url|allowedOrigins|originList)$/i.test(ident)) continue;
      // JS reserved literals that look like variable names but are
      // actually values (origin: true is the reflective wildcard).
      if (ident === 'true' || ident === 'false' || ident === 'null') {
        hits.push({
          message:
            ident === 'true'
              ? "Reflective CORS: origin: true echoes the request origin. Functionally wildcard."
              : `CORS origin: ${ident}. Verify the runtime value is safe.`,
          line: lineOfSource(source, blockStart + m3.index),
        });
        continue;
      }
      hits.push({
        message:
          `Dynamic CORS origin from variable '${ident}'. Verify it is not '*' / ` +
          `true / a request-origin echo at runtime.`,
        line: lineOfSource(source, blockStart + m3.index),
      });
    }
  }
  return hits;
}

export const dangerousCorsRule = createRule<RuleContext>({
  id: 'security/dangerous-cors',
  category: 'security',
  severity: 'medium',
  aiSpecific: true,
  description:
    "Wildcard or reflective CORS configuration: 'Access-Control-Allow-Origin: *' / origin: '*' / origin: true.",
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    for (const hit of scanForWildcardCors(source)) {
      issues.push({
        ruleId: 'security/dangerous-cors',
        category: 'security',
        severity: 'medium',
        aiSpecific: true,
        message: hit.message,
        line: hit.line,
        column: 1,
        advice:
          'Restrict CORS to an explicit allowlist of origins. If you really need wildcard, ' +
          'never combine it with Access-Control-Allow-Credentials: true.',
      });
    }
    return issues;
  },
});

export default dangerousCorsRule satisfies Rule<RuleContext>;