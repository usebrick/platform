/**
 * Rule: java/hardcoded-credential
 *
 * String literal that looks like a credential: API key, secret,
 * token, password. The regex matches `key = "value"` or
 * `key: "value"` patterns where `key` is credential-like and
 * `value` is a long opaque string.
 *
 * **Why this matters:**
 * - Hardcoded credentials are the #1 secret-leak vector on
 *   GitHub. A committed API key lives forever in git history.
 * - The fix is env vars, a `.env` file in `.gitignore`, or a
 *   secrets manager (Vault, AWS Secrets Manager).
 * - Severity: high. Leaked credentials trigger incident response.
 * - Default off (DORMANT) until v9 Java corpus calibration.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * `(?i)(api[_-]?key|secret|token|password|auth)\s*[=:]\s*"..."`
 * with a 16+ char value that has both letters and digits.
 *
 * **v0.30.0: non-AI-fingerprint rule.** Mirrors the v0.29.0
 * `kotlin/hardcoded-credential`.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface JavaHardcodedCredentialContext {
  // No configuration.
}

const KEY_REGEX = /\b(api[_-]?key|apikey|secret|token|password|auth|access[_-]?key|client[_-]?secret|private[_-]?key)\b\s*[=:]/i;

const VALUE_REGEX = /["']([A-Za-z0-9_\-+/=.@*!]{16,})["']/;

const FALSE_POSITIVES = new Set([
  'passwordless',
  'tokenize',
  'tokenizer',
  'authorizationrequired',
  'authenticated',
  'authenticatortoken',
  'authtoken',
  'placeholder',
  'changeme',
]);

export const javaHardcodedCredentialRule = createRule<JavaHardcodedCredentialContext>({
  id: 'java/hardcoded-credential',
  category: 'security',
  severity: 'high',
  aiSpecific: false,
  description: 'Hardcoded credential literal — use env vars or a secrets manager',
  create(_context: RuleContext): JavaHardcodedCredentialContext {
    return {};
  },
  analyze(_context: JavaHardcodedCredentialContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.30.0: Java-only rule.
    if (!/\.java$/i.test(facts.filePath)) return issues;

    // Skip test files.
    if (/\/test\//i.test(facts.filePath) || /\/src\/test\//i.test(facts.filePath)) return issues;

    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (!KEY_REGEX.test(line)) continue;
      const valueMatch = VALUE_REGEX.exec(line);
      if (!valueMatch) continue;
      const value = valueMatch[1]!;
      if (FALSE_POSITIVES.has(value.toLowerCase())) continue;
      if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) continue;
      if (value.startsWith('$')) continue;

      issues.push({
        ruleId: 'java/hardcoded-credential',
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
          'on GitHub. Reference: java/hardcoded-credential v0.30 ' +
          '(OWASP A07:2021 — Identification and Authentication Failures).',
      });
    }
    return issues;
  },
});

export default javaHardcodedCredentialRule satisfies Rule<JavaHardcodedCredentialContext>;
