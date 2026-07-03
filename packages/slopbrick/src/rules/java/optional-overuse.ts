/**
 * Rule: java/optional-overuse
 *
 * `Optional.ofNullable(x).orElseThrow(...)` chains where a simple
 * null check or `Objects.requireNonNull(x)` would suffice. AI agents
 * default to Optional chains because their training data emphasizes
 * null-safety via Optional. Human code in performance-sensitive
 * paths often avoids the wrapper allocation.
 *
 * **Why this matters:**
 * - Each Optional.ofNullable() allocates a wrapper object. In hot
 *   paths (logging, validation, error handling), this is measurable.
 * - The pattern correlates with the v0.18.9 calibration's
 *   `ai/comment-ratio` (P 67.2%) — both AI-fingerprint signals.
 * - Severity: low. Optional chains are correct; the rule flags it
 *   as a stylistic signal of AI.
 * - Default off (DORMANT) until calibrated on v9 Java corpus.
 *
 * **Scope:** file-local. Regex on the source text.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface JavaOptionalOveruseContext {
  /** Min number of orElseThrow calls before the rule fires. Default: 2. */
  threshold: number;
}

const OR_ELSE_THROW_REGEX = /\.orElseThrow\s*\(/g;
const NULL_CHECK_REGEX = /Objects\.requireNonNull\s*\(|if\s*\([^)]*==\s*null\)\s*(?:throw|return)/g;

const DEFAULT_THRESHOLD = 2;

export const javaOptionalOveruseRule = createRule<JavaOptionalOveruseContext>({
  id: 'java/optional-overuse',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description: 'Optional chain over-use — null check or Objects.requireNonNull is faster',
  create(_context: RuleContext): JavaOptionalOveruseContext {
    return { threshold: DEFAULT_THRESHOLD };
  },
  analyze(context: JavaOptionalOveruseContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    if (!/\.java$/i.test(facts.filePath)) return issues;

    OR_ELSE_THROW_REGEX.lastIndex = 0;
    let orElseThrowCount = 0;
    let firstIdx = 0;
    let m: RegExpExecArray | null;
    while ((m = OR_ELSE_THROW_REGEX.exec(source)) !== null) {
      orElseThrowCount++;
      if (firstIdx === 0) firstIdx = m.index;
    }
    if (orElseThrowCount < context.threshold) return issues;

    // Bonus signal: file has 0 null-check alternatives (no Objects.requireNonNull
    // or explicit null checks). This suggests the author avoided null checks
    // in favor of Optional chains, which is the AI fingerprint.
    NULL_CHECK_REGEX.lastIndex = 0;
    const nullCheckCount = (source.match(NULL_CHECK_REGEX) ?? []).length;
    const optionalRatio = orElseThrowCount / Math.max(orElseThrowCount + nullCheckCount, 1);
    if (optionalRatio < 0.6) return issues; // author uses both, normal style

    const line = source.slice(0, firstIdx).split('\n').length;
    issues.push({
      ruleId: 'java/optional-overuse',
      category: 'typo',
      severity: 'low',
      aiSpecific: true,
      message: `${orElseThrowCount} .orElseThrow() calls with ${nullCheckCount} null checks — Optional chain over-use`,
      line,
      column: 1,
      advice:
        'Use Objects.requireNonNull(x, "msg") for null checks; reserve Optional for return values. ' +
        'AI agents default to Optional chains because their training data emphasizes null-safety. ' +
        'Real Java code uses null checks in hot paths. Reference: java/optional-overuse v0.26.0.',
    });
    return issues;
  },
});

export default javaOptionalOveruseRule satisfies Rule<JavaOptionalOveruseContext>;
