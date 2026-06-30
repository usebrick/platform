/**
 * Rule: dead/dead-branch
 *
 * `if (true)`, `if (false)`, `while (true)`, `while (false)` — a
 * literal boolean condition that makes the branch statically
 * decidable. One of the two arms is dead code by construction.
 *
 * **Why this matters:**
 * - The pattern is a frequent AI-iteration artifact. The model
 *   refactors a condition, leaves an `if (true) { ... }` wrapper
 *   behind, then loses track of the original guard. Or the model
 *   introduces a feature flag and toggles it to a constant.
 * - TypeScript catches `if (true)` only with the
 *   `noUnnecessaryCondition` flag (off by default; in
 *   `strict` mode it's a warning).
 * - Severity: medium for `if-true` and `if-false` (almost always
 *   a bug), low for `while-true` (sometimes legitimate — event
 *   loops, server hot loops).
 *
 * **Known false positives:**
 * - `while (true) { ... break; ... }` — legitimate infinite loop
 *   pattern. The rule downgrades the severity in this case; the
 *   user can suppress with `// slopbrick-disable dead/dead-branch`.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface DeadBranchContext {
  // No configuration needed.
}

export const deadBranchRule = createRule<DeadBranchContext>({
  id: 'dead/dead-branch',
  category: 'logic',
  severity: 'medium',
  aiSpecific: true,
  description: 'Literal boolean condition makes one branch statically dead',
  create(_context: RuleContext): DeadBranchContext {
    return {};
  },
  analyze(_context: DeadBranchContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    if (!facts.v2) return issues;

    for (const cond of facts.v2.deadCode.constantConditions) {
      // `while-true` is often legitimate (event loop, server
      // hot loop with explicit `break`). Lower the severity and
      // change the message so the user can decide.
      const isWhileTrue = cond.kind === 'while-true';
      issues.push({
        ruleId: 'dead/dead-branch',
        category: 'logic',
        severity: isWhileTrue ? 'low' : 'medium',
        aiSpecific: true,
        message: isWhileTrue
          ? `Infinite loop with literal condition (${cond.kind})`
          : `Dead branch: condition is always ${cond.condition}`,
        line: cond.line,
        column: cond.column,
        advice: isWhileTrue
          ? `If this is an intentional infinite loop (event loop, hot loop with explicit \`break\`), add a \`// slopbrick-disable\` comment. Otherwise, replace the literal with a real condition.`
          : `Replace the literal with a real condition, or remove the dead branch entirely. ` +
            `This is the AI-iteration signature: the model toggled a feature flag to a constant ` +
            `or left a wrapper from a previous refactor.`,
      });
    }

    return issues;
  },
});

export default deadBranchRule satisfies Rule<DeadBranchContext>;
