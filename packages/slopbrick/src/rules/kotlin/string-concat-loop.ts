/**
 * Rule: kotlin/string-concat-loop
 *
 * String concatenation inside a Kotlin loop (`for`, `while`,
 * `repeat`, `forEach`). Kotlin compiles `s = s + x` to a fresh
 * `StringBuilder` each iteration (one per loop step), so it is
 * O(n²) in time and allocation. The idiomatic Kotlin fix is a
 * `buildString { ... }` block or a `StringBuilder` declared
 * outside the loop.
 *
 * **Why this matters:**
 * - Same O(n²) cost as Java's `s = s + x` pattern. Kotlin's
 *   compiler optimizes one-shot concatenation (`"a" + "b"`) to a
 *   single `StringBuilder`, but it cannot optimize the
 *   loop-iteration form.
 * - Real Kotlin code uses `buildString { append(...) }` or a
 *   `StringBuilder` declared outside the loop. AI agents
 *   concatenate inside loops because their training data has
 *   many "string builder" examples that look like `s = s + i`
 *   — the same fingerprint the v0.20 Java
 *   `java/string-concat-loop` rule fires on.
 * - Severity: low. Performance impact is small for n < 100.
 * - Default off (DORMANT) until calibrated on v9 Kotlin corpus.
 *
 * **Scope:** file-local. Heuristic regex on the source text. We
 * only fire when a loop keyword (`for` / `while` / `repeat` /
 * `forEach`) is present somewhere in the file; otherwise `s = s +
 * x` in straight-line code is fine.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface KotlinStringConcatLoopContext {
  // No configuration.
}

// Match `s = s + ...` style — same back-reference trick the Java rule
// uses to keep the variable name consistent on both sides. Kotlin
// statements don't require a trailing `;`, so we accept `;`, `}`, or
// end-of-line as the terminator.
const STRING_CONCAT_REGEX = /\b(\w+)\s*=\s*\1\s*\+\s*[^;}]+[;}\n]/g;

export const kotlinStringConcatLoopRule = createRule<KotlinStringConcatLoopContext>({
  id: 'kotlin/string-concat-loop',
  category: 'perf',
  severity: 'low',
  aiSpecific: true,
  description: 'String concatenation in a loop — use buildString { ... } or a StringBuilder',
  create(_context: RuleContext): KotlinStringConcatLoopContext {
    return {};
  },
  analyze(_context: KotlinStringConcatLoopContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.24.0: Kotlin-only rule.
    if (!/\.kts?$/i.test(facts.filePath)) return issues;

    // Heuristic: only fire if the file contains a loop keyword.
    // Without this, a straight-line `s = s + x` would trigger,
    // but the perf issue lives in the loop, not the assignment.
    if (!/\b(?:for|while|repeat|forEach)\b/.test(source)) return issues;

    let m: RegExpExecArray | null;
    STRING_CONCAT_REGEX.lastIndex = 0;
    while ((m = STRING_CONCAT_REGEX.exec(source)) !== null) {
      const line = source.slice(0, m.index).split('\n').length;
      // Naive guard: skip lines that also have `.append(...)` —
      // those are real StringBuilder uses, not concat.
      const lineText = source.slice(0, m.index).split('\n').pop() ?? '';
      if (/\.append\s*\(/.test(lineText)) continue;

      issues.push({
        ruleId: 'kotlin/string-concat-loop',
        category: 'perf',
        severity: 'low',
        aiSpecific: true,
        message:
          `String concatenation in a loop at line ${line} — use buildString { ... }`,
        line,
        column: 1,
        advice:
          'Wrap the loop in `buildString { append(...) }` or declare a ' +
          '`StringBuilder` outside the loop. Kotlin cannot optimize ' +
          '`s = s + x` inside a loop — each iteration allocates a new ' +
          'StringBuilder, making the whole thing O(n²) for n iterations. ' +
          'AI agents concatenate inside loops because of training-data ' +
          'examples. Reference: kotlin/string-concat-loop v0.24.',
      });
    }
    return issues;
  },
});

export default kotlinStringConcatLoopRule satisfies Rule<KotlinStringConcatLoopContext>;
