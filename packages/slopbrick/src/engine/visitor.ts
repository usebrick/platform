import type { Module } from '@swc/core';
import type {
  ScanFacts,
  ComponentFacts,
  ClassNameFact,
  ElementFact,
  HookFact,
  FetchCallFact,
  OptimisticUpdateFact,
  LogicalExpressionFact,
  StateBinding,
  StylePropFact,
  AstroComponentFact,
  KeyPropFact,
  ComponentSizeFact,
} from '../types';

/**
 * Internal accumulator used during the AST walk. The shape is
 * defined in ./visitors/v2-build.ts (it owns the v2 assembly) and
 * re-exported here for the walk loop's local use.
 *
 * Holds ONLY the data the v2 build needs. After the walk, v2 is
 * assembled from these fields and the public ScanFacts returned to
 * callers exposes ONLY `filePath` and `v2`. The legacy flat-shape
 * fields (interactiveElements, imageElements, consoleCalls, etc.)
 * have been removed.
 */
export type { InternalFacts };

// the existing visitor body keeps working unchanged. The functions
// below (isObject, spanStart, spanEnd, extractElementFact, etc.) are
// re-exported below for any external caller that needs them.
import {
  isObject as visitorsIsObject,
  isHookName,
  getNodeType,
  spanStart as visitorsSpanStart,
  spanEnd as visitorsSpanEnd,
  buildLineOffsets,
  positionFromOffset,
  positionFrom,
  endPositionFrom,
  containsJsx,
  stringLiteralValue,
  numericLiteralValue,
  templateLiteralValue,
  staticClassValue,
  jsxAttrName,
  jsxElementName,
  extractElementFact,
  unwrapJsxExpression,
  unwrapArgument,
  getFunctionName,
  sourceText,
} from './visitors/react.js';
import type { AnyNode } from './visitors/react.js';
import { extractHtmlElementFacts } from './visitors/html.js';
import { isIdentifierNode, isMapCall, isMemoOrForwardRefCall, isWrappedInMemoOrForwardRef } from './visitors/ast-guards.js';
// v2.0.1: walker-body dispatch refactor — top-level dispatch helper
// covers the 3 closure-free handlers (ExpressionStatement,
// ImportDeclaration, BinaryExpression). Other types stay inline.
import { dispatchNode } from './visitors/dispatch.js';
// v0.6.0: pure helpers (no closure state) live in ./visitors/scan-helpers.ts
// and are re-exported from this module for backward compatibility with
// existing test imports.
import {
  extractDisabledRules,
  isConditionalNode,
  isLoopNode,
  findMatchingBrace,
  extractOptimisticUpdates,
  fetchCallHasSignal,
  fetchCallChecksOk,
  extractFetchUrl,
  extractFetchCredentials,
  extractFetchMethod,
  countJsxBranches,
  maxJsxNestingDepth,
  extractDepNames,
  deriveFramework,
  findUnreachableStatements,
} from './visitors/scan-helpers.js';
// v0.6.0: ScanFactsV2 assembler (was inline in extractFacts()).
// Pure function of InternalFacts + source + ext + framework + config.
import { buildV2Facts, splitFilePath, envelopeScanFacts } from './visitors/v2-build.js';
import type { InternalFacts } from './visitors/v2-build.js';
const isObject = visitorsIsObject;
const spanStart = visitorsSpanStart;
const spanEnd = visitorsSpanEnd;
// Re-export the public helpers so callers still see them on the visitor module.
export {
  isHookName,
  buildLineOffsets,
  positionFromOffset,
  positionFrom,
  endPositionFrom,
  containsJsx,
  stringLiteralValue,
  numericLiteralValue,
  templateLiteralValue,
  staticClassValue,
  jsxAttrName,
  jsxElementName,
  extractElementFact,
  unwrapJsxExpression,
  unwrapArgument,
  getFunctionName,
  sourceText,
};

// v0.6.0: pure helpers from ./visitors/scan-helpers.ts are re-exported
// here for backward compat with existing test imports that reach into
// src/engine/visitor.
export {
  extractDisabledRules,
  isConditionalNode,
  isLoopNode,
  findMatchingBrace,
  extractOptimisticUpdates,
  fetchCallHasSignal,
  fetchCallChecksOk,
  extractFetchUrl,
  extractFetchCredentials,
  extractFetchMethod,
  countJsxBranches,
  maxJsxNestingDepth,
  extractDepNames,
  deriveFramework,
} from './visitors/scan-helpers.js';

// FunctionFrame is unified in ./visitors/internal.ts. It includes all
// runtime walker fields (hookCalls, stateBindings, propBindings,
// propPassThroughs, propUsages, isMemoWrapped) plus the ComponentFacts
// base. Re-export here so existing internal references resolve.
import type { FunctionFrame } from './visitors/internal.js';
export type { FunctionFrame } from './visitors/internal.js';

interface WalkContext {
  stack: FunctionFrame[];
  useClient: boolean;
  mapDepth: number;
  // Round 23: when we enter a `.map()` call, increment this counter.
  // The first JSXOpeningElement we visit afterwards is the "map child"
  // that needs a `key` prop. Visiting that element consumes the counter
  // (decrements by 1) so descendants are NOT checked.
  pendingKeyChecks: number;
  // Round 28: depth of JSX elements that have a `key` prop on the current
  // walk. While inside a keyed JSX element we don't fire key-prop-missing
  // for nested elements — only the keyed element itself matters for the
  // React reconciliation rule. Without this, the rule flags every nested
  // child of a keyed list element (huge FP volume on real human code).
  keyDepth: number;
}

interface SourceRange {
  start: number;
  end: number;
}

// implementations live in src/engine/visitors/templates.ts and can be
// tested in isolation. Re-export them so callers see no API change.
import { findAstroFrontmatterRange, findHtmlBlockRanges, findScriptAndStyleRanges, findHtmlCommentRanges, findAstroSkipRanges, lineNumberOf as templatesLineNumberOf, extractStaticTemplateClassNames, extractAstroComponents, extractAstroElementFacts } from './visitors/templates.js';
export {
  findAstroFrontmatterRange,
  findHtmlBlockRanges,
  findScriptAndStyleRanges,
  findHtmlCommentRanges,
  findAstroSkipRanges,
  extractStaticTemplateClassNames,
  extractAstroComponents,
  extractAstroElementFacts,
};
// Local aliases for the helpers that share names with existing visitor.ts
// callers.
const lineNumberOf = templatesLineNumberOf;

function mergeTemplateClassNames(filePath: string, source: string, facts: InternalFacts, templateClassNames: ClassNameFact[]): void {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext !== 'vue' && ext !== 'svelte' && ext !== 'astro' && ext !== 'html') return;

  let skipRanges: SourceRange[] = [];
  if (ext === 'vue' || ext === 'svelte') {
    skipRanges = findScriptAndStyleRanges(source);
  }
  if (ext === 'astro') {
    skipRanges = findAstroSkipRanges(source);
  }

  const templateFacts = extractStaticTemplateClassNames(source, skipRanges);
  const seen = new Set(facts.staticClassNames.map((f: ClassNameFact) => `${f.line}:${f.column}:${f.value}`));
  for (const fact of templateFacts) {
    const key = `${fact.line}:${fact.column}:${fact.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // synthetic `<template>` element injection that polluted jsx.elements
    // in .
    templateClassNames.push(fact);
  }
}

// v0.9.3: isAndChainChild, isUseStateDeclarator, and extractStateBinding
// moved to ./visitors/ast-guards.ts and ./visitors/scan-helpers.ts to
// break the visitor.ts ⇄ dispatch.ts circular dependency. They are
// re-exported here so existing test imports from `src/engine/visitor`
// continue to resolve.
export { isAndChainChild } from './visitors/ast-guards.js';
export { isUseStateDeclarator, extractStateBinding } from './visitors/scan-helpers.js';

export function extractFacts(
  filePath: string,
  ast: Module,
  source: string,
  supportsRsc: boolean = true,
  framework: string = 'react',
  config?: import('../types').ResolvedConfig,
): ScanFacts {
  const lineOffsets = buildLineOffsets(source);

  // build at the bottom of this function. The legacy flat-shape fields
  // (interactiveElements, imageElements, consoleCalls, etc.) have been
  // removed; their data either is computed inside the v2 build or is
  // dropped because no rule needs it.
  // Internal flat-style accumulator. Powers the v2 build at the bottom
  // of this function but is NOT exposed on the returned ScanFacts.
  // : only `filePath` and `v2` are part of the public API.
  const facts: InternalFacts & { _source?: string } = {
    filePath,
    components: [],
    staticClassNames: [],
    allElements: [],
    imports: [],
    hooks: [],
    logicalExpressions: [],
    styleProps: [],
    keyProps: [],
    componentSizes: [],
    astroComponents: [],
    fetchCalls: [],
    optimisticUpdates: [],
    //  dead-code detector. The visitor's identifier walk + import/
    //  branch/return handlers populate these. The v2 builder at the
    //  bottom of extractFacts() reads them and produces
    //  `facts.v2.deadCode`.
    deadCode: {
      bindings: [],
      constantConditions: [],
      unreachableStatements: [],
    },
    referencedNames: new Set<string>(),
  };

  const ctx: WalkContext = {
    stack: [],
    useClient: !supportsRsc,
    mapDepth: 0,
    pendingKeyChecks: 0,
    keyDepth: 0,
  };

  // v0.6.0: removed dead closure helpers (nearestComponent, nearestFrame,
  // findNearestBlock, isPropBinding, isPassThroughIdentifier, isPropsPassThrough,
  // trackPropUsage, attachHook, hasTypeAnnotation, isAndChainChildLocal,
  // containsNode, isBindingSite, isNonComputedMemberProperty, markStateReference).
  // The live implementations live in ./visitors/dispatch.ts and take a VisitorCtx
  // parameter; this walker delegates every per-node-type decision to dispatchNode.

  function collectBindingNames(node: AnyNode): string[] {
    if (!isObject(node)) return [];
    if (node.type === 'Identifier' && typeof node.value === 'string') {
      return [node.value as string];
    }
    if (node.type === 'Parameter') {
      return collectBindingNames(node.pat);
    }
    if (node.type === 'ArrayPattern') {
      const names: string[] = [];
      const elements = node.elements as AnyNode[];
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
      const properties = node.properties as AnyNode[];
      if (Array.isArray(properties)) {
        for (const property of properties) {
          if (!isObject(property)) continue;
          if (property.type === 'AssignmentPatternProperty') {
            const key = (property as Record<string, unknown>).key as AnyNode;
            if (isIdentifierNode(key)) {
              names.push(key.value);
            }
          } else if (
            property.type === 'KeyValuePatternProperty' ||
            property.type === 'ObjectProperty' ||
            property.type === 'Property'
          ) {
            names.push(...collectBindingNames((property as Record<string, unknown>).value as AnyNode));
          } else if (property.type === 'RestElement') {
            names.push(...collectBindingNames(property.argument));
          }
        }
      }
      return names;
    }
    if (node.type === 'RestElement') {
      return collectBindingNames(node.argument);
    }
    if (node.type === 'AssignmentPattern') {
      return collectBindingNames(node.left);
    }
    return [];
  }

  function hasTypeAnnotation(node: AnyNode): boolean {
    if (!isObject(node)) return false;
    if ((node as Record<string, unknown>).typeAnnotation) return true;
    if (node.type === 'Parameter') {
      return hasTypeAnnotation(node.pat as AnyNode);
    }
    if (node.type === 'AssignmentPattern') {
      return hasTypeAnnotation(node.left as AnyNode);
    }
    return false;
  }

  function pushFrame(node: Record<string, unknown>): void {
    const name = getFunctionName(node);
    const { line, column } = positionFrom(node, lineOffsets);
    const { line: endLine } = endPositionFrom(node, lineOffsets);
    const bindings = new Set<string>();
    const propBindingSet = new Set<string>();
    if (name) {
      bindings.add(name);
    }
    const isComponent = containsJsx(node);
    const params = node.params as AnyNode[];
    if (Array.isArray(params)) {
      for (const param of params) {
        for (const bindingName of collectBindingNames(param)) {
          bindings.add(bindingName);
          if (isComponent || bindingName === 'props') {
            propBindingSet.add(bindingName);
          }
        }
        //  dead-code detector. Push each parameter name
        //  to the deadCode.bindings list with kind: 'parameter' so
        //  the `dead/unused-parameter` rule can flag it if no
        //  identifier reference appears in the function body. We
        //  use the parameter node's own position (not the
        //  function's) so the issue points at the parameter, not
        //  the `function` keyword.
        const { line: pLine, column: pCol } = positionFrom(param, lineOffsets);
        for (const bindingName of collectBindingNames(param)) {
          facts.deadCode.bindings.push({
            name: bindingName,
            kind: 'parameter',
            line: pLine,
            column: pCol,
            isReferenced: false,
          });
        }
        // Round 23: dropped the missing-annotation branch. Real human code
        // has tons of untyped lambda params; the rule should fire only on
        // the explicit `: any` keyword.
        // if (isTypeScript && !hasTypeAnnotation(param)) { ... }
      }
    }
    ctx.stack.push({
      name,
      line,
      column,
      endLine,
      isServerComponent: !ctx.useClient,
      hookCalls: [],
      stateBindings: [],
      propBindings: [],
      propPassThroughs: [],
      propUsages: [],
      isComponent,
      bindings,
      //  dead-code detector: per-frame referenced-name set.
      //  Identifiers encountered inside the frame are added to this
      //  set; the deadCode builder unions it with parent frames at
      //  pop time so a binding is considered used if any reachable
      //  scope references it.
      references: new Set<string>(),
      propBindingSet,
      propUsageSet: new Set<string>(),
      node,
    });
  }

  function popFrame(): void {
    const frame = ctx.stack.pop();
    if (frame && frame.isComponent) {
      const { isComponent, bindings, propBindingSet, propUsageSet, node, ...component } = frame;
      component.propBindings = [...propBindingSet];
      component.propUsages = [...propUsageSet];
      facts.components.push(component as ComponentFacts);
      facts.componentSizes.push({
        name: component.name,
        lineCount: component.endLine - component.line + 1,
        jsxBranchCount: countJsxBranches(node),
        line: component.line,
        column: component.column,
      });
    }
  }

  // v0.6.0: see the comment above the collectBindingNames block —
  // isAndChainChildLocal / containsNode / isBindingSite / isNonComputedMemberProperty /
  // markStateReference were the remaining dead closure helpers.

  function processNode(node: AnyNode, parent: AnyNode, path: AnyNode[]): boolean {
    if (!isObject(node)) return false;

    // v0.9.3: all 9 per-node-type handlers (ExpressionStatement,
    // ImportDeclaration, BinaryExpression, CallExpression,
    // JSXAttribute, JSXOpeningElement, VariableDeclarator, Identifier,
    // MemberExpression) live in visitors/dispatch.ts and are keyed by
    // AST node type in the HANDLERS dispatch table. processNode
    // delegates the entire decision; the inline if-chain that used to
    // route to closure-bound handlers here is gone.
    return dispatchNode(node, parent, path, { facts, ctx, source, lineOffsets, framework, visit });
  }

  function visit(node: AnyNode, parent: AnyNode = null, path: AnyNode[] = []): void {
    if (!isObject(node)) return;

    const type = getNodeType(node);
    const isFunction = type === 'FunctionDeclaration' || type === 'FunctionExpression' || type === 'ArrowFunctionExpression';
    const isMap = isMapCall(node);

    if (isFunction) {
      pushFrame(node);
      // Round 23: detect React.memo(...) and React.forwardRef(...) wrapping.
      // Two effects:
      //   1. The inline-event-handler rule is only meaningful for memoized
      //      components (else the perf cost is zero).
      //   2. A memo()/forwardRef()-wrapped component is by definition a
      //      client component, so the boundary-violation rule must not
      //      flag its hooks as "client hooks in a server component".
      if (isMemoOrForwardRefCall(parent) || isWrappedInMemoOrForwardRef(path, node)) {
        const top = ctx.stack[ctx.stack.length - 1];
        if (top) {
          top.isMemoWrapped = true;
          top.isServerComponent = false;
        }
      }
    }
    if (isMap) {
      ctx.mapDepth++;
      ctx.pendingKeyChecks++;
    }

    const currentPath = [...path, node];
    const skipChildren = processNode(node, parent, currentPath);

    // Round 28: if this node is a JSXElement with a `key` prop on its
    // opening element, bump keyDepth so descendant JSX is treated as
    // "inside a keyed parent" and skipped by key-prop-missing. The
    // JSXOpeningElement itself doesn't own its subtree (the walker
    // iterates JSXElement's Object.values, where JSXOpeningElement is
    // just one sibling of the children array), so we manage the depth
    // here at the JSXElement boundary.
    let keyedJsxDepthBump = false;
    if (type === 'JSXElement' && isObject(node.opening)) {
      const opening = node.opening as Record<string, unknown>;
      const openingAttrs = Array.isArray(opening.attributes) ? (opening.attributes as unknown[]) : [];
      const openingHasKey = openingAttrs.some(
        (a) => isObject(a) && a.type === 'JSXAttribute' && jsxAttrName(a) === 'key',
      );
      if (openingHasKey) {
        ctx.keyDepth++;
        keyedJsxDepthBump = true;
      }
    }

    if (!skipChildren) {
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
          for (const item of value) {
            visit(item, node, currentPath);
          }
        } else if (isObject(value)) {
          visit(value, node, currentPath);
        }
      }
    }

    if (isMap) {
      ctx.mapDepth--;
      // pendingKeyChecks is decremented by the JSXOpeningElement handler
      // (consumed by the first JSX). If no JSX consumed it (e.g. the map
      // callback returns null), decrement on exit to keep the counter balanced.
      if (ctx.pendingKeyChecks > 0) ctx.pendingKeyChecks--;
    }
    if (keyedJsxDepthBump) ctx.keyDepth--;
    if (isFunction) {
      popFrame();
    }
  }

  visit(ast);

  facts.optimisticUpdates = extractOptimisticUpdates(source);

  if (filePath.toLowerCase().endsWith('.astro')) {
    facts.astroComponents = extractAstroComponents(source);
    for (const element of extractAstroElementFacts(source)) {
      facts.allElements.push(element);
    }
  }

  if (filePath.toLowerCase().endsWith('.html')) {
    for (const element of extractHtmlElementFacts(source)) {
      facts.allElements.push(element);
    }
  }

  const templateClassNames: ClassNameFact[] = [];
  mergeTemplateClassNames(filePath, source, facts, templateClassNames);

  // Compute the file extension. We use lastIndexOf on the basename so
  // that paths with dots in the directory (e.g. `/foo.bar/baz.tsx`) still
  // resolve to `.tsx`. For extension-less files we return ''.
  const { ext } = splitFilePath(filePath);

  facts._source = source;

  //  dead-code detector (v0.18.5b). Post-pass to find
  //  statements after a `return` / `throw` / `break` / `continue`
  //  in function bodies. The visitor's pre-order walk can't see
  //  this in a single pass (the terminator's siblings haven't
  //  been visited yet), so we do a second walk over the AST.
  facts.deadCode.unreachableStatements = findUnreachableStatements(
    ast as unknown,
    source,
    lineOffsets,
  );

  // v0.6.0: v2 build is now a single pure call into
  // ./visitors/v2-build.ts. The walker no longer needs to know about
  // FileMeta / JsxElementRecord / ScanFactsV2 shape internals.
  const v2 = buildV2Facts(facts, source, ext, framework, config, templateClassNames);

  // is discarded — its data is now reachable only via `facts.v2.*`.
  return envelopeScanFacts(filePath, v2);
}

// ---------------------------------------------------------------------------
// helpers for the grouped ScanFactsV2 shape
//
// maxJsxNestingDepth, extractDepNames, and deriveFramework live in
// ./visitors/scan-helpers.ts and are re-exported above.
// ---------------------------------------------------------------------------
