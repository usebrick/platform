/**
 * Rule: ts/optional-chain-overuse
 *
 * Optional chaining (`?.`) used 5+ times in a single chain expression.
 * AI agents chain `?.` to avoid null checks; real engineers break
 * the chain with intermediate variables or guard clauses.
 *
 * **Why this matters:**
 * - Long `?.` chains hide the actual type-narrowing that the
 *   developer should be doing.
 * - The pattern is consistent with the "over-defensive" behavior
 *   in the v0.18.9 calibration (ghost-defensive rule, 88.9% precision,
 *   112k lift). The two rules overlap but `optional-chain-overuse`
 *   is the narrower, more specific signal.
 * - Severity: low. False positives are possible on legitimately
 *   deep data structures (e.g. deeply nested API responses).
 * - Default off (DORMANT) until calibrated on v9 corpus.
 *
 * **Scope:** file-local. Reuses `facts.v2.logic.logicalExpressions`
 * which is pre-extracted from the SWC AST by the engine.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface TsOptionalChainOveruseContext {
  minChainLength: number;
}

const DEFAULT_MIN_CHAIN_LENGTH = 5;

export const tsOptionalChainOveruseRule = createRule<TsOptionalChainOveruseContext>({
  id: 'ts/optional-chain-overuse',
  category: 'logic',
  severity: 'low',
  aiSpecific: true,
  description: 'Optional chaining (?.) used 5+ times in a single chain — AI tends to chain rather than narrow',
  create(_context: RuleContext): TsOptionalChainOveruseContext {
    return { minChainLength: DEFAULT_MIN_CHAIN_LENGTH };
  },
  analyze(context: TsOptionalChainOveruseContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const expressions = facts.v2.logic?.logicalExpressions;
    if (!expressions) return issues;

    for (const expression of expressions) {
      // The `depth` field on logicalExpressions is set by the engine's
      // AST walker. A depth of >= 5 with optional-chain-like syntax
      // (a?.b?.c?.d?.e?.f) is the signal we're after.
      if (
        expression.depth >= context.minChainLength &&
        expression.isOptionalChainLike
      ) {
        issues.push({
          ruleId: 'ts/optional-chain-overuse',
          category: 'logic',
          severity: 'low',
          aiSpecific: true,
          message:
            `Optional chain depth ${expression.depth} — break with an intermediate variable or guard clause`,
          line: expression.line,
          column: expression.column,
          advice:
            'Long optional chains are an AI pattern. Use a guard clause ' +
            '(`if (!value) return`) or intermediate variables to make the ' +
            'narrowing explicit. Reference: ts/optional-chain-overuse v0.19.',
        });
      }
    }
    return issues;
  },
});

export default tsOptionalChainOveruseRule satisfies Rule<TsOptionalChainOveruseContext>;
