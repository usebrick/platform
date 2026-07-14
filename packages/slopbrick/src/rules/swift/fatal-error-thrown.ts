/**
 * Rule: swift/fatal-error-thrown
 *
 * `fatalError(...)` or `preconditionFailure(...)` in production
 * (non-test) Swift source. These crash the app with a fixed
 * message — the "TODO marker" form. They survive to release builds
 * because `fatalError` is not the same as `assert`.
 *
 * **Why this matters:**
 * - `fatalError("not implemented")` in shipping code is a customer-
 *   facing crash. Apple's docs explicitly contrast it with `assert`
 *   (debug-only) and `precondition` (debug+checked builds). The
 *   `fatalError` form survives App Store review.
 * - AI agents plant `fatalError("not implemented")` in protocol stubs
 *   and placeholder methods because the pattern "makes the file
 *   compile" while signalling "TODO" to the reader. Real Swift
 *   stubs return a typed error (`enum MyError: Error { case notImplemented }`)
 *   or use a typed default like `nil` / `[]([T])()` that the
 *   compiler can prove safe.
 * - We deliberately skip files that `import XCTest`. Test code
 *   may legitimately use `fatalError` to abort a test mid-run.
 * - Severity: high. `fatalError` in shipping code is a real crash
 *   waiting to happen; this is the highest-severity rule in the
 *   v0.24 batch.
 * - Default off (DORMANT) until calibrated on v10 Swift corpus.
 * The v10 corpus (576,750 files) is the source; the rule is
 * DORMANT because the v9 calibration on a smaller Swift slice
 * showed borderline FPR.
 *
 * **Scope:** file-local. Regex on the source text.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface SwiftFatalErrorThrownContext {
  // No configuration.
}

const FATAL_REGEX = /\b(?:fatalError|preconditionFailure)\s*\(/g;

export const swiftFatalErrorThrownRule = createRule<SwiftFatalErrorThrownContext>({
  id: 'swift/fatal-error-thrown',
  category: 'logic',
  severity: 'high',
  aiSpecific: true,
  description:
    'fatalError / preconditionFailure in production — crashes unconditionally. Return an error or a typed default.',
  create(_context: RuleContext): SwiftFatalErrorThrownContext {
    return {};
  },
  analyze(_context: SwiftFatalErrorThrownContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.24.0: Swift-only rule.
    if (!/\.swift$/i.test(facts.filePath)) return issues;

    // Skip test files: tests legitimately abort themselves via
    // fatalError / XCTFail when setup is broken.
    if (/\bimport\s+XCTest\b/.test(source)) return issues;

    let m: RegExpExecArray | null;
    FATAL_REGEX.lastIndex = 0;
    while ((m = FATAL_REGEX.exec(source)) !== null) {
      const line = source.slice(0, m.index).split('\n').length;
      // Distinguish in the message: `fatalError` vs `preconditionFailure`.
      const matched = m[0].replace(/\s*\($/, '');
      issues.push({
        ruleId: 'swift/fatal-error-thrown',
        category: 'logic',
        severity: 'high',
        aiSpecific: true,
        message:
          `${matched}() at line ${line} — crashes unconditionally in release builds`,
        line,
        column: 1,
        advice:
          'Replace with `return` of a typed default (e.g. `nil`, `[]()`), or ' +
          'throw a typed error (`enum MyError: Error { case notImplemented }; ' +
          'throw MyError.notImplemented`). Apple\'s docs contrast `fatalError` ' +
          '(survives release) with `precondition` (debug+checked only) and ' +
          '`assert` (debug only). A protocol stub should be implemented or ' +
          'explicitly represented as a typed error rather than shipping a runtime panic. ' +
          'Reference: swift/fatal-error-thrown v0.24.',
      });
    }
    return issues;
  },
});

export default swiftFatalErrorThrownRule satisfies Rule<SwiftFatalErrorThrownContext>;
