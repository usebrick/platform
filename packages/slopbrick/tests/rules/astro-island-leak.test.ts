import { describe, it, expect } from 'vitest';
import { astroIslandLeakRule } from '../../src/rules/arch/astro-island-leak';
import type { ResolvedConfig, ScanFacts } from '../../src/types';

function makeFacts(astroComponents: Array<{ tag: string; hasClientDirective: boolean; hasEventHandler: boolean; line: number; column: number }>): ScanFacts {
  return {
    filePath: '/x.astro',
    v2: {
      file: { path: '/x.astro', loc: 10, extension: '.astro', framework: 'astro' },
      imports: [],
      components: [],
      jsx: { elements: [], maxNestingDepth: 0 },
      logic: {
        hooks: [],
        stateVariables: [],
        defensiveChecks: [],
        apiCalls: [],
        logicalExpressions: [],
        keyProps: [],
        optimisticUpdates: [],
      },
      designTokens: { spacingUsage: [], colorValues: [], fontSizes: [], borderRadius: [] },
      componentSizes: [],
      astroComponents,
      disabledRules: [],
      templateClassNames: [],
    },
  };
}

const baseConfig: ResolvedConfig = {
  include: [],
  exclude: [],
  rules: { 'arch/astro-island-leak': 'low' },
  frameworkMultipliers: {},
  ruleConfig: {},
  thresholds: { meanSlop: 25, p90Slop: 50, individualSlopThreshold: 50 },
  arbitraryValueAllowlist: [],
  wcag: { targetSizeExemptSelectors: [] },
};

describe('arch/astro-island-leak', () => {
  it('flags event handlers without a client directive', () => {
    const context = astroIslandLeakRule.create({ config: baseConfig, filePath: '/x.astro', cwd: '/' });
    const facts = makeFacts([{ tag: 'Counter', hasClientDirective: false, hasEventHandler: true, line: 3, column: 1 }]);
    const issues = astroIslandLeakRule.analyze(context, facts);
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('arch/astro-island-leak');
    expect(issues[0].message).toContain('Counter');
  });

  it('ignores components with a client directive', () => {
    const context = astroIslandLeakRule.create({ config: baseConfig, filePath: '/x.astro', cwd: '/' });
    const facts = makeFacts([{ tag: 'Counter', hasClientDirective: true, hasEventHandler: true, line: 3, column: 1 }]);
    expect(astroIslandLeakRule.analyze(context, facts)).toHaveLength(0);
  });

  it('ignores components without event handlers', () => {
    const context = astroIslandLeakRule.create({ config: baseConfig, filePath: '/x.astro', cwd: '/' });
    const facts = makeFacts([{ tag: 'Icon', hasClientDirective: false, hasEventHandler: false, line: 3, column: 1 }]);
    expect(astroIslandLeakRule.analyze(context, facts)).toHaveLength(0);
  });

  it('is disabled when rule severity is off', () => {
    const config: ResolvedConfig = { ...baseConfig, rules: { 'arch/astro-island-leak': 'off' } };
    const context = astroIslandLeakRule.create({ config, filePath: '/x.astro', cwd: '/' });
    const facts = makeFacts([{ tag: 'Counter', hasClientDirective: false, hasEventHandler: true, line: 3, column: 1 }]);
    expect(astroIslandLeakRule.analyze(context, facts)).toHaveLength(0);
  });
});
