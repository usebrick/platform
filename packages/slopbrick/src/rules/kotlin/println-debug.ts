/**
 * Rule: kotlin/println-debug
 *
 * Top-level `println(...)` calls (more than one) in non-test Kotlin
 * source files. A single `println` in a CLI `main` is legitimate
 * output; two or more is an AI fingerprint — agents default to
 * `println` for "debug" because their training data has many
 * Kotlin examples that use it, and they copy-paste the pattern
 * repeatedly.
 *
 * **Why this matters:**
 * - `println` writes to stdout, has no level / no redaction / no
 *   sampling, and can't be silenced in production. Real Android and
 *   JVM apps use `android.util.Log` or `Timber` (with release trees
 *   that strip the calls) or a SLF4J-style facade.
 * - Multiple `println` calls in one file correlate with AI / junior
 *   code more strongly than a single deliberate print in a CLI
 *   script. The same heuristic the v0.20 Java
 *   `java/system-out-println` rule uses, ported to Kotlin.
 * - Severity: low. Stylistic / debug-noise signal.
 * - Default off (DORMANT) until calibrated on v9 Kotlin corpus.
 *
 * **Scope:** file-local. Regex on the source text. We count
 * `println(...)` calls that sit at the start of a line (allowing
 * leading whitespace). We don't count `Timber.plant(...)` or any
 * `Logger.X(...)` style — those are not the bug pattern.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface KotlinPrintlnDebugContext {
  /** Max number of println calls before the rule fires. Default: 1. */
  threshold: number;
}

const PRINTLN_REGEX = /^\s*println\s*\(/gm;
const DEFAULT_THRESHOLD = 1;

export const kotlinPrintlnDebugRule = createRule<KotlinPrintlnDebugContext>({
  id: 'kotlin/println-debug',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description: 'println(...) in production code — use Timber, android.util.Log, or an SLF4J facade',
  create(_context: RuleContext): KotlinPrintlnDebugContext {
    return { threshold: DEFAULT_THRESHOLD };
  },
  analyze(context: KotlinPrintlnDebugContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.24.0: Kotlin-only rule. `println` exists in many languages,
    // but the AI-fingerprint pattern (multiple ln calls in one file)
    // is calibrated on the v9 Kotlin corpus arm.
    if (!/\.kts?$/i.test(facts.filePath)) return issues;

    const matches: number[] = [];
    let m: RegExpExecArray | null;
    PRINTLN_REGEX.lastIndex = 0;
    while ((m = PRINTLN_REGEX.exec(source)) !== null) {
      matches.push(m.index);
    }
    if (matches.length <= context.threshold) return issues;

    const cap = Math.min(matches.length, 10);
    for (let i = 0; i < cap; i++) {
      const idx = matches[i];
      const line = source.slice(0, idx).split('\n').length;
      issues.push({
        ruleId: 'kotlin/println-debug',
        category: 'typo',
        severity: 'low',
        aiSpecific: true,
        message:
          `println(...) at line ${line} — use Timber or android.util.Log for production output`,
        line,
        column: 1,
        advice:
          'Replace with `Timber.plant(Timber.DebugTree())` then ' +
          '`Timber.d(...)`, or with an SLF4J facade. `println` writes ' +
          'to stdout with no level / no redaction and cannot be ' +
          'silenced in production. Multiple `println` calls in one ' +
          'file is an AI fingerprint — agents default to it because ' +
          'their training data has many copy-pasteable Kotlin examples. ' +
          'A single println in a `main` function is fine; 2+ is not. ' +
          'Reference: kotlin/println-debug v0.24.',
      });
    }
    return issues;
  },
});

export default kotlinPrintlnDebugRule satisfies Rule<KotlinPrintlnDebugContext>;
