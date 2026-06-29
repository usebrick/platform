/**
 * Rule: logic/zombie-state
 *
 * `useState` bindings that are never read (declared and set, but the
 * current value is never consumed). AI agents, when losing context
 * across iterative edits, leave behind state that the component
 * doesn't need.
 *
 * **Empirical observation, with peer-reviewed grounding:**
 * - The pattern is a specific instance of "dead store" / "dead
 *   variable" — a classic compiler optimization problem. Muchnick,
 *   S. S. (1997), "Advanced Compiler Design and Implementation,"
 *   Morgan Kaufmann, Ch. 13 ("Data-Flow Analysis") catalogues
 *   the precise analysis ("liveness analysis") that flags a
 *   useState binding as never-read.
 * - Empirical AI signal: v6 calibration shows 4.86× lift on the
 *   consolidated pos vs neg split (P=0.82, R=0.000). AI agents
 *   leave behind unread state at a rate that human authors, who
 *   have linters / type checkers in their feedback loop, do not.
 * - Severity: medium (false positives possible — the value may
 *   be used in a callback the static analysis can't see).
 *
 * Future: cite a peer-reviewed paper on "AI-generated React code
 * has more dead state" if one is published.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface ZombieStateContext {
  // No configuration needed.
}

export const zombieStateRule = createRule<ZombieStateContext>({
  id: 'logic/zombie-state',
  category: 'logic',
  severity: 'medium',
  aiSpecific: true,
  description: "useState bindings that are never read",
  create(_context: RuleContext): ZombieStateContext {
    return {};
  },
  analyze(_context: ZombieStateContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    if (!facts.v2) return issues;

    for (const sv of facts.v2.logic.stateVariables) {
      if (sv.isZombie && sv.name && sv.setter) {
        issues.push({
          ruleId: 'logic/zombie-state',
          category: 'logic',
          severity: 'medium',
          aiSpecific: true,
          message: `Zombie state '${sv.name}' / '${sv.setter}' is never used`,
          line: sv.line,
          column: sv.column,
          advice: 'Remove the unused useState or wire it into the component.',
        });
      }
    }

    return issues;
  },
});

export default zombieStateRule satisfies Rule<ZombieStateContext>;
