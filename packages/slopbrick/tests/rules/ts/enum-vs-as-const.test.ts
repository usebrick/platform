import { describe, it, expect } from 'vitest';
import { tsEnumVsAsConstRule } from '../../../src/rules/ts/enum-vs-as-const';
import { tsImportTypeMisuseRule } from '../../../src/rules/ts/import-type-misuse';
import { tsNeverVsUnknownRule } from '../../../src/rules/ts/never-vs-unknown';
import { tsExcessiveTypeAssertionRule } from '../../../src/rules/ts/excessive-type-assertion';
import type { ScanFacts, RuleContext } from '../../../src/types';

const CTX: RuleContext = {} as RuleContext;

function makeFacts(source: string): ScanFacts {
  return {
    filePath: '/test.ts',
    v2: { _source: source } as any,
  } as unknown as ScanFacts;
}

describe('ts/enum-vs-as-const', () => {
  it('flags an enum declaration', () => {
    const issues = tsEnumVsAsConstRule.analyze(CTX, makeFacts(`
enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe('ts/enum-vs-as-const');
  });

  it('does not flag `as const`', () => {
    const issues = tsEnumVsAsConstRule.analyze(CTX, makeFacts(`
const Color = { Red: 'red', Green: 'green' } as const;
`.trim()));
    expect(issues).toEqual([]);
  });

  it('returns no findings when source is empty', () => {
    expect(tsEnumVsAsConstRule.analyze(CTX, makeFacts(''))).toEqual([]);
  });
});

describe('ts/import-type-misuse', () => {
  it('flags inline `import { type X }`', () => {
    const issues = tsImportTypeMisuseRule.analyze(CTX, makeFacts(
      `import { type Foo, Bar } from 'mod';`
    ));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].ruleId).toBe('ts/import-type-misuse');
  });

  it('does not flag `import type { X }`', () => {
    const issues = tsImportTypeMisuseRule.analyze(CTX, makeFacts(
      `import type { Foo } from 'mod';`
    ));
    expect(issues).toEqual([]);
  });
});

describe('ts/never-vs-unknown', () => {
  it('flags a function with `: never` return but no throw/loop/exit', () => {
    const issues = tsNeverVsUnknownRule.analyze(CTX, makeFacts(`
function impossible(): never {
  const x = 1;
  return x as never;
}
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a function that throws', () => {
    const issues = tsNeverVsUnknownRule.analyze(CTX, makeFacts(`
function panic(msg: string): never {
  throw new Error(msg);
}
`.trim()));
    expect(issues).toEqual([]);
  });
});

describe('ts/excessive-type-assertion', () => {
  it('flags a function with >3 `as` assertions', () => {
    // The rule's analyze reads `context.maxAssertionsPerFunction`,
    // which is set by the rule's `create()` method. In production
    // the engine calls create() first; in tests we pass a
    // properly-initialized context directly.
    const ctx = { maxAssertionsPerFunction: 3 };
    const issues = tsExcessiveTypeAssertionRule.analyze(ctx, makeFacts(`
function f(x: any) {
  return (x as Foo).bar as Baz as Qux as Final;
}
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a function with <=3 `as` assertions', () => {
    const ctx = { maxAssertionsPerFunction: 3 };
    const issues = tsExcessiveTypeAssertionRule.analyze(ctx, makeFacts(`
function f(x: any) {
  return (x as Foo).bar as Baz;
}
`.trim()));
    expect(issues).toEqual([]);
  });
});
