/**
 * Rule: kt/coroutine-cancellation-missing
 *
 * A coroutine launched with `launch { ... }` or `async { ... }`
 * that doesn't check for cancellation. Long-running coroutines
 * that don't honour cancellation will keep running after their
 * scope is cancelled, leaking resources.
 *
 * **Why this matters:**
 * - Per the Kotlin coding conventions (kotlinlang.org):
 *   "Cancellation of a coroutine is enforced by the suspension
 *   points of the coroutine. If a coroutine does not contain
 *   any suspension points, its cancellation will not be carried
 *   out." That means `launch { while (true) { doWork() } }` will
 *   never be cancelled.
 * - The fix is to add `ensureActive()` or `yield()` inside the
 *   loop, or use `coroutineScope { while (isActive) { ... } }`.
 * - Severity: medium. The coroutine leaks CPU/IO until the JVM
 *   is shut down or the process is killed.
 * - Default off (DORMANT) until v10.2 Kotlin corpus calibration.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * `launch { ... }` or `async { ... }` blocks that don't contain
 * `ensureActive`, `yield`, `delay`, or `isActive` inside.
 *
 * **v0.43.0: initial rule.** Mirrors the Kotlin coding
 * conventions' explicit warning about cancellation.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface KtCoroutineCancellationMissingContext {
  // No configuration.
}

const LAUNCH_BLOCK_REGEX = /\b(?:launch|async|launchIn|async\s*\{)\s*\{/g;
const CANCELLATION_KEYWORDS = /\b(?:ensureActive|yield\s*\(|delay\s*\(|isActive|isCancelled|coroutineScope|withContext|currentCoroutineContext)\b/;

export const ktCoroutineCancellationMissingRule = createRule<KtCoroutineCancellationMissingContext>({
  id: 'kt/coroutine-cancellation-missing',
  category: 'logic',
  severity: 'medium',
  aiSpecific: false,
  description: 'Kotlin coroutine (launch/async) without cancellation checks — runs forever if scope is cancelled',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const source = facts.v2._source ?? '';
    if (!source) return [];

    const issues: Issue[] = [];
    const re = new RegExp(LAUNCH_BLOCK_REGEX.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const line = 1 + (source.substring(0, m.index).match(/\n/g)?.length ?? 0);
      const blockStart = m.index;
      const blockEnd = Math.min(source.length, blockStart + 5000);
      const block = source.substring(blockStart, blockEnd);

      if (!CANCELLATION_KEYWORDS.test(block)) {
        issues.push({
          ruleId: 'kt/coroutine-cancellation-missing',
          category: 'logic',
          severity: 'medium',
          aiSpecific: false,
          filePath: facts.filePath ?? '',
          line,
          column: 1,
          message: `Kotlin coroutine has no cancellation checks. \`${m[0].trim()}\` will not be cancellable.`,
          advice: 'Add `ensureActive()` inside long loops, use `delay()` (a suspension point), or wrap in `coroutineScope { ... }` so the coroutine respects parent cancellation.',
        });
      }
    }

    return issues;
  },
});
