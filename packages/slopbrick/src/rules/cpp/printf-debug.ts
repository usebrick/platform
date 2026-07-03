/**
 * Rule: cpp/printf-debug
 *
 * Debug printing in C++ via `printf` family or `std::cout << "..."`;
 * either ≥ 2 printf-family calls OR a `std::cout`/`cerr`/`clog`
 * stream-insertion of a string literal. Production code uses
 * a logger (spdlog, glog, Abseil logging) instead.
 *
 * **Why this matters:**
 * - `printf` and `std::cout << "..."` write to stdout without
 *   levels, destinations, redaction, sampling, or stderr-vs-
 *   stdout routing. They're appropriate for `main` examples
 *   but inappropriate for shipped code.
 * - Real C++ code uses `spdlog::info(...)`, `LOG(INFO) << ...`
 *   (glog), or `absl::Log(INFO)` — all of which are level-
 *   aware and have a configurable sink.
 * - AI agents reach for `printf` / `std::cout` because their
 *   training data has countless C++ textbook examples with
 *   them. Real production C++ suppresses them.
 * - A single `printf` in `main` is legitimate output (status
 *   line); we only flag when there are 2+ (or when the insertion
 *   form ships debug text to stdout).
 * - Severity: low. Stylistic / debug-noise signal.
 * - Default off (DORMANT) until calibrated on v9 C++ corpus.
 *
 * **Scope:** file-local. Regex on the source text.
 *
 * **v0.34.7: skip test files.** The v0.33.0 calibration found
 * that test files (gtest, catch2, doctest) legitimately use
 * `printf` / `std::cout` for assertion error messages and
 * test output. Excluding test files follows the same pattern as
 * v0.34.2 (swift/print-debug), v0.34.5 (kotlin/println-as-log).
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface CppPrintfDebugContext {
  /** Max number of printf-family calls before the rule fires. Default: 1. */
  threshold: number;
}

const PRINTF_FAMILY_REGEX = /\b(?:printf|fprintf|sprintf|snprintf)\s*\(/g;
const COUT_LITERAL_REGEX = /std\s*::\s*(?:cout|cerr|clog)\s*<<\s*"[^"]*"/g;
const STD_COUT_BARE_REGEX = /std\s*::\s*(?:cout|cerr|clog)\s*<<\s*'[^']*'/g;
const THRESHOLD_DEFAULT = 1;

// Test-file heuristic: gtest, catch2, doctest naming conventions.
// gtest: TEST/SRC/*_test.cc, *_test.cpp, /tests/ dir, *Test.cc
// catch2: TEST_CASE in *_test.cpp
// We use a case-sensitive regex to avoid false positives like
// `/path/test.cpp` (lowercase 't' in "test").
const TEST_FILE_REGEX = /(?:\/tests?\/|_test\.cc|_test\.cpp|Test\.cc|Test\.cpp|Tests\.cc|Tests\.cpp|_unittest\.cc|_unittest\.cpp)/;

export const cppPrintfDebugRule = createRule<CppPrintfDebugContext>({
  id: 'cpp/printf-debug',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description:
    'printf family or std::cout debug printing — use spdlog / glog / AbslLog for level-controlled output.',
  create(_context: RuleContext): CppPrintfDebugContext {
    return { threshold: THRESHOLD_DEFAULT };
  },
  analyze(context: CppPrintfDebugContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.24.0: full C++ gate.
    if (!/\.(cpp|cc|cxx|h|hpp|hh|hxx|H)$/i.test(facts.filePath)) return issues;
    // v0.34.7: skip test files. gtest, catch2, doctest conventions.
    if (TEST_FILE_REGEX.test(facts.filePath)) return issues;

    // Path A: 2+ printf-family calls.
    const printfCount = (source.match(PRINTF_FAMILY_REGEX) ?? []).length;
    let viaPrintf = false;
    if (printfCount > context.threshold) {
      const line = source.indexOf('printf');
      if (line !== -1) viaPrintf = true;
    }

    // Path B: any std::cout/cerr/clog << "literal". Even ONE is
    // almost always a debug call, not a status line.
    const coutHit = COUT_LITERAL_REGEX.test(source) || STD_COUT_BARE_REGEX.test(source);

    if (!viaPrintf && !coutHit) return issues;

    issues.push({
      ruleId: 'cpp/printf-debug',
      category: 'typo',
      severity: 'low',
      aiSpecific: true,
      message: viaPrintf
        ? `${printfCount} printf-family calls — use spdlog / glog / AbslLog`
        : 'std::cout/cerr/clog with a string literal — use spdlog / glog / AbslLog',
      line: 1,
      column: 1,
      advice:
        'Replace with `spdlog::info(...)`, `LOG(INFO) << ...` (glog), ' +
        'or `ABSL_LOG(INFO) << ...` (Abseil). All of these are level-' +
        'aware and have a configurable sink, and they route to stderr ' +
        'by default. `printf` / `std::cout` have no levels, no redaction, ' +
        'no sink routing, and can\'t be silenced in release builds. AI ' +
        'agents reach for these because their training data has countless ' +
        'C++ textbook examples with them. Reference: cpp/printf-debug ' +
        'v0.34.7 (refined to skip test files for higher precision).',
    });

    return issues;
  },
});

export default cppPrintfDebugRule satisfies Rule<CppPrintfDebugContext>;
