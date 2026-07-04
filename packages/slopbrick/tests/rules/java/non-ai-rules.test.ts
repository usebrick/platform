/**
 * v0.30.0: Tests for the non-AI-fingerprint Java rules.
 * v0.38.0: Removed java/hardcoded-credential, java/command-injection,
 * java/system-out-println (all v10-DORMANT). 2 rules remain.
 *
 * All remaining rules are aiSpecific: false. They measure real engineering
 * defects, not AI authorship.
 */

import { describe, it, expect } from 'vitest';
import { javaSqlStringConcatRule } from '../../../src/rules/java/sql-string-concat';
import { javaThreadSleepInLoopRule } from '../../../src/rules/java/thread-sleep-in-loop';
import type { ScanFacts, RuleContext } from '../../../src/types';

const CTX: RuleContext = {} as RuleContext;

function makeFacts(source: string, filePath: string = '/test.java'): ScanFacts {
  return {
    filePath,
    v2: { _source: source } as any,
  } as unknown as ScanFacts;
}

describe('java/sql-string-concat', () => {
  it('flags a SELECT with string concat', () => {
    const issues = javaSqlStringConcatRule.analyze(
      CTX,
      makeFacts('String q = "SELECT * FROM users WHERE id = " + userId;'),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a SELECT with PreparedStatement', () => {
    const issues = javaSqlStringConcatRule.analyze(
      CTX,
      makeFacts('PreparedStatement ps = conn.prepareStatement("SELECT * FROM users WHERE id = ?");'),
    );
    expect(issues.length).toBe(0);
  });

  it('does not flag on a .kt file (gated on extension)', () => {
    const issues = javaSqlStringConcatRule.analyze(
      CTX,
      makeFacts('val q = "SELECT * FROM users WHERE id = " + userId', '/test.kt'),
    );
    expect(issues.length).toBe(0);
  });

  it('does not fire when SELECT appears in a string value (v0.34.9)', () => {
    // v0.34.9: require SQL keyword to start a string literal.
    // Lines like `String msg = "Selected 1 row: " + count` have
    // SELECT as a substring of a value, not a query.
    const issues = javaSqlStringConcatRule.analyze(
      CTX,
      makeFacts('String msg = "Selected 1 row: " + count;'),
    );
    expect(issues.length).toBe(0);
  });

  it('does not fire on `selected` (camelCase substring) (v0.34.9)', () => {
    const issues = javaSqlStringConcatRule.analyze(
      CTX,
      makeFacts('Object item = selectedItem + offset;'),
    );
    expect(issues.length).toBe(0);
  });

  it('flags `String q = "SELECT ... " + id` (v0.34.9 — assignment to string)', () => {
    // v0.34.9: SELECT after `=` (assignment) is also valid.
    const issues = javaSqlStringConcatRule.analyze(
      CTX,
      makeFacts('String q = "SELECT * FROM users WHERE id = " + id;'),
    );
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe('java/thread-sleep-in-loop', () => {
  it('flags Thread.sleep in a for loop', () => {
    const issues = javaThreadSleepInLoopRule.analyze(
      CTX,
      makeFacts(`
class Poller {
  void poll() {
    for (int i = 0; i < 10; i++) {
      Thread.sleep(1000);
    }
  }
}
      `.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('flags Thread.sleep in a while loop', () => {
    const issues = javaThreadSleepInLoopRule.analyze(
      CTX,
      makeFacts(`
class Poller {
  void poll() {
    while (!done) {
      Thread.sleep(1000);
    }
  }
}
      `.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag Thread.sleep outside a loop', () => {
    const issues = javaThreadSleepInLoopRule.analyze(
      CTX,
      makeFacts(`
class Worker {
  void doWork() {
    Thread.sleep(1000);
  }
}
      `.trim()),
    );
    expect(issues.length).toBe(0);
  });

  it('does not flag a file with no Thread.sleep', () => {
    const issues = javaThreadSleepInLoopRule.analyze(
      CTX,
      makeFacts(`
class Worker {
  void doWork() {
    for (int i = 0; i < 10; i++) {
      System.out.println(i);
    }
  }
}
      `.trim()),
    );
    expect(issues.length).toBe(0);
  });

  it('does not flag Thread.sleep in main() when a different method has a for loop (v0.34.6)', () => {
    // v0.34.6: the previous heuristic fired on every Thread.sleep
    // if the file ALSO had a for/while/do keyword. This means
    // a top-level Thread.sleep in main() would fire if any other
    // method had a `for` loop — false positive. v0.34.6 uses
    // brace-counting to verify Thread.sleep is INSIDE the loop
    // block.
    const issues = javaThreadSleepInLoopRule.analyze(
      CTX,
      makeFacts(`
class App {
  public static void main(String[] args) throws Exception {
    Thread.sleep(1000);  // top-level, not in a loop
    System.out.println("done");
  }

  void unrelatedMethod() {
    for (int i = 0; i < 10; i++) {
      System.out.println(i);  // unrelated for loop
    }
  }
}
      `.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not flag Thread.sleep before/after a loop, outside its block (v0.34.6)', () => {
    // v0.34.6: brace-counting ensures the sleep must be inside
    // the loop's `{...}` block, not before or after.
    const issues = javaThreadSleepInLoopRule.analyze(
      CTX,
      makeFacts(`
class App {
  void poll() throws Exception {
    Thread.sleep(500);  // before the loop, not in it
    for (int i = 0; i < 10; i++) {
      System.out.println(i);
    }
    Thread.sleep(500);  // after the loop, not in it
  }
}
      `.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('still fires Thread.sleep in a for loop (v0.34.6 sanity check)', () => {
    // Sanity check: a Thread.sleep inside a for block still
    // fires. The brace-counting logic correctly recognizes
    // the for-body `{...}` as a loop block.
    const issues = javaThreadSleepInLoopRule.analyze(
      CTX,
      makeFacts(`
class Poller {
  void poll() throws Exception {
    for (int i = 0; i < 10; i++) {
      Thread.sleep(1000);
    }
  }
}
      `.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('still fires Thread.sleep in a do-while loop (v0.34.6)', () => {
    // do-while: body `{` follows immediately. v0.34.6 detects
    // this when `pendingLoopKeyword.kind === 'do'` and the
    // next non-paren char is `{`.
    const issues = javaThreadSleepInLoopRule.analyze(
      CTX,
      makeFacts(`
class Poller {
  void poll() throws Exception {
    do {
      Thread.sleep(1000);
    } while (!done);
  }
}
      `.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag Thread.sleep in a string literal (v0.34.6)', () => {
    // v0.34.6: the string-literal state machine skips Thread.sleep
    // occurrences inside `"..."`. Avoids matching docs/comments
    // like `String s = "call Thread.sleep(1000) here";`.
    const issues = javaThreadSleepInLoopRule.analyze(
      CTX,
      makeFacts(`
class Doc {
  void describe() {
    for (int i = 0; i < 10; i++) {
      String doc = "use Thread.sleep(1000) to wait";
      System.out.println(doc);
    }
  }
}
      `.trim()),
    );
    expect(issues).toEqual([]);
  });
});
