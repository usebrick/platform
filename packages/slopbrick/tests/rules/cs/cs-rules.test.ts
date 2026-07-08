import { describe, it, expect } from 'vitest';
import { csSqlStringInterpolationRule } from '../../../src/rules/cs/sql-string-interpolation';
import { csAsyncWithoutAwaitRule } from '../../../src/rules/cs/async-without-await';
import { csEmptyCatchBlockRule } from '../../../src/rules/cs/empty-catch-block';
import type { ScanFacts, RuleContext } from '../../../src/types';

const CTX: RuleContext = {} as RuleContext;

function makeFacts(source: string): ScanFacts {
  return {
    filePath: '/test.cs',
    v2: { _source: source } as any,
  } as unknown as ScanFacts;
}

describe('cs/sql-string-interpolation', () => {
  it('flags a C# interpolated SQL string', () => {
    const issues = csSqlStringInterpolationRule.analyze(CTX, makeFacts(`
var sql = $"SELECT * FROM users WHERE id = {userId}";
db.Execute(sql);
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a parameterized query', () => {
    const issues = csSqlStringInterpolationRule.analyze(CTX, makeFacts(`
var users = db.Users.FromSqlInterpolated($"SELECT * FROM users WHERE id = {0}", userId);
`.trim()));
    expect(issues.length).toBe(0);
  });
});

describe('cs/async-without-await', () => {
  it('flags an async method with no await', () => {
    const issues = csAsyncWithoutAwaitRule.analyze(CTX, makeFacts(`
public async Task DoStuff() {
  Console.WriteLine("hello");
}
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag an async method with await', () => {
    const issues = csAsyncWithoutAwaitRule.analyze(CTX, makeFacts(`
public async Task DoStuff() {
  await Task.Delay(100);
  Console.WriteLine("hello");
}
`.trim()));
    expect(issues.length).toBe(0);
  });
});

describe('cs/empty-catch-block', () => {
  it('flags an empty catch block', () => {
    const issues = csEmptyCatchBlockRule.analyze(CTX, makeFacts(`
try { DoStuff(); } catch (Exception e) { }
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('flags a bare re-throw', () => {
    const issues = csEmptyCatchBlockRule.analyze(CTX, makeFacts(`
try { DoStuff(); } catch (Exception e) { throw; }
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a catch with logging', () => {
    const issues = csEmptyCatchBlockRule.analyze(CTX, makeFacts(`
try { DoStuff(); } catch (Exception e) { logger.Error(e, "context"); }
`.trim()));
    expect(issues.length).toBe(0);
  });
});
