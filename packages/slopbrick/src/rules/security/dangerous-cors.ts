// Rule: security/dangerous-cors
//
// Reports only wildcard CORS configurations proven by the SWC AST:
// `res.setHeader('Access-Control-Allow-Origin', '*')`, static header
// objects (including `new Headers({...})`), and `cors({ origin: '*' })` /
// `cors({ origin: true })`.
//
// Source prose, comments, templates, JSX text, regular expressions, and
// dynamic values are intentionally outside this rule's evidence boundary.

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import type { DangerousCorsFact } from '../../engine/types';

function messageFor(kind: DangerousCorsFact['kind']): string {
  switch (kind) {
    case 'cors-origin-wildcard':
      return "Wildcard CORS in cors() options: origin: '*'. Any origin is allowed.";
    case 'cors-origin-reflective':
      return 'Reflective CORS: origin: true echoes the request origin.';
    case 'set-header':
    case 'header-object':
      return "Wildcard CORS header: 'Access-Control-Allow-Origin: *'. Any origin can read responses.";
  }
}

export const dangerousCorsRule = createRule<RuleContext>({
  id: 'security/dangerous-cors',
  category: 'security',
  severity: 'medium',
  aiSpecific: true,
  description:
    "Wildcard CORS configuration proven by AST: 'Access-Control-Allow-Origin: *' / origin: '*' / origin: true.",
  create(context) {
    return context;
  },
  analyze(_context, facts: ScanFacts): Issue[] {
    const configurations = facts.v2?.dangerousCors ?? [];
    return configurations.map((configuration) => ({
      ruleId: 'security/dangerous-cors',
      category: 'security',
      severity: 'medium',
      aiSpecific: true,
      message: messageFor(configuration.kind),
      line: configuration.line,
      column: configuration.column,
      advice:
        'Restrict CORS to an explicit allowlist of origins and review whether request-origin reflection is intended.',
    }));
  },
});

export default dangerousCorsRule satisfies Rule<RuleContext>;
