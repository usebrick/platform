// Rule: security/eval
//
// Per OWASP Foundation (2021), Top 10 Web Application Security Risks
// (A03:2021 — Injection); MDN (2024), "eval()" — "Never use eval()!".
//
// Catches `eval(...)`, `new Function(...)`, and `window.eval(...)` /
// `globalThis.eval(...)` calls. These are RCE vectors whenever the
// argument could be (or could become) attacker-controlled — the most
// common AI-tutored footgun is `eval(userInput)` / `eval(req.body.x)`
// in early prototypes.
//
// Detection (raw source scan):
//   1. `eval(<args>)` — the canonical RCE call
//   2. `new Function(<args>)` — function-constructor RCE
//   3. `window.eval(...)` / `globalThis.eval(...)` — qualified form
//
// v1 limitation: bracket-string indirection `globalThis['eval'](x)`
// is not caught. Acceptable trade-off — uncommon in real code.
//
// Severity: high (RCE).
// aiSpecific: false (this is a real security issue, not AI-specific —
// but AI-tutored code defaults to eval() far more than human code).

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { lineOfSource } from '../utils';

const EVAL_CALL_RE = /\beval\s*\(/g;
const NEW_FUNCTION_RE = /\bnew\s+Function\s*\(/g;
// window.eval( or globalThis.eval( — qualified forms
const QUALIFIED_EVAL_RE = /\b(?:window|globalThis|self|global)\s*\.\s*eval\s*\(/g;
// Block comment opener / closer. We blank-pad the contents so line
// numbers and column positions are preserved.
const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;

function scanForEvalCalls(source: string): Array<{ message: string; line: number; column: number }> {
  // Strip block comments so eval() inside `/* ... */` doesn't fire.
  // We blank-pad the contents to preserve line numbers / columns.
  const stripped = source.replace(BLOCK_COMMENT_RE, (match) =>
    match.replace(/[^\n]/g, ' '),
  );
  const hits: Array<{ message: string; line: number; column: number }> = [];
  let m: RegExpExecArray | null;

  EVAL_CALL_RE.lastIndex = 0;
  while ((m = EVAL_CALL_RE.exec(stripped)) !== null) {
    // Skip matches inside block comments or string literals — a heuristic:
    //   1. Count unescaped quotes before m.index on the same line; odd = inside string.
    //   2. If the immediately preceding chars are `//` on the same line, skip.
    const before = source.slice(0, m.index);
    const lastNewline = before.lastIndexOf('\n');
    const lineStart = lastNewline + 1;
    const lineBeforeMatch = source.slice(lineStart, m.index);
    if (lineBeforeMatch.includes('//')) continue;
    // If the line has an odd number of unescaped quotes before the match, we're
    // inside a string literal — skip. (e.g. `"use eval here"` inside a doc.)
    const quoteCount = (lineBeforeMatch.match(/['"`]/g) || []).length;
    if (quoteCount % 2 === 1) continue;

    hits.push({
      message:
        'Avoid eval(): it is an RCE vector whenever the argument is or becomes ' +
        'attacker-controlled. Use JSON.parse, a sandboxed expression parser, or ' +
        'a precomputed dispatch table.',
      line: lineOfSource(stripped, m.index),
      column: m.index - lineStart + 1,
    });
  }

  NEW_FUNCTION_RE.lastIndex = 0;
  while ((m = NEW_FUNCTION_RE.exec(stripped)) !== null) {
    const before = source.slice(0, m.index);
    const lastNewline = before.lastIndexOf('\n');
    const lineStart = lastNewline + 1;
    const lineBeforeMatch = source.slice(lineStart, m.index);
    if (lineBeforeMatch.includes('//')) continue;
    const quoteCount = (lineBeforeMatch.match(/['"`]/g) || []).length;
    if (quoteCount % 2 === 1) continue;

    hits.push({
      message:
        'Avoid new Function(): the function-constructor evaluates a string at ' +
        'runtime — same RCE risk as eval().',
      line: lineOfSource(stripped, m.index),
      column: m.index - lineStart + 1,
    });
  }

  QUALIFIED_EVAL_RE.lastIndex = 0;
  while ((m = QUALIFIED_EVAL_RE.exec(stripped)) !== null) {
    const before = source.slice(0, m.index);
    const lastNewline = before.lastIndexOf('\n');
    const lineStart = lastNewline + 1;
    const lineBeforeMatch = source.slice(lineStart, m.index);
    if (lineBeforeMatch.includes('//')) continue;
    const quoteCount = (lineBeforeMatch.match(/['"`]/g) || []).length;
    if (quoteCount % 2 === 1) continue;

    hits.push({
      message:
        'Avoid window.eval() / globalThis.eval() — same RCE risk as bare eval().',
      line: lineOfSource(stripped, m.index),
      column: m.index - lineStart + 1,
    });
  }

  return hits;
}

export const evalRule = createRule<RuleContext>({
  id: 'security/eval',
  category: 'security',
  severity: 'high',
  aiSpecific: false,
  description:
    'eval() / new Function() / window.eval() — RCE vector when the argument is attacker-controlled (OWASP A03:2021)',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    for (const hit of scanForEvalCalls(source)) {
      issues.push({
        ruleId: 'security/eval',
        category: 'security',
        severity: 'high',
        aiSpecific: false,
        message: hit.message,
        line: hit.line,
        column: hit.column,
        advice:
          'Replace eval() with JSON.parse, a sandboxed expression parser, or a ' +
          'precomputed dispatch table. If you must compile dynamic code, use a ' +
          'Web Worker with a strict CSP and no network access.',
      });
    }
    return issues;
  },
});

export default evalRule satisfies Rule<RuleContext>;
