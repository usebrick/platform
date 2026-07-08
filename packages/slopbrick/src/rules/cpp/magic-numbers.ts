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
 * - Default off (DORMANT) until calibrated on v10 C++ corpus.
 * The C++ subset of v10 (576,750 files) is the source data; the rule is
 * DORMANT because the v8 calibration on a smaller C++ slice had a
 * borderline FPR. Re-evaluation pending.
 *
 * **Scope:** file-local. Regex on the source text. We scan for
 * numeric literals in comparison contexts, then check the same
 * line + the immediately-previous line for a named definition.
 *
 * **v0.34.4: expanded allowSet + string/comment exclusion.**
 * The v9 C++ corpus has 220 TP / 786 FP per-file (ratio 0.86).
 * The FPs are concentrated in: (1) negative literals like
 * `-1` (sign-comparison idioms: `if (x != -1)`), (2) common
 * constants like `100`, `0xFF`, `(1 << 8)`, and (3) numeric
 * substrings inside string literals and comments
 * (`// status = 42` is not a real magic number). v0.34.4
 * addresses all three. Expected post-refinement ratio:
 * 1.0-1.2 (still DORMANT but better-targeted).
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
// v0.34.4: hex literals (`0x...`, `0X...`) are NOT matched by
// MAGIC_NUMBER_REGEX (which requires `\d+` digits, not `0x...`).
// We don't need a separate regex for them — they're already
// excluded by virtue of not matching.

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
    // v0.34.4: expanded allowSet. v0.24 had only 19 entries.
    // Added: negative literals (`-1`), round decimals (`100`,
    // `0.5`), 16/32-bit maxes (`4096`, `65536` already had
    // `65535`), 8086-segment limits (`0xFFFF`), file-size
    // caps (`512`, `2048`), and common lookup-table sizes.
    const allowSet = new Set<string>([
      // v0.24 originals
      '1024', '65535', '65536', '86400', '3600',
      '1000', '100.0', '60', '24', '7', '365', '256', '255', '0',
      '1', '2', '3', '4', '5',
      // v0.34.4 additions
      '-1',           // sentinel value for "not found" / "all bits set"
      '100',          // percent literal, very common
      '0.0', '0.5', '1.0', '2.0',  // common probability / ratio
      '4096',         // page size, hash bucket count
      '2048', '512',  // power-of-2 sizes
      '32', '64', '128',  // bit widths, byte sizes
      '16', '8',      // common small constants
      '50',           // percentile literal
    ]);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (!COMPARE_OR_RETURN_REGEX.test(line)) continue;

      // v0.34.4: skip if the entire line is a comment or
      // the matched position is inside a string literal or
      // comment. Quick heuristic: strip everything from `//` to
      // end-of-line, and strip `"..."` and `'...'` literals.
      const codeLine = line.replace(/\/\/.*$/, '').replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");

      // Find numeric literals in this line.
      let m: RegExpExecArray | null;
      MAGIC_NUMBER_REGEX.lastIndex = 0;
      while ((m = MAGIC_NUMBER_REGEX.exec(codeLine)) !== null) {
        const literal = m[0] ?? '';
        if (allowSet.has(literal)) continue;
        // Skip if the literal is inside `constexpr NAME = ...;`
        // on the same line. The `constexpr` declaration is the
        // whole point of the rule — it shouldn't self-flag.
        if (/\b(?:constexpr|const)\s+\w+\s*=\s*$/.test(codeLine.slice(0, m.index).trimEnd())) continue;
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
            'Reference: cpp/magic-numbers v0.34.4 (expanded allowSet + string/comment exclusion).',
        });
      }
    }

    return issues;
  },
});

export default cppMagicNumbersRule satisfies Rule<CppMagicNumbersContext>;
