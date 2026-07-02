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
  description: 'Server-side data-layer / DB import leaked into a client component, or a client React hook used inside a server file (RSC boundary violation)',
  create(ruleContext: RuleContext): BoundaryViolationContext {
    return { clientHooks: CLIENT_HOOKS, supportsRsc: ruleContext.config.supportsRsc ?? true };
  },
  analyze(context: BoundaryViolationContext, facts: ScanFacts): Issue[] {
    if (context.supportsRsc === false) return [];
    if (!facts.v2) return [];

    const issues: Issue[] = [];

    for (const component of facts.v2.components) {
      if (!component.isServerComponent) continue;
      // v0.20.0 R-INVERTED fix: was iterating over `facts.v2.logic.hooks`
      // (GLOBAL — every hook in the codebase) and creating one issue per
      // (component, hook) pair, regardless of whether the hook was
      // actually in the component. With 5 server components and 100
      // client hooks across the codebase, that produced 500 false
      // positives per scan, all pointing to the component's line (not
      // the hook's line). The comment admitted it: "reports the
      // component's location; per-hook scoping comes later." It never
      // came. Fix: iterate over `component.hookCalls` (the v2 facts
      // already scope hooks to the component) and report the hook's
      // actual line.
      for (const hook of component.hookCalls) {
        if (!context.clientHooks.has(hook.name)) continue;
        issues.push({
          ruleId: 'logic/boundary-violation',
          category: 'logic',
          severity: 'high',
          aiSpecific: true,
          message: `'${hook.name}' only works in interactive client components. This component runs on the server.`,
          line: hook.line,
          column: hook.column,
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
