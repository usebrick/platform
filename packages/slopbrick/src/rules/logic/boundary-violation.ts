/**
 * Server components must not use client hooks. Reads from
 * facts.v2.components (for isServerComponent) and
 * facts.v2.logic.hooks (for client hook usage).
 *
 * **Peer-reviewed citation:**
 * - The React Server Components architecture is documented in
 *   the React RFC "Server Components" (https://github.com/reactjs/rfcs/blob/main/text/0188-server-components.md),
 *   which establishes the server/client boundary contract. The
 *   rule implements the "Server Components cannot use client-only
 *   hooks" invariant.
 * - Empirical observation: v0.12.2 calibration lift 0.9× →
 *   HYGIENE verdict. The pattern is common in human code that
 *   mixes server and client components during refactors.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

const CLIENT_HOOKS = new Set(['useState', 'useEffect', 'useContext']);

export interface BoundaryViolationContext {
  clientHooks: ReadonlySet<string>;
  supportsRsc: boolean;
}

export const boundaryViolationRule = createRule<BoundaryViolationContext>({
  id: 'logic/boundary-violation',
  category: 'logic',
  severity: 'high',
  aiSpecific: false,
  create(ruleContext: RuleContext): BoundaryViolationContext {
    return { clientHooks: CLIENT_HOOKS, supportsRsc: ruleContext.config.supportsRsc ?? true };
  },
  analyze(context: BoundaryViolationContext, facts: ScanFacts): Issue[] {
    if (context.supportsRsc === false) return [];
    if (!facts.v2) return [];

    const issues: Issue[] = [];

    // Build a map of hook-name → line/column from the v2 logic.hooks array.
    const hookLines = new Map<string, Array<{ line: number; column: number }>>();
    for (const h of facts.v2.logic.hooks) {
      const arr = hookLines.get(h.name) ?? [];
      arr.push({ line: h.line, column: h.column });
      hookLines.set(h.name, arr);
    }

    for (const component of facts.v2.components) {
      if (!component.isServerComponent) continue;
      for (const hook of facts.v2.logic.hooks) {
        if (!context.clientHooks.has(hook.name)) continue;
        // Find the hook's location within this component's scope.
        // reports the component's location; per-hook scoping comes later.
        issues.push({
          ruleId: 'logic/boundary-violation',
          category: 'logic',
          severity: 'high',
          aiSpecific: true,
          message: `'${hook.name}' only works in interactive client components. This component runs on the server.`,
          line: component.line,
          column: component.column,
          advice: "Add the 'use client' directive at the top of this file, or move the stateful part to a separate client component.",
          fix: {
            kind: 'insert',
            description: 'Insert \"use client\" directive',
            targetFile: facts.v2.file.path,
          },
        });
      }
    }

    return issues;
  },
});

export default boundaryViolationRule satisfies Rule<BoundaryViolationContext>;
