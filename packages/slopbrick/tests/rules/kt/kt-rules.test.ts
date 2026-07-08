import { describe, it, expect } from 'vitest';
import { ktStringTemplateInjectionRule } from '../../../src/rules/kt/string-template-injection';
import { ktCoroutineCancellationMissingRule } from '../../../src/rules/kt/coroutine-cancellation-missing';
import { ktForceUnwrapRule } from '../../../src/rules/kt/force-unwrap';
import { ktGlobalCoroutineScopeRule } from '../../../src/rules/kt/global-coroutine-scope';
import type { ScanFacts, RuleContext } from '../../../src/types';

const CTX: RuleContext = {} as RuleContext;

function makeFacts(source: string): ScanFacts {
  return {
    filePath: '/test.kt',
    v2: { _source: source } as any,
  } as unknown as ScanFacts;
}

describe('kt/string-template-injection', () => {
  it('flags a SQL string with $variable interpolation', () => {
    const issues = ktStringTemplateInjectionRule.analyze(CTX, makeFacts(`
fun findUser(name: String) {
  conn.prepareStatement("SELECT * FROM users WHERE name = '$name'")
}
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a parameterized query', () => {
    const issues = ktStringTemplateInjectionRule.analyze(CTX, makeFacts(`
fun findUser(name: String) {
  conn.prepareStatement("SELECT * FROM users WHERE name = ?").use { stmt ->
    stmt.setString(1, name)
  }
}
`.trim()));
    expect(issues.length).toBe(0);
  });
});

describe('kt/coroutine-cancellation-missing', () => {
  it('flags a launch block without ensureActive', () => {
    const issues = ktCoroutineCancellationMissingRule.analyze(CTX, makeFacts(`
fun runForever() {
  GlobalScope.launch {
    while (true) {
      doWork()
    }
  }
}
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a launch with ensureActive', () => {
    const issues = ktCoroutineCancellationMissingRule.analyze(CTX, makeFacts(`
fun runForever() {
  GlobalScope.launch {
    while (true) {
      ensureActive()
      doWork()
    }
  }
}
`.trim()));
    expect(issues.length).toBe(0);
  });
});

describe('kt/force-unwrap', () => {
  it('flags !! on a nullable type', () => {
    const issues = ktForceUnwrapRule.analyze(CTX, makeFacts(`
fun getName(user: User?): String {
  return user!!.name
}
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe('kt/global-coroutine-scope', () => {
  it('flags GlobalScope.launch', () => {
    const issues = ktGlobalCoroutineScopeRule.analyze(CTX, makeFacts(`
GlobalScope.launch {
  doWork()
}
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag coroutineScope', () => {
    const issues = ktGlobalCoroutineScopeRule.analyze(CTX, makeFacts(`
coroutineScope.launch {
  doWork()
}
`.trim()));
    expect(issues.length).toBe(0);
  });
});
