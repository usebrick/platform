/**
 * Rule: cs/async-without-await
 *
 * An `async` method body that has no `await` expression. The
 * method runs synchronously despite the `async` modifier. The
 * Microsoft C# coding conventions explicitly call this out:
 * "The body of an async method should contain at least one
 * await expression. If it doesn't, the method runs
 * synchronously, which can cause confusion and deadlocks."
 *
 * **Why this matters:**
 * - `async Task DoStuff() { SomeCall(); }` runs synchronously.
 *   The caller might `await` it expecting async behavior.
 * - The fix is either remove the `async` modifier (synchronous
 *   method returning Task) or add a real `await`.
 * - Severity: medium. Confusion, not a runtime bug, but
 *   indicates a design mistake.
 * - Default off (DORMANT) until v10.2 C# corpus calibration.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * `async Task` / `async ValueTask` methods that don't contain
 * `await`.
 *
 * **v0.43.0: initial rule.** Mirrors the Microsoft convention
 * "async methods should contain await".
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface CsAsyncWithoutAwaitContext {
  // No configuration.
}

const ASYNC_METHOD_REGEX = /\basync\s+(?:Task|ValueTask|Task<[^>]+>|ValueTask<[^>]+>|void)\s+\w+\s*\([^)]*\)\s*\{/g;
const AWAIT_REGEX = /\bawait\s+/g;

export const csAsyncWithoutAwaitRule = createRule<CsAsyncWithoutAwaitContext>({
  id: 'cs/async-without-await',
  category: 'logic',
  severity: 'medium',
  aiSpecific: false,
  description: '`async` method body has no `await` — runs synchronously, indicates design mistake',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    if (!facts.v2) return [];
    const source = facts.v2._source ?? '';
    if (!source) return [];

    const issues: Issue[] = [];
    const re = new RegExp(ASYNC_METHOD_REGEX.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const line = 1 + (source.substring(0, m.index).match(/\n/g)?.length ?? 0);
      const blockStart = m.index + m[0].length;
      // Find matching closing brace (simplified: look at next 2000 chars)
      const blockEnd = Math.min(source.length, blockStart + 2000);
      const block = source.substring(blockStart, blockEnd);

      if (!AWAIT_REGEX.test(block)) {
        issues.push({
          ruleId: 'cs/async-without-await',
          category: 'logic',
          severity: 'medium',
          aiSpecific: false,
          filePath: facts.filePath ?? '',
          line,
          column: 1,
          message: `C# \`async\` method \`${m[0].trim()}\` has no \`await\` — runs synchronously.`,
          advice: 'Either remove the `async` modifier (return `Task` synchronously) or add a real `await` expression. The Microsoft C# coding conventions explicitly call this out.',
        });
      }
    }

    return issues;
  },
});
