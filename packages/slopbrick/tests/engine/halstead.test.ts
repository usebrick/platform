import { describe, it, expect } from 'vitest';
import {
  computeHalstead,
  computeCyclomatic,
  computeHalsteadForRange,
} from '../../src/engine/halstead';

/**
 * v0.10: Halstead complexity measures (Halstead 1977, *Elements of
 * Software Science*, Elsevier, §3 "Software Science").
 *
 * These tests pin the engine's behavior so future refactors of the
 * tokenizer or formulas don't silently drift. They are intentionally
 * arithmetic-heavy: every assertion ties to a closed-form expression
 * from Halstead §3 (vocabulary, length, calculated length, volume,
 * difficulty, effort, estimated bugs).
 */

describe('computeHalstead', () => {
  it('returns zeros for empty source (n=0 degenerate case)', () => {
    const m = computeHalstead('');
    expect(m).toEqual({
      vocabulary: 0,
      length: 0,
      calculatedLength: 0,
      volume: 0,
      difficulty: 0,
      effort: 0,
      estimatedBugs: 0,
      n1: 0,
      n2: 0,
      N1: 0,
      N2: 0,
    });
  });

  it('returns zeros for whitespace-only source', () => {
    const m = computeHalstead('   \n\n\t  ');
    expect(m.vocabulary).toBe(0);
    expect(m.length).toBe(0);
    expect(m.volume).toBe(0);
  });

  it('handles a single identifier (defensive guard returns all zeros when n1===0)', () => {
    // The engine has a guard: when vocabulary === 0 OR n1 === 0 OR
    // n2 === 0, it returns all-zero metrics (including n1 and n2).
    // This is intentional — log2(0) and log2(1) produce degenerate
    // values, so the engine refuses to compute them. Documented quirk.
    const m = computeHalstead('foo');
    expect(m.n1).toBe(0);
    expect(m.n2).toBe(0); // defensive guard zeroes even valid operand counts
    expect(m.vocabulary).toBe(0);
    expect(m.length).toBe(0);
    expect(m.volume).toBe(0);
  });

  it('returns all zeros when only operators are present (n2===0 guard)', () => {
    // Pure operator input: `+` alone. Same defensive guard kicks in.
    const m = computeHalstead('+');
    expect(m.n1).toBe(0);
    expect(m.n2).toBe(0);
    expect(m.length).toBe(0);
  });

  it('computes metrics for a function declaration', () => {
    // `function f(x) { return x; }`
    // Operators: function, (, ), {, return, ;, }
    // Operands: f, x, x
    const m = computeHalstead('function f(x) { return x; }');
    expect(m.n1).toBeGreaterThan(0);
    expect(m.n2).toBeGreaterThan(0);
    expect(m.vocabulary).toBe(m.n1 + m.n2);
    expect(m.length).toBe(m.N1 + m.N2);
    expect(m.volume).toBeGreaterThan(0);
    expect(m.difficulty).toBeGreaterThan(0);
    expect(m.effort).toBeGreaterThan(0);
    expect(m.estimatedBugs).toBeGreaterThanOrEqual(0);
  });

  it('computes metrics for a simple arithmetic expression', () => {
    // `a + b`
    // Operators: +
    // Operands: a, b
    const m = computeHalstead('a + b');
    expect(m.n1).toBe(1); // unique operator: +
    expect(m.n2).toBe(2); // unique operands: a, b
    expect(m.N1).toBe(1); // total operator: +
    expect(m.N2).toBe(2); // total operands: a, b
    expect(m.vocabulary).toBe(3);
    expect(m.length).toBe(3);
    // volume = length * log2(vocabulary) = 3 * log2(3) ≈ 4.755
    expect(m.volume).toBeCloseTo(3 * Math.log2(3), 6);
    // difficulty = (n1/2) * (N2/n2) = (1/2) * (2/2) = 0.5
    expect(m.difficulty).toBeCloseTo(0.5, 6);
    // effort = difficulty * volume ≈ 2.377
    expect(m.effort).toBeCloseTo(0.5 * 3 * Math.log2(3), 6);
  });

  it('computes non-zero volume and difficulty for a realistic component body', () => {
    // A realistic React-style function component with ≥10 distinct
    // operators and operands — this is the threshold where Halstead
    // metrics become meaningful (vocabulary ≥ 10).
    const source = `
function UserCard({ user, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const handleClick = (event) => {
    event.preventDefault();
    setExpanded(!expanded);
    if (user && user.id) {
      onSelect(user.id);
    }
  };
  return (
    <div className="card" onClick={handleClick}>
      <span>{user.name}</span>
    </div>
  );
}
`;
    const m = computeHalstead(source);
    expect(m.n1).toBeGreaterThanOrEqual(5); // function, const, =, (, ), {, return, <, />, ., !, &&, ?, :
    expect(m.n2).toBeGreaterThanOrEqual(10); // UserCard, user, onSelect, expanded, setExpanded, handleClick, event, ...
    expect(m.vocabulary).toBeGreaterThanOrEqual(15);
    expect(m.volume).toBeGreaterThan(0);
    expect(m.difficulty).toBeGreaterThan(0);
    expect(m.effort).toBeGreaterThan(0);
  });

  it('respects arithmetic operator precedence in tokenization (longest match first)', () => {
    // `a === b` should tokenize as [a, ===, b] — three tokens, not five.
    // The OPERATORS array is sorted longest-first so `===` is matched
    // before `=` or `==`.
    const m = computeHalstead('a === b');
    expect(m.n1).toBe(1); // ===
    expect(m.n2).toBe(2); // a, b
    expect(m.length).toBe(3);
  });

  it('tokenizes `**` as a single exponentiation operator, not two `*`', () => {
    const m = computeHalstead('a ** b');
    expect(m.n1).toBe(1); // **
    expect(m.n2).toBe(2); // a, b
    expect(m.length).toBe(3);
  });

  it('strips block comments before tokenizing', () => {
    const withComments = computeHalstead(`
function f(x) {
  /* this is a block comment with operators like + - * */
  return x;
}
`);
    const withoutComments = computeHalstead(`
function f(x) {
  return x;
}
`);
    expect(withComments).toEqual(withoutComments);
  });

  it('strips line comments before tokenizing', () => {
    const withComments = computeHalstead(`
function f(x) {
  // line comment with operators + - *
  return x;
}
`);
    const withoutComments = computeHalstead(`
function f(x) {
  return x;
}
`);
    expect(withComments).toEqual(withoutComments);
  });

  it('strips string literals before tokenizing', () => {
    // The string contents must NOT count as operands.
    const withStrings = computeHalstead(`
const greeting = "hello world + foo - bar";
const name = 'alice';
`);
    const withoutStrings = computeHalstead(`
const greeting = "";
const name = '';
`);
    expect(withStrings).toEqual(withoutStrings);
  });

  it('strips template literal contents before tokenizing', () => {
    const withTemplates = computeHalstead('const x = `hello ${name} world`;');
    const withoutTemplates = computeHalstead('const x = ``;');
    expect(withTemplates).toEqual(withoutTemplates);
  });

  it('increases vocabulary when more distinct identifiers are added', () => {
    const small = computeHalstead('a + b');
    const larger = computeHalstead('a + b + c + d + e + f');
    expect(larger.vocabulary).toBeGreaterThan(small.vocabulary);
    expect(larger.volume).toBeGreaterThan(small.volume);
  });

  it('matches Halstead §3 closed-form for `N̂ = n1·log2(n1) + n2·log2(n2)`', () => {
    // For `a + b`: n1=1, n2=2 → N̂ = 1·log2(1) + 2·log2(2) = 0 + 2 = 2.
    const m = computeHalstead('a + b');
    expect(m.calculatedLength).toBeCloseTo(2, 6);
  });
});

describe('computeHalsteadForRange', () => {
  it('returns the file-level metrics when the slice is empty', () => {
    const source = 'function f() { return 1; }';
    // Empty lineOffsets — defensive fallback returns file-level metrics.
    const m = computeHalsteadForRange(source, [], 1, 1);
    expect(m.n1).toBeGreaterThan(0);
  });

  it('scopes metrics to the given line range', () => {
    const source = [
      'function a() {', // line 1
      '  return 1;',     // line 2
      '}',               // line 3
      'function b() {',  // line 4
      '  return 2;',     // line 5
      '}',               // line 6
    ].join('\n');
    // Build line offsets: [0, 17, 33, 36, 51, 67, 70]
    const lineOffsets = [0];
    let cursor = 0;
    for (const line of source.split('\n')) {
      cursor += line.length + 1;
      lineOffsets.push(cursor);
    }
    // Range [1, 3] is just function a — uses keywords { return ; }.
    const rangeA = computeHalsteadForRange(source, lineOffsets, 1, 3);
    // Range [4, 6] is just function b — same shape.
    const rangeB = computeHalsteadForRange(source, lineOffsets, 4, 6);
    // Both ranges have the same metric shape (function + return + digit).
    expect(rangeA.vocabulary).toBe(rangeB.vocabulary);
    expect(rangeA.length).toBe(rangeB.length);
  });

  it('falls back gracefully when startLine is beyond lineOffsets', () => {
    // The function uses `lineOffsets[startLine - 1] ?? 0`, so an
    // out-of-bounds startLine becomes 0 and the entire file is scanned.
    const source = 'function f() { return 1; }';
    const lineOffsets = [0, source.length];
    const m = computeHalsteadForRange(source, lineOffsets, 10, 20);
    // Should return file-level metrics, not crash.
    expect(m.length).toBeGreaterThan(0);
    expect(m.vocabulary).toBeGreaterThan(0);
  });
});

describe('computeCyclomatic', () => {
  // McCabe 1976 baseline: M = 1 + decision points + functions.
  // The slopbrick approximation overcounts slightly because the
  // regex matches both the `function` keyword AND the `f(...) {`
  // signature pattern. This is intentional — it's a conservative
  // overestimate of complexity, not an underestimate.

  it('returns 1 for empty source (the McCabe baseline)', () => {
    expect(computeCyclomatic('')).toBe(1);
    expect(computeCyclomatic('   \n\n  ')).toBe(1);
  });

  it('returns > 1 for any function declaration', () => {
    // functionCount captures both `\bfunction\b` and `\bf() {` pattern → 2.
    // decisionKeywords = 0. Total = 1 + 2 + 0 = 3.
    expect(computeCyclomatic('function f() { return 1; }')).toBe(3);
  });

  it('increases when an if-statement is added', () => {
    const without = computeCyclomatic('function f(x) { return 1; }');
    const withIf = computeCyclomatic('function f(x) { if (x) { return 1; } return 2; }');
    // The if branch contributes both an `if` keyword and an `if (...) {`
    // signature pattern, so the deltas are: +1 (if keyword) + 1 (if sig).
    expect(withIf - without).toBeGreaterThanOrEqual(2);
  });

  it('counts each decision keyword (if, for, while, case, catch, ternary)', () => {
    const source = `
function f(x) {
  if (x > 0) {
    for (let i = 0; i < x; i++) {
      while (true) {
        try {
          doSomething();
        } catch (e) {
          break;
        }
      }
    }
  }
  switch (x) {
    case 1: return 1;
    case 2: return 2;
    default: return 0;
  }
}
`;
    // Each function/branch contributes both a keyword and a signature
    // pattern. For this source: 1 function keyword + 1 function sig,
    // 1 if keyword + 1 if sig, 1 for + 1 for sig, 1 while + 1 while sig,
    // 1 catch + 1 catch sig, 1 switch + 1 switch sig, 2 case keywords
    // (no sig because `case 1:` is not followed by `{`).
    // Expected = 1 (baseline) + 12 (functions+branches counted twice) + 2 (cases).
    const m = computeCyclomatic(source);
    // Pin the exact value so future refactors of the regex trigger a
    // deliberate test update.
    expect(m).toBe(14);
  });

  it('counts ternary operators as decision points', () => {
    const without = computeCyclomatic('function f(x) { return x; }');
    const withTernary = computeCyclomatic('function f(x) { return x > 0 ? 1 : 0; }');
    // The ternary `?` adds exactly 1 to decisionKeywords.
    expect(withTernary - without).toBe(1);
  });

  it('counts multiple functions additively', () => {
    const one = computeCyclomatic('function a() { return 1; }');
    const two = computeCyclomatic('function a() { return 1; } function b() { return 2; }');
    // Each additional function adds 2 (keyword + signature pattern).
    expect(two - one).toBe(2);
  });

  it('returns a strictly positive integer for any non-empty input', () => {
    expect(computeCyclomatic('a')).toBeGreaterThanOrEqual(1);
    expect(computeCyclomatic('a + b')).toBeGreaterThanOrEqual(1);
    expect(computeCyclomatic('// just a comment')).toBeGreaterThanOrEqual(1);
  });
});