/**
 * Rule: java/suspicious-implementation
 *
 * Content-based detection: a function whose name suggests a strong
 * operation (validate, encrypt, hash, sanitize, check, verify,
 * authenticate, etc.) but whose body is trivially empty or
 * returns a constant / the input unchanged.
 *
 * **Why this matters:**
 * - The CoCoNUTS paper (2025) showed that style-based AI-detectors
 *   fail under paraphrasing because they look at surface features.
 *   Content-based detection looks at semantic intent vs execution.
 *   For code, the equivalent is: does the function body actually
 *   implement what the function name suggests?
 * - A function named `validateInput()` whose body is `return true;`
 *   is a real engineering bug — it passes the type checker but
 *   silently approves all input. A function named `encrypt()`
 *   whose body is `return data;` is a security bug.
 * - Real Java code: when developers write these stubs, they
 *   almost always mean to "come back and fix this later" — but
 *   the comment often says "TODO" or "FIXME" and the function
 *   ships. These are the bug surfaces that surface in security
 *   audits.
 * - Severity: high. Silent security failures are OWASP A04:2021.
 * - Default on. This is a real engineering defect, not AI slop.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * method declarations whose name contains a "strong verb" but
 * whose body is suspicious (empty, just `return X;`, etc.).
 *
 * **v0.35.0: non-AI-fingerprint rule, content-based.** Per the
 * v0.27.0 methodology paper's Option C, v0.35.0+ adds
 * content-based rules. This is the first v9 release where the
 * rule is ON by default (visible to end users) because it
 * measures a real engineering defect, not an AI fingerprint.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface JavaSuspiciousImplementationContext {
  // No configuration.
}

// Strong verbs that suggest a meaningful operation. The function
// name containing one of these is a claim about behavior; an
// empty/trivial body is a violation of the claim.
//
// Note: we use a positive lookahead `(?=[A-Z]|[^a-zA-Z]|$)`
// instead of `\b` to handle camelCase method names like
// `validateInput` — `\b` requires a word/non-word transition
// which doesn't exist between `validate` and `Input` (both
// word chars). The lookahead detects the camelCase boundary
// (capital letter), non-letter, or end of string.
const STRONG_VERB_REGEX =
  /(?:validate|validates|validated|verifies?|verify|check|checks?|checked|ensures?|ensure|ensured|verifies|verified|sanitize|sanitizes|sanitized|escape|escapes|escaped|authenticate|authenticates|authenticated|authorize|authorizes|authorized|audit|audits|audited|inspect|inspects|inspected|filter|filters?|filtered|normalize|normalizes|normalized|encrypt|encrypts|encrypted|decrypt|decrypts|decrypted|hash|hashes|hashed|sign|signs?|signed|compress|compresses|compressed|decompress|decompresses|decompressed|parse|parses|parsed|format|formats?|formatted)(?=[A-Z]|[^a-zA-Z]|$)/i;

// Method declaration: `public/private/protected [static] ReturnType
// MethodName(args) { body }`. We capture the method name (group 1)
// and the body (group 2).
const METHOD_DECL_REGEX =
  /(?:public|private|protected)\s+(?:static\s+)?[\w<>,\s\[\]]+?\s+(\w+)\s*\([^)]*\)\s*\{([^{}]*)\}/g;

// Suspicious body patterns:
// 1. Empty body: `{}` or `{ }`
const EMPTY_BODY_REGEX = /^\s*$/;
// 2. Just `return null;` or `return true;` etc.
const RETURN_CONSTANT_REGEX = /^\s*return\s+(?:null|true|false|0|1|0L|0\.0|"")\s*;\s*$/;
// 3. Just `return argName;` (pass-through, common stub for
//    "validate(x) { return x; }")
const RETURN_INPUT_REGEX = /^\s*return\s+(\w+)\s*;\s*$/;
// 4. Just `throw new UnsupportedOperationException(...);` etc.
const JUST_THROW_REGEX =
  /^\s*throw\s+new\s+(?:UnsupportedOperationException|UnsupportedOperationException\([^)]*\)|RuntimeException\([^)]*\)|IllegalStateException\([^)]*\))\s*;\s*$/;

export const javaSuspiciousImplementationRule = createRule<JavaSuspiciousImplementationContext>({
  id: 'java/suspicious-implementation',
  category: 'security',
  severity: 'high',
  aiSpecific: false,
  description:
    'function name suggests validation/encryption/auth but body is empty or trivially wrong — content mismatch',
  create(_context: RuleContext): JavaSuspiciousImplementationContext {
    return {};
  },
  analyze(_context: JavaSuspiciousImplementationContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.35.0: Java-only rule.
    if (!/\.java$/i.test(facts.filePath)) return issues;
    // Skip test files — stubs are common in tests.
    if (/\/test\//i.test(facts.filePath) || /\/src\/test\//i.test(facts.filePath)) return issues;

    let m: RegExpExecArray | null;
    METHOD_DECL_REGEX.lastIndex = 0;
    while ((m = METHOD_DECL_REGEX.exec(source)) !== null) {
      const methodName = m[1]!;
      const body = m[2]!;

      // Skip if the method name doesn't contain a strong verb.
      if (!STRONG_VERB_REGEX.test(methodName)) continue;

      // Check if the body is suspicious.
      let reason: string | null = null;
      if (EMPTY_BODY_REGEX.test(body)) {
        reason = 'empty body';
      } else if (RETURN_CONSTANT_REGEX.test(body)) {
        reason = 'returns a constant (null/true/false/0/1)';
      } else if (RETURN_INPUT_REGEX.test(body)) {
        reason = 'returns the input unchanged (pass-through stub)';
      } else if (JUST_THROW_REGEX.test(body)) {
        reason = 'throws UnsupportedOperationException — not implemented';
      }
      if (!reason) continue;

      const line = source.slice(0, m.index).split('\n').length;
      issues.push({
        ruleId: 'java/suspicious-implementation',
        category: 'security',
        severity: 'high',
        aiSpecific: false,
        message: `function ${methodName} (${reason}) — content-based mismatch`,
        line,
        column: 1,
        advice:
          `The function name "${methodName}" suggests a real ` +
          `validation/encryption/auth/filter operation, but the body ` +
          `is ${reason}. This is a content mismatch — the code's claimed ` +
          `behavior doesn't match its actual behavior. ` +
          `Real production code that ships this is a silent security ` +
          `failure (OWASP A04:2021 — Insecure Design). The fix is to ` +
          `either implement the operation or rename the function to ` +
          `reflect what it actually does. Reference: ` +
          `java/suspicious-implementation v0.35.0 (CoCoNUTS-inspired content-based detection).`,
      });
    }
    return issues;
  },
});

export default javaSuspiciousImplementationRule satisfies Rule<JavaSuspiciousImplementationContext>;
