import type { Rule } from '../types';

/**
 * v0.9.3: re-export the canonical `Rule<Context>` from `src/types.ts`
 * as `RuleFactory` for the small number of external callers that import
 * the factory type by name. The two were structurally identical; the
 * duplicate type was a refactoring hazard (3 different names for the
 * same shape across `rule.ts`, `registry.ts`, and `types.ts`).
 *
 * New code should import `Rule` from `../types` directly.
 */
export type RuleFactory<Context = unknown> = Rule<Context>;

export function createRule<Context>(def: Rule<Context>): Rule<Context> {
  return def;
}
