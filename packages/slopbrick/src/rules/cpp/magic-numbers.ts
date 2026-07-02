/**
 * Rule: cpp/magic-numbers
 *
 * Magic numbers in comparisons or returns: literal values that
 * aren't part of an allowlist of "obvious" constants (1024,
 * 65535, 86400, 3600, 1000, 100.0, 60, 24, 7, 365, 256, 255, hex)
 * AND aren't preceded by a `constexpr` / `const` named definition
 * on the same line / preceeding line.
 *
 * **Why this matters:**
 * - A magic number is a literal embedded in a comparison /
 *   return that the reader has to look up. Examples: `if (size
 *   > 1024)`, `return (status == 7)`. The reader sees `1024` /
 *   `7` and has no idea what those numbers mean.
 * - The fix is `constexpr int MAX_SIZE = 1024; if (size >
 *   MAX_SIZE)` — the named constant lives next to its value and
 *   can be searched.
 * - AI agents produce magic-number-heavy code because their
 *   training data is mostly examples where the agent didn't
 *   bother naming the constant.
 * - Severity: low. Stylistic / readability signal.
 * - Default off (DORMANT) until calibrated on v9 C++ corpus.
 *
 * **Scope:** file-local. Regex on the source text. We scan for
 * numeric literals in comparison contexts, then check the same
 * line + the immediately-previous line for a named definition.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface CppMagicNumbersContext {
  // No configuration.
}

// Allowlist of "obviously fine" numbers. Hex literals are
// allowed broadly; everything else must be on this list. We use a
// negative non-allowlist check below.
const MAGIC_NUMBER_REGEX = /\b(\d+(?:\.\d+)?)\b/g;

// Trim common shape: array index, ternary, bit-shift, etc.
const COMPARE_OR_RETURN_REGEX = /\b(?:if|while|return|for)\s*[\(\s]?[^;]*[<>=!][^;]*/;

export const cppMagicNumbersRule = createRule<CppMagicNumbersContext>({
  id: 'cpp/magic-numbers',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description:
    'Magic-number literal in a comparison / return — name it: `constexpr int MAX = 1024;`.',
  create(_context: RuleContext): CppMagicNumbersContext {
    return {};
  },
  analyze(_context: CppMagicNumbersContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.24.0: full C++ gate.
    if (!/\.(cpp|cc|cxx|h|hpp|hh|hxx|H)$/i.test(facts.filePath)) return issues;

    // Walk lines. For each line containing a comparison-shaped
    // expression, look for a numeric literal that isn't on the
    // allowlist and isn't preceded by a `constexpr` / `const`
    // definition on the same line.
    const lines = source.split('\n');
    const allowSet = new Set<string>([
      '1024', '65535', '65536', '86400', '3600',
      '1000', '100.0', '60', '24', '7', '365', '256', '255', '0',
      '1', '2', '3', '4', '5',
    ]);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (!COMPARE_OR_RETURN_REGEX.test(line)) continue;

      // Find numeric literals in this line.
      let m: RegExpExecArray | null;
      MAGIC_NUMBER_REGEX.lastIndex = 0;
      while ((m = MAGIC_NUMBER_REGEX.exec(line)) !== null) {
        const literal = m[0] ?? '';
        if (allowSet.has(literal)) continue;
        // Skip if the literal is inside `constexpr NAME = ...;`
        // on the same line. The `constexpr` declaration is the
        // whole point of the rule — it shouldn't self-flag.
        if (/\b(?:constexpr|const)\s+\w+\s*=\s*$/.test(line.slice(0, m.index).trimEnd())) continue;
        // Skip the previous line definition carry-over.
        const prevLine = i > 0 ? lines[i - 1] ?? '' : '';
        if (/\b(?:constexpr|const)\s+\w+\s*=\s*$/.test(prevLine.trim())) continue;

        issues.push({
          ruleId: 'cpp/magic-numbers',
          category: 'typo',
          severity: 'low',
          aiSpecific: true,
          message:
            `magic number ${literal} at line ${i + 1} — name it: constexpr int MAX = ${literal};`,
          line: i + 1,
          column: 1,
          advice:
            'Replace the bare literal with a named constant declared as ' +
            '`constexpr int MAX_SIZE = 1024;` (or `static constexpr`). ' +
            'The named constant lives next to its value, can be searched, ' +
            'and forces the reader to mean what they say. Magic numbers in ' +
            'comparisons hide intent ("7" against what?). AI agents produce ' +
            'magic-number-heavy code because their training-data examples ' +
            'rarely bother to name the constant. ' +
            'Reference: cpp/magic-numbers v0.24.',
        });
      }
    }

    return issues;
  },
});

export default cppMagicNumbersRule satisfies Rule<CppMagicNumbersContext>;
