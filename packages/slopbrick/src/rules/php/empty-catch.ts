/**
 * Rule: php/empty-catch
 *
 * PHP `catch` block that has an empty body. The exception is
 * silently swallowed. Note this is different from
 * `cs/empty-catch-block` because PHP doesn't require an exception
 * class in the catch clause (PHP 7+ does, but `catch (Exception)`
 * is common in legacy code).
 *
 * **Why this matters:**
 * - An empty `catch { }` or `catch (Exception $e) { }` suppresses
 *   the error entirely. Production bugs become invisible.
 * - The PHP-FIG PSR-12 style guide doesn't directly cover this,
 *   but the PHP community convention is "log or re-throw".
 * - The fix is `catch (Exception $e) { error_log($e->getMessage());
 *   throw $e; }` or `catch (Exception $e) { throw new
 *   RuntimeException("context", 0, $e); }`.
 * - Severity: medium. Silent failures are a debugging nightmare.
 * - Default off (DORMANT) until v10.2 PHP corpus calibration.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * `catch (...) { }` patterns.
 *
 * **v0.43.0: initial rule.**
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface PhpEmptyCatchContext {
  // No configuration.
}

const PHP_EMPTY_CATCH_REGEX = /\bcatch\s*(?:\([^)]*\))?\s*\{[\s]*\}/g;
const PHP_BARE_THROW_REGEX = /\bcatch\s*(?:\([^)]*\))?\s*\{\s*throw\s*;\s*\}/g;

export const phpEmptyCatchRule = createRule<PhpEmptyCatchContext>({
  id: 'php/empty-catch',
  category: 'logic',
  severity: 'medium',
  aiSpecific: false,
  description: 'Empty PHP catch block or bare `throw;` — silently swallows errors',
  create(context) {
    return context;
  },
  analyze(_context, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    if (!/\.php$/i.test(facts.filePath ?? '')) return issues;

    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i] ?? '';
      const re1 = new RegExp(PHP_EMPTY_CATCH_REGEX.source, 'g');
      if (re1.test(lineText)) {
        issues.push({
          ruleId: 'php/empty-catch',
          category: 'logic',
          severity: 'medium',
          aiSpecific: false,
          filePath: facts.filePath ?? '',
          line: i + 1,
          column: 1,
          message: `PHP empty \`catch\` block. Exception is silently swallowed.`,
          advice: 'At minimum, log: `catch (Exception $e) { error_log($e->getMessage()); }`. Better: re-throw with a wrapper exception that includes your operation context.',
        });
      }
      const re2 = new RegExp(PHP_BARE_THROW_REGEX.source, 'g');
      if (re2.test(lineText)) {
        issues.push({
          ruleId: 'php/empty-catch',
          category: 'logic',
          severity: 'medium',
          aiSpecific: false,
          filePath: facts.filePath ?? '',
          line: i + 1,
          column: 1,
          message: `PHP \`catch { throw; }\` re-throws without context.`,
          advice: 'Wrap the original: `throw new \\RuntimeException("context here", 0, $e);` so the stack trace shows what your code was trying to do.',
        });
      }
    }

    return issues;
  },
});
