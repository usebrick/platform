/**
 * Rule: dead/unused-local
 *
 * `let` / `const` / `var` declarations in a function body that are
 * never read after their declaration. Sibling to `dead/unused-import`
 * — same AI-iteration signature, different scope.
 *
 * **Why this matters:**
 * - The pattern is the textbook "dead store" / "dead variable" that
 *   Muchnick (1997, Ch. 13) catalogues. Most real-world tsconfig.json
 *   files have `noUnusedLocals: false`, so tsc never fires.
 * - AI agents, when losing context across iterative edits, leave
 *   behind `const x = ...` bindings that the new code never reads
 *   because the model rewrote the function without cleaning up.
 * - Severity: low (cosmetic, not a bug). Default-on because false
 *   positives are rare (a binding that is never read is almost
 *   always intentional dead code or a leftover from a refactor).
 *
 * **Scope:** function-scoped only. Module-top-level `const`s are
 * often intentionally unused (placeholder exports, type re-exports,
 * side-effect-ful constructions). For those, see `dead/unused-import`
 * (for ES imports) or your bundler's tree-shaking config.
 *
 * Companion rule:
 *   - dead/unused-parameter — function parameters never read
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface UnusedLocalContext {
  // No configuration needed.
}

/** Names that should never be flagged even if unused. The underscore
 *  prefix is the canonical "intentionally unused" marker in JS/TS;
 *  `React` is implicitly used by the JSX transform (consumed by
 *  `React.createElement` under the hood even if your code only
 *  writes `<div/>`). */
const SKIP_NAMES = new Set<string>(['React', '_']);

export const unusedLocalRule = createRule<UnusedLocalContext>({
  id: 'dead/unused-local',
  category: 'logic',
  severity: 'low',
  aiSpecific: true,
  description: 'Variable is declared but never read after declaration',
  create(_context: RuleContext): UnusedLocalContext {
    return {};
  },
  analyze(_context: UnusedLocalContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    if (!facts.v2) return issues;

    for (const binding of facts.v2.deadCode.bindings) {
      // Only emit for var/let/const/function/class/type/interface/enum.
      // Imports get dead/unused-import, parameters get dead/unused-parameter.
      if (
        binding.kind !== 'var' &&
        binding.kind !== 'let' &&
        binding.kind !== 'const' &&
        binding.kind !== 'function' &&
        binding.kind !== 'class' &&
        binding.kind !== 'type' &&
        binding.kind !== 'interface' &&
        binding.kind !== 'enum'
      ) {
        continue;
      }
      // Skip if the binding is referenced.
      if (binding.isReferenced) continue;
      // Skip the intentionally-unused marker and React (implicit use).
      if (SKIP_NAMES.has(binding.name)) continue;
      // Skip names starting with `_` (intentionally unused convention).
      if (binding.name.startsWith('_')) continue;
      // v0.21.0: skip module-top-level const/function/class/type/interface/enum.
      // These are often intentional (placeholder exports, type re-exports,
      // side-effect-ful constructions) — see the rule's header comment.
      // Only var/let inside a function body are reliably dead.
      if (
        binding.scope === 'module' &&
        (binding.kind === 'const' ||
          binding.kind === 'function' ||
          binding.kind === 'class' ||
          binding.kind === 'type' ||
          binding.kind === 'interface' ||
          binding.kind === 'enum')
      ) {
        continue;
      }
      issues.push({
        ruleId: 'dead/unused-local',
        category: 'logic',
        severity: 'low',
        aiSpecific: true,
        message: `Unused ${binding.kind}: '${binding.name}'`,
        line: binding.line,
        column: binding.column,
        advice: `Remove the declaration or use '${binding.name}' somewhere in the file. ` +
          `This is the second-most-common AI-iteration signature — the model declared ` +
          `the binding when it introduced a feature, then rewrote the function without ` +
          `cleaning up.`,
      });
    }

    return issues;
  },
});

export default unusedLocalRule satisfies Rule<UnusedLocalContext>;
