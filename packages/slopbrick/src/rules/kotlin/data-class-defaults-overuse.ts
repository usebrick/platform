/**
 * Rule: kotlin/data-class-defaults-overuse
 *
 * Kotlin data classes declared with three or more constructor parameters
 * that all have default values (`= literal`). Real Kotlin engineers
 * reserve defaults for the genuinely optional fields (e.g. optional
 * configuration). AI agents produce "API-shaped" data classes where
 * every field has `= null` or `= emptyList()` because they imitate
 * Java/Swift optional patterns without thinking about whether the
 * field should really be optional.
 *
 * **Why this matters:**
 * - Defaulting every constructor parameter to a literal makes the
 *   no-arg constructor callable for every data class, which silently
 *   widens the API and obscures intent ("is `email` actually
 *   optional?"). Real Kotlin uses defaults sparingly.
 * - The pattern correlates with AI scaffolding: copy-pasted boilerplate
 *   where every field is "declared as optional" because the agent
 *   wants the no-arg form to compile.
 * - Severity: low. Defaults are legal Kotlin; the rule flags the
 *   overuse as an AI/stylistic signal.
 * - Default off (DORMANT) until calibrated on v9 Kotlin corpus.
 *
 * **Scope:** file-local. Regex on the source text. We look for the
 * `data class Name(<params>)` shape and count the number of `= literal`
 * defaults inside the parens. We deliberately count ≥ 3 because 1-2
 * defaults are routine (e.g. an optional callback).
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface KotlinDataClassDefaultsOveruseContext {
  /** Minimum number of `= literal` defaults for the rule to fire. Default: 3. */
  minDefaults: number;
}

const DATA_CLASS_HEAD_REGEX = /\bdata\s+class\s+\w+\s*\(/g;
// Parameters with `= literal` defaults. Matches `name: Type = value` —
// we don't try to validate the literal; we just count.
const DEFAULT_PARAM_REGEX = /=\s*(?:null|true|false|"[^"]*"|'[^']*'|[+-]?\d+(?:\.\d+)?\w*|emptyList\(\)|emptyMap\(\)|emptySet\(\)|listOf\(\)|mapOf\(\)|setOf\(\))/g;

const DEFAULT_MIN_DEFAULTS = 3;

export const kotlinDataClassDefaultsOveruseRule = createRule<KotlinDataClassDefaultsOveruseContext>({
  id: 'kotlin/data-class-defaults-overuse',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description:
    'data class with 3+ literal defaults — AI defaults every field rather than only the genuinely optional ones',
  create(_context: RuleContext): KotlinDataClassDefaultsOveruseContext {
    return { minDefaults: DEFAULT_MIN_DEFAULTS };
  },
  analyze(context: KotlinDataClassDefaultsOveruseContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.24.0: Kotlin-only rule. The `data class` keyword is
    // syntactically unique to Kotlin, but we still gate by extension
    // to keep the rule a clean Kotlin signal.
    if (!/\.kts?$/i.test(facts.filePath)) return issues;

    let m: RegExpExecArray | null;
    DATA_CLASS_HEAD_REGEX.lastIndex = 0;
    while ((m = DATA_CLASS_HEAD_REGEX.exec(source)) !== null) {
      const headStart = m.index;
      const openParen = source.indexOf('(', headStart);
      if (openParen === -1) continue;
      // Find the matching close paren — naive balance scan, fine for
      // a one-line `data class` head in 99% of real Kotlin code.
      let depth = 1;
      let i = openParen + 1;
      while (i < source.length && depth > 0) {
        const ch = source.charAt(i);
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        i++;
      }
      if (depth !== 0) continue;
      const paramBlock = source.slice(openParen + 1, i - 1);

      // Count `= literal` defaults inside the parens.
      DEFAULT_PARAM_REGEX.lastIndex = 0;
      let defaults = 0;
      let dm: RegExpExecArray | null;
      while ((dm = DEFAULT_PARAM_REGEX.exec(paramBlock)) !== null) {
        defaults++;
      }
      if (defaults < context.minDefaults) continue;

      const line = source.slice(0, headStart).split('\n').length;
      issues.push({
        ruleId: 'kotlin/data-class-defaults-overuse',
        category: 'typo',
        severity: 'low',
        aiSpecific: true,
        message:
          `data class with ${defaults} literal defaults at line ${line} — only optional fields should have defaults`,
        line,
        column: 1,
        advice:
          'Audit which fields are genuinely optional. Real Kotlin uses ' +
          'defaults sparingly (1-2 callbacks, the rest required). ' +
          'Defaulting every field makes the no-arg constructor callable ' +
          'for every data class and obscures intent. AI agents default ' +
          'every field because they imitate Java/Swift optional patterns. ' +
          'Reference: kotlin/data-class-defaults-overuse v0.24.',
      });
    }
    return issues;
  },
});

export default kotlinDataClassDefaultsOveruseRule satisfies Rule<KotlinDataClassDefaultsOveruseContext>;
