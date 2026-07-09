/**
 * Rule: dart/dynamic-call
 *
 * Calling methods on `dynamic` or via `as` cast bypasses type
 * safety. AI-generated Dart often uses `as` or implicit `dynamic`
 * to "make it compile" without realizing the runtime cost. The
 * Dart analyzer warns on these (DYNAMIC_CAST, INVOKE_ON_NON_NULL)
 * — the rule surfaces the same.
 *
 * **Why this matters:**
 * - `dynamic` defeats the type system: a typo becomes a runtime
 *   `NoSuchMethodError` instead of a compile error.
 * - `as` casts lose static analysis: refactor the type and
 *   the call site silently uses the wrong shape.
 * - Severity: medium. Not a bug at runtime, but a maintenance
 *   hazard and a sign the AI didn't fully model the type.
 * - Default off (DORMANT) until v10.2 Dart corpus calibration.
 *
 * **v0.44.0: initial rule.**
 */

import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface DartDynamicCallContext {
  // No configuration.
}

const DART_FILE_REGEX = /\.dart$/i;
// Match `xxx as SomeType` casts.
const AS_CAST_REGEX = /\bas\s+[A-Z][a-zA-Z0-9_<>,\s]*\b/g;
// Match `dynamic` declarations.
const DYNAMIC_TYPE_REGEX = /\bdynamic\s+[a-zA-Z_]/g;

export const dartDynamicCallRule: Rule<DartDynamicCallContext> = createRule<DartDynamicCallContext>({
  id: 'dart/dynamic-call',
  category: 'logic',
  severity: 'medium',
  description: 'dynamic or `as` cast bypasses Dart\'s type safety.',
  aiSpecific: true,
  defaultOff: true,
  create(context: DartDynamicCallContext): DartDynamicCallContext {
    return context;
  },
  analyze(_context: DartDynamicCallContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    if (!DART_FILE_REGEX.test(facts.filePath ?? '')) return issues;
    const source = facts.v2?._source ?? '';
    if (!source) return issues;
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (line.trimStart().startsWith('//')) continue;
      let match: RegExpExecArray | null;
      AS_CAST_REGEX.lastIndex = 0;
      while ((match = AS_CAST_REGEX.exec(line)) !== null) {
        const col = (match.index ?? 0) + 1;
        issues.push({
          ruleId: 'dart/dynamic-call',
          category: 'logic',
          severity: 'medium',
          aiSpecific: true,
          filePath: facts.filePath,
          message: `\`as\` cast at line ${i + 1} bypasses type safety. Consider a typed parameter or pattern match.`,
          line: i + 1,
          column: col,
        });
      }
      DYNAMIC_TYPE_REGEX.lastIndex = 0;
      while ((match = DYNAMIC_TYPE_REGEX.exec(line)) !== null) {
        const col = (match.index ?? 0) + 1;
        issues.push({
          ruleId: 'dart/dynamic-call',
          category: 'logic',
          severity: 'medium',
          aiSpecific: true,
          filePath: facts.filePath,
          message: `\`dynamic\` declaration at line ${i + 1} defeats Dart's type system. Use the concrete type.`,
          line: i + 1,
          column: col,
        });
      }
    }
    return issues;
  },
});
