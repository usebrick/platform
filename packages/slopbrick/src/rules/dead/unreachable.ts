/**
 * Rule: dead/unreachable
 *
 * Statements that come after an unconditional `return` / `throw` /
 * `break` / `continue` in the same function body. The first
 * terminator makes every subsequent statement unreachable.
 *
 * **Why this matters:**
 * - The pattern is the classic "unreachable code" warning that
 *   TypeScript catches only with `allowUnreachableCode: false`
 *   (default is `true` — i.e. tsc does NOT report it by default).
 * - AI agents, when losing context across iterative edits, often
 *   add a `return` for an error path and leave the original
 *   function body intact below. The code still parses, still
 *   type-checks, still tests (if the early return fires), so the
 *   rot is invisible until a human audits.
 * - Severity: high (unreachable code is almost always a bug, not
 *   a stylistic issue).
 *
 * **Scope:** only top-level statements of each function body. The
 * helper does NOT recurse into nested `if`/`try` blocks because
 * tracking terminators across nested blocks is exponential and
 * false-positive-prone. A future iteration (v0.18.5c) adds the
 * nested case.
 *
 * **Known false positives:**
 * - `if (x) return; foo();` — the rule correctly does NOT flag
 *   `foo()` because the early return is inside a nested `if`.
 * - `try { ... } finally { return; } foo();` — `foo()` is
 *   reachable (the `try` could throw before `return` executes
 *   if the body re-throws). The helper does not model `finally`
 *   so this case may false-positive. Disabling with
 *   `// slopbrick-disable` is recommended for `try/finally`
 *   blocks.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface UnreachableContext {
  // No configuration needed.
}

export const unreachableRule = createRule<UnreachableContext>({
  id: 'dead/unreachable',
  category: 'logic',
  severity: 'high',
  aiSpecific: true,
  description: 'Statement is unreachable after an unconditional return/throw/break/continue',
  create(_context: RuleContext): UnreachableContext {
    return {};
  },
  analyze(_context: UnreachableContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    if (!facts.v2) return issues;

    for (const u of facts.v2.deadCode.unreachableStatements) {
      // Skip empty `;` statements that TypeScript inserts.
      if (u.snippet === '<unreachable>') continue;
      issues.push({
        ruleId: 'dead/unreachable',
        category: 'logic',
        severity: 'high',
        aiSpecific: true,
        message: `Unreachable after ${u.terminator}: ${u.snippet}`,
        line: u.line,
        column: u.column,
        advice: `Remove this statement — code after a ${u.terminator} is unreachable. ` +
          `This is the AI-iteration signature: the model added an early ${u.terminator} ` +
          `for a new error path, then forgot the rest of the function body was still ` +
          `sitting below it.`,
      });
    }

    return issues;
  },
});

export default unreachableRule satisfies Rule<UnreachableContext>;
