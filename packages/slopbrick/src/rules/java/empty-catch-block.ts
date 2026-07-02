/**
 * Rule: java/empty-catch-block
 *
 * `catch (Exception e) { }` with an empty (or whitespace-only) body.
 * Empty catch blocks silently swallow exceptions — the textbook
 * "AI scaffolding" pattern. Real Java code either logs the exception
 * (even at debug level) or re-throws.
 *
 * **Why this matters:**
 * - Empty catch blocks hide bugs. The most common scenario: AI
 *   generates a `try { ... } catch (Exception e) {}` block to make
 *   the code "look defensive" while silently dropping the error.
 * - SonarQube's `java:S1186` ("Methods should not be empty") and
 *   `java:S108` ("Empty blocks are likely bugs") flag the same
 *   pattern.
 * - Severity: medium. Empty catch blocks are usually bugs.
 * - Default off (DORMANT) until calibrated on v9 Java corpus.
 *
 * **Scope:** file-local. Regex on the source text. The regex matches
 * `catch (X) { }` and `catch (X) {\n}` (whitespace-only body). It
 * does not match multi-line empty bodies with comments.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface JavaEmptyCatchBlockContext {
  // No configuration.
}

// Match `catch (X) { }` with empty/whitespace body (single-line).
const SINGLE_LINE_EMPTY_CATCH_REGEX =
  /catch\s*\([^)]*\)\s*\{\s*\}/g;

export const javaEmptyCatchBlockRule = createRule<JavaEmptyCatchBlockContext>({
  id: 'java/empty-catch-block',
  category: 'logic',
  severity: 'medium',
  aiSpecific: true,
  description: 'Empty catch block — silently swallows exceptions',
  create(_context: RuleContext): JavaEmptyCatchBlockContext {
    return {};
  },
  analyze(_context: JavaEmptyCatchBlockContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.21.2: Java-only rule. The `catch (X) { }` regex is
    // syntactically similar to try/catch in TS/JS but the
    // patterns that matter here (singleton catch with no body)
    // are an idiomatic Java anti-pattern. Keep it scoped to Java.
    if (!/\.java$/i.test(facts.filePath)) return issues;

    let m: RegExpExecArray | null;
    SINGLE_LINE_EMPTY_CATCH_REGEX.lastIndex = 0;
    while ((m = SINGLE_LINE_EMPTY_CATCH_REGEX.exec(source)) !== null) {
      const line = source.slice(0, m.index).split('\n').length;
      issues.push({
        ruleId: 'java/empty-catch-block',
        category: 'logic',
        severity: 'medium',
        aiSpecific: true,
        message:
          `Empty catch block at line ${line} — exception is silently swallowed`,
        line,
        column: 1,
        advice:
          'Log the exception (`log.error("...", e)`), re-throw it, or both. ' +
          'Empty catch blocks hide bugs. The pattern is common in AI-generated ' +
          'code that wants to look defensive. Reference: java/empty-catch-block v0.20.',
      });
    }
    return issues;
  },
});

export default javaEmptyCatchBlockRule satisfies Rule<JavaEmptyCatchBlockContext>;
