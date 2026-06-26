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
