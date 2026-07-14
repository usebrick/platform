/**
 * Rule: swift/force-unwrap
 *
 * Swift force-unwrap forms in production (non-test) source:
 *   - `foo as! Type`            — forced type cast
 *   - `something!.bar`          — forced optional unwrap on access
 *   - `try! someThrowingCall()` — forced `try`
 *
 * Force-unwraps crash at runtime when the value is nil. Swift
 * explicitly distinguishes the unconditional form (`!`) from the
 * safe form (`?`) precisely because silent fall-through is rarely
 * what callers want.
 *
 * **Why this matters:**
 * - A force-unwrap converts "the value might be nil" into "the
 *   program crashes if the value is nil". In production that's a
 *   crash log shipped to a customer. Apple SwiftLint
 *   (`discarded_notification_center_post_style`, `force_cast`,
 *   `force_try`, `force_unwrapping`) flags every shape above.
 * - AI agents reach for `!` because their training data has many
 *   "make it compile, deal with the edge case later" snippets; the
 *   Swift optional system is one of the most distinctive things
 *   the language adds over TypeScript / Java, and AI agents under-
 *   use the safe forms.
 * - We deliberately skip files that `import XCTest` (test files
 *   routinely force-unwrap because tests assert specific values
 *   and `XCTUnwrap(...)` is verbose).
 * - Severity: medium. Each force-unwrap is a potential prod crash.
 * - Default off (DORMANT) until calibrated on v10 Swift corpus.
 * The v10 corpus (576,750 files) is the source; the rule is
 * DORMANT because the v9 calibration on a smaller Swift slice
 * showed borderline FPR.
 *
 * **Scope:** file-local. Regex on the source text. We treat
 * the `!` as a force-unwrap only when NOT preceded by a word /
 * closing paren character (so `Optional.foo!.bar` is also caught
 * via the access form).
 *
 * **v0.34.10: tighten the access-force regex.** The previous
 * regex `(?:\w|\])\!\s*(?:\.|\(|;|,|\s*$)` matched the `!` in
 * comparison operators like `!==` and `!=` because the `!` is
 * preceded by `\w` (e.g. `a!` in `a != b`) and followed by `\s`.
 * v0.34.10 adds a negative lookbehind to exclude `!=` and `!==`
 * operators. The `AS_FORCE_REGEX` and `TRY_FORCE_REGEX` are
 * unchanged (those patterns don't conflict with operators).
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface SwiftForceUnwrapContext {
  // No configuration.
}

// `as! ` cast — identifier or `?` is allowed before (we don't want
// `as?` to match).
const AS_FORCE_REGEX = /\bas!\s+/g;
// Access-style force unwrap: identifier or `]` followed by `!` then
// dot/`(`/`;`/`,`/EOS. v0.34.10: exclude `!` in comparison
// operators (`!=`, `!==`) via negative lookbehind. The lookbehind
// matches the case where the `!` is preceded by `=` (i.e., the `!`
// is part of `!=` or `!==`, not a force-unwrap).
const ACCESS_FORCE_REGEX = /(?<![=!])(\w|\])\!\s*(?:\.|\(|;|,|\s*$)/gm;
// Forced try: `try!`.
const TRY_FORCE_REGEX = /\btry!\s+/g;

export const swiftForceUnwrapRule = createRule<SwiftForceUnwrapContext>({
  id: 'swift/force-unwrap',
  category: 'logic',
  severity: 'medium',
  aiSpecific: true,
  description:
    'Swift force-unwrap (as!, var!.prop, try!) — silently crashes if the value is nil. Use as? / guard let / try?.',
  create(_context: RuleContext): SwiftForceUnwrapContext {
    return {};
  },
  analyze(_context: SwiftForceUnwrapContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.24.0: Swift-only rule.
    if (!/\.swift$/i.test(facts.filePath)) return issues;

    // Skip test files: force-unwraps are idiomatic in test code.
    if (/\bimport\s+XCTest\b/.test(source)) return issues;

    const emit = (idx: number, label: string): void => {
      const line = source.slice(0, idx).split('\n').length;
      issues.push({
        ruleId: 'swift/force-unwrap',
        category: 'logic',
        severity: 'medium',
        aiSpecific: true,
        message: `force-unwrap (${label}) at line ${line} — crashes if the value is nil`,
        line,
        column: 1,
        advice:
          'Replace with the safe form: `as?` + guard/if let, `try?` + nil-check, ' +
          'or `guard let x = optional else { return }` instead of `x!`. ' +
          'A force-unwrap converts "the value might be nil" into "the program ' +
          'crashes if the value is nil" — in production that is a customer-facing ' +
          'crash log. Model the nil case explicitly. Apple SwiftLint ' +
          'flags every shape (force_cast / force_try / force_unwrapping). ' +
          'Reference: swift/force-unwrap v0.34.10 (refined: exclude ' +
          '`!` in `!==`/`!=` operators via negative lookbehind).',
      });
    };

    let m: RegExpExecArray | null;
    AS_FORCE_REGEX.lastIndex = 0;
    while ((m = AS_FORCE_REGEX.exec(source)) !== null) emit(m.index, 'as!');
    TRY_FORCE_REGEX.lastIndex = 0;
    while ((m = TRY_FORCE_REGEX.exec(source)) !== null) emit(m.index, 'try!');
    ACCESS_FORCE_REGEX.lastIndex = 0;
    while ((m = ACCESS_FORCE_REGEX.exec(source)) !== null) {
      // The match is `(\w|\])!` (group 1 is the preceding char).
      // Report the line/column at the `!` itself, which is at
      // m.index + m[1].length (the offset of the `!` after the
      // preceding word char).
      const bangOffset = m.index + (m[1]?.length ?? 1);
      emit(bangOffset, '!.');
    }

    return issues;
  },
});

export default swiftForceUnwrapRule satisfies Rule<SwiftForceUnwrapContext>;
