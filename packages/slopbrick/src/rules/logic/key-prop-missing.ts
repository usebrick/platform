import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';

export const keyPropMissingRule = createRule<unknown>({
  id: 'logic/key-prop-missing',
  category: 'logic',
  severity: 'high',
  aiSpecific: false,
  description: "Items in a list missing a React key",
  create() {
    return undefined;
  },
  analyze(_context: unknown, facts: ScanFacts): Issue[] {
    const source = facts.v2.logic.keyProps;
    return source
      .filter((k) => k.valueType === 'missing')
      .map((k) => ({
        ruleId: 'logic/key-prop-missing',
        category: 'logic',
        severity: 'high',
        aiSpecific: true,
        message: 'Missing React key in list element',
        line: k.line,
        column: k.column,
        advice: 'Add a unique key prop to each item rendered from an array.',
      }));
  },
});

export default keyPropMissingRule satisfies Rule<unknown>;