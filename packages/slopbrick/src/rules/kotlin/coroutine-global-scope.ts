/**
 * Rule: kotlin/coroutine-global-scope
 *
 * `GlobalScope.launch { ... }`, `GlobalScope.async { ... }`, or
 * `GlobalScope.runBlocking { ... }`. These bypass Kotlin's
 * structured concurrency — the resulting coroutine has no parent,
 * no cancellation, no exception propagation, and no way for the
 * caller to wait on it.
 *
 * **Why this matters:**
 * - Kotlin's structured concurrency guarantee (every coroutine has a
 *   parent, lifetime is bound to its scope) is one of the language's
 *   strongest correctness properties. `GlobalScope` silently
 *   disables it, and the official `kotlinx.coroutines` docs say
 *   "GlobalScope is a delicate API and its usage should be rare".
 * - AI agents default to `GlobalScope.launch` for "fire-and-forget"
 *   work because their training data has many copy-pasteable
 *   snippets that start with it. Real Kotlin code uses
 *   `viewModelScope` / `lifecycleScope` / `coroutineScope { }`.
 * - `GlobalScope.runBlocking` is especially harmful because it
 *   blocks the calling thread, defeating coroutines' main benefit.
 * - Severity: medium. Structured concurrency bugs (leaked work,
 *   swallowed exceptions) are real and hard to diagnose.
 * - Default off (DORMANT) until calibrated on v9 Kotlin corpus.
 *
 * **Scope:** file-local. Regex on the source text.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface KotlinCoroutineGlobalScopeContext {
  // No configuration.
}

// Accept either `(` (any-arg call) or `{` (trailing-closure form,
// which is how Kotlin's `launch { ... }` is normally invoked).
const GLOBAL_SCOPE_REGEX = /GlobalScope\s*\.\s*(?:launch|async|runBlocking)\s*[({]/g;

export const kotlinCoroutineGlobalScopeRule = createRule<KotlinCoroutineGlobalScopeContext>({
  id: 'kotlin/coroutine-global-scope',
  category: 'logic',
  severity: 'medium',
  aiSpecific: true,
  description:
    'GlobalScope.launch/async/runBlocking — bypasses structured concurrency. Use viewModelScope / lifecycleScope / coroutineScope {}.',
  create(_context: RuleContext): KotlinCoroutineGlobalScopeContext {
    return {};
  },
  analyze(_context: KotlinCoroutineGlobalScopeContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.24.0: Kotlin-only rule. The `GlobalScope` identifier would
    // also match in any Kotlin-like language; gate by extension.
    if (!/\.kts?$/i.test(facts.filePath)) return issues;

    let m: RegExpExecArray | null;
    GLOBAL_SCOPE_REGEX.lastIndex = 0;
    while ((m = GLOBAL_SCOPE_REGEX.exec(source)) !== null) {
      const line = source.slice(0, m.index).split('\n').length;
      issues.push({
        ruleId: 'kotlin/coroutine-global-scope',
        category: 'logic',
        severity: 'medium',
        aiSpecific: true,
        message:
          `GlobalScope.${m[0].split('.')[1]?.split('(')[0]}() at line ${line} — bypasses structured concurrency`,
        line,
        column: 1,
        advice:
          'Replace with `viewModelScope.launch { ... }` (Android view models), ' +
          '`lifecycleScope.launch { ... }` (Android activities / fragments), ' +
          'or `coroutineScope { ... }` inside a suspending function. ' +
          'GlobalScope bypasses cancellation, exception propagation, and ' +
          'lifetime binding. The kotlinx.coroutines docs explicitly call ' +
          'GlobalScope "delicate API". AI agents default to it for ' +
          '"fire-and-forget" work because of training-data snippets. ' +
          'Reference: kotlin/coroutine-global-scope v0.24.',
      });
    }
    return issues;
  },
});

export default kotlinCoroutineGlobalScopeRule satisfies Rule<KotlinCoroutineGlobalScopeContext>;
