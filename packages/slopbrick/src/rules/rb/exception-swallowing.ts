/**
 * Rule: rb/exception-swallowing
 *
 * `rescue` block with empty body or just `nil` / `return`. The
 * error is caught, the log is suppressed, and the program
 * continues as if nothing happened.
 *
 * **Why this matters:**
 * - The Ruby style guide (rubocop/ruby-style-guide) explicitly
 *   recommends: "Rescuing StandardError or Exception is discouraged
 *   as it can catch errors you don't expect. Use a narrower
 *   exception class."
 * - A bare `rescue` (no class) catches StandardError which
 *   includes things like Interrupt, SystemExit, NoMemoryError.
 *   That's almost never what you want.
 * - An empty body suppresses the error entirely, making
 *   debugging impossible.
 * - Severity: medium. Silent failures cause production bugs
 *   that are hard to reproduce.
 * - Default off (DORMANT) until v10.2 Ruby corpus calibration.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * `rescue` blocks that are empty or have only a `nil` / `return`
 * statement.
 *
 * **v0.43.0: initial rule.**
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface RbExceptionSwallowingContext {
  // No configuration.
}

const EMPTY_RESCUE_REGEX = /\brescue(?:\s+[A-Z][A-Za-z]*(?:::\s*[A-Z][A-Za-z]*)*)?(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)?(?:\s*#[^\n]*)?\s*$/m;
const NIL_RESCUE_REGEX = /\brescue(?:\s+[A-Z][A-Za-z]*(?:::\s*[A-Z][A-Za-z]*)*)?(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)?(?:\s*#[^\n]*)?\s*\n\s*(?:nil|return(?:\s+nil)?)\s*$/m;

export const rbExceptionSwallowingRule = createRule<RbExceptionSwallowingContext>({
  id: 'rb/exception-swallowing',
  category: 'logic',
  severity: 'medium',
  aiSpecific: false,
  description: 'Empty `rescue` body or `rescue; nil` swallows the error — debug info is lost',
  create(context) {
    return context;
  },
  analyze(_context, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    if (!/\.rb$/i.test(facts.filePath ?? '')) return issues;

    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i] ?? '';
      const re = new RegExp(EMPTY_RESCUE_REGEX.source, 'm');
      if (re.test(lineText)) {
        issues.push({
          ruleId: 'rb/exception-swallowing',
          category: 'logic',
          severity: 'medium',
          aiSpecific: false,
          filePath: facts.filePath ?? '',
          line: i + 1,
          column: 1,
          message: `Empty \`rescue\` block. Exception is caught and silently ignored.`,
          advice: 'At minimum, log: `rescue => e; Rails.logger.error(e)`. Better: re-raise (`raise e`) or use a narrower exception class.',
        });
      }
      const re2 = new RegExp(NIL_RESCUE_REGEX.source, 'm');
      if (re2.test(lineText)) {
        issues.push({
          ruleId: 'rb/exception-swallowing',
          category: 'logic',
          severity: 'medium',
          aiSpecific: false,
          filePath: facts.filePath ?? '',
          line: i + 1,
          column: 1,
          message: `\`rescue; nil\` returns nothing. Error is caught and swallowed.`,
          advice: 'Log the exception or re-raise. `rescue => e; Rails.logger.error(e); raise` preserves both.',
        });
      }
    }

    return issues;
  },
});
