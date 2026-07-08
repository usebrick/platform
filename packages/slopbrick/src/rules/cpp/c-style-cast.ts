/**
 * Rule: cpp/c-style-cast
 *
 * C-style casts in C++: `(int)x`, `(MyClass*)ptr`, `(const
 * Foo&)ref`. C-style casts are the union of `static_cast`,
 * `reinterpret_cast`, and `const_cast` — silently picking
 * whichever the compiler needs, which makes the cast impossible
 * to grep for and impossible to review.
 *
 * **Why this matters:**
 * - C++ provides four named casts (`static_cast`, `reinterpret_cast`,
 *   `const_cast`, `dynamic_cast`), each with one job. C-style casts
 *   hide which one is happening.
 * - The C++ Core Guidelines (ES.49: Use a `static_cast` /
 *   `reinterpret_cast` / `const_cast` rather than a C-style cast)
 *   call this out by name. Google style guide's `-Wold-style-cast`
 *   flags the same pattern.
 * - AI agents reach for `(int)x` because their training data has
 *   every C textbook example using it; modern C++ reviewers
 *   expect the named casts.
 * - We restrict to casts around a numeric type or with `*` /
 *   `&` in the inner part — `(Foo)x` is more likely a function-
 *   call-looking expression like `if (x)`. Casts of class types
 *   are still flagged, but we require an actual cast-shaped
 *   target.
 * - Severity: low. Stylistic / review-hygiene signal.
 * - Default off (DORMANT) until v10.2 corpus calibration with C++ files included.
 * The C++ subset of v10 (576,750 files) is the source data; the rule is
 * DORMANT because the v8 calibration on a smaller C++ slice had a
 * borderline FPR. Re-evaluation pending.
 *
 * **Scope:** file-local. Regex on the source text. We negate
 * matches that follow `static_cast` / `reinterpret_cast` /
 * `const_cast` / `dynamic_cast` (v0.34.3: tightened to also
 * exclude `(void)` casts and to require a primitive type or
 * `*` / `&` — the previous regex was too permissive on
 * template metaprogramming and `Type(...)` function-style
 * casts).
 *
 * **v0.34.3: refined regex selectivity.** The v9 C++ corpus
 * (5107 neg, 1655 pos) had 874/2885 = ratio 0.93 — fires
 * almost equally on both arms, diluting the signal. Two
 * refinements: (1) `NAMED_CAST_PREFIX_REGEX` now correctly
 * matches `static_cast<int>`-prefixed parens (the previous
 * version required `\($` at the end of the lookback slice,
 * which never matched because the slice ended with `>`).
 * (2) `(void)x` is excluded — it's a deliberate "discard"
 * idiom, not a real cast.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface CppCStyleCastContext {
  // No configuration.
}

// C-style cast regex. The outer `\(\s*  ...  \)\s*(\w+|[^a-zA-Z_])`
// shape requires a "target" character after the closing paren —
// this kills most `(x)`-shaped false positives like `if (x)` because
// `if (x)` is followed by `{`, which matches `[^a-zA-Z_]`.
//   Actually wait — `if (x) {` matches!  Because `[^a-zA-Z_]` matches
//   `{`.  The inner-content check below then rejects: `x` is not a
//   primitive type and has no `*` / `&`.
const C_STYLE_CAST_REGEX = /\(\s*(?:int|long|short|char|float|double|bool|unsigned\s+\w+|signed\s+\w+|size_t|[A-Za-z_]\w*(?:\s*[*,&][^)]*)?)\s*\)\s*(\w+|[^a-zA-Z_])/g;

// Lookbehind support is spotty, so we exclude `static_cast<...>`
// forms by re-checking the surrounding text per match. v0.34.3:
// the regex now ends with `\s*$` instead of `\s*\($`. The old
// version required the 40-char lookback slice to end with `>(`,
// which never matched because the slice ends with `>` (the paren
// we're matching is OUTSIDE the slice). The new version matches
// when the slice ends with `static_cast<...>` (no need for the
// closing paren, which is the one we're already at).
const NAMED_CAST_PREFIX_REGEX = /\b(?:static|reinterpret|const|dynamic)_cast\s*<[^>]*>\s*$/;

// `(void)x` is a deliberate "discard" idiom — the author is
// explicitly throwing away `x`. It is NOT a C-style cast.
// v0.34.3: exclude these.
const VOID_CAST_REGEX = /^\s*void\s*$/;

export const cppCStyleCastRule = createRule<CppCStyleCastContext>({
  id: 'cpp/c-style-cast',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description:
    'C-style cast `(int)x` — use static_cast / reinterpret_cast / const_cast so the kind is greppable.',
  create(_context: RuleContext): CppCStyleCastContext {
    return {};
  },
  analyze(_context: CppCStyleCastContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.24.0: full C++ gate.
    if (!/\.(cpp|cc|cxx|h|hpp|hh|hxx|H)$/i.test(facts.filePath)) return issues;

    let m: RegExpExecArray | null;
    C_STYLE_CAST_REGEX.lastIndex = 0;
    while ((m = C_STYLE_CAST_REGEX.exec(source)) !== null) {
      // Examine the inner content of the parens. We require a
      // numeric type, or a class name with `*` / `&`. Without
      // either, this is likely a function call or a control-flow
      // construct (e.g. `while (x)`), not a cast.
      const innerMatch = /\(\s*([^)]+?)\s*\)/.exec(m[0]) ?? [];
      const inner = (innerMatch[1] ?? '').trim();
      // v0.34.3: skip `(void)` deliberately.
      if (VOID_CAST_REGEX.test(inner)) continue;
      const looksLikeCast =
        /\b(?:int|long|short|char|float|double|bool|unsigned|signed|size_t)\b/.test(inner) ||
        /[*&]/.test(inner);
      if (!looksLikeCast) continue;

      // Skip if the immediately preceding text is the closing
      // angle-bracket of a named cast. Look back ~60 chars
      // (v0.34.3: increased from 40 to handle longer type names
      // like `static_cast<folly::Function<std::string()>>`).
      const before = source.slice(Math.max(0, m.index - 60), m.index);
      if (NAMED_CAST_PREFIX_REGEX.test(before)) continue;

      const line = source.slice(0, m.index).split('\n').length;
      issues.push({
        ruleId: 'cpp/c-style-cast',
        category: 'typo',
        severity: 'low',
        aiSpecific: true,
        message:
          `C-style cast at line ${line} — use static_cast / reinterpret_cast / const_cast`,
        line,
        column: 1,
        advice:
          'Use the named cast that matches the intent: `static_cast<int>(x)`, ' +
          '`reinterpret_cast<MyClass*>(p)`, `const_cast<...>(ref)`, or ' +
          '`dynamic_cast<Derived*>(base)` for runtime-checked downcasts. ' +
          'C-style casts silently pick whichever the compiler needs — ' +
          '`static_cast`, `reinterpret_cast`, OR `const_cast` — which makes ' +
          'them impossible to grep for and impossible to review. The C++ Core ' +
          'Guidelines (ES.49) call this out by name. AI agents reach for ' +
          '`(int)x` because of training-data C textbooks. ' +
          'Reference: cpp/c-style-cast v0.34.3 (refined regex selectivity).',
      });
    }
    return issues;
  },
});

export default cppCStyleCastRule satisfies Rule<CppCStyleCastContext>;
