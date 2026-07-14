/**
 * Rule: go/nil-slice-vs-empty
 *
 * A Go variable declared as `var x []int` (nil slice) but later
 * initialized with `x = []int{}` or `x = make([]int, n)`. The two
 * forms are semantically similar (both have len == 0) but the
 * inconsistency is a real AI signal: real code picks one form
 * and sticks with it.
 *
 * **Why this matters:**
 * - The Go community has a long-running discussion about nil vs
 *   empty slices. Rob Pike's standard is "prefer nil slices" but
 *   the codebase convention is what matters.
 * - AI agents sometimes declare a variable as `var x []int` and
 *   then initialize it as `x = []int{}` because the training data
 *   mixes both forms.
 * - The inconsistency is a stylistic signal, not a bug. JSON
 *   marshaling treats nil and empty slices differently (`null`
 *   vs `[]`) but that's the whole point — the developer should
 *   pick one.
 * - Severity: low. The rule is a heuristic.
 * - Default off (DORMANT) until v10.2 corpus calibration.
 * The v10 corpus (576,750 files) is the source data; the rule is
 * DORMANT until a v10-specific precision/recall pass confirms
 * FPR stays below 0.5%.
 *
 * **Scope:** file-local. Regex on the source text. Heuristic.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface GoNilSliceVsEmptyContext {
  // No configuration.
}

const NIL_SLICE_DECL_REGEX = /^[\t ]*var\s+([A-Za-z_][A-Za-z0-9_]*)\s+\[\][\w.*]+\b/gm;

const EMPTY_SLICE_ASSIGN_REGEX =
  /^[\t ]*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:\[\][\w.*]*\{\}|make\(\[\][\w.*]*)/gm;

export const goNilSliceVsEmptyRule = createRule<GoNilSliceVsEmptyContext>({
  id: 'go/nil-slice-vs-empty',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description: 'Variable declared `var x []int` but later assigned `x = []int{}` or `make([]int, n)` — pick one form',
  create(_context: RuleContext): GoNilSliceVsEmptyContext {
    return {};
  },
  analyze(_context: GoNilSliceVsEmptyContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;

    // Collect nil-slice-declared variable names.
    const nilDecls = new Map<string, number>(); // name -> line
    let m: RegExpExecArray | null;
    NIL_SLICE_DECL_REGEX.lastIndex = 0;
    while ((m = NIL_SLICE_DECL_REGEX.exec(source)) !== null) {
      nilDecls.set(m[1] as string, source.slice(0, m.index).split('\n').length);
    }
    if (nilDecls.size === 0) return issues;

    // Look for assignments to those names that use `[]T{}` or
    // `make([]T, ...)`.
    EMPTY_SLICE_ASSIGN_REGEX.lastIndex = 0;
    while ((m = EMPTY_SLICE_ASSIGN_REGEX.exec(source)) !== null) {
      const name = m[1] as string;
      if (!nilDecls.has(name)) continue;

      const declLine = nilDecls.get(name)!;
      const assignLine = source.slice(0, m.index).split('\n').length;
      if (assignLine <= declLine) continue;

      issues.push({
        ruleId: 'go/nil-slice-vs-empty',
        category: 'typo',
        severity: 'low',
        aiSpecific: true,
        message:
          `Variable '${name}' declared as nil slice (line ${declLine}) but assigned an empty slice (line ${assignLine}) — pick one form`,
        line: declLine,
        column: 1,
        advice:
          'Either declare as `var ' + name + ' = []int{}` or assign ' +
          'with `make([]int, 0)`. Choose nil/empty semantics from the ' +
          'API contract and use one consistent convention within the package. ' +
          'Reference: go/nil-slice-vs-empty v0.19.',
      });
    }
    return issues;
  },
});

export default goNilSliceVsEmptyRule satisfies Rule<GoNilSliceVsEmptyContext>;
