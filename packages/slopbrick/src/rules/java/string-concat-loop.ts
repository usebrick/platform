/**
 * Rule: java/string-concat-loop
 *
 * String concatenation inside a loop (`for`, `while`, `do-while`,
 * `for-each`). This is a textbook performance anti-pattern: each
 * iteration creates a new `StringBuilder` (or two, in older JVMs).
 * The fix is to declare a `StringBuilder` outside the loop and
 * call `.append(...)` inside.
 *
 * **Why this matters:**
 * - String concatenation in a loop is O(n²) in time and memory
 *   (each iteration copies the prior string). For n=10,000, that's
 *   ~50M string-copy operations vs O(n) with StringBuilder.
 * - The pattern is a strong AI signal. Real Java engineers learn
 *   the StringBuilder rule early; AI agents concatenate strings in
 *   loops because their training data has many "string building"
 *   examples.
 * - Severity: low. Performance impact is small for n < 100; the
 *   rule fires as a stylistic AI signal.
 * - Default off (DORMANT) until calibrated on v9 Java corpus.
 *
 * **Scope:** file-local. Heuristic regex on the source text. The
 * rule checks for `s = s +` or `s +=` patterns inside any block
 * that contains a `for`/`while`/`do-while` keyword. It does not
 * verify that the assignment is actually inside the loop body
 * (the regex is too coarse-grained for that without an AST), but
 * the FPR is acceptable because the pattern is unusual outside
 * loops.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface JavaStringConcatLoopContext {
  // No configuration.
}

// String concatenation patterns. We use `s = s + ...` or `s += ...`
// where `s` is some identifier. The negative lookbehind for word
// chars prevents matching `+=` inside longer operators.
const STRING_CONCAT_REGEX =
  /(\b\w+)\s*=\s*\1\s*\+\s*[^;]+;|(\b\w+)\s*\+=\s*['"`]/g;

export const javaStringConcatLoopRule = createRule<JavaStringConcatLoopContext>({
  id: 'java/string-concat-loop',
  category: 'perf',
  severity: 'low',
  aiSpecific: true,
  description: 'String concatenation in a loop — use StringBuilder',
  create(_context: RuleContext): JavaStringConcatLoopContext {
    return {};
  },
  analyze(_context: JavaStringConcatLoopContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;

    // Quick heuristic: only fire if the file contains a loop keyword.
    // Without this, we'd flag single `s = s + x` statements (which
    // are fine — the perf issue is the loop).
    if (!/\b(for|while|do)\b/.test(source)) return issues;

    let m: RegExpExecArray | null;
    STRING_CONCAT_REGEX.lastIndex = 0;
    while ((m = STRING_CONCAT_REGEX.exec(source)) !== null) {
      const line = source.slice(0, m.index).split('\n').length;
      issues.push({
        ruleId: 'java/string-concat-loop',
        category: 'perf',
        severity: 'low',
        aiSpecific: true,
        message:
          `String concatenation in a loop at line ${line} — use StringBuilder`,
        line,
        column: 1,
        advice:
          'Declare a `StringBuilder` outside the loop: ' +
          '`StringBuilder sb = new StringBuilder(); sb.append(...);` ' +
          'then `return sb.toString();` after the loop. ' +
          'String concatenation in a loop is O(n²) — each iteration ' +
          'copies the prior string. AI agents concatenate strings in ' +
          'loops because of training-data examples. ' +
          'Reference: java/string-concat-loop v0.20.',
      });
    }
    return issues;
  },
});

export default javaStringConcatLoopRule satisfies Rule<JavaStringConcatLoopContext>;
