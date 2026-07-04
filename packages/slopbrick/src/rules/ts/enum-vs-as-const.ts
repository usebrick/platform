/**
 * Rule: ts/enum-vs-as-const
 *
 * The `enum` keyword used in user code. Modern TypeScript style guides
 * (TS-eslint, Google TS style) prefer `as const` objects over `enum`
 * because enums have surprising runtime semantics (reverse mappings,
 * const enums vs non-const, transpilation differences).
 *
 * **Why this matters:**
 * - AI agents default to `enum Foo { A, B, C }` because it appears in
 *   older TypeScript tutorials that dominate the training data.
 * - Real hand-written code in 2024+ codebases overwhelmingly uses
 *   `const Foo = { A: 'A', B: 'B', C: 'C' } as const` or
 *   `const Foo = ['A', 'B', 'C'] as const`.
 * - Severity: low. Enums aren't broken, they're just stylistically
 *   out of fashion. The rule is a soft signal of older code or
 *   AI-generated code.
 * - Default off (DORMANT) until calibrated on v9 corpus.
 *
 * **Scope:** file-local. Uses regex on the source text (facts.v2._source).
 * This is a syntactic detection — it doesn't distinguish between
 * `const enum` (TS-only, fully erased) and `enum` (runtime object).
 * Both are flagged.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface TsEnumVsAsConstContext {
  // No configuration.
}

// v0.39.0: also match `namespace Foo { ... }` — the modern-TS
// anti-pattern twin of `enum` (both are TS2-era runtime
// constructs that modern style guides discourage).
const ENUM_DECL_REGEX = /^[ \t]*(?:export\s+)?(?:const\s+)?(?:enum|namespace)\s+[A-Z_][A-Za-z0-9_]*\s*[\{]/gm;

export const tsEnumVsAsConstRule = createRule<TsEnumVsAsConstContext>({
  id: 'ts/enum-vs-as-const',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description: 'Uses `enum` — modern TS prefers `as const` objects',
  create(_context: RuleContext): TsEnumVsAsConstContext {
    return {};
  },
  analyze(_context: TsEnumVsAsConstContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;

    let match: RegExpExecArray | null;
    ENUM_DECL_REGEX.lastIndex = 0;
    while ((match = ENUM_DECL_REGEX.exec(source)) !== null) {
      // Compute line number from match.index
      const line = source.slice(0, match.index).split('\n').length;
      issues.push({
        ruleId: 'ts/enum-vs-as-const',
        category: 'typo',
        severity: 'low',
        aiSpecific: true,
        message: `'enum' is an AI / older-TS pattern — prefer 'as const' for a frozen object literal`,
        line,
        column: match[0].indexOf('enum') + 1,
        advice:
          'Replace `enum Foo { A, B }` with ' +
          '`const Foo = { A: "A", B: "B" } as const` (or ' +
          '`const Foo = ["A", "B"] as const`). Modern TS style guides ' +
          '(Google, TS-eslint) prefer `as const` because enums have ' +
          'surprising runtime semantics. Reference: ts/enum-vs-as-const v0.19.',
      });
    }
    return issues;
  },
});

export default tsEnumVsAsConstRule satisfies Rule<TsEnumVsAsConstContext>;
