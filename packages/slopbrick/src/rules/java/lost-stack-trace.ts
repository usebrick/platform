/**
 * Rule: java/lost-stack-trace
 *
 * Catch block that throws a new exception WITHOUT including the
 * original exception as a cause. The original stack trace is lost
 * in the new exception, making debugging impossible.
 *
 * **Why this matters:**
 * - A `throw new RuntimeException("msg")` without the original
 *   exception discards the stack trace of the original error.
 *   When the new exception is logged, only "msg" is visible —
 *   the original cause, line numbers, and call stack are gone.
 * - The fix is `throw new RuntimeException("msg", e)` where `e`
 *   is the original exception. Java's `Throwable` constructor
 *   accepts a `cause` parameter that preserves the chain.
 * - The Raidar paper (ICLR 2024) found that LLMs tend to "polish"
 *   error handling by wrapping exceptions but losing context.
 *   This is a content-based detection of that pattern.
 * - Severity: medium. Lost stack traces make production debugging
 *   extremely difficult.
 * - Default on. Real engineering defect, not AI fingerprint.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * `throw new SomeException(...)` calls inside a catch block where
 * the args don't include the caught exception variable.
 *
 * **v0.35.1: Raidar-inspired content-based detection.** This is
 * the second v9 release with a content-based rule (the first was
 * v0.35.0's `java/suspicious-implementation`). The Raidar paper
 * (ICLR 2024) showed that LLMs are more likely to modify
 * human-written text than AI-generated text; the inverse
 * observation is that AI-generated code often has characteristic
 * "polish" patterns — like wrapping exceptions but losing the
 * original cause. This rule detects that pattern.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface JavaLostStackTraceContext {
  // No configuration.
}

// Match `throw new XxxException(args)`. We capture the args
// (group 1) for further inspection. We allow newlines in the args
// to catch multi-line throw statements.
const THROW_NEW_REGEX = /throw\s+new\s+(\w+(?:Exception|Error|Throwable))\s*\(([^)]*)\)/g;

// Match catch block declarations. We capture the exception
// variable name (group 1) so we can verify it's referenced in the
// throw statement.
const CATCH_REGEX = /catch\s*\(\s*(?:final\s+)?[\w<>,\s]+\s+(\w+)\s*\)\s*\{/g;

export const javaLostStackTraceRule = createRule<JavaLostStackTraceContext>({
  id: 'java/lost-stack-trace',
  category: 'logic',
  severity: 'medium',
  aiSpecific: false,
  description:
    'catch block throws a new exception without the original cause — stack trace is lost',
  create(_context: RuleContext): JavaLostStackTraceContext {
    return {};
  },
  analyze(_context: JavaLostStackTraceContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.35.1: Java-only rule.
    if (!/\.java$/i.test(facts.filePath)) return issues;
    // Skip test files — exceptions in tests are often shallow.
    if (/\/test\//i.test(facts.filePath) || /\/src\/test\//i.test(facts.filePath)) return issues;

    // Step 1: find all catch blocks and their exception variables.
    // Build a map: catch-block-end-position -> exception-variable-name.
    const catchBlocks: { start: number; end: number; exVar: string }[] = [];
    let cm: RegExpExecArray | null;
    CATCH_REGEX.lastIndex = 0;
    while ((cm = CATCH_REGEX.exec(source)) !== null) {
      // Find the matching closing brace by counting `{` and `}`.
      // We use a simple counter starting at 1 (the catch's own `{`).
      const catchStart = cm.index;
      const exVar = cm[1]!;
      let depth = 1;
      let i = cm.index + cm[0].length;
      while (i < source.length && depth > 0) {
        const ch = source[i]!;
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
      }
      catchBlocks.push({ start: catchStart, end: i, exVar });
    }

    // Step 2: find all `throw new XxxException(args)` calls.
    // For each, check if it's inside a catch block. If so, and the
    // args don't include the catch's exception variable, flag it.
    let m: RegExpExecArray | null;
    THROW_NEW_REGEX.lastIndex = 0;
    while ((m = THROW_NEW_REGEX.exec(source)) !== null) {
      const throwPos = m.index;
      const args = m[2]!.trim();

      // Find the enclosing catch block.
      const enclosing = catchBlocks.find(
        (cb) => cb.start < throwPos && throwPos < cb.end,
      );
      if (!enclosing) continue; // not inside a catch block

      // Check if the args reference the catch's exception variable.
      // The args might be: "", "msg", "msg", exVar, or
      // "msg", exVar (2 args). We look for the variable as a
      // standalone word in the args.
      const exVarPattern = new RegExp(`\\b${enclosing.exVar}\\b`);
      if (exVarPattern.test(args)) continue; // original exception is included

      const line = source.slice(0, throwPos).split('\n').length;
      issues.push({
        ruleId: 'java/lost-stack-trace',
        category: 'logic',
        severity: 'medium',
        aiSpecific: false,
        message:
          `throw new ${m[1]}(${args}) — original exception \`${enclosing.exVar}\` is not included as cause`,
        line,
        column: 1,
        advice:
          `The catch block declares exception variable \`${enclosing.exVar}\` ` +
          `but the throw statement doesn't include it as a cause. The ` +
          `original stack trace is lost. Fix: ` +
          `\`throw new ${m[1]}("...", ${enclosing.exVar})\` — ` +
          `the second argument to the exception constructor is the ` +
          `cause, which Java's Throwable framework preserves in the ` +
          `stack trace chain. Reference: java/lost-stack-trace v0.35.1 ` +
          `(Raidar-inspired content-based detection of AI-polished ` +
          `error handling).`,
      });
    }
    return issues;
  },
});

export default javaLostStackTraceRule satisfies Rule<JavaLostStackTraceContext>;
