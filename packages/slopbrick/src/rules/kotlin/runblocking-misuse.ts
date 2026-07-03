/**
 * Rule: kotlin/runblocking-misuse
 *
 * `runBlocking { ... }` outside of `main()` or a test. The
 * coroutine builder is intended for bridging non-coroutine code
 * (e.g. `fun main()`) into the coroutine world. Calling
 * `runBlocking` deep in a coroutine chain blocks the calling
 * thread, which defeats the entire purpose of coroutines.
 *
 * **Why this matters:**
 * - `runBlocking` on a non-main thread is a deadlock waiting to
 *   happen. The Kotlin coroutines docs explicitly say "should
 *   rarely (if ever) be used" outside of `main()`.
 * - Real Kotlin code uses `coroutineScope { }` or just calls the
 *   `suspend` function directly. `runBlocking` is a code smell
 *   that often signals a developer who doesn't yet understand
 *   structured concurrency.
 * - Severity: medium. The bug is real but usually surfaces
 *   under specific load patterns.
 * - Default on. This rule gates the coroutine-anti-patterns
 *   category.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * `runBlocking` and report each occurrence. (A more sophisticated
 * version would check the function context with AST — out of scope
 * for v0.29.0.)
 *
 * **v0.29.0: non-AI-fingerprint rule.** This rule measures a real
 * engineering defect, not AI authorship.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface KotlinRunBlockingMisuseContext {
  // No configuration.
}

// Match `runBlocking {` or `runBlocking(` (some callers use the
// form `runBlocking(myBlock)`). We accept the `{` or `(` directly
// after to exclude `runBlocking` as a name in a comment or string.
const RUN_BLOCKING_REGEX = /\brunBlocking\s*[({]/g;

export const kotlinRunBlockingMisuseRule = createRule<KotlinRunBlockingMisuseContext>({
  id: 'kotlin/runblocking-misuse',
  category: 'perf',
  severity: 'medium',
  aiSpecific: false,
  description: 'runBlocking { ... } — blocks the calling thread; use coroutineScope {} or call suspend fun directly',
  create(_context: RuleContext): KotlinRunBlockingMisuseContext {
    return {};
  },
  analyze(_context: KotlinRunBlockingMisuseContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.29.0: Kotlin-only rule.
    if (!/\.kts?$/i.test(facts.filePath)) return issues;

    // Skip `fun main()` — that's the documented use case.
    // We use a coarse heuristic: if the file has `fun main(`
    // anywhere, we trust that any `runBlocking` is in main().
    // (False negatives are acceptable for v0.29.0; a more
    // sophisticated version would AST-detect the enclosing fn.)
    if (/\bfun\s+main\s*\(/.test(source)) return issues;

    let m: RegExpExecArray | null;
    RUN_BLOCKING_REGEX.lastIndex = 0;
    while ((m = RUN_BLOCKING_REGEX.exec(source)) !== null) {
      const line = source.slice(0, m.index).split('\n').length;
      issues.push({
        ruleId: 'kotlin/runblocking-misuse',
        category: 'perf',
        severity: 'medium',
        aiSpecific: false,
        message: `runBlocking { ... } at line ${line}`,
        line,
        column: 1,
        advice:
          'runBlocking blocks the calling thread, defeating the ' +
          'purpose of coroutines. Use coroutineScope { } for ' +
          'structured concurrency, or call the suspend function ' +
          'directly. The Kotlin coroutines docs: runBlocking "should ' +
          'rarely (if ever) be used outside of main()". Reference: ' +
          'kotlin/runblocking-misuse v0.29.',
      });
    }
    return issues;
  },
});

export default kotlinRunBlockingMisuseRule satisfies Rule<KotlinRunBlockingMisuseContext>;
