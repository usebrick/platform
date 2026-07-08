/**
 * Rule: swift/implicitly-unwrapped-optional
 *
 * Implicitly unwrapped optionals in declarations: `var name: String!`,
 * `let config: Config!`, etc. They look like non-optionals but
 * silently become optionals at runtime, hiding the "may be nil"
 * fact from the type system until something tries to access them.
 *
 * **Why this matters:**
 * - IUOs exist for a real reason (bridging from Obj-C, two-phase
 *   init in UIKit, storyboard outlets) but using them everywhere
 *   is a strong AI signal — agents emit `var x: Type!` because
 *   the syntax survives a moment when the agent can't decide
 *   whether the value is nil or not. Real Swift code uses
 *   regular optionals (`Type?`) and unwraps them with `guard let`
 *   / `if let`.
 * - The Swift Language Guide and Apple's SwiftLint (`implicitly_unwrapped_optional`)
 *   both advise against IUOs for new properties. The pattern is
 *   tolerated only for legacy IBOutlets.
 * - We distinguish IUO declarations from `as!` (handled by the
 *   v0.24 `swift/force-unwrap` rule) and from `let foo = bar!`
 *   (also force-unwrap, not a declaration).
 * - Severity: low. Stylistic signal; the runtime behavior is the
 *   same as a regular optional that gets force-unwrapped.
 * - Default off (DORMANT) until calibrated on v10 Swift corpus.
 * The v10 corpus (576,750 files) is the source; the rule is
 * DORMANT because the v9 calibration on a smaller Swift slice
 * showed borderline FPR.
 *
 * **Scope:** file-local. Regex on the source text. We match
 * `var|let NAME: Type!` followed by `=` or `;` so we don't catch
 * `!` in expressions (those are force-unwraps, a different rule).
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface SwiftImplicitlyUnwrappedOptionalContext {
  // No configuration.
}

// `var|let` + space + name + colon + type-name + `!` + ( `=` or `;` or end of line ).
// Type-name allows letters, digits, `_`, `<`, `>`, `?`, `,`, whitespace (the
// `?` allows us to NOT match a real optional like `String?`).
const IUO_DECL_REGEX =
  /\b(?:var|let)\s+\w+\s*:\s*[A-Za-z_][\w<>?,\.\s]*!\s*[=;\n]/g;

export const swiftImplicitlyUnwrappedOptionalRule = createRule<SwiftImplicitlyUnwrappedOptionalContext>({
  id: 'swift/implicitly-unwrapped-optional',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description:
    'Implicitly unwrapped optional (var x: Type!) — declare as Type? and unwrap with guard let.',
  create(_context: RuleContext): SwiftImplicitlyUnwrappedOptionalContext {
    return {};
  },
  analyze(_context: SwiftImplicitlyUnwrappedOptionalContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.24.0: Swift-only rule.
    if (!/\.swift$/i.test(facts.filePath)) return issues;

    let m: RegExpExecArray | null;
    IUO_DECL_REGEX.lastIndex = 0;
    while ((m = IUO_DECL_REGEX.exec(source)) !== null) {
      // Guard: ensure the type doesn't already contain `?` before the
      // `!` (which would mean we matched `Type?!` — an unusual but
      // legal shape). If a `?` appears in the captured type before the
      // `!`, skip.
      const captured = m[0];
      const bangAt = captured.indexOf('!', captured.indexOf(':'));
      const between = captured.slice(captured.indexOf(':'), bangAt);
      if (between.includes('?')) continue;

      const line = source.slice(0, m.index).split('\n').length;
      issues.push({
        ruleId: 'swift/implicitly-unwrapped-optional',
        category: 'typo',
        severity: 'low',
        aiSpecific: true,
        message:
          `implicitly unwrapped optional at line ${line} — declare as Type? and unwrap explicitly`,
        line,
        column: 1,
        advice:
          'Declare as `var name: Type?` and unwrap with `guard let name else { ... }` ' +
          '(or `if let`). IUOs exist for a real reason (Obj-C bridging, IBOutlets, ' +
          'two-phase init), but using them everywhere is an AI signal — agents emit ' +
          '`var x: Type!` because the syntax survives the moment when the agent can\'t ' +
          'decide whether the value is nil. The type system silently says "non-optional" ' +
          'while the runtime says "may be nil". Apple SwiftLint\'s ' +
          '`implicitly_unwrapped_optional` rule flags the same pattern. ' +
          'Reference: swift/implicitly-unwrapped-optional v0.24.',
      });
    }
    return issues;
  },
});

export default swiftImplicitlyUnwrappedOptionalRule satisfies Rule<SwiftImplicitlyUnwrappedOptionalContext>;
