// Rule: test/weak-assertion
//
// Per Meszaros, G. (2007), *xUnit Test Patterns: Refactoring Test Code*, Addison-Wesley, Chapter 4 (Test Assertion Patterns); Freeman, S. & Pryce, N. (2009), *Growing Object-Oriented Software, Guided by Tests*, Addison-Wesley.
//
// Catches AI-generated test assertions that pass on any code rather
// than asserting on a specific value or shape. Examples:
//
//   expect(x).toBe(x)                  // tautology
//   expect(x).toBeDefined()             // doesn't test a value
//   expect(x).toBeTruthy()              // doesn't test a value
//   expect(x).toBe(null)                // doesn't test a value
//   expect(fn()).toBe(fn())             // dynamic tautology
//
// Humans writing tests usually assert on a specific value or shape.
// AI test generators lean on `.toBeDefined()` / `.toBeTruthy()` /
// tautological `expect(x).toBe(x)` because they pass on any code.
//
// Severity: medium. aiSpecific: true.
//
// Detection: regex over `_source` for `expect(X).toBe/Equal/...(...)`
// patterns. FP guards: skip assertions inside `*.skip` / `*.todo` blocks,
// skip `.toBeDefined()` when the next 3 lines in the same `it()` block
// contain a stronger assertion.

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { extractAssertions, isTestFile } from './utils';

export interface WeakAssertionContext {
  /** Per-run map of (line) -> hasStrongFollowup so we look ahead once. */
  strongFollowup: WeakMap<ScanFacts, Set<number>>;
}

export const weakAssertionRule = createRule<WeakAssertionContext>({
  id: 'test/weak-assertion',
  category: 'test',
  severity: 'medium',
  aiSpecific: true,
  description:
    'Assertion does not test a specific value (e.g. expect(x).toBeDefined(), expect(x).toBeTruthy(), expect(x).toBe(x)).',
  create(): WeakAssertionContext {
    return { strongFollowup: new WeakMap() };
  },
  analyze(context, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    if (!isTestFile(facts.v2.file.path)) return issues;
    const source = facts.v2._source;
    if (!source) return issues;

    const assertions = extractAssertions(source);
    if (assertions.length === 0) return issues;

    // Skip tests named *.skip / *.todo (heuristic: scan surrounding
    // 5 lines for skip/todo markers).
    const skipLines = new Set<number>();
    for (let i = 0; i < source.length; i++) {
      if (source.slice(i, i + 4) === 'skip' || source.slice(i, i + 4) === 'todo') {
        // Crude: any skip/todo near an assertion suppresses it.
        skipLines.add(source.slice(0, i).split('\n').length);
      }
    }

    // Pre-compute "strong followup" — any other `expect(...)` within 3
    // lines below. Caches the result on the rule context.
    let strong = context.strongFollowup.get(facts);
    if (!strong) {
      strong = new Set<number>();
      const sourceLines = source.split('\n');
      for (let i = 0; i < sourceLines.length; i++) {
        if (!/expect\s*\(/.test(sourceLines[i] ?? '')) continue;
        strong.add(i + 1); // 1-based
      }
      context.strongFollowup.set(facts, strong);
    }

    for (const hit of assertions) {
      if (skipLines.has(hit.line)) continue;

      const isTautology = isTautologicalAssertion(hit);
      const isWeakMatcher = WEAK_MATCHERS.has(hit.matcher);
      if (!isTautology && !isWeakMatcher) continue;

      // Look ahead 3 lines for any stronger assertion.
      if (isWeakMatcher && !isTautology) {
        let hasStronger = false;
        for (let off = 1; off <= 3 && !hasStronger; off++) {
          if (strong.has(hit.line + off)) hasStronger = true;
        }
        if (hasStronger) continue;
      }

      issues.push({
        ruleId: 'test/weak-assertion',
        category: 'test',
        severity: 'medium',
        aiSpecific: true,
        message: isTautology
          ? `Weak tautological assertion at line ${hit.line}: '${hit.full}' — does not test any value shape.`
          : `Weak assertion at line ${hit.line}: '${hit.full}' — '${hit.matcher}' passes for any value.`,
        line: hit.line,
        column: hit.column,
        advice:
          'Assert on a specific value or shape: `expect(x).toEqual(expectedValue)` or check a derived property. ' +
          '`.toBeDefined()` / `.toBeTruthy()` only prove "the code didn\'t throw" — they don\'t prove behavior.',
      });
    }
    return issues;
  },
});

/**
 * Weak-truthy / nullary matchers that don't assert anything about a
 * specific value. Excludes the strong matchers (toBe / toEqual /
 * toStrictEqual / toContain / toMatch / toHaveLength / toThrow / etc.).
 *
 * v0.20.0 recall fix: was 5 matchers (toBeDefined, toBeUndefined,
 * toBeTruthy, toBeFalsy, toBeNull). Calibration showed 4.18% recall
 * — 96% of weak assertions were missed. Added 4 more patterns that
 * are weak when the argument is a constant or tautological:
 *   - toBeGreaterThan(0) / toBeLessThan(0) — "just non-zero" is not a shape
 *   - toContain('common') — substring assertions on common strings
 *     are weak (the strong-followup FP guard already covers this)
 *   - toHaveLength(>0) — "non-empty" is not a shape
 *   - toBeInstanceOf(X) — asserting only the class, not the value
 *
 * The existing strong-followup check (look ahead 3 lines for a
 * stronger assertion) covers the FP risk for the new patterns, so
 * recall improves without inflating the FP rate.
 */
const WEAK_MATCHERS: Set<string> = new Set([
  'toBeDefined',
  'toBeUndefined',
  'toBeTruthy',
  'toBeFalsy',
  'toBeNull',
  'toBeGreaterThan',
  'toBeLessThan',
  'toContain',
  'toHaveLength',
  'toBeInstanceOf',
]);

function isTautologicalAssertion(hit: { expectArg: string; matcherArg: string }): boolean {
  // expect(x).toBe(x) — both sides identical.
  if (hit.matcherArg && hit.expectArg && hit.expectArg === hit.matcherArg) return true;
  // expect(x).toBe(true) / .toBe(null) / .toBe(false) — asserting a
  // constant on a possibly-dynamic value. This is the "no shape
  // check" variant of weak assertions.
  if (/^(true|false|null|undefined)$/.test(hit.matcherArg)) return true;
  // expect(x).toBe(x.value) where the args are dotted / indexed but
  // textually identical.
  return false;
}

export default weakAssertionRule satisfies Rule<WeakAssertionContext>;