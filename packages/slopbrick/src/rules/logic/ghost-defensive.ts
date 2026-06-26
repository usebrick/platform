import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface GhostDefensiveContext {
  maxDepth: number;
}

export const ghostDefensiveRule = createRule<GhostDefensiveContext>({
  id: 'logic/ghost-defensive',
  category: 'logic',
  severity: 'medium',
  aiSpecific: true,
  description: "Defensive code for impossible cases",
  create(_context: RuleContext): GhostDefensiveContext {
    return { maxDepth: 3 };
  },
  analyze(context: GhostDefensiveContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const candidates: Issue[] = [];

    const source = facts.v2.logic.logicalExpressions;
    for (const expression of source) {
      if (expression.depth >= context.maxDepth && expression.isOptionalChainLike) {
        candidates.push({
          ruleId: 'logic/ghost-defensive',
          category: 'logic',
          severity: 'medium',
          aiSpecific: true,
          message: `Ghost defensive chain: ${expression.text}`,
          line: expression.line,
          column: expression.column,
          advice: 'Use optional chaining (?.) or early returns instead of deep && guards.',
        });
      }
    }

    if (candidates.length < 3) return issues;
    return candidates;
  },
});

export default ghostDefensiveRule satisfies Rule<GhostDefensiveContext>;