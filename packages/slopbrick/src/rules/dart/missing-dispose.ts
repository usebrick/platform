/**
 * Rule: dart/missing-dispose
 *
 * In Flutter, controllers, subscriptions, and streams must be
 * `dispose()`d when the State is disposed. Forgetting to dispose
 * leads to memory leaks ("rendered off-screen widget" errors after
 * navigation). AI-generated Flutter code often has `.initialize()`
 * without matching `.dispose()`.
 *
 * **Why this matters:**
 * - TextEditingController, AnimationController, StreamSubscription
 *   all hold native resources.
 * - Leaks accumulate over navigation cycles; users see "Memory
 *   pressure" warnings and eventually OOM on long sessions.
 * - The fix is `controller.dispose()` in the State's `dispose()`.
 * - Severity: high. Real memory leak.
 * - Default off (DORMANT) until v10.2 Dart corpus calibration.
 *
 * **v0.44.0: initial rule.**
 */

import type { Issue, Rule, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface DartMissingDisposeContext {
  // No configuration.
}

const DART_FILE_REGEX = /\.dart$/i;
// Match `xxx = SomeController()` (likely a leak if no dispose).
const CONTROLLER_INIT_REGEX = /^\s*([a-z][a-zA-Z0-9_]*)\s*=\s*[A-Z][a-zA-Z0-9_]*Controller\s*\(/gm;
const CONTROLLER_TYPES = [
  'TextEditingController',
  'AnimationController',
  'ScrollController',
  'PageController',
  'TabController',
  'StreamController',
  'FocusNode',
];

export const dartMissingDisposeRule: Rule<DartMissingDisposeContext> = createRule<DartMissingDisposeContext>({
  id: 'dart/missing-dispose',
  category: 'logic',
  severity: 'high',
  description: 'Controller or subscription not disposed; possible memory leak in Flutter.',
  aiSpecific: true,
  defaultOff: true,
  create(context: DartMissingDisposeContext): DartMissingDisposeContext {
    return context;
  },
  analyze(_context: DartMissingDisposeContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    if (!DART_FILE_REGEX.test(facts.filePath ?? '')) return issues;
    const source = facts.v2?._source ?? '';
    if (!source) return issues;
    const lines = source.split('\n');
    // First pass: find controller initializations
    const foundControllers: { name: string; line: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      for (const ctrl of CONTROLLER_TYPES) {
        if (line.includes(`${ctrl}(`)) {
          const m = line.match(new RegExp(`(\\w+)\\s*=\\s*${ctrl}\\(`));
          if (m) {
            foundControllers.push({ name: m[1] ?? 'unknown', line: i + 1 });
          }
        }
      }
    }
    // Second pass: check that dispose() exists in the file
    const hasDispose = CONTROLLER_TYPES.some((c) =>
      new RegExp(`\\.dispose\\(\\s*\\)`, 'm').test(source),
    );
    if (!hasDispose) {
      for (const ctrl of foundControllers) {
        issues.push({
          ruleId: 'dart/missing-dispose',
          category: 'logic',
          severity: 'high',
          aiSpecific: true,
          filePath: facts.filePath,
          message: `\`${ctrl.name}\` (a controller/subscription) at line ${ctrl.line} but no matching \`.dispose()\` found. Possible memory leak.`,
          line: ctrl.line,
          column: 1,
        });
      }
    }
    return issues;
  },
});
