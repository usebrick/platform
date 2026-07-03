/**
 * Rule: java/builder-overuse
 *
 * `@Builder` annotation (Lombok) on classes with < 4 fields. AI
 * agents default to the Builder pattern even for simple data
 * classes. Human code often uses plain constructors for small
 * data carriers.
 *
 * **Why this matters:**
 * - Builder adds Lombok dependency, increases bytecode, and adds
 *   a Builder inner class for every annotated class.
 * - The pattern correlates with the v0.18.9 calibration's
 *   `ai/comment-ratio` (P 67.2%) — both AI-fingerprint signals.
 * - Severity: low.
 * - Default off (DORMANT) until calibrated on v9 Java corpus.
 *
 * **Scope:** file-local. Heuristic regex; we look for @Builder on
 * a class with 1-3 fields (too few to justify a builder).
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface JavaBuilderOveruseContext {
  /** Max number of fields in the class for the rule to fire. Default: 3. */
  fieldCountCap: number;
}

const BUILDER_ANNOTATION_REGEX = /@Builder\b/;
const FIELD_DECL_REGEX = /(?:private|public|protected)\s+(?:final\s+)?[\w<>,\s]+\s+(\w+)\s*[=;]/g;

const DEFAULT_FIELD_COUNT_CAP = 3;

export const javaBuilderOveruseRule = createRule<JavaBuilderOveruseContext>({
  id: 'java/builder-overuse',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description: '@Builder on a class with few fields — plain constructor is simpler',
  create(_context: RuleContext): JavaBuilderOveruseContext {
    return { fieldCountCap: DEFAULT_FIELD_COUNT_CAP };
  },
  analyze(context: JavaBuilderOveruseContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    if (!/\.java$/i.test(facts.filePath)) return issues;

    BUILDER_ANNOTATION_REGEX.lastIndex = 0;
    const builderMatch = BUILDER_ANNOTATION_REGEX.exec(source);
    if (!builderMatch) return issues;
    const firstBuilderLine = source.slice(0, builderMatch.index).split('\n').length;

    // Count field declarations in the file (rough heuristic)
    FIELD_DECL_REGEX.lastIndex = 0;
    let fieldCount = 0;
    while (FIELD_DECL_REGEX.exec(source) !== null) {
      fieldCount++;
    }
    if (fieldCount > context.fieldCountCap) return issues; // too many fields, builder is justified

    issues.push({
      ruleId: 'java/builder-overuse',
      category: 'typo',
      severity: 'low',
      aiSpecific: true,
      message: `@Builder on a class with ${fieldCount} field(s) — plain constructor is simpler`,
      line: firstBuilderLine,
      column: 1,
      advice:
        'Use a plain constructor for classes with ≤ 3 fields. ' +
        'AI agents default to @Builder because their training data ' +
        'emphasizes the pattern. Builder adds Lombok dependency and ' +
        'a Builder inner class for every annotated class. ' +
        'Reference: java/builder-overuse v0.26.0.',
    });
    return issues;
  },
});

export default javaBuilderOveruseRule satisfies Rule<JavaBuilderOveruseContext>;
