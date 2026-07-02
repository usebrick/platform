// v2.0.1: partial walker-body dispatch refactor.
//
// Extracts the three CLOSURE-FREE per-node-type handlers out of
// `processNode()` in visitor.ts into top-level functions, keyed by
// AST node type in a dispatch table:
//
//   * ExpressionStatement — detect "use client" directive
//   * ImportDeclaration   — collect ES module imports
//   * BinaryExpression    — detect deep && expression chains
//
// The other 6 handlers (CallExpression, JSXAttribute, JSXOpeningElement,
// VariableDeclarator, Identifier, MemberExpression) call closure-
// captured helpers (attachHook, trackPropUsage, markStateReference,
// etc.) and stay inline in processNode for now. They will move into
// this module incrementally as those helpers are lifted to top-level
// functions in v2.0.2 and beyond.
//
// Behavior is IDENTICAL to the pre-refactor inline if-chain. The
// dispatch lookup happens once per node visit; for the 6 types not
// in this table, processNode falls through to its existing checks.

import type { HookFact } from '../../types';
import type { AnyNode } from './react.js';
import type { InternalFacts, WalkContext, FunctionFrame } from './internal.js';
import {
  isObject,
  getNodeType,
  positionFrom,
  isHookName,
  spanStart,
  spanEnd,
  jsxAttrName,
  jsxElementName,
  stringLiteralValue,
  extractElementFact,
  unwrapJsxExpression,
  staticClassValue,
  sourceText,
} from './react.js';
import {
  binaryAndChainLength,
  collectChainText,
  isOptionalChainPattern,
  isIdentifierNode,
  isMemberExpressionNode,
  extractKeyPropFact,
  isAndChainChild,
} from './ast-guards.js';
// v0.9.3: imported from scan-helpers.ts (and ast-guards.ts) to break
// the visitor.ts ⇄ dispatch.ts circular dependency. The original
// implementations lived in visitor.ts and were re-imported here
// transitively — which forced visitor.ts to also import from
// dispatch.ts (the cycle).
import {
  fetchCallHasSignal,
  fetchCallChecksOk,
  extractFetchUrl,
  extractFetchCredentials,
  extractFetchMethod,
  isUseStateDeclarator,
  extractStateBinding,
} from './scan-helpers.js';

// v2.0.2: lift closure-bound helpers (`nearestComponent`,
// `findNearestBlock`, `attachHook`, `markStateReference`) to top-level
// functions so the dispatch handlers can call them without sharing
// visitor.ts' extractFacts closure. Each is a thin wrapper that
// reads from `vctx` (facts + ctx). Behavior is identical to the
// closure-bound originals — see tests/engine/dispatch.test.ts.

/** Walk the WalkContext stack from inside out to find the nearest
 *  enclosing component frame. */
export function nearestComponent(vctx: VisitorCtx): FunctionFrame | null {
  for (let i = vctx.ctx.stack.length - 1; i >= 0; i--) {
    if (vctx.ctx.stack[i]!.isComponent) {
      return vctx.ctx.stack[i]!;
    }
  }
  return null;
}

/** Walk the path from the end and return the nearest enclosing block,
 *  function, loop, or try/catch — used to bound fetch() span checks. */
export function findNearestBlock(path: AnyNode[]): AnyNode | undefined {
  for (let i = path.length - 1; i >= 0; i--) {
    const type = getNodeType(path[i]);
    if (
      type === 'BlockStatement' ||
      type === 'FunctionDeclaration' ||
      type === 'FunctionExpression' ||
      type === 'ArrowFunctionExpression' ||
      type === 'TryStatement' ||
      type === 'CatchClause' ||
      type === 'IfStatement' ||
      type === 'ForStatement' ||
      type === 'ForInStatement' ||
      type === 'ForOfStatement' ||
      type === 'WhileStatement' ||
      type === 'DoWhileStatement' ||
      type === 'SwitchStatement'
    ) {
      return path[i];
    }
  }
  return undefined;
}

/** Attach a detected hook call to the nearest enclosing component
 *  frame (or to top-level facts if no component is in scope). */
export function attachHook(hook: HookFact, vctx: VisitorCtx): void {
  vctx.facts.hooks.push(hook);
  const component = nearestComponent(vctx);
  if (component) {
    component.hookCalls.push(hook);
  }
}

/** Mark a state binding reference. Walks the stack from inside out;
 *  if the identifier shadows a tracked state binding, mark it referenced. */
export function markStateReference(name: string, vctx: VisitorCtx): void {
  const stack = vctx.ctx.stack;
  for (let i = stack.length - 1; i >= 0; i--) {
    const frame = stack[i]!;
    if (frame.bindings.has(name)) {
      if (frame.isComponent) {
        for (const binding of frame.stateBindings) {
          if (binding.valueName === name) binding.valueReferenced = true;
          if (binding.setterName === name) binding.setterReferenced = true;
        }
      }
      return;
    }
    if (frame.isComponent) {
      let matched = false;
      for (const binding of frame.stateBindings) {
        if (binding.valueName === name) {
          binding.valueReferenced = true;
          matched = true;
        }
        if (binding.setterName === name) {
          binding.setterReferenced = true;
          matched = true;
        }
      }
      if (matched) return;
    }
  }
}

/** Per-node-type handler signature. Returns true if children should be
 *  skipped (none of the 3 handlers shipped in v2.0.1 do). */
export type DispatchHandler = (
  node: AnyNode,
  parent: AnyNode,
  path: AnyNode[],
  vctx: VisitorCtx,
) => boolean;

/**
 * Bundle of closure-bound state needed by the handlers. The visitor
 * constructs one per file and passes it on every dispatch call.
 * Handlers mutate `facts` and `ctx` directly; helpers read from
 * `source`/`lineOffsets`/`framework`.
 */
export interface VisitorCtx {
  facts: InternalFacts;
  ctx: WalkContext;
  source: string;
  lineOffsets: number[];
  framework: string;
  /**
   * descends into its initializer before its new bindings shadow
   * outer names; the handler calls this to recurse.
   * Optional because tests that exercise the other handlers
   * don't need it.
   */
  visit?: (node: AnyNode, parent: AnyNode, path: AnyNode[]) => void;
}

// -- per-type handlers --------------------------------------------------

/** Detect `"use client"` directive at the top of the module. */
export function handleExpressionStatement(
  node: AnyNode,
  _parent: AnyNode,
  _path: AnyNode[],
  vctx: VisitorCtx,
): boolean {
  if (!isObject(node)) return false;
  const expr = node.expression as AnyNode;
  if (isObject(expr) && expr.type === 'StringLiteral' && expr.value === 'use client') {
    vctx.ctx.useClient = true;
  }
  return false;
}

/** Detect ES module imports. */
export function handleImportDeclaration(
  node: AnyNode,
  _parent: AnyNode,
  _path: AnyNode[],
  vctx: VisitorCtx,
): boolean {
  if (!isObject(node)) return false;
  const source = stringLiteralValue(node.source as AnyNode);
  if (source) {
    const { line, column } = positionFrom(node, vctx.lineOffsets);
    const importedNames: string[] = [];
    // v0.21.0: `import type { X } from '...'` declarations should not
    // be flagged by dead/unused-import (TypeScript elides them at
    // build time). swc exposes this via the `typeOnly` field on
    // ImportDeclaration.
    const isTypeOnly = node.typeOnly === true;
    const specifiers = node.specifiers as AnyNode[];
    if (Array.isArray(specifiers)) {
      for (const specifier of specifiers) {
        if (!isObject(specifier)) continue;
        if (
          specifier.type === 'ImportDefaultSpecifier' ||
          specifier.type === 'ImportNamespaceSpecifier'
        ) {
          const local = specifier.local as AnyNode;
          if (
            isObject(local) &&
            local.type === 'Identifier' &&
            typeof local.value === 'string'
          ) {
            const name = local.value as string;
            importedNames.push(name);
            //  dead-code detector. Record the binding so
            //  the v2 builder can mark it unused if the name
            //  never appears as an identifier reference.
            vctx.facts.deadCode.bindings.push({
              name,
              kind:
                specifier.type === 'ImportDefaultSpecifier'
                  ? 'import-default'
                  : 'import-namespace',
              line,
              column,
              source,
              isReferenced: false,
              isTypeOnly,
            });
          }
        } else if (specifier.type === 'ImportSpecifier') {
          const imported = specifier.imported as AnyNode;
          const local = specifier.local as AnyNode;
          if (
            isObject(imported) &&
            typeof imported.value === 'string' &&
            imported.value.length > 0
          ) {
            const name = imported.value as string;
            importedNames.push(name);
            vctx.facts.deadCode.bindings.push({
              name,
              kind: 'import-specifier',
              line,
              column,
              source,
              isReferenced: false,
              isTypeOnly,
            });
          } else if (
            isObject(local) &&
            local.type === 'Identifier' &&
            typeof local.value === 'string'
          ) {
            const name = local.value as string;
            importedNames.push(name);
            vctx.facts.deadCode.bindings.push({
              name,
              kind: 'import-specifier',
              line,
              column,
              source,
              isReferenced: false,
              isTypeOnly,
            });
          }
        }
      }
    }
    vctx.facts.imports.push({ source, line, column, importedNames });
  }
  return false;
}

/** Deep && binary expression chains (depth >= 3). */
export function handleBinaryExpression(
  node: AnyNode,
  parent: AnyNode,
  _path: AnyNode[],
  vctx: VisitorCtx,
): boolean {
  if (!isObject(node)) return false;
  if (node.operator === '&&' && !isAndChainChild(parent)) {
    const depth = binaryAndChainLength(node);
    if (depth >= 3) {
      const { line, column } = positionFrom(node, vctx.lineOffsets);
      vctx.facts.logicalExpressions.push({
        depth,
        line,
        column,
        text: collectChainText(node, vctx.source),
        isOptionalChainLike: isOptionalChainPattern(node, vctx.source),
      });
    }
  }
  return false;
}

/**
 * v2.0.2: detect hook calls + fetch() calls.
 *
 * Two responsibilities per CallExpression:
 *   1. If callee is an Identifier named like a React hook
 *      (useState, useEffect, useMemo, ...), record it as a hook
 *      call on the nearest enclosing component frame.
 *   2. If callee is the `fetch` identifier, capture the URL,
 *      credentials, method, and whether the call has an AbortSignal
 *      and a `.ok`/`.status` check in its surrounding block.
 *
 * The handler returns false (does not skip children) because
 * CallExpression's arguments still need to be walked normally.
 */
export function handleCallExpression(
  node: AnyNode,
  _parent: AnyNode,
  path: AnyNode[],
  vctx: VisitorCtx,
): boolean {
  if (!isObject(node)) return false;
  const callee = node.callee as AnyNode;

  // 1. Hook detection
  if (
    isObject(callee) &&
    callee.type === 'Identifier' &&
    typeof callee.value === 'string' &&
    isHookName(callee.value)
  ) {
    const { line, column } = positionFrom(node, vctx.lineOffsets);
    const hookName = callee.value as string;
    attachHook({ name: hookName, line, column }, vctx);
  }

  // 2. Fetch detection
  if (isObject(callee) && callee.type === 'Identifier' && callee.value === 'fetch') {
    const { line, column } = positionFrom(node, vctx.lineOffsets);
    const start = spanStart(node) ?? 0;
    const end = spanEnd(node) ?? vctx.source.length;
    const nearestBlock = findNearestBlock(path);
    const blockEnd = nearestBlock ? (spanEnd(nearestBlock) ?? end) : end;
    vctx.facts.fetchCalls.push({
      line,
      column,
      hasAbortSignal: fetchCallHasSignal(vctx.source, start - 1, end - 1),
      checksOk: fetchCallChecksOk(
        vctx.source,
        start - 1,
        Math.max(start - 1, blockEnd - 1),
      ),
      url: extractFetchUrl(node, vctx.source),
      credentials: extractFetchCredentials(node, vctx.source),
      method: extractFetchMethod(node, vctx.source),
    });
  }
  return false;
}

/**
 * Pure functions — read node shape only, no closure state.
 */

/** Recursively check if `target` is anywhere inside `container`. */
export function containsNode(container: AnyNode, target: AnyNode): boolean {
  if (container === target) return true;
  if (!isObject(container)) return false;
  for (const value of Object.values(container)) {
    if (Array.isArray(value)) {
      if (value.some((item: AnyNode) => containsNode(item, target))) return true;
    } else if (isObject(value)) {
      if (containsNode(value, target)) return true;
    }
  }
  return false;
}

/** Return true if `node` is the LHS of a binding pattern (declarator
 *  id, assignment target, function parameter, destructure element, etc.).
 *  Such sites are not references — they're declarations. */
export function isBindingSite(node: AnyNode, parent: AnyNode): boolean {
  if (!isObject(parent)) return false;
  if (parent.type === 'VariableDeclarator' && parent.id === node) return true;
  if (parent.type === 'AssignmentPattern' && parent.left === node) return true;
  if (parent.type === 'JSXAttribute' && parent.name === node) return true;
  if ((parent.type === 'ObjectProperty' || parent.type === 'Property') && parent.key === node) return true;
  if (parent.type === 'ArrayPattern') {
    const elements = parent.elements as AnyNode[];
    if (Array.isArray(elements) && elements.includes(node as object)) return true;
  }
  if (parent.type === 'Parameter') {
    const pat = parent.pat as AnyNode;
    if (pat === node) return true;
    if (containsNode(pat, node)) return true;
  }
  if (
    parent.type === 'FunctionDeclaration' ||
    parent.type === 'FunctionExpression' ||
    parent.type === 'ArrowFunctionExpression'
  ) {
    const params = parent.params as AnyNode[];
    if (Array.isArray(params)) {
      if (params.includes(node as object)) return true;
      if (params.some((param: AnyNode) => containsNode(param, node))) return true;
    }
  }
  //  dead-code detector. The `imported` and `local` fields
  //  of an ImportSpecifier / ImportDefaultSpecifier /
  //  ImportNamespaceSpecifier are binding declarations, not
  //  references. Without this case, the identifier walk would
  //  add the imported name to the referenced-name set just
  //  because it appears inside the import statement, making
  //  every import look used.
  if (
    parent.type === 'ImportSpecifier' ||
    parent.type === 'ImportDefaultSpecifier' ||
    parent.type === 'ImportNamespaceSpecifier'
  ) {
    if (parent.type === 'ImportSpecifier') {
      if (parent.imported === node || parent.local === node) return true;
    } else {
      if (parent.local === node) return true;
    }
  }
  return false;
}

/** Return true if `node` is the non-computed `.property` of a
 *  MemberExpression (e.g. `foo.bar` — `bar` is a property access,
 *  not a reference to a binding named `bar`). */
export function isNonComputedMemberProperty(node: AnyNode, parent: AnyNode): boolean {
  if (!isObject(parent)) return false;
  if ((parent.type === 'MemberExpression' || parent.type === 'JSXMemberExpression') && parent.property === node) {
    return !parent.computed;
  }
  return false;
}

/** Return true if `node` is a JSX attribute whose value is just the
 *  same prop being passed through (`<Child {...foo} />` — `foo`
 *  is a passthrough, not a usage). */
export function isPassThroughIdentifier(node: AnyNode, parent: AnyNode, path: AnyNode[]): boolean {
  if (!isIdentifierNode(node)) return false;
  if (!isObject(parent) || parent.type !== 'JSXExpressionContainer') return false;
  const jsxAttr = path[path.length - 3];
  if (!jsxAttr || getNodeType(jsxAttr) !== 'JSXAttribute') return false;
  if (jsxAttrName(jsxAttr) !== node.value) return false;
  const jsxOpening = path[path.length - 4];
  if (!jsxOpening || getNodeType(jsxOpening) !== 'JSXOpeningElement') return false;
  const tag = jsxElementName(jsxOpening);
  if (!tag || tag[0] !== tag[0]!.toUpperCase()) return undefined as unknown as boolean;
  return true;
}

/** Return the prop name when `node` is a `props.foo` JSX attribute
 *  value that is a pass-through (i.e. forwarded to a child). Returns
 *  undefined otherwise. */
export function isPropsPassThrough(node: AnyNode, parent: AnyNode, path: AnyNode[]): string | undefined {
  if (!isMemberExpressionNode(node)) return undefined;
  const obj = (node as Record<string, unknown>).object as AnyNode;
  const prop = (node as Record<string, unknown>).property as AnyNode;
  if (!isIdentifierNode(obj) || obj.value !== 'props') return undefined;
  if (!isIdentifierNode(prop)) return undefined;
  if (!isObject(parent) || parent.type !== 'JSXExpressionContainer') return undefined;
  const jsxAttr = path[path.length - 3];
  if (!jsxAttr || getNodeType(jsxAttr) !== 'JSXAttribute') return undefined;
  if (jsxAttrName(jsxAttr) !== prop.value) return undefined;
  const jsxOpening = path[path.length - 4];
  if (!jsxOpening || getNodeType(jsxOpening) !== 'JSXOpeningElement') return undefined;
  const tag = jsxElementName(jsxOpening);
  if (!tag || tag[0] !== tag[0]!.toUpperCase()) return undefined as unknown as string;
  return prop.value;
}

/**
 * bindings are being read. Skips shorthand destructuring keys (caught
 * separately by the binding-site check at the call site) and skips
 * pass-throughs (forwarding props to a child isn't usage). Mirrors
 * the closure-bound `trackPropUsage` in visitor.ts.
 */
export function trackPropUsage(
  node: AnyNode,
  parent: AnyNode,
  path: AnyNode[],
  vctx: VisitorCtx,
): void {
  if (
    isIdentifierNode(node) &&
    isObject(parent) &&
    parent.type === 'AssignmentPatternProperty' &&
    parent.key === node
  ) {
    return;
  }

  const component = nearestComponent(vctx);
  if (!component) return;

  if (isIdentifierNode(node)) {
    const name = node.value;
    if (!component.propBindingSet.has(name)) return;
    if (name === 'props') return;
    if (isPassThroughIdentifier(node, parent, path)) return;
    component.propUsageSet.add(name);
    return;
  }

  if (isMemberExpressionNode(node)) {
    const obj = (node as Record<string, unknown>).object as AnyNode;
    const prop = (node as Record<string, unknown>).property as AnyNode;
    if (!isIdentifierNode(obj) || obj.value !== 'props') return;
    if (!component.propBindingSet.has('props')) return;
    if (!isIdentifierNode(prop)) return;
    if (isPropsPassThrough(node, parent, path) !== undefined) return;
    component.propUsageSet.add(prop.value);
  }
}

/**
 * bindings (delegated to markStateReference) and tracks prop usage
 * (delegated to trackPropUsage). Skips binding sites and non-computed
 * member-expression properties.
 */
export function handleIdentifier(
  node: AnyNode,
  parent: AnyNode,
  path: AnyNode[],
  vctx: VisitorCtx,
): boolean {
  if (!isObject(node)) return false;
  if (
    typeof node.value === 'string' &&
    !isBindingSite(node, parent) &&
    !isNonComputedMemberProperty(node, parent)
  ) {
    markStateReference(node.value as string, vctx);
    trackPropUsage(node, parent, path, vctx);
    //  dead-code detector. Add this identifier to the
    //  file-level referenced-name set so the v2 builder can answer
    //  "was this binding ever used?" without re-walking the AST.
    //  Skipped when the identifier is the LHS of a binding pattern
    //  (already excluded by isBindingSite) or a non-computed
    //  member property (also already excluded).
    vctx.facts.referencedNames.add(node.value as string);
    // Per-frame reference tracking: also add to the nearest
    // frame's `references` set so a future rule can scope references
    // per function. Currently unused but cheap to populate.
    const top = vctx.ctx.stack[vctx.ctx.stack.length - 1];
    if (top) top.references.add(node.value as string);
  }
  return false;
}

/**
 */
export function handleMemberExpression(
  node: AnyNode,
  parent: AnyNode,
  path: AnyNode[],
  vctx: VisitorCtx,
): boolean {
  trackPropUsage(node, parent, path, vctx);
  return false;
}

/**
 * Static dispatch table. One entry per AST node type the handlers
 * own. Unrecognized types return undefined and the caller (processNode)
 * falls through to the inline checks for the remaining 3 types.
 */
/** Walk the WalkContext stack and return the innermost frame, or
 *  null if the stack is empty. Mirrors the closure-bound
 *  `nearestFrame` in visitor.ts. */
export function nearestFrame(vctx: VisitorCtx): FunctionFrame | null {
  const stack = vctx.ctx.stack;
  return stack.length > 0 ? stack[stack.length - 1]! : null;
}

/**
 * Pure function — no closure state. Mirrors the closure-bound
 * `collectBindingNames` in visitor.ts.
 */
export function collectBindingNames(node: AnyNode): string[] {
  if (!isObject(node)) return [];
  if (node.type === 'Identifier' && typeof node.value === 'string') {
    return [node.value as string];
  }
  if (node.type === 'Parameter') {
    return collectBindingNames(node.pat as AnyNode);
  }
  if (node.type === 'ArrayPattern') {
    const names: string[] = [];
    const elements = (node as { elements?: AnyNode[] }).elements;
    if (Array.isArray(elements)) {
      for (const element of elements) {
        if (element != null) {
          names.push(...collectBindingNames(element));
        }
      }
    }
    return names;
  }
  if (node.type === 'ObjectPattern') {
    const names: string[] = [];
    const properties = (node as { properties?: AnyNode[] }).properties;
    if (Array.isArray(properties)) {
      for (const property of properties) {
        if (!isObject(property)) continue;
        if (property.type === 'AssignmentPatternProperty') {
          const key = (property as { key?: AnyNode }).key;
          if (isIdentifierNode(key)) {
            names.push(key.value as string);
          }
        } else if (
          property.type === 'KeyValuePatternProperty' ||
          property.type === 'ObjectProperty' ||
          property.type === 'Property'
        ) {
          const value = (property as { value?: AnyNode }).value;
          if (value) names.push(...collectBindingNames(value));
        } else if (property.type === 'RestElement') {
          const arg = (property as { argument?: AnyNode }).argument;
          if (arg) names.push(...collectBindingNames(arg));
        }
      }
    }
    return names;
  }
  if (node.type === 'RestElement') {
    return collectBindingNames((node as { argument?: AnyNode }).argument as AnyNode);
  }
  if (node.type === 'AssignmentPattern') {
    return collectBindingNames((node as { left?: AnyNode }).left as AnyNode);
  }
  return [];
}

/**
 *   1. Static className/class → push to facts.staticClassNames.
 *   2. Inline style object → push to facts.styleProps.
 *   3. Prop pass-through detection → push to component.propPassThroughs
 *      if the attribute value forwards a bound prop or `props.foo`
 *      to a child component.
 */
export function handleJSXAttribute(
  node: AnyNode,
  parent: AnyNode,
  _path: AnyNode[],
  vctx: VisitorCtx,
): boolean {
  if (!isObject(node)) return false;
  const attrName = jsxAttrName(node);
  if (attrName === 'className' || attrName === 'class') {
    const raw = (node as { value?: AnyNode }).value;
    const valueNode = unwrapJsxExpression(raw);
    const classValue = staticClassValue(valueNode);
    if (classValue !== undefined) {
      const { line, column } = positionFrom(node, vctx.lineOffsets);
      vctx.facts.staticClassNames.push({ value: classValue, line, column });
    }
  }
  if (attrName === 'style') {
    const raw = (node as { value?: AnyNode }).value;
    const valueNode = unwrapJsxExpression(raw);
    if (isObject(valueNode)) {
      const { line, column } = positionFrom(node, vctx.lineOffsets);
      const propSource = sourceText(valueNode, vctx.source);
      vctx.facts.styleProps.push({ source: propSource, line, column });
    }
  }

  if (attrName) {
    const raw = (node as { value?: AnyNode }).value;
    const valueNode = unwrapJsxExpression(raw);
    const component = nearestComponent(vctx);
    const childTag = jsxElementName(parent);
    if (component && childTag) {
      if (
        isIdentifierNode(valueNode) &&
        component.propBindingSet.has(valueNode.value as string) &&
        attrName === valueNode.value
      ) {
        const { line, column } = positionFrom(node, vctx.lineOffsets);
        component.propPassThroughs.push({
          propName: attrName,
          toTag: childTag,
          line,
          column,
        });
      } else if (
        isMemberExpressionNode(valueNode) &&
        component.propBindingSet.has('props')
      ) {
        const obj = (valueNode as { object?: AnyNode }).object;
        const prop = (valueNode as { property?: AnyNode }).property;
        if (
          isIdentifierNode(obj) &&
          obj.value === 'props' &&
          isIdentifierNode(prop) &&
          attrName === prop.value
        ) {
          const { line, column } = positionFrom(node, vctx.lineOffsets);
          component.propPassThroughs.push({
            propName: prop.value as string,
            toTag: childTag,
            line,
            column,
          });
        }
      }
    }
  }
  return false;
}

/**
 * (when inside a .map() callback and not already inside a keyed
 * parent) a KeyPropFact for the `key-prop-missing` rule.
 */
export function handleJSXOpeningElement(
  node: AnyNode,
  _parent: AnyNode,
  _path: AnyNode[],
  vctx: VisitorCtx,
): boolean {
  if (!isObject(node)) return false;
  const element = extractElementFact(node, vctx.lineOffsets);
  if (element) {
    vctx.facts.allElements.push(element);
  }
  const insideMap = vctx.ctx.mapDepth > 0 && vctx.ctx.keyDepth === 0;
  const keyFact = extractKeyPropFact(node, vctx.lineOffsets, insideMap);
  if (keyFact) {
    vctx.facts.keyProps.push(keyFact);
  }
  return false;
}

/**
 * initializer (so references resolve before bindings shadow outer
 * names), then registers the new bindings with the nearest frame,
 * detects useState destructuring, and treats top-level `const style
 * = {...}` in non-JSX frameworks as an inline style object.
 * Returns true to skip walking the pattern itself — the identifiers
 * there are bindings, not references.
 */
export function handleVariableDeclarator(
  node: AnyNode,
  _parent: AnyNode,
  path: AnyNode[],
  vctx: VisitorCtx,
): boolean {
  if (!isObject(node)) return false;
  const init = (node as { init?: AnyNode }).init;
  if (init && vctx.visit) {
    vctx.visit(init, node, [...path, node]);
  }

  const id = (node as { id?: AnyNode }).id;
  const bindingNames = collectBindingNames(id as AnyNode);
  const frame = nearestFrame(vctx);
  if (frame) {
    for (const bindingName of bindingNames) {
      frame.bindings.add(bindingName);
    }
  }

  //  dead-code detector. Record each `let`/`const`/`var`
  //  declarator's bindings so the v2 builder can mark them
  //  unused if their name never appears as an identifier
  //  reference. We resolve the kind from the parent
  //  VariableDeclaration node's `kind` field.
  if (bindingNames.length > 0) {
    const parent = (node as { parent?: unknown }).parent;
    const kind = isObject(parent) && parent.type === 'VariableDeclaration'
      ? String((parent as Record<string, unknown>).kind ?? 'var')
      : 'var';
    const { line, column } = positionFrom(id as AnyNode, vctx.lineOffsets);
    for (const bindingName of bindingNames) {
      vctx.facts.deadCode.bindings.push({
        name: bindingName,
        kind: kind as 'var' | 'let' | 'const',
        line,
        column,
        isReferenced: false,
      });
    }
  }

  if (isUseStateDeclarator(node as Record<string, unknown>)) {
    const binding = extractStateBinding(node as Record<string, unknown>, vctx.lineOffsets);
    if (binding) {
      const component = nearestComponent(vctx);
      if (component) {
        component.stateBindings.push(binding);
      }
    }
  }

  if (
    isIdentifierNode(id) &&
    id.value === 'style' &&
    isObject(init) &&
    init.type === 'ObjectExpression' &&
    (vctx.framework === 'vue' || vctx.framework === 'svelte' || vctx.framework === 'astro')
  ) {
    const { line, column } = positionFrom(init, vctx.lineOffsets);
    vctx.facts.styleProps.push({
      source: sourceText(init, vctx.source),
      line,
      column,
    });
  }

  return true;
}

/**
 * Static dispatch table. One entry per AST node type the handlers
 * own. All 9 per-node-type handler blocks from the original
 * processNode() are now in this table.
 */
/**
 *  dead-code detector. Detect `if (true)` / `if (false)` /
 * `while (true)` / `while (false)` — the condition is a literal
 * boolean so the branch is statically decidable and one side is
 * dead code by construction. Records to `deadCode.constantConditions`
 * for the `dead/dead-branch` rule to consume.
 */
export function handleIfStatement(
  node: AnyNode,
  _parent: AnyNode,
  _path: AnyNode[],
  vctx: VisitorCtx,
): boolean {
  if (!isObject(node)) return false;
  const test = node.test as AnyNode;
  if (!isObject(test)) return false;
  if (test.type === 'BooleanLiteral' && typeof test.value === 'boolean') {
    const { line, column } = positionFrom(test, vctx.lineOffsets);
    vctx.facts.deadCode.constantConditions.push({
      kind: test.value ? 'if-true' : 'if-false',
      condition: String(test.value),
      line,
      column,
    });
  }
  return false;
}

/**
 *  dead-code detector. Same logic as `if` but for `while` /
 * `do...while`. `while (true)` is sometimes legitimate (event
 * loops), so the rule downgrades the severity in that case
 * (handled in the rule itself, not here).
 */
export function handleWhileStatement(
  node: AnyNode,
  _parent: AnyNode,
  _path: AnyNode[],
  vctx: VisitorCtx,
): boolean {
  if (!isObject(node)) return false;
  const test = node.test as AnyNode;
  if (!isObject(test)) return false;
  if (test.type === 'BooleanLiteral' && typeof test.value === 'boolean') {
    const { line, column } = positionFrom(test, vctx.lineOffsets);
    vctx.facts.deadCode.constantConditions.push({
      kind: test.value ? 'while-true' : 'while-false',
      condition: String(test.value),
      line,
      column,
    });
  }
  return false;
}

export const HANDLERS: Record<string, DispatchHandler> = {
  ExpressionStatement: handleExpressionStatement,
  ImportDeclaration: handleImportDeclaration,
  BinaryExpression: handleBinaryExpression,
  CallExpression: handleCallExpression,
  Identifier: handleIdentifier,
  MemberExpression: handleMemberExpression,
  JSXAttribute: handleJSXAttribute,
  JSXOpeningElement: handleJSXOpeningElement,
  VariableDeclarator: handleVariableDeclarator,
  IfStatement: handleIfStatement,
  WhileStatement: handleWhileStatement,
};

/** Top-level dispatch helper. Returns true if a handler ran and
 *  asked to skip children; false otherwise. */
export function dispatchNode(
  node: AnyNode,
  parent: AnyNode,
  path: AnyNode[],
  vctx: VisitorCtx,
): boolean {
  if (!isObject(node)) return false;
  const type = getNodeType(node);
  if (!type) return false;
  const handler = HANDLERS[type];
  if (handler) return handler(node, parent, path, vctx);
  return false;
}
