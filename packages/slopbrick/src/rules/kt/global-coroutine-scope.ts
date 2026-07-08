/**
 * Rule: kt/global-coroutine-scope
 *
 * Use of `GlobalScope.launch { ... }` for structured concurrency.
 * The Kotlin docs explicitly call this out as an anti-pattern:
 * "GlobalScope is a way to start a top-level coroutine. It's
 * commonly used in background processes. However, using
 * GlobalScope has many disadvantages."
 *
 * **Why this matters:**
 * - GlobalScope is not bound to any CoroutineScope. When the
 *   calling component / activity is destroyed, the coroutine
 *   keeps running. That's a leak and a way to introduce NPEs
 *   (the coroutine holds references to UI components).
 * - The fix is to use `coroutineScope { ... }` or
 *   `MainScope()` on a per-component lifecycle, or to inject
 *   a `CoroutineScope` via DI (Hilt, Koin).
 * - Severity: medium. Memory leak + lifecycle bug.
 * - Default off (DORMANT) until v10.2 Kotlin corpus calibration.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * `GlobalScope.launch` or `GlobalScope.async` calls.
 *
 * **v0.43.0: initial rule.** Mirrors the Kotlin docs' explicit
 * warning about `GlobalScope`.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface KtGlobalCoroutineScopeContext {
  // No configuration.
}

const GLOBAL_SCOPE_REGEX = /\bGlobalScope\.(?:launch|async)\s*[({]/g;

export const ktGlobalCoroutineScopeRule = createRule<KtGlobalCoroutineScopeContext>({
  id: 'kt/global-coroutine-scope',
  category: 'logic',
  severity: 'medium',
  aiSpecific: false,
  description: '`GlobalScope.launch/async` defeats structured concurrency — leaks when calling component is destroyed',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const source = facts.v2._source ?? '';
    if (!source) return [];

    const issues: Issue[] = [];
    if (!/\.kt$/i.test(facts.filePath ?? "")) return issues;
    const re = new RegExp(GLOBAL_SCOPE_REGEX.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const line = 1 + (source.substring(0, m.index).match(/\n/g)?.length ?? 0);
      issues.push({
        ruleId: 'kt/global-coroutine-scope',
        category: 'logic',
        severity: 'medium',
        aiSpecific: false,
        filePath: facts.filePath ?? '',
        line,
        column: 1,
        message: `\`${m[0]}\` defeats structured concurrency. Coroutine is not bound to any lifecycle.`,
        advice: 'Use `coroutineScope { ... }` for structured concurrency, or inject a `CoroutineScope` via DI (Hilt, Koin) tied to the component lifecycle.',
      });
    }

    return issues;
  },
});
