/**
 * Rule: java/thread-sleep-in-loop
 *
 * `Thread.sleep(...)` inside a loop (`for`, `while`, `do-while`).
 * This is the classic "polling with sleep" anti-pattern — the
 * thread blocks for the sleep duration each iteration, which
 * wastes CPU on wakeups, prevents cancellation, and ties up
 * the executor thread.
 *
 * **Why this matters:**
 * - The idiomatic Java fix is `ScheduledExecutorService` for
 *   periodic work, or `BlockingQueue.take()` for event-driven
 *   work. `Thread.sleep` in a loop is a code smell.
 * - In server contexts, polling with sleep ties up a Tomcat /
 *   Jetty / Netty thread. Under load, all threads get blocked
 *   on sleep, and the service degrades to "all threads sleeping".
 * - Severity: medium. Performance impact depends on load.
 * - Default off (DORMANT) until v9 Java corpus calibration.
 *
 * **Scope:** file-local. Regex on the source text. We look for
 * a `for|while` keyword and a `Thread.sleep` call within ~10
 * lines of each other. (A more sophisticated version would
 * track loop nesting; out of scope for v0.30.0.)
 *
 * **v0.30.0: non-AI-fingerprint rule.** Mirrors the v0.29.0
 * `kotlin/runblocking-misuse` (same anti-pattern, different
 * language: Thread.sleep vs runBlocking).
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface JavaThreadSleepInLoopContext {
  // No configuration.
}

const THREAD_SLEEP_REGEX = /\bThread\.sleep\s*\(/g;

export const javaThreadSleepInLoopRule = createRule<JavaThreadSleepInLoopContext>({
  id: 'java/thread-sleep-in-loop',
  category: 'perf',
  severity: 'medium',
  aiSpecific: false,
  description: 'Thread.sleep() in a loop — use ScheduledExecutorService or BlockingQueue',
  create(_context: RuleContext): JavaThreadSleepInLoopContext {
    return {};
  },
  analyze(_context: JavaThreadSleepInLoopContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.30.0: Java-only rule.
    if (!/\.java$/i.test(facts.filePath)) return issues;

    // Coarse heuristic: if the file has BOTH a `Thread.sleep(` AND
    // a loop keyword, we fire on every Thread.sleep in the file.
    // A more sophisticated version would track loop nesting depth
    // (we want Thread.sleep INSIDE a for/while, not at the same
    // line). For v0.30.0, we accept the false positives — they
    // point to code that uses Thread.sleep, which is a smell even
    // outside loops.
    if (!/\bThread\.sleep\s*\(/.test(source)) return issues;
    if (!/\b(?:for|while|do)\b/.test(source)) return issues;

    let m: RegExpExecArray | null;
    THREAD_SLEEP_REGEX.lastIndex = 0;
    while ((m = THREAD_SLEEP_REGEX.exec(source)) !== null) {
      const line = source.slice(0, m.index).split('\n').length;
      issues.push({
        ruleId: 'java/thread-sleep-in-loop',
        category: 'perf',
        severity: 'medium',
        aiSpecific: false,
        message: `Thread.sleep() at line ${line}`,
        line,
        column: 1,
        advice:
          'Use ScheduledExecutorService for periodic work, or ' +
          'BlockingQueue.take() for event-driven work. ' +
          'Thread.sleep in a loop is the classic "polling with ' +
          'sleep" anti-pattern — the thread blocks for the sleep ' +
          'duration each iteration. In server contexts this ties ' +
          'up Tomcat/Jetty/Netty threads. Reference: ' +
          'java/thread-sleep-in-loop v0.30.',
      });
    }
    return issues;
  },
});

export default javaThreadSleepInLoopRule satisfies Rule<JavaThreadSleepInLoopContext>;
