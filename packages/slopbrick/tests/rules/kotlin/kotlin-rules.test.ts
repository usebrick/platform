import { describe, it, expect } from 'vitest';
import { kotlinDataClassDefaultsOveruseRule } from '../../../src/rules/kotlin/data-class-defaults-overuse';
import { kotlinCoroutineGlobalScopeRule } from '../../../src/rules/kotlin/coroutine-global-scope';
import { kotlinPrintlnDebugRule } from '../../../src/rules/kotlin/println-debug';
import { kotlinObjectSingletonMisuseRule } from '../../../src/rules/kotlin/object-singleton-misuse';
import { kotlinStringConcatLoopRule } from '../../../src/rules/kotlin/string-concat-loop';
import type { ScanFacts, RuleContext } from '../../../src/types';

const CTX: RuleContext = {} as RuleContext;

function makeFacts(source: string): ScanFacts {
  return {
    filePath: '/test.kt',
    v2: { _source: source } as any,
  } as unknown as ScanFacts;
}

describe('kotlin/data-class-defaults-overuse', () => {
  it('flags a data class with 3+ default values', () => {
    const ctx = { minDefaults: 3 };
    const issues = kotlinDataClassDefaultsOveruseRule.analyze(
      ctx,
      makeFacts(`
data class User(
  val name: String = "x",
  val age: Int = 0,
  val email: String? = null,
  val tags: List<String> = emptyList()
)
`.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag a fully-required data class', () => {
    const ctx = { minDefaults: 3 };
    const issues = kotlinDataClassDefaultsOveruseRule.analyze(
      ctx,
      makeFacts(`
data class User(val name: String, val age: Int)
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not flag a data class with only one default', () => {
    const ctx = { minDefaults: 3 };
    const issues = kotlinDataClassDefaultsOveruseRule.analyze(
      ctx,
      makeFacts(`
data class User(val name: String, val age: Int = 0)
`.trim()),
    );
    expect(issues).toEqual([]);
  });
});

describe('kotlin/coroutine-global-scope', () => {
  it('flags GlobalScope.launch', () => {
    const issues = kotlinCoroutineGlobalScopeRule.analyze(
      CTX,
      makeFacts(`
fun bind() {
  GlobalScope.launch {
    doWork()
  }
}
`.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('flags GlobalScope.async', () => {
    const issues = kotlinCoroutineGlobalScopeRule.analyze(
      CTX,
      makeFacts(`
val deferred = GlobalScope.async { fetchUser() }
`.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag viewModelScope.launch', () => {
    const issues = kotlinCoroutineGlobalScopeRule.analyze(
      CTX,
      makeFacts(`
fun bind() {
  viewModelScope.launch {
    doWork()
  }
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not fire on a bare runBlocking without GlobalScope', () => {
    const issues = kotlinCoroutineGlobalScopeRule.analyze(
      CTX,
      makeFacts(`
fun main() = runBlocking {
  println("hi")
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });
});

describe('kotlin/println-debug', () => {
  it('flags 2+ println calls', () => {
    const ctx = { threshold: 1 };
    const issues = kotlinPrintlnDebugRule.analyze(
      ctx,
      makeFacts(`
fun main() {
  println("one")
  println("two")
}
`.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not fire on exactly 1 println (legitimate CLI)', () => {
    const ctx = { threshold: 1 };
    const issues = kotlinPrintlnDebugRule.analyze(
      ctx,
      makeFacts(`
fun main() {
  println("hello")
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not fire when only Timber.plant is called', () => {
    const ctx = { threshold: 1 };
    const issues = kotlinPrintlnDebugRule.analyze(
      ctx,
      makeFacts(`
fun init() {
  Timber.plant(Timber.DebugTree())
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });
});

describe('kotlin/object-singleton-misuse', () => {
  it('flags an object with a var field', () => {
    const issues = kotlinObjectSingletonMisuseRule.analyze(
      CTX,
      makeFacts(`
object Cache {
  var data: List<String> = emptyList()
}
`.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not flag an object with only val fields', () => {
    const issues = kotlinObjectSingletonMisuseRule.analyze(
      CTX,
      makeFacts(`
object Constants {
  val MAX = 100
  val NAME = "x"
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not flag a companion object', () => {
    const issues = kotlinObjectSingletonMisuseRule.analyze(
      CTX,
      makeFacts(`
class Helper {
  companion object {
    var counter = 0
  }
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not flag a regular class with var fields', () => {
    const issues = kotlinObjectSingletonMisuseRule.analyze(
      CTX,
      makeFacts(`
class Foo {
  var x: Int = 0
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });
});

describe('kotlin/string-concat-loop', () => {
  it('flags `s = s + i` inside a for loop', () => {
    const issues = kotlinStringConcatLoopRule.analyze(
      CTX,
      makeFacts(`
fun build(): String {
  var s = ""
  for (i in 0..10) {
    s = s + i.toString()
  }
  return s
}
`.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('flags `s = s + i` inside a repeat block', () => {
    const issues = kotlinStringConcatLoopRule.analyze(
      CTX,
      makeFacts(`
fun build(): String {
  var s = ""
  repeat(10) {
    s = s + "x"
  }
  return s
}
`.trim()),
    );
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not fire when there is no loop keyword in the file', () => {
    const issues = kotlinStringConcatLoopRule.analyze(
      CTX,
      makeFacts(`
val s = "a" + "b" + "c"
`.trim()),
    );
    expect(issues).toEqual([]);
  });

  it('does not fire on a StringBuilder append chain', () => {
    const issues = kotlinStringConcatLoopRule.analyze(
      CTX,
      makeFacts(`
fun build(): String {
  val sb = StringBuilder()
  for (i in 0..10) {
    sb.append(i)
  }
  return sb.toString()
}
`.trim()),
    );
    expect(issues).toEqual([]);
  });
});
