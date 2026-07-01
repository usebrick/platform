/**
 * Unit tests for `rust/unused-pub-fn`.
 *
 * The rule fires on `pub fn` declarations whose name doesn't
 * appear anywhere in the source. Tests build synthetic ScanFacts
 * with `facts.v2.rustFile.functions` populated and assert the
 * expected issues fire / stay quiet.
 */

import { describe, expect, it } from 'vitest';
import { rustUnusedPubFnRule } from '../../../src/rules/rust/unused-pub-fn';
import type { Issue, RuleContext, ScanFacts, ResolvedConfig } from '../../../src/types';

const baseConfig: ResolvedConfig = {
  include: [], exclude: [], rules: {}, frameworkMultipliers: {},
  ruleConfig: {}, arbitraryValueAllowlist: [],
  wcag: { targetSizeExemptSelectors: [] },
  thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 },
};

function makeFacts(opts: {
  functions: Array<{ name: string; line: number; column: number; isPublic: boolean; isMethod: boolean; bodyLines: number; inTestConfig: boolean }>;
  source?: string;
}): ScanFacts {
  return {
    filePath: 'fixture.rs',
    v2: {
      file: { path: 'fixture.rs', loc: 1, extension: '.rs', framework: 'react' },
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
      _source: opts.source ?? '',
    },
  };
}

function runRule(facts: ScanFacts): Issue[] {
  const ruleCtx: RuleContext = { config: baseConfig, filePath: 'fixture.rs', cwd: process.cwd() };
  const ctx = rustUnusedPubFnRule.create(ruleCtx);
  return rustUnusedPubFnRule.analyze(ctx, facts);
}

describe('rust/unused-pub-fn', () => {
  it('fires on a pub fn with no in-file references', () => {
    const facts = makeFacts({
      source: 'pub fn caller() {}',
      functions: [{ name: 'unused', line: 1, column: 0, isPublic: true, isMethod: false, bodyLines: 1, inTestConfig: false }],
    });
    const issues = runRule(facts);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.ruleId).toBe('rust/unused-pub-fn');
    expect(issues[0]!.message).toContain('unused');
  });

  it('does not fire when the name appears in the source (call site)', () => {
    const facts = makeFacts({
      source: 'pub fn caller() { pub_fn_helper(); }\npub fn pub_fn_helper() {}',
      functions: [
        { name: 'caller', line: 1, column: 0, isPublic: true, isMethod: false, bodyLines: 1, inTestConfig: false },
        { name: 'pub_fn_helper', line: 2, column: 0, isPublic: true, isMethod: false, bodyLines: 1, inTestConfig: false },
      ],
    });
    const issues = runRule(facts);
    expect(issues).toEqual([]);
  });

  it('does not fire on private (non-pub) functions', () => {
    const facts = makeFacts({
      source: '',
      functions: [{ name: 'helper', line: 1, column: 0, isPublic: false, isMethod: false, bodyLines: 1, inTestConfig: false }],
    });
    const issues = runRule(facts);
    expect(issues).toEqual([]);
  });

  it('does not fire on API-convention names (new, into_iter, ...)', () => {
    const facts = makeFacts({
      source: 'pub fn new() {}', // `new` is in API_CONVENTION_NAMES
      functions: [{ name: 'new', line: 1, column: 0, isPublic: true, isMethod: false, bodyLines: 1, inTestConfig: false }],
    });
    const issues = runRule(facts);
    expect(issues).toEqual([]);
  });

  it('does not fire on functions decorated with #[cfg(test)]', () => {
    const facts = makeFacts({
      source: '',
      functions: [{ name: 'setup_test_env', line: 1, column: 0, isPublic: true, isMethod: false, bodyLines: 1, inTestConfig: true }],
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
    const issues = runRule(facts);
    expect(issues).toEqual([]);
  });
});
