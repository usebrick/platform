/**
 * Unit tests for `rust/todo-macro`.
 */

import { describe, expect, it } from 'vitest';
import { rustTodoMacroRule } from '../../../src/rules/rust/todo-macro';
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
  const ctx = rustTodoMacroRule.create(ruleCtx);
  return rustTodoMacroRule.analyze(ctx, facts);
}

describe('rust/todo-macro', () => {
  it('fires on todo!() in production code', () => {
    const source = [
      'fn handler() {',
      '    todo!("not implemented yet")',
      '}',
    ].join('\n');
    const facts = makeFacts({
      source,
      functions: [{ name: 'handler', line: 1, column: 0, isPublic: false, isMethod: false, bodyLines: 3, inTestConfig: false }],
    });
    const issues = runRule(facts);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.message).toContain('todo');
  });

  it('fires on unimplemented!() in production code', () => {
    const source = [
      'fn handler() {',
      '    unimplemented!("later")',
      '}',
    ].join('\n');
    const facts = makeFacts({
      source,
      functions: [{ name: 'handler', line: 1, column: 0, isPublic: false, isMethod: false, bodyLines: 3, inTestConfig: false }],
    });
    const issues = runRule(facts);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.message).toContain('unimplemented');
  });

  it('does not fire when the function is marked inTestConfig', () => {
    const source = [
      '#[test]',
      'fn scaffold_test() {',
      '    todo!("fill this in later")',
      '}',
    ].join('\n');
    const facts = makeFacts({
      source,
      functions: [{ name: 'scaffold_test', line: 2, column: 0, isPublic: true, isMethod: false, bodyLines: 3, inTestConfig: true }],
    });
    const issues = runRule(facts);
    expect(issues).toEqual([]);
  });

  it('does not fire on an implemented production body', () => {
    const source = 'fn load() -> i32 { 42 }';
    const facts = makeFacts({
      source,
      functions: [{ name: 'load', line: 1, column: 0, isPublic: false, isMethod: false, bodyLines: 1, inTestConfig: false }],
    });
    expect(runRule(facts)).toEqual([]);
  });

  it('does not fire on todo! inside a macro definition', () => {
    const source = 'macro_rules! deferred { () => { todo!() } }';
    expect(runRule(makeFacts({ source, functions: [] }))).toEqual([]);
  });

  it.each([
    ['alternate syntax', 'fn load()->Result<i32,Error>{ Err(Error::Pending) }'],
    ['baseline', 'fn load()->i32{ 42 }'],
    ['comment adjacent', '// todo!()\nfn load()->i32{ 42 }'],
    ['near miss', 'fn todo_count()->usize{ 0 }'],
    ['regression safe', 'unimplemented_feature();'],
  ])('does not flag the %s transfer control', (_label, source) => {
    expect(runRule(makeFacts({ source, functions: [] }))).toEqual([]);
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
