/**
 * Rule: dart/unwrapped-futures
 *
 * Async functions in Dart return a `Future<T>`. If the caller
 * doesn't `await` (or chain `.then`), errors are swallowed and
 * execution order is non-deterministic. AI-generated code often
 * "forgets" to await.
 *
 * **Why this matters:**
 * - Unawaited Future errors become silent: print to console,
 *   never reach the user.
 * - Async chains may execute in wrong order.
 * - Flutter "Lost connection" / "RenderFlex overflowed" errors
 *   are often traced to unawaited futures upstream.
 * - Severity: high. Real bugs, hard to trace.
 * - Default off (DORMANT) until v10.2 Dart corpus calibration.
 *
 * **v0.44.0: initial rule.**
 */

import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface DartUnwrappedFuturesContext {
  // No configuration.
}

const DART_FILE_REGEX = /\.dart$/i;
// Match calls like `getData()` or `fetchUser()` where the function
// is named and the call isn't followed by `await`, `.then`, `.catch`,
// `;` (statement boundary), or `//` (comment).
const UNWRAPPED_CALL_REGEX = /^\s*([a-z][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*;?\s*$/gm;

export const dartUnwrappedFuturesRule: Rule<DartUnwrappedFuturesContext> = createRule<DartUnwrappedFuturesContext>({
  id: 'dart/unwrapped-futures',
  category: 'logic',
  severity: 'high',
  description: 'Async call may not be awaited; errors could be silently swallowed.',
  aiSpecific: true,
  defaultOff: true,
  create(context: DartUnwrappedFuturesContext): DartUnwrappedFuturesContext {
    return context;
  },
  analyze(_context: DartUnwrappedFuturesContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    if (!DART_FILE_REGEX.test(facts.filePath ?? '')) return issues;
    const source = facts.v2?._source ?? '';
    if (!source) return issues;
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = (lines[i] ?? '').trim();
      // Skip lines starting with `await`, `return`, `//`, or assignment
      // (e.g. `x = fetch()` — assignment without await is still a bug
      // but the analyzer focuses on the simpler "expression statement"
      // case for v1).
      if (line.startsWith('await ')) continue;
      if (line.startsWith('return ')) continue;
      if (line.startsWith('//')) continue;
      if (line.startsWith('throw ')) continue;
      if (line.includes('=') && !line.startsWith('==')) continue;
      UNWRAPPED_CALL_REGEX.lastIndex = 0;
      const m = UNWRAPPED_CALL_REGEX.exec(line);
      if (m) {
        const fn = m[1] ?? '';
        // Skip common non-async identifiers
        if (['print', 'setState', 'runZoned', 'debugPrint'].includes(fn)) continue;
        issues.push({
          ruleId: 'dart/unwrapped-futures',
          category: 'logic',
          severity: 'high',
          aiSpecific: true,
          filePath: facts.filePath,
          message: `Call to \`${fn}()\` at line ${i + 1} is not awaited. Async errors may be silently swallowed.`,
          line: i + 1,
          column: 1,
        });
      }
    }
    return issues;
  },
});
