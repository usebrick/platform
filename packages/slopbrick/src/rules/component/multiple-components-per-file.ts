import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * Rule: multiple-components-per-file
 * Phase 2 §10 (Boundary Slop). Flags files that contain 2 or more
 * React component definitions.
 */
export const multipleComponentsPerFileRule = createRule<RuleContext>({
  id: 'component/multiple-components-per-file',
  category: 'component',
  severity: 'medium',
  aiSpecific: false,
  description: 'File contains 2+ component definitions — split into separate files.',
  create(context) {
    return context;
  },
  analyze(_context, facts: ScanFacts): Issue[] {
    const source = facts.v2.componentSizes;
    if (!source || source.length < 2) return [];
    const extraCount = source.length - 1;
    const first = source[0]!;
    return [
      {
        ruleId: 'component/multiple-components-per-file',
        category: 'component',
        severity: 'medium',
        aiSpecific: true,
        message: `File defines ${source.length} components (${extraCount} extra beyond the first). Multiple components per file bloat the Context Window and couple unrelated UI primitives.`,
        line: first.line,
        column: first.column,
        advice: `Move each component into its own file. Start with ${first.name ?? `the component at line ${first.line}`}.`,
      },
    ];
  },
});

export default multipleComponentsPerFileRule satisfies Rule<RuleContext>;