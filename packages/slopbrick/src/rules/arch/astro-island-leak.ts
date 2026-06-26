import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';

export interface AstroIslandLeakContext {
  severity: Issue['severity'];
  disabled: boolean;
}

export const astroIslandLeakRule: Rule<AstroIslandLeakContext> = {
  id: 'arch/astro-island-leak',
  category: 'arch',
  severity: 'low',
  aiSpecific: true,
  description: "Astro component with click handler but no client:* directive",

  create(context: RuleContext): AstroIslandLeakContext {
    const severity = context.config.rules['arch/astro-island-leak'];
    return {
      severity: (severity === 'off' ? 'low' : severity) as Issue['severity'],
      disabled: severity === 'off',
    };
  },

  analyze(context: AstroIslandLeakContext, facts: ScanFacts): Issue[] {
    if (context.disabled) return [];

    const issues: Issue[] = [];
    const source = facts.v2.astroComponents;
    for (const component of source) {
      if (component.hasEventHandler && !component.hasClientDirective) {
        issues.push({
          ruleId: 'arch/astro-island-leak',
          category: 'arch',
          severity: context.severity,
          aiSpecific: true,
          filePath: facts.filePath,
          message: `<${component.tag}> has a click handler but won't run in the browser — it needs a client directive to "turn on".`,
          line: component.line,
          column: component.column,
          advice: 'Add a client directive to the component tag: client:load, client:idle, or client:visible. Pick the one that matches when you want it to start working.',
        });
      }
    }
    return issues;
  },
};

export default astroIslandLeakRule satisfies Rule<AstroIslandLeakContext>;