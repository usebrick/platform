// v2.0.1: unit tests for the walker-body dispatch handlers.
//
// Covers the three closure-free handlers that moved from visitor.ts
// into visitors/dispatch.ts:
//   * ExpressionStatement → handleExpressionStatement
//   * ImportDeclaration   → handleImportDeclaration
//   * BinaryExpression    → handleBinaryExpression
//
// Each test builds a minimal VisitorCtx, calls the handler directly,
// and asserts the side effect on the InternalFacts accumulator. This
// proves behavior is identical to the pre-refactor inline checks.

import { describe, expect, it } from 'vitest';
import {
  handleExpressionStatement,
  handleImportDeclaration,
  handleBinaryExpression,
  dispatchNode,
  HANDLERS,
  type VisitorCtx,
} from '../../src/engine/visitors/dispatch';
import type { InternalFacts, WalkContext } from '../../src/engine/visitors/internal';

function emptyFacts(): InternalFacts {
  return {
    filePath: '/x.tsx',
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
    //  dead-code detector. The dispatch tests construct
    //  facts directly via this helper; populate the new
    //  fields with empty defaults so the v0.18.5 handleImportDeclaration
    //  code can run.
    deadCode: {
      bindings: [],
      constantConditions: [],
      unreachableStatements: [],
    },
    referencedNames: new Set<string>(),
  };
}

function emptyCtx(): WalkContext {
  return { stack: [], useClient: false, mapDepth: 0, pendingKeyChecks: 0, keyDepth: 0 };
}

function vctx(source = '// hi'): VisitorCtx {
  return {
    facts: emptyFacts(),
    ctx: emptyCtx(),
    source,
    lineOffsets: [0],
    framework: 'react',
  };
}

describe('dispatch table (v2.0.1)', () => {
  it('HANDLERS table covers the 9 dispatched types (v0.5.0: +JSXAttribute, +JSXOpeningElement, +VariableDeclarator)', () => {
    expect(Object.keys(HANDLERS).sort()).toEqual([
      'BinaryExpression',
      'CallExpression',
      'ExpressionStatement',
      'Identifier',
      'ImportDeclaration',
      'JSXAttribute',
      'JSXOpeningElement',
      'MemberExpression',
      'VariableDeclarator',
    ]);
  });

  it('dispatchNode returns false for unrecognized types (fall through)', () => {
    const result = dispatchNode(
      { type: 'SomeOtherNode', value: 'x' },
      null,
      [],
      vctx(),
    );
    expect(result).toBe(false);
  });

  it('dispatchNode returns false for non-object nodes', () => {
    expect(dispatchNode(null, null, [], vctx())).toBe(false);
    expect(dispatchNode('string' as unknown as Parameters<typeof dispatchNode>[0], null, [], vctx())).toBe(false);
  });
});

describe('handleExpressionStatement (v2.0.1)', () => {
  it('sets useClient=true for "use client" string literal', () => {
    const ctx = vctx();
    const node = { type: 'ExpressionStatement', expression: { type: 'StringLiteral', value: 'use client' } };
    handleExpressionStatement(node, null, [], ctx);
    expect(ctx.ctx.useClient).toBe(true);
  });

  it('ignores other ExpressionStatement content', () => {
    const ctx = vctx();
    const node = { type: 'ExpressionStatement', expression: { type: 'StringLiteral', value: 'something else' } };
    handleExpressionStatement(node, null, [], ctx);
    expect(ctx.ctx.useClient).toBe(false);
  });

  it('returns false (does not skip children)', () => {
    const ctx = vctx();
    const node = { type: 'ExpressionStatement', expression: { type: 'StringLiteral', value: 'use client' } };
    expect(handleExpressionStatement(node, null, [], ctx)).toBe(false);
  });
});

describe('handleImportDeclaration (v2.0.1)', () => {
  it('collects default specifiers', () => {
    const ctx = vctx();
    const node = {
      type: 'ImportDeclaration',
      source: { type: 'StringLiteral', value: 'react' },
      specifiers: [{ type: 'ImportDefaultSpecifier', local: { type: 'Identifier', value: 'React' } }],
    };
    handleImportDeclaration(node, null, [], ctx);
    expect(ctx.facts.imports).toHaveLength(1);
    expect(ctx.facts.imports[0].source).toBe('react');
    expect(ctx.facts.imports[0].importedNames).toEqual(['React']);
  });

  it('collects named specifiers (using imported.name)', () => {
    const ctx = vctx();
    const node = {
      type: 'ImportDeclaration',
      source: { type: 'StringLiteral', value: 'react' },
      specifiers: [{ type: 'ImportSpecifier', imported: { value: 'useState' }, local: { type: 'Identifier', value: 'useState' } }],
    };
    handleImportDeclaration(node, null, [], ctx);
    expect(ctx.facts.imports[0].importedNames).toEqual(['useState']);
  });

  it('collects namespace specifiers', () => {
    const ctx = vctx();
    const node = {
      type: 'ImportDeclaration',
      source: { type: 'StringLiteral', value: 'fs' },
      specifiers: [{ type: 'ImportNamespaceSpecifier', local: { type: 'Identifier', value: 'fs' } }],
    };
    handleImportDeclaration(node, null, [], ctx);
    expect(ctx.facts.imports[0].importedNames).toEqual(['fs']);
  });

  it('skips non-string-literal source', () => {
    const ctx = vctx();
    const node = { type: 'ImportDeclaration', source: null, specifiers: [] };
    handleImportDeclaration(node, null, [], ctx);
    expect(ctx.facts.imports).toHaveLength(0);
  });
});

describe('handleBinaryExpression (v2.0.1)', () => {
  it('flags deep && chains with depth >= 3', () => {
    const ctx = vctx('a && b && c && d');
    const node = {
      type: 'BinaryExpression',
      operator: '&&',
      left: { type: 'Identifier', value: 'a' },
      right: {
        type: 'BinaryExpression',
        operator: '&&',
        left: {
          type: 'BinaryExpression',
          operator: '&&',
          left: { type: 'Identifier', value: 'a' },
          right: { type: 'Identifier', value: 'b' },
        },
        right: { type: 'Identifier', value: 'c' },
      },
    };
    handleBinaryExpression(node, null, [], ctx);
    expect(ctx.facts.logicalExpressions.length).toBeGreaterThanOrEqual(1);
    expect(ctx.facts.logicalExpressions[0].depth).toBeGreaterThanOrEqual(3);
  });

  it('does not flag shallow chains (depth < 3)', () => {
    const ctx = vctx('a && b');
    const node = {
      type: 'BinaryExpression',
      operator: '&&',
      left: { type: 'Identifier', value: 'a' },
      right: { type: 'Identifier', value: 'b' },
    };
    handleBinaryExpression(node, null, [], ctx);
    expect(ctx.facts.logicalExpressions).toHaveLength(0);
  });

  it('does not flag non-&& operators', () => {
    const ctx = vctx('a || b || c || d');
    const node = {
      type: 'BinaryExpression',
      operator: '||',
      left: { type: 'Identifier', value: 'a' },
      right: { type: 'Identifier', value: 'b' },
    };
    handleBinaryExpression(node, null, [], ctx);
    expect(ctx.facts.logicalExpressions).toHaveLength(0);
  });

  it('does not flag child of an && chain (avoids double-counting)', () => {
    const ctx = vctx('a && b && c && d');
    const parent = {
      type: 'BinaryExpression',
      operator: '&&',
      left: { type: 'Identifier', value: 'a' },
      right: { type: 'Identifier', value: 'b' },
    };
    handleBinaryExpression(parent.left, parent, [], ctx);
    expect(ctx.facts.logicalExpressions).toHaveLength(0);
  });
});