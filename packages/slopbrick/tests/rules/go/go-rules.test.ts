import { describe, it, expect } from 'vitest';
import { goStructTagInconsistencyRule } from '../../../src/rules/go/struct-tag-inconsistency';
import { goNilSliceVsEmptyRule } from '../../../src/rules/go/nil-slice-vs-empty';
import type { ScanFacts, RuleContext } from '../../../src/types';

const CTX: RuleContext = {} as RuleContext;

function makeFacts(source: string): ScanFacts {
  return {
    filePath: '/test.go',
    v2: { _source: source } as any,
  } as unknown as ScanFacts;
}

describe('go/struct-tag-inconsistency', () => {
  it('flags a struct with mixed json tag styles', () => {
    const issues = goStructTagInconsistencyRule.analyze(CTX, makeFacts(`
type User struct {
  Name string \`json:"name"\`
  Email string \`json:"email,omitempty"\`
  Age int \`json:"age"\`
}
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a struct with consistent json tag styles', () => {
    const issues = goStructTagInconsistencyRule.analyze(CTX, makeFacts(`
type User struct {
  Name string \`json:"name"\`
  Email string \`json:"email"\`
  Age int \`json:"age"\`
}
`.trim()));
    expect(issues).toEqual([]);
  });
});

describe('go/nil-slice-vs-empty', () => {
  it('flags a variable declared nil then assigned empty', () => {
    const issues = goNilSliceVsEmptyRule.analyze(CTX, makeFacts(`
var items []int
items = []int{}
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a variable consistently nil or empty', () => {
    const issues = goNilSliceVsEmptyRule.analyze(CTX, makeFacts(`
var items []int
var other = []int{}
`.trim()));
    expect(issues).toEqual([]);
  });
});
