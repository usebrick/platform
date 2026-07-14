/**
 * Pure functions that operate on `@swc/core` AST nodes. They were
 * previously defined in `src/engine/visitor.ts` as local helpers; this
 * module is the per-framework home for the React walker.
 * The  re-exports of the templates/HTML helpers from
 * `src/engine/visitors/templates.ts` established the pattern. This
 * file is the React equivalent for SWC AST helpers.
 */

import type { ClassNameFact, ElementFact } from '../../types';

/**
 * Any AST node — we walk SWC's output dynamically, so each node is just
 * a record with arbitrary fields (`.type`, `.expression`, `.operator`,
 * `.value`, etc.). Using an index signature with `any` keeps the
 * per-node-type handlers readable without sacrificing type safety on
 * the parts that matter (the dispatch table keys, the `VisitorCtx`,
 * the `Fact` accumulators).
 *
 * `null` and `undefined` are valid at the root of the walk (parent of
 * the topmost node) and in optional positions of optional-chaining
 * expressions, so they are part of the union.
 */
export type AnyNode = { type?: string; [key: string]: any } | null | undefined;

/**
 * Runtime type guard for "object that is not null/array/primitive".
 * Accepts `unknown` because call sites (visitor, test fixtures) pass
 * raw values; the guard is what filters them.
 */
export function isObject(node: unknown): node is Record<string, unknown> {
  return typeof node === 'object' && node !== null && !Array.isArray(node);
}

export function isHookName(name: string): boolean {
  return name.startsWith('use') && name.length > 3 && name[3] === name[3]!.toUpperCase();
}

export function getNodeType(node: AnyNode): string | undefined {
  if (isObject(node) && typeof node.type === 'string') {
    return node.type;
  }
  return undefined;
}

export function spanStart(node: AnyNode): number | undefined {
  if (isObject(node) && isObject(node.span) && typeof node.span.start === 'number') {
    return node.span.start as number;
  }
  return undefined;
}

export function spanEnd(node: AnyNode): number | undefined {
  if (isObject(node) && isObject(node.span) && typeof node.span.end === 'number') {
    return node.span.end as number;
  }
  return undefined;
}

export function buildLineOffsets(source: string): number[] {
  const offsets: number[] = [0];
  let byteOffset = 0;
  for (let i = 0; i < source.length; i++) {
    const codePoint = source.codePointAt(i)!;
    const char = String.fromCodePoint(codePoint);
    if (char.length === 2) i++;
    if (char === '\n') {
      byteOffset += 1;
      offsets.push(byteOffset);
    } else if (char === '\r') {
      byteOffset += 1;
      if (i + 1 < source.length && source[i + 1] === '\n') {
        byteOffset += 1;
        i++;
      }
      offsets.push(byteOffset);
    } else if (char === '\u2028' || char === '\u2029') {
      byteOffset += 3;
      offsets.push(byteOffset);
    } else {
      byteOffset += Buffer.byteLength(char, 'utf-8');
    }
  }
  return offsets;
}

export function positionFromOffset(
  offset: number,
  lineOffsets: number[],
): { line: number; column: number } {
  // SWC spans are 1-based byte offsets; convert to 0-based.
  const byteOffset = Math.max(0, offset - 1);

  let low = 1;
  let high = lineOffsets.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (lineOffsets[mid]! <= byteOffset) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  const line = low;
  const column = byteOffset - lineOffsets[line - 1]! + 1;
  return { line, column };
}

export function positionFrom(
  node: AnyNode,
  lineOffsets: number[],
): { line: number; column: number } {
  const start = spanStart(node);
  if (start === undefined) return { line: 1, column: 1 };
  return positionFromOffset(start, lineOffsets);
}

export function endPositionFrom(
  node: AnyNode,
  lineOffsets: number[],
): { line: number; column: number } {
  const end = spanEnd(node);
  if (end === undefined) return { line: 1, column: 1 };
  return positionFromOffset(end, lineOffsets);
}

export function containsJsx(node: AnyNode): boolean {
  if (!isObject(node)) return false;
  const type = getNodeType(node);
  if (type === 'JSXElement' || type === 'JSXFragment') return true;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (containsJsx(item)) return true;
      }
    } else if (isObject(value)) {
      if (containsJsx(value)) return true;
    }
  }
  return false;
}

export function stringLiteralValue(node: AnyNode): string | undefined {
  if (isObject(node) && node.type === 'StringLiteral' && typeof node.value === 'string') {
    return node.value as string;
  }
  return undefined;
}

export function numericLiteralValue(node: AnyNode): string | undefined {
  if (isObject(node) && node.type === 'NumericLiteral' && typeof node.value === 'number') {
    return String(node.value);
  }
  return undefined;
}

export function templateLiteralValue(node: AnyNode): string | undefined {
  if (!isObject(node) || node.type !== 'TemplateLiteral') return undefined;
  const exprs = node.expressions;
  if (Array.isArray(exprs) && exprs.length === 0) {
    const quasis = node.quasis;
    if (Array.isArray(quasis) && quasis.length > 0 && isObject(quasis[0]) && typeof quasis[0].raw === 'string') {
      const cooked = quasis[0].cooked;
      return typeof cooked === 'string' ? cooked : (quasis[0].raw as string);
    }
  }
  return undefined;
}

export function staticClassValue(node: AnyNode): string | undefined {
  return stringLiteralValue(node) ?? templateLiteralValue(node);
}

export function jsxAttrName(node: AnyNode): string | undefined {
  if (!isObject(node) || node.type !== 'JSXAttribute') return undefined;
  const name = node.name;
  if (isObject(name) && typeof name.value === 'string') {
    return name.value as string;
  }
  if (isObject(name) && typeof (name as Record<string, unknown>).name === 'string') {
    return (name as Record<string, unknown>).name as string;
  }
  return undefined;
}

export function jsxElementName(node: AnyNode): string | undefined {
  if (!isObject(node)) return undefined;
  if (node.type === 'JSXOpeningElement' || node.type === 'JSXClosingElement') {
    const name = node.name;
    if (isObject(name) && typeof name.value === 'string') {
      return name.value as string;
    }
  }
  if (node.type === 'JSXElement') {
    return jsxElementName(node.opening);
  }
  return undefined;
}

export function extractElementFact(
  node: AnyNode,
  lineOffsets: number[],
): ElementFact | undefined {
  if (!isObject(node) || node.type !== 'JSXOpeningElement') return undefined;
  const tag = jsxElementName(node);
  if (!tag) return undefined;

  const attributes: Record<string, string | undefined> = {};
  const classNames: ClassNameFact[] = [];
  const eventHandlers: string[] = [];
  const attrs = node.attributes as AnyNode[];
  if (Array.isArray(attrs)) {
    for (const attr of attrs) {
      if (!isObject(attr) || attr.type !== 'JSXAttribute') continue;
      const name = jsxAttrName(attr);
      if (!name) continue;
      const raw = attr.value as AnyNode;
      const valueNode = unwrapJsxExpression(raw);
      const staticValue = stringLiteralValue(valueNode) ?? numericLiteralValue(valueNode);
      attributes[name] = staticValue;
      if (name === 'className' || name === 'class') {
        const classValue = staticClassValue(valueNode);
        if (classValue !== undefined) {
          const { line, column } = positionFrom(attr, lineOffsets);
          classNames.push({ value: classValue, line, column });
        }
      }
      if (name.toLowerCase().startsWith('on')) {
        eventHandlers.push(name);
      }
    }
  }
  const { line, column } = positionFrom(node, lineOffsets);
  return { tag, attributes, classNames, eventHandlers, line, column };
}

export function unwrapJsxExpression(node: AnyNode): AnyNode {
  if (isObject(node) && node.type === 'JSXExpressionContainer') {
    return node.expression as AnyNode;
  }
  return node;
}

export function unwrapArgument(node: AnyNode): AnyNode {
  if (
    isObject(node) &&
    (!('type' in node) || node.type === 'Argument') &&
    'expression' in node
  ) {
    return (node as Record<string, unknown>).expression as AnyNode;
  }
  return node;
}

export function getFunctionName(node: Record<string, unknown>): string | undefined {
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
    const id = node.identifier as AnyNode;
    if (isObject(id) && typeof id.value === 'string') {
      return id.value as string;
    }
  }
  return undefined;
}

export function sourceText(node: AnyNode, source: string): string {
  const start = spanStart(node);
  const end = spanEnd(node);
  if (start === undefined || end === undefined) return 'expr';
  return source.slice(Math.max(0, start - 1), Math.max(0, end - 1));
}
