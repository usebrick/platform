import type { Module } from '@swc/core';
import type { DangerousCorsFact } from './types';
import { isObject, positionFrom } from './visitors/react.js';
import type { AnyNode } from './visitors/react.js';

const CORS_HEADER = 'access-control-allow-origin';

function identifierValue(node: AnyNode): string | undefined {
  return isObject(node) && node.type === 'Identifier' && typeof node.value === 'string'
    ? node.value
    : undefined;
}

function stringValue(node: AnyNode): string | undefined {
  return isObject(node) && node.type === 'StringLiteral' && typeof node.value === 'string'
    ? node.value
    : undefined;
}

function argumentExpression(node: AnyNode): AnyNode {
  if (!isObject(node) || !Object.prototype.hasOwnProperty.call(node, 'expression')) return undefined;
  if (node.spread != null) return undefined;
  return node.expression as AnyNode;
}

function propertyName(node: AnyNode): string | undefined {
  if (!isObject(node)) return undefined;
  return stringValue(node) ?? identifierValue(node);
}

type KeyValuePropertyNode = {
  type?: string;
  computed?: boolean;
  key?: AnyNode;
  value?: AnyNode;
  [key: string]: unknown;
};

function isKeyValueProperty(node: AnyNode): node is KeyValuePropertyNode {
  return isObject(node) && (
    node.type === 'KeyValueProperty' ||
    node.type === 'ObjectProperty' ||
    node.type === 'Property'
  );
}

function addFact(
  facts: DangerousCorsFact[],
  kind: DangerousCorsFact['kind'],
  node: AnyNode,
  lineOffsets: number[],
): void {
  if (!isObject(node)) return;
  // SWC's `KeyValueProperty` nodes do not always carry a span; their key
  // does. Use the key as the stable source anchor for object/cors options so
  // multiline findings do not collapse to line 1, column 1.
  const anchor = !isObject(node.span) && isKeyValueProperty(node)
    ? node.key as AnyNode
    : node;
  const { line, column } = positionFrom(anchor, lineOffsets);
  facts.push({ kind, line, column });
}

function inspectHeaderObject(
  node: AnyNode,
  facts: DangerousCorsFact[],
  lineOffsets: number[],
): void {
  if (!isObject(node) || node.type !== 'ObjectExpression') return;
  const properties = Array.isArray(node.properties) ? node.properties as AnyNode[] : [];
  for (const property of properties) {
    if (!isKeyValueProperty(property) || property.computed === true) continue;
    if (propertyName(property.key as AnyNode)?.toLowerCase() !== CORS_HEADER) continue;
    // Only a literal `'*'` is definite. Template literals, identifiers,
    // concatenations, and runtime values deliberately abstain.
    if (stringValue(property.value as AnyNode) !== '*') continue;
    addFact(facts, 'header-object', property, lineOffsets);
  }
}

function inspectKnownHeaderObjectContext(
  node: AnyNode,
  facts: DangerousCorsFact[],
  lineOffsets: number[],
): void {
  if (!isObject(node)) return;

  // `new Headers({ ... })` is an unambiguous Web API header object.
  if (node.type === 'NewExpression' && identifierValue(node.callee as AnyNode) === 'Headers') {
    const args = Array.isArray(node.arguments) ? node.arguments as AnyNode[] : [];
    inspectHeaderObject(argumentExpression(args[0]), facts, lineOffsets);
    return;
  }

  // Header options are only trusted when the containing object is passed to
  // a recognized network/header API. A bare `headers: { ... }` object can be
  // documentation or display metadata and is intentionally ignored.
  if (node.type === 'CallExpression') {
    const callee = node.callee as AnyNode;
    const name = identifierValue(callee);
    let optionIndices: number[] = [];
    if (name === 'fetch') {
      optionIndices = [1];
    } else if (name === 'got') {
      // got(url, options) and got(options) are both supported forms; a
      // string URL argument is harmless because it is not an object.
      optionIndices = [0, 1];
    } else if (name === 'axios') {
      optionIndices = [0, 1];
    } else if (isObject(callee) && callee.type === 'MemberExpression' && callee.computed !== true) {
      const objectName = identifierValue(callee.object as AnyNode);
      const methodName = identifierValue(callee.property as AnyNode);
      if (objectName === 'axios' && methodName === 'create') {
        optionIndices = [0];
      } else if (objectName === 'axios' && methodName === 'request') {
        optionIndices = [0];
      } else if (objectName === 'axios' && ['get', 'delete', 'head', 'options'].includes(methodName ?? '')) {
        optionIndices = [1];
      } else if (objectName === 'axios' && ['post', 'put', 'patch'].includes(methodName ?? '')) {
        optionIndices = [2];
      } else if (objectName === 'got' && methodName === 'extend') {
        optionIndices = [0];
      }
    }
    const args = Array.isArray(node.arguments) ? node.arguments as AnyNode[] : [];
    for (const index of optionIndices) {
      inspectHeaderOptions(argumentExpression(args[index]), facts, lineOffsets);
    }
    return;
  }

  if (node.type === 'NewExpression') {
    const name = identifierValue(node.callee as AnyNode);
    if (name === 'Request' || name === 'Response') {
      const args = Array.isArray(node.arguments) ? node.arguments as AnyNode[] : [];
      inspectHeaderOptions(argumentExpression(args[1]), facts, lineOffsets);
    }
  }
}

function inspectHeaderOptions(
  node: AnyNode,
  facts: DangerousCorsFact[],
  lineOffsets: number[],
): void {
  if (!isObject(node) || node.type !== 'ObjectExpression') return;
  const properties = Array.isArray(node.properties) ? node.properties as AnyNode[] : [];
  for (const property of properties) {
    if (!isKeyValueProperty(property) || property.computed === true) continue;
    if (propertyName(property.key as AnyNode) !== 'headers') continue;
    inspectHeaderObject(property.value as AnyNode, facts, lineOffsets);
  }
}

function inspectSetHeaderCall(
  node: AnyNode,
  facts: DangerousCorsFact[],
  lineOffsets: number[],
): void {
  if (!isObject(node) || node.type !== 'CallExpression') return;
  const callee = node.callee as AnyNode;
  if (!isObject(callee) || callee.type !== 'MemberExpression' || callee.computed === true) return;
  if (identifierValue(callee.object as AnyNode) !== 'res') return;
  if (identifierValue(callee.property as AnyNode) !== 'setHeader') return;
  const args = Array.isArray(node.arguments) ? node.arguments as AnyNode[] : [];
  const headerName = argumentExpression(args[0]);
  const headerValue = argumentExpression(args[1]);
  if (stringValue(headerName)?.toLowerCase() !== CORS_HEADER || stringValue(headerValue) !== '*') return;
  // Point to the call site, preserving the useful line when arguments are
  // split across multiple lines.
  addFact(facts, 'set-header', node, lineOffsets);
}

function inspectCorsCall(
  node: AnyNode,
  facts: DangerousCorsFact[],
  lineOffsets: number[],
): void {
  if (!isObject(node) || node.type !== 'CallExpression') return;
  if (identifierValue(node.callee as AnyNode) !== 'cors') return;
  const args = Array.isArray(node.arguments) ? node.arguments as AnyNode[] : [];
  const options = argumentExpression(args[0]);
  if (!isObject(options) || options.type !== 'ObjectExpression') return;
  const properties = Array.isArray(options.properties) ? options.properties as AnyNode[] : [];
  for (const property of properties) {
    if (!isKeyValueProperty(property) || property.computed === true) continue;
    if (propertyName(property.key as AnyNode) !== 'origin') continue;
    const value = property.value as AnyNode;
    if (stringValue(value) === '*') {
      addFact(facts, 'cors-origin-wildcard', property, lineOffsets);
    } else if (isObject(value) && value.type === 'BooleanLiteral' && value.value === true) {
      addFact(facts, 'cors-origin-reflective', property, lineOffsets);
    }
  }
}

/**
 * Extract only wildcard CORS configurations that SWC proves are executable
 * syntax. The caller supplies the AST returned by the parser; no source-text
 * matching is performed here. Blank ASTs used for Astro/HTML/backend files
 * therefore produce no facts by construction.
 */
export function extractDangerousCorsFacts(
  ast: Module,
  lineOffsets: number[],
): DangerousCorsFact[] {
  const facts: DangerousCorsFact[] = [];

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!isObject(value)) return;
    const node = value as AnyNode;
    inspectKnownHeaderObjectContext(node, facts, lineOffsets);
    inspectSetHeaderCall(node, facts, lineOffsets);
    inspectCorsCall(node, facts, lineOffsets);
    // Literal nodes have no executable children. Skipping their scalar
    // fields also makes the AST-only boundary explicit for strings,
    // templates, regexes, and JSX text.
    for (const [key, child] of Object.entries(value)) {
      if (key === 'span' || key === 'loc' || key === 'ctxt') continue;
      visit(child);
    }
  }

  visit(ast);
  return facts;
}
