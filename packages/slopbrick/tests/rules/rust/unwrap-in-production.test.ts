/**
 * Unit tests for `rust/unwrap-in-production`.
 *
 * Strategy: feed the rule a synthetic source string (test scope is
 * determined by the `inTestConfig` flag on the function record) and
 * verify the rule fires on unwrap/expect calls outside test scope
 * and stays silent inside #[test] / #[cfg(test)] scopes.
 */

import { describe, expect, it } from 'vitest';
import { rustUnwrapInProductionRule } from '../../../src/rules/rust/unwrap-in-production';
import type { Issue, RuleContext, ScanFacts, ResolvedConfig } from '../../../src/types';

const baseConfig: ResolvedConfig = {
  include: [], exclude: [], rules: {}, frameworkMultipliers: {},
  ruleConfig: {}, arbitraryValueAllowlist: [],
  wcag: { targetSizeExemptSelectors: [] },
  thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 },
};

function makeFacts(opts: {
  functions: Array<{ name: string; line: number; column: number; isPublic: boolean; isMethod: boolean; bodyLines: number; inTestConfig: boolean }>;
  source: string;
}): ScanFacts {
  return {
    filePath: 'fixture.rs',
    v2: {
      file: { path: 'fixture.rs', loc: opts.source.split('\n').length, extension: '.rs', framework: 'react' },
      imports: [], components: [], jsx: { elements: [], maxNestingDepth: 0 },
      logic: {
        hooks: [], stateVariables: [], defensiveChecks: [],
        apiCalls: [], logicalExpressions: [], keyProps: [], optimisticUpdates: [],
      },
      designTokens: { spacingUsage: [], colorValues: [], fontSizes: [], borderRadius: [] },
      deadCode: { bindings: [], constantConditions: [], unreachableStatements: [] },
      templateClassNames: [], componentSizes: [], astroComponents: [], disabledRules: [],
      rustFile: {
        imports: [], structs: [], traits: [], impls: [],
        functions: opts.functions,
      },
      _source: opts.source,
    },
  };
}

function runRule(facts: ScanFacts): Issue[] {
  const ruleCtx: RuleContext = { config: baseConfig, filePath: 'fixture.rs', cwd: process.cwd() };
  const ctx = rustUnwrapInProductionRule.create(ruleCtx);
  return rustUnwrapInProductionRule.analyze(ctx, facts);
}

describe('rust/unwrap-in-production', () => {
  it('fires on .unwrap() in production code', () => {
    const source = [
      'fn production_handler() {',
      '    let x = "hello".to_string();',
      '    let len = x.len();',
      '    let v = x.unwrap();',
      '    v',
      '}',
    ].join('\n');
    const facts = makeFacts({
      source,
      functions: [{ name: 'production_handler', line: 1, column: 0, isPublic: false, isMethod: false, bodyLines: 6, inTestConfig: false }],
    });
    const issues = runRule(facts);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.ruleId).toBe('rust/unwrap-in-production');
    expect(issues[0]!.message).toContain('unwrap');
  });

  it('does not fire on unwrap() inside a #[cfg(test)] function (per the v2 walker)', () => {
    const source = [
      '#[test]',
      'fn it_works() {',
      '    assert_eq!("hello".to_string().unwrap(), "hello");',
      '}',
    ].join('\n');
    const facts = makeFacts({
      source,
      functions: [{ name: 'it_works', line: 2, column: 0, isPublic: true, isMethod: false, bodyLines: 3, inTestConfig: true }],
    });
    const issues = runRule(facts);
    expect(issues).toEqual([]);
  });

  it('returns empty when facts.v2.rustFile is absent', () => {
    const facts: ScanFacts = {
      filePath: 'x.tsx',
      v2: {
        file: { path: 'x.tsx', loc: 1, extension: '.tsx', framework: 'react' },
        imports: [], components: [], jsx: { elements: [], maxNestingDepth: 0 },
        logic: {
          hooks: [], stateVariables: [], defensiveChecks: [],
          apiCalls: [], logicalExpressions: [], keyProps: [], optimisticUpdates: [],
        },
        designTokens: { spacingUsage: [], colorValues: [], fontSizes: [], borderRadius: [] },
        deadCode: { bindings: [], constantConditions: [], unreachableStatements: [] },
        templateClassNames: [], componentSizes: [], astroComponents: [], disabledRules: [],
      },
    };
    expect(runRule(facts)).toEqual([]);
  });
});
