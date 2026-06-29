// Rule: security/localstorage-token
//
// Persists JWT / access / refresh tokens in localStorage or
// sessionStorage. Both stores are reachable from any page script, so
// any XSS sink drains them. OWASP A03:2021 + A07:2021: issue tokens
// as httpOnly Secure SameSite cookies so JS cannot read them.
//
// Detection (raw source scan):
//   1. setItem('token-ish-key', v) on localStorage / sessionStorage.
//      Whitelists benign UI prefs (theme, lang, settings, ...).
//   2. Variable-form keys: setItem(AUTH_KEY, v) — only flagged when
//      the identifier itself reads token-y (no taint info).
// Severity: high (XSS -> credential theft). aiSpecific: false.

import type { Issue, Rule, RuleContext } from '../../types';
import { createRule } from '../rule';
import { lineOfSource } from '../utils';

// 1=quote, 2=key. Single / double / backtick literals.
const LS_SETITEM_RE =
  /(?:localStorage|sessionStorage)\s*\.\s*setItem\s*\(\s*(['"`])([^'"`]+)\1/g;
// Variable form (no quote). Identifier is grabbed for substring scoring.
const LS_SETITEM_VAR_RE =
  /(?:localStorage|sessionStorage)\s*\.\s*setItem\s*\(\s*(?!['"`])([A-Za-z_$][\w$]*)/g;

// Substrings implying the value is a credential.
const TOKEN_KEY_RE =
  /(token|jwt|bearer|access|refresh|auth|session[_-]?id|session[_-]?token|id[_-]?token|sso|api[_-]?key)/i;

// Routine, non-credential client-state keys. AI-default code persists these.
const NON_TOKEN_KEY_ALLOWLIST: ReadonlySet<string> = new Set([
  'theme', 'lang', 'locale', 'i18n', 'user_pref', 'userprefs', 'prefs',
  'preferences', 'settings', 'ui_theme', 'sidebar', 'view_mode', 'cart',
  'last_seen', 'onboarding', 'dismissed',
]);

function isTokenY(rawKey: string): boolean {
  const k = rawKey.toLowerCase();
  return !NON_TOKEN_KEY_ALLOWLIST.has(k) && TOKEN_KEY_RE.test(k);
}

function pushIssue(out: Issue[], source: string, offset: number,
  message: string, advice: string): void {
  out.push({
    ruleId: 'security/localstorage-token', category: 'security',
    severity: 'high', aiSpecific: false,
    message, advice, line: lineOfSource(source, offset), column: 1,
  });
}

export const localstorageTokenRule = createRule<RuleContext>({
  id: 'security/localstorage-token', category: 'security',
  severity: 'high', aiSpecific: false,
  description:
    'Auth token stored in localStorage — vulnerable to XSS exfiltration (OWASP A03:2021).',
  create(context) { return context; },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source ?? '';
    if (!source) return issues;
    let m: RegExpExecArray | null;
    LS_SETITEM_RE.lastIndex = 0;
    while ((m = LS_SETITEM_RE.exec(source)) !== null) {
      const key = m[2];
      if (!isTokenY(key)) continue;
      pushIssue(issues, source, m.index,
        `Auth key '${key}' written to localStorage / sessionStorage. ` +
          'Any page script can read it (XSS, malicious dep, browser extension).',
        'Issue the token as an httpOnly Secure SameSite cookie so JS cannot access it. ' +
          'Keep credentials out of client JS entirely.');
    }
    LS_SETITEM_VAR_RE.lastIndex = 0;
    while ((m = LS_SETITEM_VAR_RE.exec(source)) !== null) {
      const ident = m[1];
      if (!TOKEN_KEY_RE.test(ident)) continue;
      pushIssue(issues, source, m.index,
        `localStorage.setItem('${ident}', ...) — identifier '${ident}' looks token-y. ` +
          'Verify the value is not a credential.',
        'Trace the value being persisted. Tokens must never reach localStorage; ' +
          'issue as httpOnly cookies and call them server-side only.');
    }
    return issues;
  },
});

export default localstorageTokenRule satisfies Rule<RuleContext>;
