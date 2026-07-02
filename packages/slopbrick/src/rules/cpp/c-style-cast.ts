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
 * - Default off (DORMANT) until calibrated on v9 C++ corpus.
 *
 * **Scope:** file-local. Regex on the source text. We negate
 * matches that follow `static_cast` / `reinterpret_cast` /
 * `const_cast` / `dynamic_cast`.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface CppCStyleCastContext {
  // No configuration.
}

const C_STYLE_CAST_REGEX = /\(\s*(?:int|long|short|char|float|double|bool|unsigned\s+\w+|signed\s+\w+|size_t|[A-Za-z_]\w*(?:\s*[*,&][^)]*)?)\s*\)\s*(\w+|[^a-zA-Z_])/g;

// Lookbehind support is spotty, so we exclude `static_cast<...>`
// forms by re-checking the surrounding text per match. We track
// the name of every named cast in the negative-set.
const NAMED_CAST_PREFIX_REGEX = /\b(?:static|reinterpret|const|dynamic)_cast\s*<[^>]*>\s*\($/;

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
      const looksLikeCast =
        /\b(?:int|long|short|char|float|double|bool|unsigned|signed|size_t)\b/.test(inner) ||
        /[*&]/.test(inner);
      if (!looksLikeCast) continue;

      // Skip if the immediately preceding text is the closing
      // angle-bracket of a named cast. Look back ~40 chars.
      const before = source.slice(Math.max(0, m.index - 40), m.index);
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
          'Reference: cpp/c-style-cast v0.24.',
      });
    }
    return issues;
  },
});

export default cppCStyleCastRule satisfies Rule<CppCStyleCastContext>;
