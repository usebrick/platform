import { describe, it, expect } from 'vitest';
import { swiftForceUnwrapRule } from '../../../src/rules/swift/force-unwrap';
import { swiftPrintDebugRule } from '../../../src/rules/swift/print-debug';
import { swiftFatalErrorThrownRule } from '../../../src/rules/swift/fatal-error-thrown';
import { swiftImplicitlyUnwrappedOptionalRule } from '../../../src/rules/swift/implicitly-unwrapped-optional';
import { swiftStrongSelfCaptureRule } from '../../../src/rules/swift/strong-self-capture';
import type { ScanFacts, RuleContext } from '../../../src/types';

const CTX: RuleContext = {} as RuleContext;

function makeFacts(source: string, filePath = '/test.swift'): ScanFacts {
  return {
    filePath,
    v2: { _source: source } as any,
  } as unknown as ScanFacts;
}

describe('swift/force-unwrap', () => {
  it('flags `as!` in production', () => {
    const issues = swiftForceUnwrapRule.analyze(
      CTX,
      makeFacts(`
let cell = tableView.dequeueReusableCell(withIdentifier: "x") as! MyCell
`.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('flags a `something!.prop` access', () => {
    const issues = swiftForceUnwrapRule.analyze(
      CTX,
      makeFacts(`
let frame = view.frame!
`.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('flags `try!`', () => {
    const issues = swiftForceUnwrapRule.analyze(
      CTX,
      makeFacts(`
let data = try! JSONSerialization.data(withJSONObject: dict)
`.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not fire inside a test file (import XCTest)', () => {
    const issues = swiftForceUnwrapRule.analyze(
      CTX,
      makeFacts(`
import XCTest
class FooTests: XCTestCase {
  func testBar() {
    let x = someOptional!
  }
}
`.trim(), '/test/FooTests.swift'),
    );
    expect(issues).toEqual([]);
  });

  it('does not flag `as?`', () => {
    const issues = swiftForceUnwrapRule.analyze(
      CTX,
      makeFacts(`
let cell = tableView.dequeueReusableCell(withIdentifier: "x") as? MyCell
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not fire on `!=` comparison (v0.34.10)', () => {
    // v0.34.10: the `!` in `!=` is a comparison operator, not a
    // force-unwrap. The negative lookbehind in the access-force
    // regex excludes this pattern.
    const issues = swiftForceUnwrapRule.analyze(
      CTX,
      makeFacts(`
if a != b { print("diff") }
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not fire on `!==` comparison (v0.34.10)', () => {
    const issues = swiftForceUnwrapRule.analyze(
      CTX,
      makeFacts(`
if a !== b { print("diff") }
`.trim()),
    );
    expect(issues).toEqual([]);
  });
});

describe('swift/print-debug', () => {
  it('flags 3+ print calls', () => {
    const ctx = { threshold: 1 };
    const issues = swiftPrintDebugRule.analyze(
      ctx,
      makeFacts(`
func bind() {
  print("one")
  print("two")
  print("three")
}
`.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not fire on exactly 1 print (legitimate CLI)', () => {
    const ctx = { threshold: 1 };
    const issues = swiftPrintDebugRule.analyze(
      ctx,
      makeFacts(`
print("hello world")
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not fire when only Logger.info is used', () => {
    const ctx = { threshold: 1 };
    const issues = swiftPrintDebugRule.analyze(
      ctx,
      makeFacts(`
import os
let log = Logger(subsystem: "app", category: "net")
log.info("one")
log.info("two")
log.info("three")
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not fire when only os_log is used', () => {
    const ctx = { threshold: 1 };
    const issues = swiftPrintDebugRule.analyze(
      ctx,
      makeFacts(`
import os
os_log("one")
os_log("two")
os_log("three")
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not fire in test files (v0.34.2 refinement)', () => {
    const ctx = { threshold: 1 };
    const issues = swiftPrintDebugRule.analyze(
      CTX,
      makeFacts('print("a")\nprint("b")\nprint("c")\n', '/Tests/MyTests.swift'),
    );
    expect(issues).toEqual([]);
  });

  it('does not fire in *Tests.swift files (v0.34.2)', () => {
    const ctx = { threshold: 1 };
    const issues = swiftPrintDebugRule.analyze(
      CTX,
      makeFacts('print("a")\nprint("b")\nprint("c")\n', '/path/MyFeatureTests.swift'),
    );
    expect(issues).toEqual([]);
  });

  it('still fires in production .swift files (v0.34.2)', () => {
    const ctx = { threshold: 1 };
    const issues = swiftPrintDebugRule.analyze(
      CTX,
      makeFacts('class Service { func doWork() { print("a"); print("b"); print("c") } }\n', '/Sources/MyService.swift'),
    );
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe('swift/fatal-error-thrown', () => {
  it('flags fatalError("not implemented") in production', () => {
    const issues = swiftFatalErrorThrownRule.analyze(
      CTX,
      makeFacts(`
protocol MyService {
  func fetch() -> Data
}
class ConcreteService: MyService {
  func fetch() -> Data {
    fatalError("not implemented")
  }
}
`.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('flags preconditionFailure', () => {
    const issues = swiftFatalErrorThrownRule.analyze(
      CTX,
      makeFacts(`
func parse(_ s: String) -> Int {
  preconditionFailure("unreachable")
}
`.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not fire inside a test file', () => {
    const issues = swiftFatalErrorThrownRule.analyze(
      CTX,
      makeFacts(`
import XCTest
class FooTests: XCTestCase {
  func testBar() {
    fatalError("test-only abort")
  }
}
`.trim(), '/test/FooTests.swift'),
    );
    expect(issues).toEqual([]);
  });

  it('does not flag a plain assert(...)', () => {
    const issues = swiftFatalErrorThrownRule.analyze(
      CTX,
      makeFacts(`
func parse(_ s: String) -> Int {
  assert(!s.isEmpty)
  return Int(s) ?? 0
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });
});

describe('swift/implicitly-unwrapped-optional', () => {
  it('flags `var name: String!`', () => {
    const issues = swiftImplicitlyUnwrappedOptionalRule.analyze(
      CTX,
      makeFacts(`
class Foo {
  var name: String!
}
`.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('flags `let config: Config! = ...`', () => {
    const issues = swiftImplicitlyUnwrappedOptionalRule.analyze(
      CTX,
      makeFacts(`
class Foo {
  let config: Config! = Config.shared
}
`.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a regular optional `String?`', () => {
    const issues = swiftImplicitlyUnwrappedOptionalRule.analyze(
      CTX,
      makeFacts(`
class Foo {
  var name: String?
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not flag a non-IUO assignment `let foo = bar!`', () => {
    const issues = swiftImplicitlyUnwrappedOptionalRule.analyze(
      CTX,
      makeFacts(`
let foo = bar!
`.trim()),
    );
    expect(issues).toEqual([]);
  });
});

describe('swift/strong-self-capture', () => {
  it('flags a closure that uses self.foo', () => {
    const issues = swiftStrongSelfCaptureRule.analyze(
      CTX,
      makeFacts(`
class Loader {
  func loadData() {
    api.get { self.foo = bar }
  }
}
`.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a closure with [weak self]', () => {
    const issues = swiftStrongSelfCaptureRule.analyze(
      CTX,
      makeFacts(`
class Loader {
  func loadData() {
    api.get { [weak self] in
      self?.foo = bar
    }
  }
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not flag self.view outside any closure', () => {
    const issues = swiftStrongSelfCaptureRule.analyze(
      CTX,
      makeFacts(`
class Loader {
  var title = ""
  func render() {
    self.title = "x"
  }
}
`.trim()),
    );
    // No closure-wrapped self; method-body self access is not a
    // closure capture, so we expect zero issues.
    expect(issues).toEqual([]);
  });

  it('does not flag a closure with [unowned self]', () => {
    const issues = swiftStrongSelfCaptureRule.analyze(
      CTX,
      makeFacts(`
class Loader {
  func loadData() {
    api.get { [unowned self] in self.foo = bar }
  }
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });
});
