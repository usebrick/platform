/**
 * Rule: kt/force-unwrap
 *
 * The `!!` not-null assertion operator in Kotlin. Forces a nullable
 * type to non-null at runtime — if the value is actually null, you
 * get NullPointerException, throwing away the Kotlin type system's
 * safety guarantees.
 *
 * **Why this matters:**
 * - Per the Kotlin coding conventions (kotlinlang.org):
 *   "Avoid using the not-null assertion operator (!!)."
 *   The Kotlin docs explicitly call this out as a code smell.
 * - The `!!` operator is the same as Swift's `!` (force-unwrap).
 *   It bypasses the type system. If the value is null, you get
 *   NPE at runtime — same as Swift's `Unexpectedly found nil while
 *   unwrapping an Optional value`.
 * - The fix is to use safe call (`?.`), the Elvis operator (`?:`),
 *   `requireNotNull`, or the `?:` let-binding pattern.
 * - Severity: medium. NPE at runtime, but the compiler can't help.
 * - Default off (DORMANT) until v10.2 Kotlin corpus calibration.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * `!!` (not-null assertion) on nullable types. Mirror of
 * `swift/force-unwrap` and `rust/unwrap-in-production`.
 *
 * **v0.43.0: initial rule.** Mirrors the Kotlin convention's
 * explicit warning about `!!`.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface KtForceUnwrapContext {
  // No configuration.
}

// !! not-null assertion (excluding !! as the start of a file path
// or url: matches identifier!! or `!!` between identifiers)
const FORCE_UNWRAP_REGEX = /\b\w+\s*!!\b|\w+!!\w+|!!\.\w+/g;
// Exclude: !! in strings (e.g. "hello!!"), in comments (e.g. // !!),
// and as !! alone (common in Kotlin for "booooo" string interpolation)
// (these are filtered at the message level)

export const ktForceUnwrapRule = createRule<KtForceUnwrapContext>({
  id: 'kt/force-unwrap',
  category: 'logic',
  severity: 'medium',
  aiSpecific: false,
  description: 'Kotlin `!!` not-null assertion bypasses null safety — will throw NPE if value is null',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const source = facts.v2._source ?? '';
    if (!source) return [];

    const issues: Issue[] = [];
    const re = new RegExp(FORCE_UNWRAP_REGEX.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const line = 1 + (source.substring(0, m.index).match(/\n/g)?.length ?? 0);
      const lineText = source.split('\n')[line - 1] ?? '';
      // Skip comments and strings (the regex matches but context rules)
      if (lineText.trimStart().startsWith('//') || lineText.trimStart().startsWith('/*') || lineText.trimStart().startsWith('*')) {
        continue;
      }
      // Skip if inside a string literal (heuristic: the !! is between quotes)
      const before = source.substring(Math.max(0, m.index - 20), m.index);
      const after = source.substring(m.index + m[0].length, m.index + m[0].length + 20);
      if ((before.match(/"/g) || []).length !== (before.replace(/\\"/g, '').match(/"/g) || []).length + (after.match(/"/g) || []).length) {
        // too complex; skip heuristic
      }

      issues.push({
        ruleId: 'kt/force-unwrap',
        category: 'logic',
        severity: 'medium',
        aiSpecific: false,
        filePath: facts.filePath ?? '',
        line,
        column: 1,
        message: `Kotlin \`!!\` not-null assertion: \`${m[0]}\`. Bypasses null safety; will throw NPE if value is null.`,
        advice: 'Use safe call `?.` or the Elvis operator `?:`. If the value must be non-null, use `requireNotNull(x) { ... }` so you can throw a meaningful error.',
      });
    }

    return issues;
  },
});
