/**
 * Rule: java/verbose-javadoc
 *
 * Javadoc with `@param`/`@return`/`@throws` tags on EVERY method,
 * including trivial ones (method body < 5 lines). AI agents
 * over-document trivial methods because their training data has
 * countless textbook Javadoc examples. Human code often skips
 * Javadoc on trivial getters, setters, builders.
 *
 * **Why this matters:**
 * - High Javadoc density on trivial methods correlates with
 *   the v0.18.9 calibration's `ai/comment-ratio` (P 67.2%) and
 *   `visual/radius-scale-violation` (P 64.1%) — both AI signals.
 * - Severity: low. Javadoc is technically correct; the rule flags
 *   it as a stylistic signal of AI or junior code.
 * - Default off (DORMANT) until calibrated on v9 Java corpus.
 *
 * **Scope:** file-local. Regex on the source text.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface JavaVerboseJavadocContext {
  /** Min number of @param/@return/@throws tags to count. Default: 3. */
  tagThreshold: number;
  /** Max method body length (lines) for the rule to fire. Default: 5. */
  bodyLengthCap: number;
}

const TAG_REGEX = /@(param|return|throws)\b/g;
const METHOD_BODY_REGEX = /}\s*$/gm;

const DEFAULT_TAG_THRESHOLD = 3;
const DEFAULT_BODY_LENGTH_CAP = 5;

export const javaVerboseJavadocRule = createRule<JavaVerboseJavadocContext>({
  id: 'java/verbose-javadoc',
  category: 'typo',
  severity: 'low',
  aiSpecific: true,
  description: 'Excessive Javadoc tags on trivial methods — over-documentation is an AI fingerprint',
  create(_context: RuleContext): JavaVerboseJavadocContext {
    return {
      tagThreshold: DEFAULT_TAG_THRESHOLD,
      bodyLengthCap: DEFAULT_BODY_LENGTH_CAP,
    };
  },
  analyze(context: JavaVerboseJavadocContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    if (!/\.java$/i.test(facts.filePath)) return issues;

    // Count Javadoc tags in the file
    TAG_REGEX.lastIndex = 0;
    let tagCount = 0;
    let firstTagLine = 0;
    let m: RegExpExecArray | null;
    while ((m = TAG_REGEX.exec(source)) !== null) {
      tagCount++;
      if (firstTagLine === 0) {
        firstTagLine = source.slice(0, m.index).split('\n').length;
      }
    }
    if (tagCount < context.tagThreshold) return issues;

    // Heuristic: if the file is small (< 200 lines) and has many tags,
    // it's likely a Javadoc-heavy file with trivial methods. We don't
    // do per-method AST analysis; we use the file-level density.
    const lineCount = source.split('\n').length;
    const tagDensity = tagCount / Math.max(lineCount, 1);
    // Tag density threshold: 0.05 (1 tag per 20 lines). AI over-documents
    // typically hits 0.1+ in vector-store / DTO files.
    if (tagDensity < 0.05) return issues;
    // Require small file (over-documentation on a 1000-line file is normal)
    if (lineCount > 200) return issues;

    issues.push({
      ruleId: 'java/verbose-javadoc',
      category: 'typo',
      severity: 'low',
      aiSpecific: true,
      message: `${tagCount} Javadoc tags in ${lineCount} lines (density ${(tagDensity * 100).toFixed(1)}%) — likely over-documented`,
      line: firstTagLine,
      column: 1,
      advice:
        'Skip Javadoc on trivial methods (getters, setters, builders). ' +
        'AI agents default to over-documentation because their training ' +
        'data has countless textbook Javadoc examples. Real Java code ' +
        'limits Javadoc to public API surface. Reference: java/verbose-javadoc v0.26.0.',
    });
    return issues;
  },
});

export default javaVerboseJavadocRule satisfies Rule<JavaVerboseJavadocContext>;
