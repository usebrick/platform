/**
 * Rule: ts/never-vs-unknown
 *
 * A function whose return type annotation is `never` (e.g. `: never`)
 * but whose body has no `throw` statement, no infinite loop, and no
 * `process.exit(...)` call. The `never` return type means "this
 * function never returns" — it should be reserved for functions that
 * always throw, always loop forever, or always exit the process.
 *
 * **Why this matters:**
 * - AI agents use `never` as an "impossible" return type when they
 *   don't know what to return. Real engineers either return a
 *   concrete type (e.g. `void`, `Error`, `unknown`) or use
 *   `never` correctly (always throw).
 * - The misuse of `never` creates type-system holes that propagate
 *   to callers, often masking real bugs.
 * - Severity: low. The rule is a heuristic — `never` can also be
 *   legitimate for branch-exhaustive switch statements (e.g.
 *   `const _: never = checkExhaustiveness(x);`).
 * - Default off (DORMANT) until calibrated on v10 corpus.
 * The v10 corpus (576,750 files) is the source data; the rule is
 * DORMANT until a v10-specific precision/recall pass confirms
 * FPR stays below 0.5%.
 *
 * **Scope:** file-local. Uses regex on the source text + a simple
 * "no throw / no loop / no exit" check. This is a heuristic, not
 * a semantic analysis.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface TsNeverVsUnknownContext {
  // No configuration.
}

// Matches a function whose return type is `never`:
//   function foo(...): never { ... }
//   const foo = (...): never => { ... }
//   const foo: (...): never => ...
//   async function foo(...): Promise<never> { ... }
//   const foo: () => never = ...
const NEVER_RETURN_REGEX =
  /^[ \t]*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)[^{]*:\s*(?:Promise<)?never\b[^{]*\{/gm;

const THROW_OR_LOOP_REGEX =
  /\b(?:throw\b|while\s*\(|for\s*\(|process\.exit\b|System\.exit\b)/;

export const tsNeverVsUnknownRule = createRule<TsNeverVsUnknownContext>({
  id: 'ts/never-vs-unknown',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description: 'Return type `: never` but body has no throw / loop / exit — likely AI misuse',
  create(_context: RuleContext): TsNeverVsUnknownContext {
    return {};
  },
  analyze(_context: TsNeverVsUnknownContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;

    let match: RegExpExecArray | null;
    NEVER_RETURN_REGEX.lastIndex = 0;
    while ((match = NEVER_RETURN_REGEX.exec(source)) !== null) {
      const fnName = match[1];
      const startIdx = match.index;
      const line = source.slice(0, startIdx).split('\n').length;

      // Walk to the end of the function body by brace-matching.
      // (Heuristic: assume well-formed source; trust the engine's
      // parser to flag malformed files.)
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

      if (THROW_OR_LOOP_REGEX.test(body)) continue;

      issues.push({
        ruleId: 'ts/never-vs-unknown',
        category: 'typo',
        severity: 'low',
        aiSpecific: true,
        message: `Function '${fnName}' returns 'never' but its body has no throw, loop, or exit — likely AI misuse`,
        line,
        column: match[0].indexOf('never') + 1,
        advice:
          'The `never` return type means "this function never returns". ' +
          'Reserve it for functions that always throw, always loop, or ' +
          'always exit. For "impossible" branches, use a concrete type ' +
          '(`void`, `Error`, `unknown`) and an exhaustive check. ' +
          'Reference: ts/never-vs-unknown v0.19.',
      });
    }
    return issues;
  },
});

export default tsNeverVsUnknownRule satisfies Rule<TsNeverVsUnknownContext>;
