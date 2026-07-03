/**
 * Rule: kotlin/hardcoded-credential
 *
 * String literal that looks like a credential: API key, secret,
 * token, password, or auth header. The regex matches
 * `key = "value"` or `key: "value"` patterns where `key` is a
 * credential-like identifier and `value` is a long opaque string.
 *
 * **Why this matters:**
 * - Hardcoded credentials are a top-3 secret leak in source code
 *   (GitHub Secret Scanning, TruffleHog, etc.). A committed
 *   API key lives forever in git history.
 * - The fix is environment variables, a secrets manager
 *   (Vault, AWS Secrets Manager), or a `.env` file that's
 *   `.gitignore`d.
 * - Severity: high. Leaked credentials trigger incident response.
 * - Default on. This rule gates the secrets-in-code category.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * `(?i)(api[_-]?key|secret|token|password|auth)\s*[=:]\s*"..."`
 * with a value that's 16+ chars and looks random
 * (mix of letters + digits, not all-digits, not common words).
 *
 * **v0.29.0: non-AI-fingerprint rule.** This rule measures a real
 * engineering defect, not AI authorship. Per the v0.27.0
 * methodology paper's Option C, v0.29.0+ pivots to non-AI rules.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface KotlinHardcodedCredentialContext {
  // No configuration.
}

// Credential-like key on the left of `=` or `:`.
const KEY_REGEX = /\b(api[_-]?key|apikey|secret|token|password|auth|access[_-]?key|client[_-]?secret|private[_-]?key)\b\s*[=:]/i;

// Opaque-looking value on the right: 16+ chars, mix of letters
// and digits (heuristic: 50%+ alphanumeric, not all-digits,
// not a common word). Quoted string capture. We allow letters,
// digits, and a small set of special characters that appear in
// real credentials (URL-safe base64, hex, JWT segments).
const VALUE_REGEX = /["']([A-Za-z0-9_\-+/=.@*!]{16,})["']/;

// Common false positives we want to suppress.
const FALSE_POSITIVES = new Set([
  'passwordless',
  'tokenize',
  'tokenizer',
  'authorizationrequired',
  'authenticated',
  'authenticatortoken',
  'authtoken',
  'placeholder',  // common in test fixtures
  'changeme',     // placeholder, but still suspicious — kept for review
]);

export const kotlinHardcodedCredentialRule = createRule<KotlinHardcodedCredentialContext>({
  id: 'kotlin/hardcoded-credential',
  category: 'security',
  severity: 'high',
  aiSpecific: false,
  description: 'Hardcoded credential literal — use env vars or a secrets manager',
  create(_context: RuleContext): KotlinHardcodedCredentialContext {
    return {};
  },
  analyze(_context: KotlinHardcodedCredentialContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.29.0: Kotlin-only rule.
    if (!/\.kts?$/i.test(facts.filePath)) return issues;

    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (!KEY_REGEX.test(line)) continue;
      const valueMatch = VALUE_REGEX.exec(line);
      if (!valueMatch) continue;
      const value = valueMatch[1]!;
      if (FALSE_POSITIVES.has(value.toLowerCase())) continue;
      // Heuristic: must have BOTH letters and digits, not all-digits.
      // "1234567890123456" is a placeholder, not a credential.
      if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) continue;
      // Skip values that look like variable names (e.g. "$password")
      if (value.startsWith('$')) continue;
      // Skip test-file heuristic: "test", "Test" in path → allow.
      // (Tests often have fake credentials.)
      if (/\/test\//i.test(facts.filePath) || /\.test\.kts?$/i.test(facts.filePath)) continue;

      issues.push({
        ruleId: 'kotlin/hardcoded-credential',
        category: 'security',
        severity: 'high',
        aiSpecific: false,
        message: `Hardcoded credential at line ${i + 1}`,
        line: i + 1,
        column: 1,
        advice:
          'Move the credential to an environment variable, a ' +
          '.env file that is .gitignore\'d, or a secrets manager ' +
          '(Vault, AWS Secrets Manager, GCP Secret Manager). ' +
          'Hardcoded credentials are the #1 source of secret leaks ' +
          'on GitHub. Reference: kotlin/hardcoded-credential v0.29 ' +
          '(OWASP A07:2021 — Identification and Authentication Failures).',
      });
    }
    return issues;
  },
});

export default kotlinHardcodedCredentialRule satisfies Rule<KotlinHardcodedCredentialContext>;
