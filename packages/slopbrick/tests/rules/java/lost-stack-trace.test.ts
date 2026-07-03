/**
 * v0.35.1: Tests for the content-based detection rule
 * `java/lost-stack-trace`. The rule detects catch blocks that
 * throw a new exception WITHOUT including the original exception
 * as a cause, which loses the stack trace.
 *
 * Raidar-inspired: detects patterns characteristic of AI-polished
 * error handling (LLMs often wrap exceptions but lose context).
 */

import { describe, it, expect } from 'vitest';
import { javaLostStackTraceRule } from '../../../src/rules/java/lost-stack-trace';
import type { ScanFacts, RuleContext } from '../../../src/types';

const CTX: RuleContext = {} as RuleContext;

function makeFacts(source: string, filePath: string = '/src/main/java/Foo.java'): ScanFacts {
  return {
    filePath,
    v2: { _source: source } as any,
  } as unknown as ScanFacts;
}

describe('java/lost-stack-trace', () => {
  it('flags a throw without the original exception', () => {
    const issues = javaLostStackTraceRule.analyze(
      CTX,
      makeFacts(`
public class Foo {
  public void read() {
    try {
      Files.readAllBytes(path);
    } catch (IOException e) {
      throw new RuntimeException("read failed");
    }
  }
}
      `.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.message).toContain('not included as cause');
  });

  it('does NOT flag a throw that includes the original exception', () => {
    const issues = javaLostStackTraceRule.analyze(
      CTX,
      makeFacts(`
public class Foo {
  public void read() {
    try {
      Files.readAllBytes(path);
    } catch (IOException e) {
      throw new RuntimeException("read failed", e);
    }
  }
}
      `.trim()),
    );
    expect(issues.length).toBe(0);
  });

  it('flags a multi-arg throw where the exception is missing', () => {
    const issues = javaLostStackTraceRule.analyze(
      CTX,
      makeFacts(`
public class Foo {
  public void read() {
    try {
      doIt();
    } catch (IllegalStateException e) {
      throw new IllegalStateException("failed at step X");
    }
  }
}
      `.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does NOT flag a throw outside a catch block', () => {
    // throw new RuntimeException() at the top level is fine —
    // there's no original exception to lose.
    const issues = javaLostStackTraceRule.analyze(
      CTX,
      makeFacts(`
public class Foo {
  public void check() {
    if (!valid) throw new RuntimeException("invalid");
  }
}
      `.trim()),
    );
    expect(issues.length).toBe(0);
  });

  it('does NOT fire in test files', () => {
    const issues = javaLostStackTraceRule.analyze(
      CTX,
      makeFacts(`
public class FooTest {
  public void test() {
    try { doIt(); } catch (Exception e) { throw new RuntimeException("test failed"); }
  }
}
      `.trim(), '/src/test/java/FooTest.java'),
    );
    expect(issues.length).toBe(0);
  });

  it('does NOT fire on .kt files (gated on extension)', () => {
    const issues = javaLostStackTraceRule.analyze(
      CTX,
      makeFacts(`
class Foo {
  fun read() {
    try { read() } catch (e: IOException) { throw RuntimeException("failed") }
  }
}
      `.trim(), '/test.kt'),
    );
    expect(issues.length).toBe(0);
  });

  it('flags multiple catch blocks with lost stack traces', () => {
    const issues = javaLostStackTraceRule.analyze(
      CTX,
      makeFacts(`
public class Foo {
  public void a() {
    try { doIt(); } catch (Exception e) { throw new RuntimeException("a"); }
  }
  public void b() {
    try { doIt(); } catch (Exception e) { throw new RuntimeException("b"); }
  }
}
      `.trim()),
    );
    expect(issues.length).toBe(2);
  });
});
