import { describe, it, expect } from 'vitest';
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

  it('does not flag a `static_cast<int>(x)` with space (v0.34.3)', () => {
    // v0.34.3: the NAMED_CAST_PREFIX_REGEX was tightened to also
    // catch this case (the lookback slice ends with `>` regardless
    // of whether there's whitespace before the next `(`).
    const issues = cppCStyleCastRule.analyze(
      CTX,
      makeFacts(`
int y = static_cast<int> (x);
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not flag a `static_cast<MyClass*>(p)` (v0.34.3)', () => {
    // The original rule only excluded casts where the inner type
    // was a primitive. Class-type named casts like
    // `static_cast<MyClass*>(p)` should also not fire — v0.34.3
    // widened the lookback from 40 to 60 chars so the regex
    // actually reaches `static_cast<MyClass*>`.
    const issues = cppCStyleCastRule.analyze(
      CTX,
      makeFacts(`
MyClass* concrete = static_cast<MyClass*>(base);
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not flag `(void)x` deliberate discard (v0.34.3)', () => {
    // v0.34.3: `(void)x` is excluded as a deliberate "discard"
    // idiom, not a real cast. Authors use it to silence
    // unused-variable warnings without `#pragma unused`.
    const issues = cppCStyleCastRule.analyze(
      CTX,
      makeFacts(`
(void)computeValue();
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

  it('does not fire in *_test.cpp files (v0.34.7 refinement)', () => {
    // v0.34.7: skip test files. gtest, catch2, doctest conventions.
    // *_test.cpp, *_test.cc, /tests/ dir, *Test.cc, *Test.cpp.
    // Test files legitimately use printf for assertion messages.
    const ctx = { threshold: 1 };
    const issues = cppPrintfDebugRule.analyze(
      ctx,
      makeFacts('void f() { printf("a"); printf("b"); }', '/tests/my_test.cpp'),
    );
    expect(issues).toEqual([]);
  });

  it('does not fire in /tests/ directory (v0.34.7)', () => {
    const ctx = { threshold: 1 };
    const issues = cppPrintfDebugRule.analyze(
      ctx,
      makeFacts('void f() { printf("a"); printf("b"); }', '/tests/MyFeatureTest.cpp'),
    );
    expect(issues).toEqual([]);
  });

  it('still fires in production .cpp files (v0.34.7)', () => {
    const ctx = { threshold: 1 };
    const issues = cppPrintfDebugRule.analyze(
      ctx,
      makeFacts('class Service { void doWork() { printf("a"); printf("b"); } };', '/src/MyService.cpp'),
    );
    expect(issues.length).toBeGreaterThan(0);
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

  it('does not flag -1 sentinel in `if (idx != -1)` (v0.34.4)', () => {
    // v0.34.4: the allowSet now skips `1` (which is what
    // MAGIC_NUMBER_REGEX matches when scanning `-1`). The
    // leading `-` is not matched by `\b(\d+)\b` so the entire
    // literal `-1` is naturally skipped because `1` is
    // allowlisted.
    const issues = cppMagicNumbersRule.analyze(
      CTX,
      makeFacts(`
int find(int* xs, int n) {
  for (int i = 0; i < n; i++) {
    if (xs[i] != -1) return xs[i];
  }
  return -1;
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not flag 100 in `if (pct > 100)` (v0.34.4)', () => {
    // v0.34.4: 100 is in the expanded allowSet (percent literal).
    const issues = cppMagicNumbersRule.analyze(
      CTX,
      makeFacts(`
bool isValid(int pct) {
  if (pct > 100) return false;
  return true;
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not flag a hex literal `0xFF` in a comparison (v0.34.4)', () => {
    // v0.34.4: hex literals (`0x...`) are not matched by
    // MAGIC_NUMBER_REGEX (which requires `\d+` digits, not
    // `0x...`). The only digit matched is `0` (between `&` and
    // `x`) but `\b` requires a word-boundary AFTER the digit —
    // `0x` has no boundary, so the `0` is not matched.
    const issues = cppMagicNumbersRule.analyze(
      CTX,
      makeFacts(`
int mask(int flags) {
  if (flags == 0xFF) return 1;
  return 0;
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not flag a numeric inside a string literal (v0.34.4)', () => {
    // v0.34.4: literals inside `"..."` are stripped before
    // scanning, so `"error 42"` doesn't fire. The line still
    // has a comparison shape (`if (level > 7)`) but the only
    // numeric in the comparison is `7`, which is allowlisted.
    const issues = cppMagicNumbersRule.analyze(
      CTX,
      makeFacts(`
int main() {
  if (level > 7) printf("error 42: bad config\\n");
  return 0;
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not flag a numeric inside a `//` comment (v0.34.4)', () => {
    // v0.34.4: literals inside `// ...` are stripped from the
    // line before scanning, so the `4242` and `99999` in the
    // trailing comment don't fire. We still fire on `8192` in
    // the comparison — the rule's whole point.
    const issues = cppMagicNumbersRule.analyze(
      CTX,
      makeFacts(`
int classify(int size) {
  // TODO: refactor when 99999 is realistic; see ticket #4242
  if (size > 8192) return 2;
  return 1;
}
`.trim()),
    );
    // We expect ONE issue: `8192` in `if (size > 8192)`. The
    // 99999 and 4242 are stripped (they're inside `//`).
    expect(issues.length).toBe(1);
  });
});
