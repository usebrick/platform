/**
 * Pure functions that operate on SWC AST nodes. Extracted from
 * `src/engine/visitor.ts` as part of the per-framework visitor refactor.
 * These helpers power logic/* and perf/* rules — guards for memo /
 * forwardRef wrappers, inline lambdas, Tamagui style prop names,
 * nullish-checked patterns, and chain-text collection.
 */

import type { AnyNode } from './react';
import { isObject, sourceText, positionFrom, jsxAttrName, jsxElementName, unwrapJsxExpression } from './react';
import type { KeyPropFact } from '../../types';

/**
 * v0.9.3: lifted from `src/engine/visitor.ts` to break the
 * visitor.ts ⇄ dispatch.ts circular dependency. Pure function —
 * no closure state. The dispatch handler for BinaryExpression uses
 * it to skip the right-hand side of `&&` chains (which would
 * double-count depth).
 */
export function isAndChainChild(parent: AnyNode): boolean {
  return isObject(parent) && parent.type === 'BinaryExpression' && parent.operator === '&&';
}

export function binaryAndChainLength(node: AnyNode): number {
  if (!isObject(node) || node.type !== 'BinaryExpression' || node.operator !== '&&') {
    return 1;
  }
  const left = node.left as AnyNode;
  const right = node.right as AnyNode;
  return binaryAndChainLength(left) + binaryAndChainLength(right);
}

export function collectChainText(node: AnyNode, source: string): string {
  return sourceText(node, source);
}

export function isIdentifierNode(
  node: AnyNode,
): node is { type: 'Identifier'; value: string } {
  return isObject(node) && node.type === 'Identifier' && typeof node.value === 'string';
}

export function isMemberExpressionNode(
  node: AnyNode,
): node is { type: 'MemberExpression'; object: AnyNode } {
  return isObject(node) && node.type === 'MemberExpression' && isObject(node.object);
}

export function isNullOrUndefinedLiteral(node: AnyNode): boolean {
  if (!isObject(node)) return false;
  if (node.type === 'NullLiteral') return true;
  return isIdentifierNode(node) && node.value === 'undefined';
}

/**
 * If `node` is a nullish comparison (`x === null`, `undefined === x`,
 * `x == null`, `x != null`, or any combination), returns the operand
 * being nullish-checked. Otherwise returns undefined.
 */
export function extractNullishChecked(node: AnyNode): AnyNode | undefined {
  if (
    !isObject(node) ||
    node.type !== 'BinaryExpression' ||
    !['===', '!==', '==', '!='].includes(node.operator as string)
  ) {
    return undefined;
  }
  const left = node.left as AnyNode;
  const right = node.right as AnyNode;
  const leftNullish = isNullOrUndefinedLiteral(left);
  const rightNullish = isNullOrUndefinedLiteral(right);
  if (leftNullish && (isIdentifierNode(right) || isMemberExpressionNode(right))) return right;
  if (rightNullish && (isIdentifierNode(left) || isMemberExpressionNode(left))) return left;
  return undefined;
}

/**
 * Recursively collect the operands of a chain of `&&` binary
 * expressions. Returns the leaf operands in left-to-right order.
 */
export function collectAndOperands(node: AnyNode, operands: AnyNode[] = []): AnyNode[] {
  if (isObject(node) && node.type === 'BinaryExpression' && node.operator === '&&') {
    collectAndOperands(node.left as AnyNode, operands);
    collectAndOperands(node.right as AnyNode, operands);
  } else {
    operands.push(node);
  }
  return operands;
}

/**
 * Detect a defensive `x && x.foo && x.foo.bar` chain — i.e. ≥3
 * identifier/member operands where each `object` matches the previous
 * operand's source text. Powers `logic/ghost-defensive`.
 */
export function isOptionalChainPattern(node: AnyNode, source: string): boolean {
  const operands = collectAndOperands(node);
  if (operands.length < 3) return false;
  let previous: AnyNode | undefined;
  for (let i = 0; i < operands.length; i++) {
    const operand = operands[i];
    let base = extractNullishChecked(operand);
    if (!base && (isIdentifierNode(operand) || isMemberExpressionNode(operand))) {
      base = operand;
    }
    if (!base) return false;
    if (i === 0) {
      if (!isIdentifierNode(base) && !isMemberExpressionNode(base)) return false;
      previous = base;
      continue;
    }
    if (!isMemberExpressionNode(base)) return false;
    const objectText = sourceText((base as { object: AnyNode }).object, source);
    const previousText = sourceText(previous as AnyNode, source);
    if (objectText !== previousText) return false;
    previous = base;
  }
  return true;
}

const TAMAGUI_STYLE_PROPS = new Set([
  'p', 'px', 'py', 'pt', 'pr', 'pb', 'pl',
  'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml',
  'g', 'gap', 'gapx', 'gapy',
  'f', 'fd', 'fw', 'fs', 'fb',
  'w', 'h', 'minw', 'minh', 'maxw', 'maxh',
  'c', 'color', 'bg', 'backgroundColor',
  'bc', 'borderColor', 'bw', 'borderWidth', 'br', 'borderRadius',
  'fontSize', 'fontFamily', 'fontWeight', 'letterSpacing', 'lh', 'lineHeight',
  'ta', 'textAlign', 'tt', 'textTransform',
  'o', 'opacity',
  'z', 'zi', 'zIndex',
  'top', 'left', 'right', 'bottom',
  'pos', 'position',
  'display', 'overflow', 'overflowX', 'overflowY',
]);

export function isTamaguiStyleProp(name: string): boolean {
  return TAMAGUI_STYLE_PROPS.has(name);
}

export const DOM_QUERY_METHODS = new Set([
  'querySelector',
  'querySelectorAll',
  'getElementById',
  'getElementsByClassName',
  'getElementsByTagName',
  'getElementsByName',
]);

export const USER_FACING_ATTRIBUTES = new Set([
  'title',
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'placeholder',
  'alt',
  'label',
  'description',
  'hint',
  'tooltip',
]);

export function isInlineFunction(node: AnyNode): boolean {
  if (!isObject(node)) return false;
  if (node.type === 'JSXExpressionContainer') {
    return isInlineFunction(node.expression as AnyNode);
  }
  return node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression';
}

export function isInlineObjectLiteral(node: AnyNode): boolean {
  if (!isObject(node)) return false;
  if (node.type === 'JSXExpressionContainer') {
    return isInlineObjectLiteral(node.expression as AnyNode);
  }
  return node.type === 'ObjectExpression';
}

export function isInlineArrayLiteral(node: AnyNode): boolean {
  if (!isObject(node)) return false;
  if (node.type === 'JSXExpressionContainer') {
    return isInlineArrayLiteral(node.expression as AnyNode);
  }
  return node.type === 'ArrayExpression';
}

export function isMapCall(node: AnyNode): boolean {
  if (!isObject(node) || node.type !== 'CallExpression') return false;
  const callee = node.callee as AnyNode;
  if (!isObject(callee) || callee.type !== 'MemberExpression') return false;
  const prop = callee.property as AnyNode;
  return isIdentifierNode(prop) && prop.value === 'map';
}

/**
 * Detect `React.memo(fn)` or `React.forwardRef(fn)` — or bare
 * `memo(fn)` / `forwardRef(fn)`.
 */
export function isMemoOrForwardRefCall(node: AnyNode): boolean {
  if (!isObject(node) || node.type !== 'CallExpression') return false;
  const callee = node.callee as AnyNode;
  // bare: memo(fn) / forwardRef(fn)
  if (isIdentifierNode(callee)) {
    return callee.value === 'memo' || callee.value === 'forwardRef';
  }
  // member: React.memo(fn) / React.forwardRef(fn)
  if (isObject(callee) && callee.type === 'MemberExpression') {
    const prop = callee.property as AnyNode;
    return isIdentifierNode(prop) && (prop.value === 'memo' || prop.value === 'forwardRef');
  }
  return false;
}

/**
 * SWC wraps each call argument in an `arguments[i] = { expression: fn }`
 * node (ExprOrSpread), so the function's direct parent is NOT the
 * CallExpression. Walk the path looking for a memo/forwardRef call that
 * contains this function.
 */
export function isWrappedInMemoOrForwardRef(path: AnyNode[], fn: AnyNode): boolean {
  for (let i = path.length - 1; i >= 0; i--) {
    const node = path[i];
    if (!isObject(node) || node.type !== 'CallExpression') continue;
    const args = (node as { arguments?: unknown }).arguments;
    if (!Array.isArray(args)) continue;
    for (const arg of args) {
      if (!isObject(arg)) continue;
      const expr = (arg as { expression?: AnyNode }).expression;
      if (expr === fn) {
        return isMemoOrForwardRefCall(node);
      }
    }
  }
  return false;
}

/**
 * Extract a `KeyPropFact` from a JSX opening element. Returns
 * `valueType: 'missing'` if the element has no `key` prop and isn't
 * inside a `.map()` callback. Powers `logic/key-prop-missing`.
 */
export function extractKeyPropFact(
  node: AnyNode,
  lineOffsets: number[],
  insideMap: boolean,
): KeyPropFact | undefined {
  if (!isObject(node) || node.type !== 'JSXOpeningElement') return undefined;
  const tag = jsxElementName(node);
  if (!tag) return undefined;
  const attrs = node.attributes as AnyNode[];
  let valueType: KeyPropFact['valueType'] = 'missing';
  for (const attr of attrs) {
    if (!isObject(attr) || attr.type !== 'JSXAttribute') continue;
    const name = jsxAttrName(attr);
    if (name !== 'key') continue;
    const raw = attr.value as AnyNode;
    const valueNode = unwrapJsxExpression(raw);
    if (isIdentifierNode(valueNode) && valueNode.value === 'index') {
      valueType = 'index';
    } else if (isIdentifierNode(valueNode) || isMemberExpressionNode(valueNode)) {
      valueType = 'stable';
    } else {
      valueType = 'unknown';
    }
    break;
  }
  if (valueType === 'missing' && !insideMap) return undefined;
  const { line, column } = positionFrom(node, lineOffsets);
  return { tag, valueType, line, column };
}