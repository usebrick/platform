/**
 * Rule: cpp/raw-new-delete
 *
 * Manual `new` / `delete` pairing in C++ source: ≥ 2 calls to
 * `new <Type>(` AND ≥ 2 matching `delete` calls. Indicates
 * manual ownership of multiple objects — the textbook AI
 * fingerprint pattern. Modern C++ uses `std::unique_ptr` /
 * `std::make_unique` / `std::shared_ptr` and never writes
 * `delete` by hand.
 *
 * **Why this matters:**
 * - `new` / `delete` pairs leak if you forget a path (early
 *   `return`, exception between new and delete). They leak if
 *   you `delete` through the wrong pointer (sliced base class).
 *   They double-free if you copy a raw pointer. Smart pointers
 *   solve all of it at the type level.
 * - The C++ Core Guidelines (R.11, R.20-R.23) call out that raw
 *   `new` / `delete` should be hidden behind RAII types.
 * - AI agents reach for `new` / `delete` because their training
 *   data was written for pre-C++11 idioms. Real modern C++
 *   uses `std::make_unique<T>(...)` and never writes `delete`.
 * - We count `new <Type>(...)` (constructor calls) specifically,
 *   not `new T[10]` (array alloc) — array allocation has its
 *   own quirks (`delete[]`) and is treated by other tooling.
 *   Real modern C++ uses `std::vector` / `std::array` instead.
 * - Severity: low. Stylistic / ownership-hygiene signal.
 * - Default off (DORMANT) until calibrated on v9 C++ corpus.
 *
 * **Scope:** file-local. Regex on the source text. We count
 * NEW_CONSTRUCT and DELETE separately and only fire when BOTH
 * exceed 1.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface CppRawNewDeleteContext {
  /** Minimum paired new/delete occurrences before the rule fires. Default: 1 (i.e., 2+). */
  minPairs: number;
}

const NEW_TYPE_REGEX = /\bnew\s+[A-Za-z_]\w*\s*\(/g;
const DELETE_REGEX = /\bdelete\s+/g;
const MIN_PAIRS_DEFAULT = 1;

export const cppRawNewDeleteRule = createRule<CppRawNewDeleteContext>({
  id: 'cpp/raw-new-delete',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description:
    'Manual `new` / `delete` pairing — use std::make_unique / std::unique_ptr instead.',
  create(_context: RuleContext): CppRawNewDeleteContext {
    return { minPairs: MIN_PAIRS_DEFAULT };
  },
  analyze(context: CppRawNewDeleteContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.24.0: full C++ gate.
    if (!/\.(cpp|cc|cxx|h|hpp|hh|hxx|H)$/i.test(facts.filePath)) return issues;

    // Count `new <Type>(`. We deliberately skip `new int[10]` (array
    // alloc) which isn't paired with `delete` 1:1.
    let newCount = 0;
    let m: RegExpExecArray | null;
    NEW_TYPE_REGEX.lastIndex = 0;
    while ((m = NEW_TYPE_REGEX.exec(source)) !== null) newCount++;

    let deleteCount = 0;
    DELETE_REGEX.lastIndex = 0;
    while ((m = DELETE_REGEX.exec(source)) !== null) deleteCount++;

    if (newCount <= context.minPairs) return issues;
    if (deleteCount <= context.minPairs) return issues;

    issues.push({
      ruleId: 'cpp/raw-new-delete',
      category: 'typo',
      severity: 'low',
      aiSpecific: true,
      message:
        `manual new/delete pairing (${newCount} new, ${deleteCount} delete) — wrap in std::unique_ptr`,
      line: 1,
      column: 1,
      advice:
        'Replace `T* p = new T(...); ... delete p;` with ' +
        '`auto p = std::make_unique<T>(...);`. Smart pointers delete ' +
        'on scope exit, never leak on early return / exception, never ' +
        'double-free on copy. The C++ Core Guidelines R.20-R.23 call out ' +
        'raw `new` / `delete` as something to avoid in application code. ' +
        'AI agents reach for `new` / `delete` because their training data ' +
        'was written for pre-C++11 idioms. Reference: cpp/raw-new-delete v0.24.',
    });

    return issues;
  },
});

export default cppRawNewDeleteRule satisfies Rule<CppRawNewDeleteContext>;
