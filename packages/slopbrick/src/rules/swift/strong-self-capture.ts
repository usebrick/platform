/**
 * Rule: swift/strong-self-capture
 *
 * Closures in Swift that capture `self` strongly. The classic
 * pattern is `loadData { self.foo = bar }` instead of
 * `loadData { [weak self] in self?.foo = bar }`. A strong `self`
 * capture creates a retain cycle: the closure keeps self alive,
 * self keeps the closure alive, and the cycle is only broken
 * when the runtime gives up and prints a leak.
 *
 * **Why this matters:**
 * - `self`-capturing closures inside UIKit / UIViewController
 *   code are the canonical example in the Swift docs. Apple
 *   SwiftLint (`explicit_self`, `weak_delegate`) flags similar
 *   patterns.
 * - AI agents write `loadData { self.foo = bar }` because it
 *   compiles and "looks normal" to the type-checker; the leak is
 *   invisible until you profile. Real Swift code uses
 *   `[weak self]` (or `[unowned self]` for guarantee-non-nil
 *   cases) on every closure whose lifetime can outlive `self`.
 * - We deliberately skip captures that already start with
 *   `[weak self]` or `[unowned self]` in their first line —
 *   those are the safe form.
 * - Severity: medium. Retain cycles leak memory; on iOS they
 *   grow until the OS jetsam kills the process.
 * - Default off (DORMANT) until calibrated on v9 Swift corpus.
 *
 * **Scope:** file-local. Stateful: we walk every `{` opening a
 * closure, look at the first line for a capture list, then count
 * `self.` references between the matching braces. Naive but the
 * Closure body shape in Swift is usually single-statement per
 * line and braces balance.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

export interface SwiftStrongSelfCaptureContext {
  // No configuration.
}

// Matches `self.` references inside a captured-body string scan.
const SELF_REF_REGEX = /\bself\.(?:\w+)/g;
// Capture-list form: anything starting with `[weak self]` or
// `[unowned self]` (or `[weak self, ...]`). We accept the bracket
// at the very start of the closure body or within it on the same line.
const CAPTURE_LIST_REGEX = /\[\s*(?:weak|unowned)\s+self\b/;

export const swiftStrongSelfCaptureRule = createRule<SwiftStrongSelfCaptureContext>({
  id: 'swift/strong-self-capture',
  category: 'logic',
  severity: 'medium',
  aiSpecific: true,
  description:
    'Closure captures `self` strongly — creates a retain cycle. Use `[weak self]` or `[unowned self]`.',
  create(_context: RuleContext): SwiftStrongSelfCaptureContext {
    return {};
  },
  analyze(_context: SwiftStrongSelfCaptureContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    // v0.24.0: Swift-only rule.
    if (!/\.swift$/i.test(facts.filePath)) return issues;

    // Walk the file linearly. For every `{` that is NOT a type/
    // dictionary-literal opener, look at the slice up to its
    // matching `}` and decide whether it has a strong-self capture.
    //
    // The closure-vs-method-body distinction is hard to resolve
    // without an AST. We use this heuristic: a `{` whose line
    // contains `func ` / `init` / `deinit` / computed-property
    // `get` / `set` BEFORE the `{` is a method / property body —
    // `self.` inside it is NOT a closure capture, so we skip it.
    // Closures are written as `{ ... }` (inline trailing-closure
    // form) or `{ params in ... }` — neither line has `func`
    // before the `{`.

    // Heuristic: a method / property body starts at a line where
    // `func` / `init` / `deinit` / `subscript` appears BEFORE
    // the `{`. Skip method-body self access — only flag true
    // closure captures. We deliberately do NOT include `get` or
    // `set` here because method names ending in `get` / `set`
    // (e.g. `api.get`) would false-trigger; computed-property
    // `get { ... }` syntax is rare enough that the small false
    // negative is acceptable.
    const METHOD_HEAD_REGEX = /\b(?:func|init\??|deinit|subscript)\b[^;{}\n]*$/m;

    let m: RegExpExecArray | null;
    SELF_REF_REGEX.lastIndex = 0;
    while ((m = SELF_REF_REGEX.exec(source)) !== null) {
      const selfIdx = m.index;
      // Find the enclosing `{` by walking backwards, tracking depth.
      let depth = 0;
      let openBrace = -1;
      for (let j = selfIdx - 1; j >= 0; j--) {
        const ch = source.charAt(j);
        if (ch === '}') depth++;
        else if (ch === '{') {
          if (depth === 0) {
            openBrace = j;
            break;
          }
          depth--;
        }
      }
      if (openBrace === -1) continue; // `self.` is at file top level.

      // Heuristic: a method / property body starts at a line where
      // `func` / `init` / `deinit` / `get` / `set` appears BEFORE
      // the `{`. Skip method-body self access — only flag true
      // closure captures.
      const openLineStart = source.lastIndexOf('\n', openBrace) + 1;
      const lineBeforeBrace = source.slice(openLineStart, openBrace);
      if (METHOD_HEAD_REGEX.test(lineBeforeBrace)) continue;

      // Look at the first 100 chars inside the `{` — capture-list
      // syntax must be on the line of (or just before) the closing
      // brace in Swift's `{ [unowned self] in ... }` form.
      const openingSlice = source.slice(openBrace, openBrace + 80);
      if (CAPTURE_LIST_REGEX.test(openingSlice)) continue;

      // We're now in a closure that captures `self` strongly.
      // Emit ONE issue per closure (not per `self.` reference) by
      // checking we haven't already emitted for this openBrace.
      // To keep the rule single-pass we just emit; a future
      // improvement could collapse by openBrace.
      const line = source.slice(0, openBrace).split('\n').length;
      issues.push({
        ruleId: 'swift/strong-self-capture',
        category: 'logic',
        severity: 'medium',
        aiSpecific: true,
        message:
          `closure at line ${line} captures self strongly — use [weak self] or [unowned self]`,
        line,
        column: 1,
        advice:
          'Capture the closure with `[weak self]` (or `[unowned self]` if you can ' +
          'guarantee non-nil): `[weak self] in self?.foo = bar`. Strong self capture ' +
          'creates a retain cycle — the closure keeps self alive, self keeps the ' +
          'closure alive, and the cycle is only broken when the runtime gives up ' +
          'and prints a leak. Apple\'s Swift docs use UIKit / UIViewController ' +
          'closures as the canonical example. AI agents write `loadData { self.foo = bar }` ' +
          'because it "just compiles"; the leak is invisible without profiling. ' +
          'Reference: swift/strong-self-capture v0.24.',
      });
    }
    return issues;
  },
});

export default swiftStrongSelfCaptureRule satisfies Rule<SwiftStrongSelfCaptureContext>;
