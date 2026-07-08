/**
 * Rule: cs/empty-catch-block
 *
 * C# `catch` block that has an empty body, or just `throw;` (which
 * re-throws the same exception but provides no context). The
 * Microsoft C# coding conventions explicitly recommend against
 * empty catch blocks.
 *
 * **Why this matters:**
 * - An empty `catch { }` swallows the exception silently. The
 *   error is logged nowhere, retried nowhere, and re-raised
 *   nowhere. Production bugs become invisible.
 * - `catch (Exception) { throw; }` re-throws but adds no context.
 *   The exception bubbles up with the same message and no
 *   additional information.
 * - The fix is `catch (Exception ex) { logger.LogError(ex, "..."); }`
 *   or `catch (Exception ex) { throw new CustomException("...", ex); }`.
 * - Severity: medium. Silent failures are a debugging nightmare.
 * - Default off (DORMANT) until v10.2 C# corpus calibration.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * `catch (...) { }` or `catch (...) { throw; }`.
 *
 * **v0.43.0: initial rule.**
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface CsEmptyCatchBlockContext {
  // No configuration.
}

const EMPTY_CATCH = /\bcatch\s*\([^)]*\)\s*(?:\{\s*\}|\{\s*throw\s*;\s*\})/g;

export const csEmptyCatchBlockRule = createRule<CsEmptyCatchBlockContext>({
  id: 'cs/empty-catch-block',
  category: 'logic',
  severity: 'medium',
  aiSpecific: false,
  description: 'Empty C# catch block or `throw;` re-throw without context — silent failure',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const source = facts.v2._source ?? '';
    if (!source) return [];

    const issues: Issue[] = [];
    if (!/\.cs$/i.test(facts.filePath ?? "")) return issues;
    const re = new RegExp(EMPTY_CATCH.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const line = 1 + (source.substring(0, m.index).match(/\n/g)?.length ?? 0);
      const isReThrow = m[0].includes('throw');
      issues.push({
        ruleId: 'cs/empty-catch-block',
        category: 'logic',
        severity: 'medium',
        aiSpecific: false,
        filePath: facts.filePath ?? '',
        line,
        column: 1,
        message: isReThrow 
          ? `C# \`catch { throw; }\` re-throws without context. Same exception bubbles up unchanged.`
          : `C# empty \`catch\` block. Exception is silently swallowed.`,
        advice: isReThrow
          ? 'Wrap the original: `throw new CustomException("context here", ex);` so the stack trace shows what your code was trying to do.'
          : 'At minimum, log: `catch (Exception ex) { logger.LogError(ex, "context"); }`. Better: re-throw with a wrapper exception that includes your operation context.',
      });
    }

    return issues;
  },
});
