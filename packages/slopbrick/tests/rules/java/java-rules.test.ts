import { describe, it, expect } from 'vitest';
import { javaSystemOutPrintlnRule } from '../../../src/rules/java/system-out-println';
import { javaEmptyCatchBlockRule } from '../../../src/rules/java/empty-catch-block';
import { javaArraylistVsLinkedlistRule } from '../../../src/rules/java/arraylist-vs-linkedlist';
import { javaLegacyDateApiRule } from '../../../src/rules/java/legacy-date-api';
import type { ScanFacts, RuleContext } from '../../../src/types';

const CTX: RuleContext = {} as RuleContext;

function makeFacts(source: string): ScanFacts {
  return {
    filePath: '/test.java',
    v2: { _source: source } as any,
  } as unknown as ScanFacts;
}

describe('java/system-out-println', () => {
  it('flags a file with >1 println', () => {
    const ctx = { threshold: 1 };
    const issues = javaSystemOutPrintlnRule.analyze(ctx, makeFacts(`
public class Foo {
  public void bar() {
    System.out.println("one");
    System.out.println("two");
  }
}
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a file with exactly 1 println', () => {
    const ctx = { threshold: 1 };
    const issues = javaSystemOutPrintlnRule.analyze(ctx, makeFacts(`
public class Foo {
  public static void main(String[] args) {
    System.out.println("hello");
  }
}
`.trim()));
    expect(issues).toEqual([]);
  });
});

describe('java/empty-catch-block', () => {
  it('flags a single-line empty catch', () => {
    const issues = javaEmptyCatchBlockRule.analyze(CTX, makeFacts(`
try { foo(); } catch (Exception e) {}
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a catch with a log statement', () => {
    const issues = javaEmptyCatchBlockRule.analyze(CTX, makeFacts(`
try { foo(); } catch (Exception e) { log.error("failed", e); }
`.trim()));
    expect(issues).toEqual([]);
  });
});

describe('java/arraylist-vs-linkedlist', () => {
  it('flags new LinkedList', () => {
    const issues = javaArraylistVsLinkedlistRule.analyze(CTX, makeFacts(`
List<String> list = new LinkedList<>();
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag new ArrayList', () => {
    const issues = javaArraylistVsLinkedlistRule.analyze(CTX, makeFacts(`
List<String> list = new ArrayList<>();
`.trim()));
    expect(issues).toEqual([]);
  });
});

describe('java/legacy-date-api', () => {
  it('flags an import of java.util.Date', () => {
    const issues = javaLegacyDateApiRule.analyze(CTX, makeFacts(`
import java.util.Date;
public class Foo { Date d = new Date(); }
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('flags Calendar.getInstance', () => {
    const issues = javaLegacyDateApiRule.analyze(CTX, makeFacts(`
import java.util.Calendar;
public class Foo { Calendar c = Calendar.getInstance(); }
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag java.time imports', () => {
    const issues = javaLegacyDateApiRule.analyze(CTX, makeFacts(`
import java.time.LocalDate;
public class Foo { LocalDate d = LocalDate.now(); }
`.trim()));
    expect(issues).toEqual([]);
  });
});
