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
 * - Default off (DORMANT) until v10 Java corpus calibration.
 * The v10 corpus (576,750 files) is the source; the rule is
 * DORMANT because the v9 calibration on a smaller Java slice
 * showed borderline FPR.
 *
 * **Scope:** file-local. v0.34.6: refined loop-detection.
 * The previous v0.30 version fired on every Thread.sleep if
 * the file ALSO had a `for`/`while`/`do` keyword anywhere —
 * even if the sleep was in a completely unrelated method
 * (e.g., a top-level `Thread.sleep` in `main` while a
 * different method had a `for` loop). The v9 Java corpus
 * (81891 neg, 10305 pos) had 2154 total fires with ratio
 * 0.97 (DORMANT) — too many FPs from this over-firing.
 *
 * **v0.34.6 algorithm:** linear walk over the source. We
 * track a `loopDepth` counter. A `loopDepth` increments
 * when we open a `{` that is the body of a `for`/`while`/`do`
 * (we detect this by walking forward from the keyword past
 * `(...)` or to `{`) and decrements when we close that `{`.
 * A `Thread.sleep` only fires if `loopDepth > 0` at its
 * position. We skip string literals, line comments, and
 * block comments to avoid false positives inside docs.
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

    if (!/\bThread\.sleep\s*\(/.test(source)) return issues;

    // v0.34.6: linear walk with brace-counting. We track
    //   - `braceStack`: positions of `{` not yet closed
    //   - `loopStack`: subset of braceStack that are loop-block opens
    //   - `loopDepth`: loopStack.length
    //
    // When we see `{`, push its position onto braceStack.
    // When we see `}`, pop braceStack. If the popped `{` is in
    // loopStack, also pop loopStack.
    //
    // A `{` is added to loopStack when we detect that the
    // most recent unmatched `for`/`while`/`do` keyword (with
    // no intervening `}`) opens a block at this `{`. For
    // `for`/`while`, we walk past `(...)` to find the body
    // `{`. For `do`, the `{` follows immediately (possibly
    // with whitespace).
    const braceStack: number[] = [];
    const loopSet = new Set<number>(); // positions of `{` that are loop-body opens
    // Tracks the position of the most recent unmatched loop
    // keyword (`for`/`while`/`do`). When we encounter its body
    // `{`, we add that `{` to loopSet.
    let pendingLoopKeyword: { kind: 'for' | 'while' | 'do'; idx: number; bodyBraceIdx?: number } | null = null;
    // Track whether we're inside `(...)` for `for`/`while`.
    let parenDepth = 0;

    type SleepEvent = { idx: number; loopDepth: number };
    const sleepEvents: SleepEvent[] = [];

    // Skip strings and comments to avoid matching inside them.
    let inString: false | '"' | "'" = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < source.length; i++) {
      const c = source[i] ?? '';
      const next = source[i + 1] ?? '';
      const prev = source[i - 1] ?? '';
      if (inLineComment) {
        if (c === '\n') inLineComment = false;
        continue;
      }
      if (inBlockComment) {
        if (c === '*' && next === '/') {
          inBlockComment = false;
          i++; // skip /
        }
        continue;
      }
      if (inString) {
        if (c === '\\') {
          i++; // skip escaped char
          continue;
        }
        if (c === inString) inString = false;
        continue;
      }
      if (c === '/' && next === '/') {
        inLineComment = true;
        i++; // skip /
        continue;
      }
      if (c === '/' && next === '*') {
        inBlockComment = true;
        i++; // skip *
        continue;
      }
      if (c === '"' || c === "'") {
        inString = c;
        continue;
      }
      // Track paren depth — useful for finding the body `{`
      // after `for (...)` / `while (...)`.
      if (c === '(') {
        parenDepth++;
        continue;
      }
      if (c === ')') {
        parenDepth = Math.max(0, parenDepth - 1);
        continue;
      }

      // Loop keyword detection (word boundary).
      if (/[A-Za-z_]/.test(c) && !/[A-Za-z0-9_]/.test(prev)) {
        const next3 = source.slice(i, i + 3);
        const next5 = source.slice(i, i + 5);
        const next2 = source.slice(i, i + 2);
        const after3 = source[i + 3] ?? '';
        const after5 = source[i + 5] ?? '';
        const after2 = source[i + 2] ?? '';
        if (next3 === 'for' && !/[A-Za-z0-9_]/.test(after3)) {
          pendingLoopKeyword = { kind: 'for', idx: i };
          i += 2; // skip "for"
          continue;
        }
        if (next5 === 'while' && !/[A-Za-z0-9_]/.test(after5)) {
          pendingLoopKeyword = { kind: 'while', idx: i };
          i += 4; // skip "while"
          continue;
        }
        if (next2 === 'do' && !/[A-Za-z0-9_]/.test(after2)) {
          pendingLoopKeyword = { kind: 'do', idx: i };
          i += 1; // skip "do"
          continue;
        }
      }

      if (c === '{') {
        braceStack.push(i);
        // If a loop keyword is pending AND parenDepth is 0
        // (for `for`/`while`, the body `{` comes after the
        // closing `)` of the header; for `do`, the body `{`
        // comes immediately), this `{` is a loop-body open.
        if (pendingLoopKeyword && parenDepth === 0) {
          loopSet.add(i);
          pendingLoopKeyword = null;
        }
      } else if (c === '}') {
        const popped = braceStack.pop();
        if (popped !== undefined && loopSet.has(popped)) {
          loopSet.delete(popped);
        }
        // If we close a brace while a loop keyword is pending,
        // the keyword's body was opened by an earlier `{` —
        // we missed it. Clear the pending state.
        if (pendingLoopKeyword) {
          pendingLoopKeyword = null;
        }
      } else if (c === 'T' && source.slice(i, i + 13) === 'Thread.sleep(') {
        sleepEvents.push({ idx: i, loopDepth: loopSet.size });
        i += 12; // skip "Thread.sleep"
      }
    }

    for (const ev of sleepEvents) {
      if (ev.loopDepth === 0) continue; // v0.34.6: not in a loop
      const line = source.slice(0, ev.idx).split('\n').length;
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
          'java/thread-sleep-in-loop v0.34.6 (refined to require ' +
          'Thread.sleep inside the loop block, not just in the file).',
      });
    }
    return issues;
  },
});

export default javaThreadSleepInLoopRule satisfies Rule<JavaThreadSleepInLoopContext>;