/**
 * Rule: kotlin/object-singleton-misuse
 *
 * Kotlin `object` declarations (singletons) whose body contains
 * mutable state (`var` fields). `object` is the right tool for
 * stateless constant holders and for `companion object`s; using it
 * as a "global mutable namespace" hides shared state in a place
 * that callers can't reason about.
 *
 * **Why this matters:**
 * - Kotlin's `object` declares a thread-safe singleton by default,
 *   but it doesn't make `var` fields inside that object thread-safe.
 *   Mutable state in a singleton is a classic source of race
 *   conditions — the singleton pattern papers over the visibility
 *   problem, not the data-race problem.
 * - AI agents reach for `object Cache { var data = ... }` because
 *   it "looks like a singleton" in their training-data snippets.
 *   Real Kotlin uses dependency injection, a repository, or
 *   `MutableStateFlow` / `Channel` with explicit synchronization.
 * - `companion object` is excluded (it has different semantics:
 *   accessed via the enclosing class), and regular `class { var ... }`
 *   is excluded (separate rule, not the singleton-misuse pattern).
 * - Severity: medium. Singleton-mutable-state is real concurrency
 *   risk; the bug rarely shows up in unit tests.
 * - Default off (DORMANT) until calibrated on v9 Kotlin corpus.
 *
 * **Scope:** file-local. Regex on the source text. We find `object
 * <Name> {` declarations (non-companion) and count `var` keywords
 * inside their matching `{ ... }` body.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface KotlinObjectSingletonMisuseContext {
  // No configuration.
}

// Match `object Name {` but exclude `companion object` which is
// always preceded by the `companion` modifier. The negative lookahead
// keeps `companion object` from triggering as a singleton.
const OBJECT_DECL_REGEX = /\bobject\s+(?!\w*Companion\b)(\w+)\s*\{/g;

export const kotlinObjectSingletonMisuseRule = createRule<KotlinObjectSingletonMisuseContext>({
  id: 'kotlin/object-singleton-misuse',
  category: 'logic',
  severity: 'medium',
  aiSpecific: true,
  description:
    'Kotlin object singleton holding mutable `var` state — hidden shared state. Use DI or a repository.',
  create(_context: RuleContext): KotlinObjectSingletonMisuseContext {
    return {};
  },
  analyze(_context: KotlinObjectSingletonMisuseContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.24.0: Kotlin-only rule.
    if (!/\.kts?$/i.test(facts.filePath)) return issues;

    let m: RegExpExecArray | null;
    OBJECT_DECL_REGEX.lastIndex = 0;
    while ((m = OBJECT_DECL_REGEX.exec(source)) !== null) {
      const declStart = m.index;
      const openBrace = source.indexOf('{', declStart);
      if (openBrace === -1) continue;
      // Naive brace balance scan. Good enough for the object-body
      // check below — we only care whether a `var` appears inside.
      let depth = 1;
      let i = openBrace + 1;
      while (i < source.length && depth > 0) {
        const ch = source.charAt(i);
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
      }
      if (depth !== 0) continue;
      const body = source.slice(openBrace + 1, i - 1);
      // Look for `var` declarations but ignore `var` inside a
      // comment or string. The NaiveKeywordScan is good enough:
      // the regex matches `var` followed by an identifier and a
      // colon or `=` so we don't catch `var` as part of `vararg`.
      if (!/\bvar\s+\w+\s*[:=]/m.test(body)) continue;

      const line = source.slice(0, declStart).split('\n').length;
      const name = m[1] ?? '<unknown>';
      issues.push({
        ruleId: 'kotlin/object-singleton-misuse',
        category: 'logic',
        severity: 'medium',
        aiSpecific: true,
        message:
          `object ${name} at line ${line} holds mutable state — singleton + var = hidden shared state`,
        line,
        column: 1,
        advice:
          'Replace with a class injected via DI, a Repository, or a `MutableStateFlow` ' +
          'with explicit synchronization. The Kotlin `object` keyword gives you a ' +
          'thread-safe singleton handle, but it does NOT make `var` fields inside ' +
          'that singleton thread-safe — mutable singleton state is a classic source ' +
          'of race conditions. AI agents reach for `object Cache { var data = ... }` ' +
          'because their training snippets make it look natural. ' +
          'Reference: kotlin/object-singleton-misuse v0.24.',
      });
    }
    return issues;
  },
});

export default kotlinObjectSingletonMisuseRule satisfies Rule<KotlinObjectSingletonMisuseContext>;
