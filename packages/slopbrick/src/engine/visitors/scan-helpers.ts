// Pure (no closure state) helpers used by extractFacts() in
// src/engine/visitor.ts and by per-node-type handlers in
// ./dispatch.ts. Grouping them here lets the visitor shrink to a
// ~400-line orchestrator and makes each helper individually testable
// without spinning up the full walker.
//
// Every function in this module reads its inputs as arguments and
// returns a value or mutates the passed-in InternalFacts. None of
// them reach into module-level state or rely on closure capture from
// extractFacts().

// ---------------------------------------------------------------------------
// Directive parser
// ---------------------------------------------------------------------------

import type {
  DisabledLintRuleFact,
  OptimisticUpdateFact,
} from '../../types';
import type { JsxElementRecord } from '../types.js';
import { positionFromCharOffset } from './templates.js';

/**
 * Walk the source for `// slopbrick-disable` / `-next-line` / `/* ... *​/`
 * comments. Returns each entry with its scope + source location so the
 * per-issue filter can drop matching rules from results.
 */
export function extractDisabledRules(source: string): DisabledLintRuleFact[] {
  const results: DisabledLintRuleFact[] = [];
  function pushRules(rawRules: string, line: number, column: number, scope: 'line' | 'next-line' | 'block') {
    const ruleIds = rawRules
      .split(/,|\s+/)
      .map((r) => r.trim())
      .filter(Boolean);
    for (const ruleId of ruleIds) {
      results.push({ ruleId, line, column, scope });
    }
  }

  const lineRegex = /\/\/\s*slopbrick-disable\s+([^\r\n*]+)/g;
  let match: RegExpExecArray | null;
  while ((match = lineRegex.exec(source)) !== null) {
    const { line, column } = positionFromCharOffset(source, match.index);
    pushRules(match[1], line, column, 'line');
  }
  const nextLineRegex = /\/\/\s*slopbrick-disable-next-line\s+([^\r\n*]+)/g;
  while ((match = nextLineRegex.exec(source)) !== null) {
    const { line, column } = positionFromCharOffset(source, match.index);
    pushRules(match[1], line + 1, column, 'next-line');
  }
  const blockRegex = /\/\*\s*slopbrick-disable\s+([\s\S]*?)\*\//g;
  while ((match = blockRegex.exec(source)) !== null) {
    const { line, column } = positionFromCharOffset(source, match.index);
    pushRules(match[1], line, column, 'block');
  }
  return results;
}

// ---------------------------------------------------------------------------
// Node-type predicates
// ---------------------------------------------------------------------------

const CONDITIONAL_NODE_TYPES = new Set([
  'IfStatement',
  'ConditionalExpression',
  'SwitchStatement',
  'SwitchCase',
]);

const LOOP_NODE_TYPES = new Set([
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
]);

export function isConditionalNode(type: string | undefined): boolean {
  if (!type) return false;
  if (CONDITIONAL_NODE_TYPES.has(type)) return true;
  if (type === 'BinaryExpression' || type === 'LogicalExpression') return true;
  return false;
}

export function isLoopNode(type: string | undefined): boolean {
  if (!type) return false;
  return LOOP_NODE_TYPES.has(type);
}

// ---------------------------------------------------------------------------
// Brace / source-text scanner
// ---------------------------------------------------------------------------

/**
 * Locate the matching closing brace for an opening brace at
 * `openBraceIndex`. Handles nested braces, string literals
 * (single/double/template), and a crude regex heuristic (since the
 * AST doesn't tell us whether `/` is division or a regex literal).
 * Returns -1 if no match is found (unterminated brace).
 */
export function findMatchingBrace(source: string, openBraceIndex: number): number {
  let depth = 0;
  let inString: string | null = null;
  let inRegex = false;
  let inTemplate = false;
  for (let i = openBraceIndex; i < source.length; i++) {
    const ch = source[i];
    const prev = source[i - 1];
    if (inString) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }
    if (inRegex) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === '/') inRegex = false;
      continue;
    }
    if (inTemplate) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === '`') inTemplate = false;
      if (ch === '$' && source[i + 1] === '{') {
        const nested = findMatchingBrace(source, i + 1);
        if (nested === -1) return -1;
        i = nested;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === '`') {
      inTemplate = true;
      continue;
    }
    if (ch === '/' && prev !== '*') {
      // crude regex detection: / following =, (, [, ,, :, or returning operand
      if (i > 0 && /[=\(\[,;:!&|]/.test(prev ?? '')) {
        inRegex = true;
        continue;
      }
    }
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Scan for `try { ... } catch (...) { ... }` blocks where an await
 * inside the try is followed by a state setter, and the catch block
 * does NOT include a matching setter call (i.e. no rollback). The
 * logic/optimistic-no-rollback rule fires on these.
 */
export function extractOptimisticUpdates(source: string): OptimisticUpdateFact[] {
  const results: OptimisticUpdateFact[] = [];
  const setterRegex = /\b(set[A-Z]\w*)\s*\(/g;
  const awaitRegex = /\bawait\b/;
  const catchSetterRegex = /\bset[A-Z]\w*\s*\(/;
  const tryRegex = /try\s*\{/g;
  const NON_SETTERS = new Set(['setTimeout', 'setInterval']);

  let match: RegExpExecArray | null;
  while ((match = tryRegex.exec(source)) !== null) {
    const tryStart = match.index + match[0].length;
    const blockEnd = findMatchingBrace(source, tryStart - 1);
    if (blockEnd === -1) continue;

    const tryBody = source.slice(tryStart, blockEnd);
    const setterMatches = Array.from(tryBody.matchAll(setterRegex));
    if (setterMatches.length === 0) continue;
    if (!awaitRegex.test(tryBody)) continue;

    // Pick the first setter that appears before an await.
    const awaitIndex = tryBody.search(awaitRegex);
    const firstSetter = setterMatches.find(
      (m: RegExpExecArray) => m.index !== undefined && m.index < awaitIndex && !NON_SETTERS.has(m[1]),
    );
    if (!firstSetter || firstSetter.index === undefined) continue;

    // Look for a catch rollback after the try block.
    const afterTry = source.slice(blockEnd);
    const catchMatch = afterTry.match(/^\s*\}\s*catch\s*\(/);
    let hasCatchRollback = false;
    if (catchMatch && catchMatch.index !== undefined) {
      const catchStart = blockEnd + catchMatch.index + catchMatch[0].length;
      const catchBlockStart = source.indexOf('{', catchStart);
      if (catchBlockStart !== -1) {
        const catchBlockEnd = findMatchingBrace(source, catchBlockStart);
        if (catchBlockEnd !== -1) {
          const catchBody = source.slice(catchBlockStart + 1, catchBlockEnd);
          hasCatchRollback = catchSetterRegex.test(catchBody);
        }
      }
    }

    if (!hasCatchRollback) {
      const absPos = tryStart + firstSetter.index;
      const { line, column } = positionFromCharOffset(source, absPos);
      results.push({ setterName: firstSetter[1], line, column, hasCatchRollback: false });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Fetch() helpers (used by handleCallExpression in dispatch.ts)
// ---------------------------------------------------------------------------

import { isObject } from './react.js';
import { unwrapArgument } from './react.js';
import type { AnyNode } from './react.js';

export function fetchCallHasSignal(source: string, start: number, end: number): boolean {
  return /\bsignal\s*:/.test(source.slice(start, end));
}

export function fetchCallChecksOk(source: string, start: number, end: number): boolean {
  const text = source.slice(start, end);
  return /\.ok\b/.test(text) || /\.status\s*[=!]==/.test(text);
}

/**
 * Extract the URL argument from a `fetch(url, ...)` call when it's a
 * string literal. Returns undefined for template strings, identifiers,
 * or other dynamic expressions.
 */
export function extractFetchUrl(node: unknown, source: string): string | undefined {
  const args = (node as { arguments?: AnyNode[] }).arguments;
  if (!Array.isArray(args) || args.length === 0) return undefined;
  const first = unwrapArgument(args[0]);
  if (!isObject(first)) return undefined;
  if (first.type === 'StringLiteral' && typeof first.value === 'string') return first.value;
  if (first.type === 'Literal' && typeof first.value === 'string') return first.value;
  return undefined;
}

/**
 * Extract the `credentials` option value from a fetch options object,
 * when it's set to a string literal. Returns undefined for variable
 * references or when the option is omitted.
 */
export function extractFetchCredentials(
  node: unknown,
  _source: string,
): 'omit' | 'same-origin' | 'include' | undefined {
  const args = (node as { arguments?: AnyNode[] }).arguments;
  if (!Array.isArray(args) || args.length < 2) return undefined;
  const second = unwrapArgument(args[1]);
  if (!isObject(second)) return undefined;
  const props = (second as { properties?: AnyNode[] }).properties;
  if (!Array.isArray(props)) return undefined;
  for (const prop of props) {
    // SWC AST uses 'KeyValueProperty' for object literal properties.
    if (!isObject(prop) || prop.type !== 'KeyValueProperty') continue;
    const key = (prop as { key?: unknown }).key;
    const value = (prop as { value?: unknown }).value;
    if (!isObject(key) || !isObject(value)) continue;
    const keyName = key.type === 'Identifier' ? key.value : key.type === 'Literal' ? key.value : null;
    if (keyName !== 'credentials') continue;
    if (value.type === 'StringLiteral' || value.type === 'Literal') {
      const v = value.value;
      if (v === 'omit' || v === 'same-origin' || v === 'include') return v;
    }
  }
  return undefined;
}

/**
 * Extract the HTTP method from a fetch options object (or as the second
 * positional argument in fetch(url, { method: 'POST' })).
 */
export function extractFetchMethod(node: unknown, _source: string): string | undefined {
  const args = (node as { arguments?: AnyNode[] }).arguments;
  if (!Array.isArray(args) || args.length < 2) return undefined;
  const second = unwrapArgument(args[1]);
  if (!isObject(second)) return undefined;
  const props = (second as { properties?: AnyNode[] }).properties;
  if (!Array.isArray(props)) return undefined;
  for (const prop of props) {
    if (!isObject(prop) || prop.type !== 'KeyValueProperty') continue;
    const key = (prop as { key?: unknown }).key;
    const value = (prop as { value?: unknown }).value;
    if (!isObject(key) || !isObject(value)) continue;
    const keyName = key.type === 'Identifier' ? key.value : key.type === 'Literal' ? key.value : null;
    if (keyName !== 'method') continue;
    if (value.type === 'StringLiteral' || value.type === 'Literal') {
      const v = value.value;
      if (typeof v === 'string') return v.toUpperCase();
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// v2-build helpers (used by the ScanFactsV2 assembler)
// ---------------------------------------------------------------------------

import type { ComponentSizeFact } from '../../types';

/**
 * Walk the JSX tree to compute maximum nesting depth. Sort by line
 * then column so parents come before children; treat any earlier
 * line as closed.
 */
export function maxJsxNestingDepth(elements: JsxElementRecord[]): number {
  const sorted = [...elements].sort((a, b) =>
    a.line !== b.line ? a.line - b.line : a.column - b.column,
  );
  let max = 0;
  const open: Array<{ line: number; column: number; depth: number }> = [];
  for (const el of sorted) {
    while (open.length > 0 && open[open.length - 1]!.line < el.line) {
      open.pop();
    }
    const depth = open.length === 0 ? 1 : open[open.length - 1]!.depth + 1;
    if (depth > max) max = depth;
    open.push({ line: el.line, column: el.column, depth });
  }
  return max;
}

/**
 * Extract dependency names from a hook body's source text. Matches
 * identifier-like tokens separated by `,`. Dedupe while preserving
 * insertion order.
 */
export function extractDepNames(body: string): string[] {
  const names: string[] = [];
  const re = /\b([A-Za-z_$][\w$]*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    names.push(m[1]!);
  }
  return Array.from(new Set(names));
}

/**
 * Derive framework from a file extension. Falls back to the caller-
 * provided fallback for unknown extensions.
 */
export function deriveFramework(extension: string, fallback: string): import('../../types').Framework {
  const ext = extension.toLowerCase();
  if (ext === '.tsx' || ext === '.jsx') return 'react';
  if (ext === '.vue') return 'vue';
  if (ext === '.svelte') return 'svelte';
  if (ext === '.astro') return 'astro';
  if (ext === '.html' || ext === '.htm') return 'html';
  if (ext === '.ts' || ext === '.js') return 'react';
  return (fallback as import('../../types').Framework) ?? 'react';
}

// ---------------------------------------------------------------------------
// JSX branch counter (used by popFrame to stamp ComponentSizeFact)
// ---------------------------------------------------------------------------

/**
 * Count the JSX branch count in a component body — feeds into
 * `ComponentSizeFact.jsxBranchCount` which the
 * `component/giant-component` rule uses to weight score by JSX
 * complexity, not just raw line count.
 */
export function countJsxBranches(node: AnyNode): number {
  if (!isObject(node)) return 0;
  let count = 0;
  if (node.type === 'JSXExpressionContainer') {
    const expr = node.expression as AnyNode;
    if (isObject(expr) && expr.type === 'BinaryExpression' && expr.operator === '&&') {
      count += 1 + countJsxBranches(expr.left as AnyNode) + countJsxBranches(expr.right as AnyNode);
    }
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) count += countJsxBranches(item);
    } else if (isObject(value)) {
      count += countJsxBranches(value);
    }
  }
  return count;
}

// Re-export so handlers / tests can use ComponentSizeFact.
export type { ComponentSizeFact };

// ---------------------------------------------------------------------------
// useState binding helpers (used by handleVariableDeclarator in dispatch.ts)
// ---------------------------------------------------------------------------

import { positionFrom } from './react.js';

/**
 * v0.9.3: lifted from `src/engine/visitor.ts` to break the
 * visitor.ts ⇄ dispatch.ts circular dependency. Returns true when
 * the given VariableDeclarator node's initializer is a `useState(...)`
 * call. Used by the VariableDeclarator dispatch handler to detect
 * useState destructuring and emit a StateBinding.
 */
export function isUseStateDeclarator(node: Record<string, unknown>): boolean {
  const init = node.init as AnyNode;
  if (!isObject(init) || init.type !== 'CallExpression') return false;
  const callee = init.callee as AnyNode;
  return (
    isObject(callee) &&
    callee.type === 'Identifier' &&
    typeof callee.value === 'string' &&
    callee.value === 'useState'
  );
}

/**
 * v0.9.3: lifted from `src/engine/visitor.ts` to break the
 * visitor.ts ⇄ dispatch.ts circular dependency. Given a useState
 * declarator node like `const [foo, setFoo] = useState(0)`, extract
 * the value/setter binding names and their position. Returns undefined
 * if the pattern doesn't match (e.g. `const x = useState(0)` with no
 * array destructuring, or names that aren't plain identifiers).
 */
export function extractStateBinding(
  node: Record<string, unknown>,
  lineOffsets: number[],
): import('../../types').StateBinding | undefined {
  const id = node.id as AnyNode;
  if (!isObject(id) || id.type !== 'ArrayPattern') return undefined;
  const elements = id.elements as AnyNode[];
  if (!Array.isArray(elements) || elements.length === 0) return undefined;

  const valueNode = elements[0];
  const setterNode = elements[1];
  let valueName: string | undefined;
  let setterName: string | undefined;

  if (isObject(valueNode) && valueNode.type === 'Identifier' && typeof valueNode.value === 'string') {
    valueName = valueNode.value as string;
  }
  if (
    elements.length >= 2 &&
    isObject(setterNode) &&
    setterNode.type === 'Identifier' &&
    typeof setterNode.value === 'string'
  ) {
    setterName = setterNode.value as string;
  }

  if (valueName === undefined && setterName === undefined) return undefined;

  const { line, column } = positionFrom(id as AnyNode, lineOffsets);
  return {
    valueName,
    setterName,
    line,
    column,
    valueReferenced: false,
    setterReferenced: false,
  };
}
