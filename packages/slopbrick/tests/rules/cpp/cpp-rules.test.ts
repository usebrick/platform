import { describe, it, expect } from 'vitest';
import { cppUsingNamespaceStdRule } from '../../../src/rules/cpp/using-namespace-std';
import { cppRawNewDeleteRule } from '../../../src/rules/cpp/raw-new-delete';
import { cppCStyleCastRule } from '../../../src/rules/cpp/c-style-cast';
import { cppPrintfDebugRule } from '../../../src/rules/cpp/printf-debug';
import { cppMagicNumbersRule } from '../../../src/rules/cpp/magic-numbers';
import type { ScanFacts, RuleContext } from '../../../src/types';

const CTX: RuleContext = {} as RuleContext;

function makeFacts(source: string, filePath = '/test.cpp'): ScanFacts {
  return {
    filePath,
    v2: { _source: source } as any,
  } as unknown as ScanFacts;
}

describe('cpp/using-namespace-std', () => {
  it('flags `using namespace std;` in a .hpp header', () => {
    const issues = cppUsingNamespaceStdRule.analyze(
      CTX,
      makeFacts(`
using namespace std;
class Foo {};
`.trim(), '/include/foo.hpp'),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('flags `using namespace std;` in a .h header', () => {
    const issues = cppUsingNamespaceStdRule.analyze(
      CTX,
      makeFacts(`
using namespace std;
void bar();
`.trim(), '/include/foo.h'),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not fire on `using namespace std;` in a .cpp file', () => {
    const issues = cppUsingNamespaceStdRule.analyze(
      CTX,
      makeFacts(`
using namespace std;
int main() { return 0; }
`.trim(), '/src/main.cpp'),
    );
    expect(issues).toEqual([]);
  });

  it('does not flag the targeted form `using std::cout;`', () => {
    const issues = cppUsingNamespaceStdRule.analyze(
      CTX,
      makeFacts(`
using std::cout;
using std::string;
class Foo {};
`.trim(), '/include/foo.hpp'),
    );
    expect(issues).toEqual([]);
  });
});

describe('cpp/raw-new-delete', () => {
  it('flags two paired new/delete calls', () => {
    const ctx = { minPairs: 1 };
    const issues = cppRawNewDeleteRule.analyze(
      ctx,
      makeFacts(`
void f() {
  Foo* a = new Foo();
  Bar* b = new Bar();
  delete a;
  delete b;
}
`.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a std::make_unique chain', () => {
    const ctx = { minPairs: 1 };
    const issues = cppRawNewDeleteRule.analyze(
      ctx,
      makeFacts(`
void f() {
  auto a = std::make_unique<Foo>();
  auto b = std::make_unique<Bar>();
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not fire on a single new int[10] (array allocation)', () => {
    const ctx = { minPairs: 1 };
    const issues = cppRawNewDeleteRule.analyze(
      ctx,
      makeFacts(`
void f() {
  int* xs = new int[10];
  delete[] xs;
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });
});

describe('cpp/c-style-cast', () => {
  it('flags `(int)x`', () => {
    const issues = cppCStyleCastRule.analyze(
      CTX,
      makeFacts(`
int y = (int)x;
`.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('flags `(MyClass*)ptr`', () => {
    const issues = cppCStyleCastRule.analyze(
      CTX,
      makeFacts(`
MyClass* concrete = (MyClass*)ptr;
`.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a `static_cast<int>(x)`', () => {
    const issues = cppCStyleCastRule.analyze(
      CTX,
      makeFacts(`
int y = static_cast<int>(x);
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not flag an `if (x)` control flow', () => {
    const issues = cppCStyleCastRule.analyze(
      CTX,
      makeFacts(`
if (x) {
  doStuff();
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });
});

describe('cpp/printf-debug', () => {
  it('flags 2+ printf calls', () => {
    const ctx = { threshold: 1 };
    const issues = cppPrintfDebugRule.analyze(
      ctx,
      makeFacts(`
void f() {
  printf("a\\n");
  printf("b\\n");
}
`.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('flags a single `std::cout << "debug"`', () => {
    const ctx = { threshold: 1 };
    const issues = cppPrintfDebugRule.analyze(
      ctx,
      makeFacts(`
void f() {
  std::cout << "debug";
}
`.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not fire on a single printf in main (legitimate CLI output)', () => {
    const ctx = { threshold: 1 };
    const issues = cppPrintfDebugRule.analyze(
      ctx,
      makeFacts(`
int main(int argc, char** argv) {
  printf("hello world\\n");
  return 0;
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not fire on spdlog::info', () => {
    const ctx = { threshold: 1 };
    const issues = cppPrintfDebugRule.analyze(
      ctx,
      makeFacts(`
#include <spdlog/spdlog.h>
void f() {
  spdlog::info("one");
  spdlog::info("two");
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });
});

describe('cpp/magic-numbers', () => {
  it('flags an unrelated number in a comparison', () => {
    const issues = cppMagicNumbersRule.analyze(
      CTX,
      makeFacts(`
int classify(int size) {
  if (size > 8192) {
    return 2;
  }
  return 1;
}
`.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag `if (size > MAX)` after a constexpr MAX = 1024', () => {
    const issues = cppMagicNumbersRule.analyze(
      CTX,
      makeFacts(`
constexpr int MAX = 1024;
int classify(int size) {
  if (size > MAX) {
    return 2;
  }
  return 1;
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not flag an array index `array[10]`', () => {
    const issues = cppMagicNumbersRule.analyze(
      CTX,
      makeFacts(`
void f() {
  int arr[10];
  arr[3] = 0;
}
`.trim()),
    );
    // We expect zero issues: `arr[10]` and `arr[3]` are both
    // subscripts, not comparison contexts.
    expect(issues).toEqual([]);
  });

  it('does not flag the allowlisted 1024 in a comparison', () => {
    const issues = cppMagicNumbersRule.analyze(
      CTX,
      makeFacts(`
int classify(int size) {
  if (size > 1024) return 2;
  return 1;
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });
});
