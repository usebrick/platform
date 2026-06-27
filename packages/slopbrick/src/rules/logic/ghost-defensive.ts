/**
 * Rule: logic/ghost-defensive
 *
 * Defensive chains for impossible cases (e.g. `value?.a?.b?.c?.d` when
 * the type system guarantees `value.a` is non-null). AI agents, when
 * losing context across iterative edits, over-defend.
 *
 * **Empirical observation, not peer-reviewed:**
 * - This is a slopbrick-specific heuristic, calibrated against the
 *   v6 corpus (lift 17.02× on the consolidated pos vs neg split).
 * - The pattern is consistent with the "over-defensive" behavior
 *   reported in industry surveys (GitClear 2024, AppSecEngineer
 *   2025) but is not, to our knowledge, the subject of a peer-
 *   reviewed empirical paper as of v0.13.0.
 * - Severity: medium (false positives possible on legitimately
 *   defensive code; review and ignore if the chain is justified).
 *
 * Future: cite a peer-reviewed paper on "redundant defensive code"
 * or "defensive programming overkill" if one is published.
 */

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