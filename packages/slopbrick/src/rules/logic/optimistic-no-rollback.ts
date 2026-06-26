import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * Rule: optimistic-no-rollback
 * Optimistic UI update without rollback error handling. The visitor
 * already detects optimistic updates (setState before await) inside
 * try blocks. If the catch block lacks a setter call (rollback), this
 * rule fires.
 * Per-detection fire.
 */

export const optimisticNoRollbackRule = createRule<RuleContext>({
  id: 'logic/optimistic-no-rollback',
  category: 'logic',
  severity: 'high',
  aiSpecific: true,
  description: 'Optimistic UI update without rollback error handling.',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];

    const source = facts.v2.logic.optimisticUpdates;
    for (const upd of source) {
      issues.push({
        ruleId: 'logic/optimistic-no-rollback',
        category: 'logic',
        severity: 'high',
        aiSpecific: true,
        message: `Optimistic update via ${upd.setterName} has no rollback in the catch block`,
        line: upd.line,
        column: upd.column,
        advice: `Revert state in the catch block: \`${upd.setterName}(prev => prev)\`.`,
      });
    }

    return issues;
  },
});

export default optimisticNoRollbackRule satisfies Rule<RuleContext>;