/**
 * Rule: ts/excessive-type-assertion
 *
 * A function body contains more than 3 `as` type assertions. Real
 * engineers fix the type definition when there are 3+ assertions in
 * one function — they don't keep bypassing the type system. AI
 * agents use `as` to make the code compile when they don't know
 * the right type.
 *
 * **Why this matters:**
 * - The `as` keyword is a type-system escape hatch. Using it more
 *   than 3 times in one function is a strong signal that the
 *   developer (or AI) is fighting the type system rather than
 *   working with it.
 * - The pattern correlates with the v0.18.9 calibration of
 *   `any`-density (88.3% precision on `dead/unused-local` and
 *   similar code-smell rules).
 * - Severity: low. Some legitimate code uses 3+ assertions
 *   (e.g. when working with untyped third-party APIs).
 * - Default off (DORMANT) until v10.2 corpus calibration.
 * The v10 corpus (576,750 files) is the source data; the rule is
 * DORMANT until a v10-specific precision/recall pass confirms
 * FPR stays below 0.5%.
 *
 * **Scope:** file-local. Uses regex on the source text + brace-
 * matching to count `as` per function. Heuristic, not semantic.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface TsExcessiveTypeAssertionContext {
  maxAssertionsPerFunction: number;
}

const DEFAULT_MAX = 3;

// Matches function declarations (named, arrow, or method).
const FN_DECL_REGEX =
  /^[ \t]*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\([^)]*\)\s*[^{]*\{|^\s*(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>\s*\{|^\s*(?:public|private|protected|static|async|abstract|readonly|\s)*\s*[A-Za-z_$][\w$]*\s*\([^)]*\)\s*:\s*[^{]*\{/gm;

// Counts non-typeof `as` occurrences (asserts, not `typeof`).
// Captured type: word chars + type-syntax. Brackets inside the
// character class are escaped (otherwise `]` would close the
// class prematurely).
const AS_REGEX = /(?<![\w$])as\s+(?!const)([A-Z][\w$.,<>\[\]|&]*)/g;

export const tsExcessiveTypeAssertionRule = createRule<TsExcessiveTypeAssertionContext>({
  id: 'ts/excessive-type-assertion',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description: 'Function with >3 `as` type assertions — likely AI fighting the type system',
  create(_context: RuleContext): TsExcessiveTypeAssertionContext {
    return { maxAssertionsPerFunction: DEFAULT_MAX };
  },
  analyze(context: TsExcessiveTypeAssertionContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;

    // v0.39.0: also flag `as unknown as X` — the double-cast
    // pattern is almost always an AI hack to force a type through
    // the compiler. One occurrence is enough to flag the file.
    const DOUBLE_CAST_REGEX = /\bas\s+unknown\s+as\s+/g;
    let dcMatch: RegExpExecArray | null;
    DOUBLE_CAST_REGEX.lastIndex = 0;
    while ((dcMatch = DOUBLE_CAST_REGEX.exec(source)) !== null) {
      const line = source.slice(0, dcMatch.index).split('\n').length;
      issues.push({
        ruleId: 'ts/excessive-type-assertion',
        category: 'typo',
        severity: 'medium',
        aiSpecific: true,
        message: `'as unknown as' bypasses type checking — fix the type instead of bypassing it`,
        line,
        column: dcMatch.index + 1,
        advice:
          'The `as unknown as` double-cast bypasses both the source and target type systems. ' +
          'Either narrow the source type properly (with a type guard) or fix the target type. ' +
          'Reference: ts/excessive-type-assertion v0.39.0.',
      });
    }

    let match: RegExpExecArray | null;
    FN_DECL_REGEX.lastIndex = 0;
    while ((match = FN_DECL_REGEX.exec(source)) !== null) {
      const startIdx = match.index;
      const openBraceIdx = source.indexOf('{', startIdx);
      if (openBraceIdx < 0) continue;
      let depth = 1;
      let i = openBraceIdx + 1;
      while (i < source.length && depth > 0) {
        const ch = source[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
      }
      const body = source.slice(openBraceIdx, i);
      const line = source.slice(0, startIdx).split('\n').length;

      // Count `as` assertions in the body. Filter out `as const`,
      // `as typeof`, and `as unknown` (these are common legitimate
      // patterns; the rule fires on the rest).
      let asCount = 0;
      const seen = new Set<string>();
      let asMatch: RegExpExecArray | null;
      AS_REGEX.lastIndex = 0;
      while ((asMatch = AS_REGEX.exec(body)) !== null) {
        const captured = asMatch[1] as string;
        if (seen.has(captured)) continue;
        seen.add(captured);
        asCount++;
      }

      if (asCount > context.maxAssertionsPerFunction) {
        issues.push({
          ruleId: 'ts/excessive-type-assertion',
          category: 'typo',
          severity: 'low',
          aiSpecific: true,
          message:
            `Function has ${asCount} 'as' assertions (max ${context.maxAssertionsPerFunction}); review whether the type definition or a type guard is missing`,
          line,
          column: 1,
          advice:
            'More than 3 `as` assertions in a function is a strong signal ' +
            'that the type is wrong, not the code. Fix the type definition ' +
            '(or use a type guard) instead of bypassing the type system. ' +
            'Reference: ts/excessive-type-assertion v0.19.',
        });
      }
    }
    return issues;
  },
});

export default tsExcessiveTypeAssertionRule satisfies Rule<TsExcessiveTypeAssertionContext>;
