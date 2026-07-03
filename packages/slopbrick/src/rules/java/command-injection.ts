/**
 * Rule: java/command-injection
 *
 * `Runtime.exec(...)` or `ProcessBuilder` invoked with a string
 * that contains string concatenation. User-controlled data
 * flowing into a shell command is the classic command-injection
 * vulnerability — attackers can break out with `; rm -rf /` or
 * `$(...)`.
 *
 * **Why this matters:**
 * - Direct command-injection vulnerability. Even when the input
 *   is "trusted", concatenation breaks the contract and an
 *   attacker who finds a way to influence the input gets
 *   arbitrary command execution.
 * - The fix is `ProcessBuilder` with a `List<String>` of args
 *   (no shell parsing) and validating each arg against a
 *   whitelist. For shell commands, use `bash -c` only with
 *   a fixed string (no concatenation).
 * - Severity: high. Command injection is OWASP A03:2021.
 * - Default off (DORMANT) until v9 Java corpus calibration.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * `Runtime.exec(` or `ProcessBuilder(` followed by a string with
 * `+` (concat) within the same line.
 *
 * **v0.30.0: non-AI-fingerprint rule.** Java-specific (Kotlin
 * has its own coroutine-based APIs that don't use Runtime.exec).
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface JavaCommandInjectionContext {
  // No configuration.
}

const COMMAND_INVOCATION_REGEX = /\b(?:Runtime\.exec|Runtime\.getRuntime\(\)\.exec|ProcessBuilder)\s*\(/;

const STRING_CONCAT_REGEX = /["'][^"']*["']\s*\+/;

export const javaCommandInjectionRule = createRule<JavaCommandInjectionContext>({
  id: 'java/command-injection',
  category: 'security',
  severity: 'high',
  aiSpecific: false,
  description: 'Runtime.exec() or ProcessBuilder with string concat — use List<String> args + validation',
  create(_context: RuleContext): JavaCommandInjectionContext {
    return {};
  },
  analyze(_context: JavaCommandInjectionContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.30.0: Java-only rule.
    if (!/\.java$/i.test(facts.filePath)) return issues;

    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (!COMMAND_INVOCATION_REGEX.test(line)) continue;
      if (!STRING_CONCAT_REGEX.test(line)) continue;

      issues.push({
        ruleId: 'java/command-injection',
        category: 'security',
        severity: 'high',
        aiSpecific: false,
        message: `Command invocation with string concat at line ${i + 1}`,
        line: i + 1,
        column: 1,
        advice:
          'Use ProcessBuilder with a List<String> of args (no ' +
          'shell parsing) and validate each arg against a whitelist. ' +
          'For shell commands, use bash -c only with a fixed string ' +
          '(no concatenation). String concat into Runtime.exec() is ' +
          'the canonical command-injection pattern — attackers can ' +
          'break out with `; rm -rf /` or `$(...)`. Reference: ' +
          'java/command-injection v0.30 (OWASP A03:2021).',
      });
    }
    return issues;
  },
});

export default javaCommandInjectionRule satisfies Rule<JavaCommandInjectionContext>;
