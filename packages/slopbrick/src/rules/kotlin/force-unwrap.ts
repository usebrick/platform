/**
 * Rule: kotlin/force-unwrap
 *
 * Kotlin's `!!` non-null assertion operator. `obj!!` throws
 * `NullPointerException` at runtime if `obj` is null. Kotlin's
 * type system is designed so you shouldn't need `!!`; if you
 * do, it's almost always a bug or a missed `?.` (safe call).
 *
 * **Why this matters:**
 * - The `!!` operator is a code smell. It says "I know this
 *   isn't null" but the type system can't verify it. The
 *   typical cause is "the function returns `T?` and I know
 *   it's not null because I just checked" — but the check is
 *   usually 50 lines away and the reader can't see it.
 * - The idiomatic fix is `?.` (safe call) with a `?:` (Elvis)
 *   default, or a proper `when`/null check. `!!` is a runtime
 *   crash waiting to happen.
 * - Severity: medium. Not always a bug (e.g. immediately after
 *   a `checkNotNull`), but high-cost when it is.
 * - Default on. This rule gates the unsafe-null-handling
 *   category.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * `!!` followed by `.` (method call), `)` (terminator), or
 * end-of-line. We exclude `!!` in string literals (rare but
 * possible).
 *
 * **v0.29.0: non-AI-fingerprint rule.** This rule measures a
 * real engineering defect, not AI authorship.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface KotlinForceUnwrapContext {
  // No configuration.
}

// `!!` followed by one of:
//   .  (method call: `obj!!.method()`)
//   )  (terminator in expression: `(obj!!)`)
//   }  (object literal close: `Foo(obj!!)`)
//   ;  (statement terminator: `val x = obj!!;`)
//   \n (end of line)
//   ,  (argument terminator: `f(obj!!, ...)`)
//   [  (indexer: `list!![0]`)
// The trailing-context requirement avoids matching `!!` in
// operators like `a !== b` (we want `!!` standalone, not part
// of a comparison).
const FORCE_UNWRAP_REGEX = /!!(?=\s*[.\)}\};,\n\[])/g;

export const kotlinForceUnwrapRule = createRule<KotlinForceUnwrapContext>({
  id: 'kotlin/force-unwrap',
  category: 'logic',
  severity: 'medium',
  aiSpecific: false,
  description: '!! force-unwrap — use ?. (safe call) or a proper null check',
  create(_context: RuleContext): KotlinForceUnwrapContext {
    return {};
  },
  analyze(_context: KotlinForceUnwrapContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.29.0: Kotlin-only rule.
    if (!/\.kts?$/i.test(facts.filePath)) return issues;

    let m: RegExpExecArray | null;
    FORCE_UNWRAP_REGEX.lastIndex = 0;
    while ((m = FORCE_UNWRAP_REGEX.exec(source)) !== null) {
      const line = source.slice(0, m.index).split('\n').length;
      // Exclude `!!` in string literals (rare but possible).
      // We check the line: if it has an unclosed `"` before
      // the !!, skip.
      const lineStart = source.lastIndexOf('\n', m.index) + 1;
      const lineText = source.slice(lineStart, m.index);
      const quoteCount = (lineText.match(/"/g) || []).length;
      if (quoteCount % 2 === 1) continue;

      issues.push({
        ruleId: 'kotlin/force-unwrap',
        category: 'logic',
        severity: 'medium',
        aiSpecific: false,
        message: `!! force-unwrap at line ${line}`,
        line,
        column: (m.index - lineStart) + 1,
        advice:
          'Use ?. (safe call) with ?: (Elvis) for a default, or a ' +
          'proper when/if check. !! throws NullPointerException at ' +
          'runtime — it bypasses Kotlin\'s type system. Reference: ' +
          'kotlin/force-unwrap v0.29.',
      });
    }
    return issues;
  },
});

export default kotlinForceUnwrapRule satisfies Rule<KotlinForceUnwrapContext>;
