import { describe, expect, it } from 'vitest';
import { dartDynamicCallRule } from '../../../src/rules/dart/dynamic-call';
import { dartMissingDisposeRule } from '../../../src/rules/dart/missing-dispose';
import { dartPrintDebugRule } from '../../../src/rules/dart/print-debug';
import { dartUnwrappedFuturesRule } from '../../../src/rules/dart/unwrapped-futures';
import type { RuleContext, ScanFacts } from '../../../src/types';

const CTX = {} as RuleContext;
const facts = (source: string, filePath = '/tmp/example.dart'): ScanFacts =>
  ({ filePath, v2: { _source: source } } as unknown as ScanFacts);

describe('Dart rule contracts', () => {
  it('detects dynamic casts but ignores typed Dart files', () => {
    expect(dartDynamicCallRule.analyze(CTX, facts('final value = input as User;')).length).toBeGreaterThan(0);
    expect(dartDynamicCallRule.analyze(CTX, facts('final User value = input;')).length).toBe(0);
  });

  it('detects a controller without dispose and accepts a disposed controller', () => {
    expect(dartMissingDisposeRule.analyze(CTX, facts('final controller = TextEditingController();')).length).toBeGreaterThan(0);
    expect(dartMissingDisposeRule.analyze(CTX, facts('final controller = TextEditingController();\ncontroller.dispose();')).length).toBe(0);
  });

  it('detects print debug output but ignores comments and non-Dart files', () => {
    expect(dartPrintDebugRule.analyze(CTX, facts('print("debug");')).length).toBe(1);
    expect(dartPrintDebugRule.analyze(CTX, facts('// print("debug");')).length).toBe(0);
    expect(dartPrintDebugRule.analyze(CTX, facts('print("debug");', '/tmp/example.ts')).length).toBe(0);
  });

  it('detects an unwrapped async call and accepts await', () => {
    expect(dartUnwrappedFuturesRule.analyze(CTX, facts('fetchUser();')).length).toBeGreaterThan(0);
    expect(dartUnwrappedFuturesRule.analyze(CTX, facts('await fetchUser();')).length).toBe(0);
  });
});
