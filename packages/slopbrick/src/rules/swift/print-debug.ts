/**
 * Rule: swift/print-debug
 *
 * `print(...)` calls in Swift source — same fingerprint as the
 * v0.20 Java `System.out.println` rule. One `print` in a CLI is
 * legitimate; two or more is an AI signal — agents default to
 * `print` for "debug logging" because their training data has
 * many Swift examples that use it. Production iOS / macOS code
 * uses `Logger` (os_log) or `os.Logger`.
 *
 * **Why this matters:**
 * - `print` writes to stdout, has no level, can't be silenced in
 *   release builds without a `#if DEBUG` wrap, and shows up in
 *   Console.app on user machines — i.e., it's user-visible.
 * - The pattern correlates with AI scaffolding. Real Swift code
 *   uses `Logger.info(...)` / `Logger.error(...)` (Unified Logging
 *   System, `os.log`) which has levels, redaction, and a privacy
 *   setting that Apple controls.
 * - Severity: low. Stylistic / debug-noise signal.
 * - Default off (DORMANT) until calibrated on v9 Swift corpus.
 *
 * **Scope:** file-local. Regex on the source text. We count
 * `print(...)` calls — the heuristic threshold of 1 (i.e., 2+
 * prints) matches the Java `system-out-println` rule exactly.
 *
 * **v0.34.2: skip test files.** Tests legitimately use `print`
 * for assertions, debug output, and snapshot diffs. The v9
 * Swift corpus (v0.32.0) has a high FP rate in test files
 * (XCTest output, snapshot tests, etc.). Excluding test files
 * (paths containing `Tests/`, `Test.swift`, or `*Tests.swift`)
 * pushes precision from 33% to 50%+. The rule still fires on
 * production code where `print` is the AI fingerprint.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface SwiftPrintDebugContext {
  /** Max number of print calls before the rule fires. Default: 1. */
  threshold: number;
}

const PRINT_REGEX = /\bprint\s*\(/g;
const DEFAULT_THRESHOLD = 1;

// Test-file heuristic: Xcode convention is that test files are
// either named `*Tests.swift` (XCTest naming) or live in a `Tests/`
// directory. SPM also uses `*Tests.swift` and `*Test.swift`.
// We use case-sensitive matches to avoid false positives like
// `/path/test.swift` (note the lowercase 't' in "test").
// The first three patterns require a directory separator before
// `Tests`; the last two patterns match the XCTest naming suffix
// (e.g. `MyFeatureTests.swift`, `MyFeatureTest.swift`).
const TEST_FILE_REGEX = /(?:\/Tests\/|\/Tests\.swift|\/Test\.swift|Tests\.swift$|Test\.swift$)/;

export const swiftPrintDebugRule = createRule<SwiftPrintDebugContext>({
  id: 'swift/print-debug',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description: 'print(...) in production Swift — use Logger (os.log) for level-controlled output',
  create(_context: RuleContext): SwiftPrintDebugContext {
    return { threshold: DEFAULT_THRESHOLD };
  },
  analyze(context: SwiftPrintDebugContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.24.0: Swift-only rule.
    if (!/\.swift$/i.test(facts.filePath)) return issues;
    // v0.34.2: skip test files. `print` is legitimate in XCTest
    // output, snapshot diffs, and debug assertions. The v9 Swift
    // corpus (v0.32.0) had high FP rate in test files.
    if (TEST_FILE_REGEX.test(facts.filePath)) return issues;

    const matches: number[] = [];
    let m: RegExpExecArray | null;
    PRINT_REGEX.lastIndex = 0;
    while ((m = PRINT_REGEX.exec(source)) !== null) {
      matches.push(m.index);
    }
    if (matches.length <= context.threshold) return issues;

    const cap = Math.min(matches.length, 10);
    for (let i = 0; i < cap; i++) {
      const idx = matches[i];
      const line = source.slice(0, idx).split('\n').length;
      issues.push({
        ruleId: 'swift/print-debug',
        category: 'typo',
        severity: 'low',
        aiSpecific: true,
        message:
          `print(...) at line ${line} — use Logger (os.log) for production output`,
        line,
        column: 1,
        advice:
          'Replace with `Logger(subsystem: "...", category: "...").info("...")` ' +
          '(Unified Logging System, os.log). `print` writes to stdout with no ' +
          'level, no redaction, and no way to silence in release builds. The ' +
          '`Logger` API integrates with Console.app and respects the device\'s ' +
          'privacy settings. Multiple `print` calls in one Swift file is an AI ' +
          'fingerprint — agents reach for `print` because of training-data ' +
          'examples. Reference: swift/print-debug v0.34.2 (refined to skip ' +
          'test files for higher precision).',
      });
    }
    return issues;
  },
});

export default swiftPrintDebugRule satisfies Rule<SwiftPrintDebugContext>;
