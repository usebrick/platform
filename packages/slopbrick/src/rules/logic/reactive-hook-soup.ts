import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * Rule: reactive-hook-soup
 *
 * `useEffect` chains manually syncing local state. AI agents, when
 * losing context across iterative edits, stop coordinating global state
 * and stack reactive loops instead. ≥3 useEffect calls in a single
 * component is a strong tell.
 *
 * Per-component fire.
 */
const MIN_EFFECTS = 3;

export const reactiveHookSoupRule = createRule<RuleContext>({
  id: 'logic/reactive-hook-soup',
  category: 'logic',
  severity: 'medium',
  aiSpecific: true,
  description: '`useEffect` chains manually syncing local state.',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    if (!facts.v2) return issues;

    for (const component of facts.v2.components) {
      const effectCalls = component.hookCalls.filter((h) => h.name === 'useEffect');
      if (effectCalls.length < MIN_EFFECTS) continue;

      issues.push({
        ruleId: 'logic/reactive-hook-soup',
        category: 'logic',
        severity: 'medium',
        aiSpecific: true,
        message: `Component ${component.name || 'at line ' + component.line} has ${effectCalls.length} useEffect calls — likely Soup`,
        line: component.line,
        column: component.column,
        advice:
          'Coordinate state via a single derived value (useMemo) or a state machine. Avoid chained useEffects.',
      });
    }

    return issues;
  },
});

export default reactiveHookSoupRule satisfies Rule<RuleContext>;
