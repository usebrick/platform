import { describe, it, expect } from 'vitest';
import { javaSystemOutPrintlnRule } from '../../../src/rules/java/system-out-println';
import { javaEmptyCatchBlockRule } from '../../../src/rules/java/empty-catch-block';
import { javaArraylistVsLinkedlistRule } from '../../../src/rules/java/arraylist-vs-linkedlist';
import { javaLegacyDateApiRule } from '../../../src/rules/java/legacy-date-api';
import { javaRawTypeOveruseRule } from '../../../src/rules/java/raw-type-overuse';
import { javaStringConcatLoopRule } from '../../../src/rules/java/string-concat-loop';
import { javaVerboseJavadocRule } from '../../../src/rules/java/verbose-javadoc';
import { javaOptionalOveruseRule } from '../../../src/rules/java/optional-overuse';
import { javaImmutableCollectionPreferenceRule } from '../../../src/rules/java/immutable-collection-preference';
import { javaBuilderOveruseRule } from '../../../src/rules/java/builder-overuse';
import { javaStreamOveruseRule } from '../../../src/rules/java/stream-overuse';
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

describe('java/raw-type-overuse', () => {
  it('flags a raw List declaration', () => {
    const issues = javaRawTypeOveruseRule.analyze(CTX, makeFacts(`
List x = new ArrayList();
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a parameterized List', () => {
    const issues = javaRawTypeOveruseRule.analyze(CTX, makeFacts(`
List<String> x = new ArrayList<>();
`.trim()));
    expect(issues).toEqual([]);
  });
});

describe('java/string-concat-loop', () => {
  it('flags s = s + x inside a for loop', () => {
    const issues = javaStringConcatLoopRule.analyze(CTX, makeFacts(`
String s = "";
for (int i = 0; i < 10; i++) {
  s = s + i;
}
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not fire when there is no loop in the file', () => {
    const issues = javaStringConcatLoopRule.analyze(CTX, makeFacts(`
String s = "a" + "b";
`.trim()));
    expect(issues).toEqual([]);
  });
});

describe('java/verbose-javadoc', () => {
  it('flags a small file with many Javadoc tags', () => {
    const source = `
/**
 * Returns the user.
 * @param id the user id
 * @return the user
 * @throws IllegalArgumentException if id is null
 */
public User getUser(String id) { return new User(id); }
/**
 * Updates the user.
 * @param u the user
 * @return the result
 * @throws RuntimeException on error
 */
public boolean update(User u) { return true; }
/**
 * Deletes the user.
 * @param id the id
 * @return success
 */
public boolean delete(String id) { return true; }
`.trim();
    const ctx = { tagThreshold: 3, bodyLengthCap: 5 };
    const issues = javaVerboseJavadocRule.analyze(ctx as any, makeFacts(source));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a small file with no Javadoc', () => {
    const ctx = { tagThreshold: 3, bodyLengthCap: 5 };
    const issues = javaVerboseJavadocRule.analyze(ctx as any, makeFacts(`
public class Foo {
  public int x;
  public int y;
  public int z;
}
`.trim()));
    expect(issues).toEqual([]);
  });

  it('does not flag a large file with normal Javadoc density', () => {
    const lines: string[] = [];
    for (let i = 0; i < 500; i++) {
      lines.push(`public void method${i}() { /* body */ }`);
    }
    const ctx = { tagThreshold: 3, bodyLengthCap: 5 };
    const issues = javaVerboseJavadocRule.analyze(ctx as any, makeFacts(lines.join('\n')));
    expect(issues).toEqual([]);
  });
});

describe('java/optional-overuse', () => {
  it('flags a file with many orElseThrow and no null checks', () => {
    const ctx = { threshold: 2 };
    const issues = javaOptionalOveruseRule.analyze(ctx as any, makeFacts(`
public String a() { return Optional.ofNullable(x).orElseThrow(); }
public String b() { return Optional.ofNullable(y).orElseThrow(); }
public String c() { return Optional.ofNullable(z).orElseThrow(); }
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a file with mix of Optional and null checks', () => {
    const ctx = { threshold: 2 };
    const issues = javaOptionalOveruseRule.analyze(ctx as any, makeFacts(`
public String a() { return Optional.ofNullable(x).orElseThrow(); }
public String b() { return Objects.requireNonNull(y); }
public String c() { return Objects.requireNonNull(z); }
`.trim()));
    expect(issues).toEqual([]);
  });
});

describe('java/immutable-collection-preference', () => {
  it('flags a file with 5+ List.of and no mutable collections', () => {
    const ctx = { immutableThreshold: 5, mutableCap: 1 };
    const issues = javaImmutableCollectionPreferenceRule.analyze(ctx as any, makeFacts(`
public class Foo {
  public List<String> a = List.of("a");
  public List<String> b = List.of("b");
  public List<String> c = List.of("c");
  public List<String> d = List.of("d");
  public List<String> e = List.of("e");
  public List<String> f = List.of("f");
}
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a file with balanced immutable/mutable use', () => {
    const ctx = { immutableThreshold: 5, mutableCap: 1 };
    const issues = javaImmutableCollectionPreferenceRule.analyze(ctx as any, makeFacts(`
public class Foo {
  public List<String> a = List.of("a");
  public List<String> b = List.of("b");
  public List<String> c = new ArrayList<>();
  public List<String> d = new ArrayList<>();
}
`.trim()));
    expect(issues).toEqual([]);
  });
});

describe('java/builder-overuse', () => {
  it('flags @Builder on a class with 2 fields', () => {
    const ctx = { fieldCountCap: 3 };
    const issues = javaBuilderOveruseRule.analyze(ctx as any, makeFacts(`
import lombok.Builder;
@Builder
public class User {
  private String name;
  private String email;
}
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag @Builder on a class with 5 fields', () => {
    const ctx = { fieldCountCap: 3 };
    const issues = javaBuilderOveruseRule.analyze(ctx as any, makeFacts(`
import lombok.Builder;
@Builder
public class User {
  private String name;
  private String email;
  private String phone;
  private int age;
  private boolean active;
}
`.trim()));
    expect(issues).toEqual([]);
  });
});

describe('java/stream-overuse', () => {
  it('flags a line with 4+ stream operations', () => {
    const ctx = { chainThreshold: 3 };
    const issues = javaStreamOveruseRule.analyze(ctx as any, makeFacts(`
List<String> result = list.stream().filter(x -> x.startsWith("a")).map(String::toUpperCase).sorted().collect(Collectors.toList());
`.trim()));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a line with 2 stream operations', () => {
    const ctx = { chainThreshold: 3 };
    const issues = javaStreamOveruseRule.analyze(ctx as any, makeFacts(`
List<String> result = list.stream().filter(x -> x.startsWith("a")).collect(Collectors.toList());
`.trim()));
    expect(issues).toEqual([]);
  });
});
