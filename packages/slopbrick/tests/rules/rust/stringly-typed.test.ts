/**
 * Unit tests for `rust/stringly-typed`.
 */

import { describe, expect, it } from 'vitest';
import { rustStringlyTypedRule } from '../../../src/rules/rust/stringly-typed';
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
  const ctx = rustStringlyTypedRule.create(ruleCtx);
  return rustStringlyTypedRule.analyze(ctx, facts);
}

describe('rust/stringly-typed', () => {
  it('fires when a String parameter has a suspect name and an enum exists in the file', () => {
    const source = [
      'pub enum EventKind { Click, Keydown, Submit }',
      'fn handle(kind: &str) {',
      '    if kind == "click" {}',
      '}',
    ].join('\n');
    const facts = makeFacts({
      source,
      functions: [{ name: 'handle', line: 2, column: 0, isPublic: false, isMethod: false, bodyLines: 3, inTestConfig: false }],
    });
    const issues = runRule(facts);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.message).toContain('kind');
  });

  it('does not fire when no enum exists in the file', () => {
    const source = [
      'fn handle(kind: &str) {',
      '    if kind == "click" {}',
      '}',
    ].join('\n');
    const facts = makeFacts({
      source,
      functions: [{ name: 'handle', line: 1, column: 0, isPublic: false, isMethod: false, bodyLines: 3, inTestConfig: false }],
    });
    const issues = runRule(facts);
    expect(issues).toEqual([]);
  });

  it('does not fire when the parameter name is not in the suspect set', () => {
    const source = [
      'pub enum EventKind { Click, Keydown }',
      'fn handle(name: &str) {}',
    ].join('\n');
    const facts = makeFacts({
      source,
      functions: [{ name: 'handle', line: 2, column: 0, isPublic: false, isMethod: false, bodyLines: 1, inTestConfig: false }],
    });
    const issues = runRule(facts);
    expect(issues).toEqual([]);
  });

  it('does not fire when the parameter type is not String / &str', () => {
    const source = [
      'pub enum EventKind { Click, Keydown }',
      'fn handle(kind: EventKind) {}',
    ].join('\n');
    const facts = makeFacts({
      source,
      functions: [{ name: 'handle', line: 2, column: 0, isPublic: false, isMethod: false, bodyLines: 1, inTestConfig: false }],
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
