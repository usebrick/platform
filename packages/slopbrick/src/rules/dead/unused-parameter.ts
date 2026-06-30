/**
 * Rule: dead/unused-parameter
 *
 * Function parameters that are never read inside the function body.
 * The most-overlooked of the dead-code patterns because the type
 * checker doesn't flag it (the param is "used" by the call site) and
 * ESLint's `no-unused-vars` requires an `args: 'after-used'`
 * configuration that most projects don't ship.
 *
 * **AI-iteration signal:**
 * - AI agents often add a parameter when introducing a feature
 *   (`function foo(x, y, z) { ... }`), then rewrite the function
 *   to use a different abstraction that only needs `x`. The
 *   model leaves `y` and `z` in the signature because removing
 *   them would break every call site.
 * - Severity: low. Default-on because the false-positive rate is
 *   near zero (a parameter that's never read is almost always
 *   an oversight).
 *
 * **Limitations:**
 * - Cross-file tsc: this rule does not check whether a parameter
 *   is used by a call site that does `something(callback)` where
 *   the callback uses the parameter. That's a v0.18.10+ (cross-file
 *   dead-code) item.
 * - React props: the rule correctly skips `props` and component
 *   props that the JSX spread forwards (`<C {...props} />`).
 *   See `logic/ghost-defensive` for a related case.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface UnusedParameterContext {
  // No configuration needed.
}

export const unusedParameterRule = createRule<UnusedParameterContext>({
  id: 'dead/unused-parameter',
  category: 'logic',
  severity: 'low',
  aiSpecific: true,
  description: 'Function parameter is declared but never read',
  create(_context: RuleContext): UnusedParameterContext {
    return {};
  },
  analyze(_context: UnusedParameterContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    if (!facts.v2) return issues;

    for (const binding of facts.v2.deadCode.bindings) {
      if (binding.kind !== 'parameter') continue;
      if (binding.isReferenced) continue;
      // Skip `_`-prefixed names — the canonical intentionally-unused
      // marker. Also skip `props` since component props are
      // forward-declared even when not read directly (the JSX
      // transform destructures them).
      if (binding.name.startsWith('_')) continue;
      if (binding.name === 'props') continue;
      issues.push({
        ruleId: 'dead/unused-parameter',
        category: 'logic',
        severity: 'low',
        aiSpecific: true,
        message: `Unused parameter: '${binding.name}'`,
        line: binding.line,
        column: binding.column,
        advice: `Remove the parameter (and update every call site) or use '${binding.name}' ` +
          `in the function body. This is the AI-iteration signature: the model added ` +
          `the parameter when it introduced a feature, then rewrote the function without ` +
          `removing parameters the new code does not need.`,
      });
    }

    return issues;
  },
});

export default unusedParameterRule satisfies Rule<UnusedParameterContext>;
