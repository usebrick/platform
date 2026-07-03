/**
 * v0.35.0: Tests for the content-based detection rule
 * `java/suspicious-implementation`. The rule detects function
 * names that claim a strong operation (validate, encrypt, hash,
 * sanitize, check, verify, authenticate) but whose body is
 * trivially empty, returns a constant, or returns the input
 * unchanged.
 *
 * CoCoNUTS-inspired: looks at semantic content (function body
 * behavior) rather than surface features (style, naming).
 */

import { describe, it, expect } from 'vitest';
import { javaSuspiciousImplementationRule } from '../../../src/rules/java/suspicious-implementation';
import type { ScanFacts, RuleContext } from '../../../src/types';

const CTX: RuleContext = {} as RuleContext;

function makeFacts(source: string, filePath: string = '/src/main/java/Foo.java'): ScanFacts {
  return {
    filePath,
    v2: { _source: source } as any,
  } as unknown as ScanFacts;
}

describe('java/suspicious-implementation', () => {
  it('flags a validate method with empty body', () => {
    const issues = javaSuspiciousImplementationRule.analyze(
      CTX,
      makeFacts('public class Foo { public boolean validateInput(String x) {} }'),
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.message).toContain('empty body');
  });

  it('flags an encrypt method that returns input unchanged', () => {
    const issues = javaSuspiciousImplementationRule.analyze(
      CTX,
      makeFacts('public class Foo { public String encrypt(String data) { return data; } }'),
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.message).toContain('pass-through');
  });

  it('flags a check method that returns true unconditionally', () => {
    const issues = javaSuspiciousImplementationRule.analyze(
      CTX,
      makeFacts('public class Foo { public boolean checkAuth(String user) { return true; } }'),
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.message).toContain('constant');
  });

  it('flags a method that throws UnsupportedOperationException', () => {
    const issues = javaSuspiciousImplementationRule.analyze(
      CTX,
      makeFacts('public class Foo { public void sanitizeInput(String x) { throw new UnsupportedOperationException("not implemented"); } }'),
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.message).toContain('UnsupportedOperationException');
  });

  it('does NOT flag a validate method that actually validates', () => {
    const issues = javaSuspiciousImplementationRule.analyze(
      CTX,
      makeFacts(`
public class Foo {
  public boolean validateInput(String x) {
    if (x == null) return false;
    if (x.isEmpty()) return false;
    return x.length() < 100;
  }
}
      `.trim()),
    );
    expect(issues.length).toBe(0);
  });

  it('does NOT flag a method without a strong verb in its name', () => {
    // "getName", "toString", "calculate" — no strong verb claim.
    const issues = javaSuspiciousImplementationRule.analyze(
      CTX,
      makeFacts('public class Foo { public String getName() { return null; } }'),
    );
    expect(issues.length).toBe(0);
  });

  it('does NOT fire in test files', () => {
    const issues = javaSuspiciousImplementationRule.analyze(
      CTX,
      makeFacts('public class FooTest { public boolean validateInput(String x) {} }', '/src/test/java/FooTest.java'),
    );
    expect(issues.length).toBe(0);
  });

  it('does NOT fire on .kt files (gated on extension)', () => {
    const issues = javaSuspiciousImplementationRule.analyze(
      CTX,
      makeFacts('class Foo { fun validate(x: String) {} }', '/test.kt'),
    );
    expect(issues.length).toBe(0);
  });
});
