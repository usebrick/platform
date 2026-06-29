/**
 *
 * Per Wathan, A. & Schoger, S. (2017+), *Refactoring UI*, self-published; Mäntylä, M. V. (2003), ‘A Taxonomy for ‘Bad Code Smells’’, MSc thesis, Univ. of Helsinki.
 * example: visual/arbitrary-escape reads from the grouped
 * ScanFactsV2 shape (`facts.v2.jsx.elements[].arbitraryValues`).
 * This is the first rule migrated to v2. It demonstrates that rules can
 * be a 5-line pure function over `ScanFactsV2`:
 *   for (const el of facts.v2.jsx.elements) {
 *     if (el.arbitraryValues.length > 0) issues.push(...);
 *   }
 * The flat `facts.staticClassNames` path is preserved as a fallback
 * until  removes the old shape.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import type { ScanFactsV2 } from '../../engine/types';
import { createRule } from '../rule';
import { isLayoutArbitrary, matchesAllowlist, nearestTailwindSpacingToken } from '../utils';

export interface ArbitraryEscapeContext {
  allowlist: readonly (string | RegExp)[];
}

export const arbitraryEscapeRule = createRule<ArbitraryEscapeContext>({
  id: 'visual/arbitrary-escape',
  category: 'visual',
  severity: 'medium',
  aiSpecific: true,
  description: 'Bracket-notation Tailwind values (e.g. `p-[13px]`, `bg-[#7c3aed]`) — AI agents reach for arbitrary escapes instead of design tokens (Refactoring UI; Mäntylä 2003)',
  create(context: RuleContext): ArbitraryEscapeContext {
    return {
      allowlist: context.config.arbitraryValueAllowlist,
    };
  },
  analyze(context: ArbitraryEscapeContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];

    // removed; rules read directly from `facts.v2`.
    const v2 = facts.v2;
    const offenders = v2.jsx.elements.flatMap((el) =>
      el.arbitraryValues
        .filter((cls) => isLayoutArbitrary(cls) && !matchesAllowlist(cls, context.allowlist)),
    );

    if (offenders.length < 3) return issues;

    for (const el of v2.jsx.elements) {
      const offendersInEl = el.arbitraryValues
        .filter((cls) => isLayoutArbitrary(cls) && !matchesAllowlist(cls, context.allowlist));
      if (offendersInEl.length === 0) continue;
      const fixes = offendersInEl
        .map((offender) => {
          const token = nearestTailwindSpacingToken(offender);
          if (!token) return undefined;
          return {
            kind: 'replace' as const,
            description: `Replace '${offender}' with '${token}'`,
            targetFile: facts.filePath,
            oldValue: offender,
            newValue: token,
          };
        })
        .filter((fix): fix is NonNullable<typeof fix> => fix !== undefined);
      issues.push({
        ruleId: 'visual/arbitrary-escape',
        category: 'visual',
        severity: 'medium',
        aiSpecific: true,
        message: `Layout arbitrary value(s) ${offendersInEl.map((o) => `'${o}'`).join(', ')} escaped the design system`,
        line: el.line,
        column: el.column,
        advice: 'Replace with a design-system token or add it to arbitraryValueAllowlist if intentional.',
        ...(fixes.length > 0 ? { fixes } : {}),
      });
    }
    return issues;
  },
});

export default arbitraryEscapeRule satisfies Rule<ArbitraryEscapeContext>;

// Re-export so other v2 rules can read the same context shape.
export type { ScanFactsV2 };
