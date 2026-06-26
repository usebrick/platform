import { describe, it, expect } from 'vitest';
import {
  isObject,
  isHookName,
  spanStart,
  spanEnd,
  buildLineOffsets,
  positionFromOffset,
  positionFrom,
  containsJsx,
  stringLiteralValue,
  numericLiteralValue,
  staticClassValue,
  jsxAttrName,
  jsxElementName,
  extractElementFact,
  unwrapJsxExpression,
  unwrapArgument,
  getFunctionName,
  sourceText,
} from '../../src/engine/visitors/react';

/**
 * These are pure functions that operate on SWC AST nodes — testable
 * in isolation from the 1903-line visitor.ts dispatcher.
 */
describe('visitors/react', () => {
  describe('node shape helpers', () => {
    it('isObject returns true for objects, false for null/array/primitive', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ type: 'Foo' })).toBe(true);
      expect(isObject(null)).toBe(false);
      expect(isObject([1, 2])).toBe(false);
      expect(isObject('x')).toBe(false);
      expect(isObject(42)).toBe(false);
    });

    it('isHookName returns true for React hooks (useState, useEffect, custom)', () => {
      expect(isHookName('useState')).toBe(true);
      expect(isHookName('useEffect')).toBe(true);
      expect(isHookName('useMyThing')).toBe(true);
      // 4 chars: 'user' has 4 chars total, name[3]='r' (uppercase).
      // The function treats any 4+-char name where 4th char is uppercase
      // as a hook. 'user' qualifies. 'use' is too short.
      expect(isHookName('use')).toBe(false); // too short
      // 'useloop' has 4th char 'l' which is lowercase, so NOT a hook.
      expect(isHookName('useloop')).toBe(false);
    });
  });

  describe('span and position helpers', () => {
    const lineOffsets = buildLineOffsets('line1\nline2\nline3');

    it('buildLineOffsets returns starting offset per line', () => {
      expect(lineOffsets).toEqual([0, 6, 12]);
    });

    it('positionFromOffset converts byte offset to line/column', () => {
      // SWC byte offsets are 1-based; offset 7 → byteOffset 6 (start of line 2)
      expect(positionFromOffset(7, lineOffsets)).toEqual({ line: 2, column: 1 });
    });

    it('positionFrom reads span.start from node', () => {
      // span.start=8 → byteOffset=7 → column 7-6+1=2
      const node = { span: { start: 8, end: 12 } };
      expect(positionFrom(node, lineOffsets)).toEqual({ line: 2, column: 2 });
    });

    it('positionFrom returns (1,1) when node has no span', () => {
      expect(positionFrom({}, lineOffsets)).toEqual({ line: 1, column: 1 });
    });

    it('spanStart/spanEnd handle missing spans', () => {
      expect(spanStart({})).toBeUndefined();
      expect(spanEnd({})).toBeUndefined();
      expect(spanStart({ span: { start: 10 } })).toBe(10);
      expect(spanEnd({ span: { end: 20 } })).toBe(20);
    });
  });

  describe('JSX walker helpers', () => {
    it('containsJsx returns true for nodes with JSXElement descendants', () => {
      expect(containsJsx({ type: 'FunctionDeclaration', body: { type: 'JSXElement' } })).toBe(true);
      expect(containsJsx({ type: 'VariableDeclaration', declarations: [{ init: { type: 'JSXFragment' } }] })).toBe(true);
      expect(containsJsx({ type: 'VariableDeclaration' })).toBe(false);
    });

    it('jsxAttrName reads JSXAttribute name', () => {
      expect(jsxAttrName({ type: 'JSXAttribute', name: { value: 'className' } })).toBe('className');
      expect(jsxAttrName({ type: 'JSXAttribute', name: { name: 'data-x' } })).toBe('data-x');
      expect(jsxAttrName({ type: 'JSXExpressionContainer' })).toBeUndefined();
    });

    it('jsxElementName reads JSXOpeningElement name', () => {
      expect(jsxElementName({ type: 'JSXOpeningElement', name: { value: 'div' } })).toBe('div');
      expect(jsxElementName({ type: 'JSXClosingElement', name: { value: 'div' } })).toBe('div');
      expect(jsxElementName({ type: 'JSXElement', opening: { type: 'JSXOpeningElement', name: { value: 'Card' } } })).toBe('Card');
    });

    it('unwrapJsxExpression unwraps JSXExpressionContainer', () => {
      const inner = { type: 'Identifier', value: 'x' };
      expect(unwrapJsxExpression({ type: 'JSXExpressionContainer', expression: inner })).toBe(inner);
      expect(unwrapJsxExpression(inner)).toBe(inner);
    });

    it('unwrapArgument unwraps wrapped expressions', () => {
      const inner = { type: 'Identifier', value: 'x' };
      expect(unwrapArgument({ type: 'Argument', expression: inner })).toBe(inner);
      expect(unwrapArgument({ expression: inner })).toBe(inner);
      expect(unwrapArgument(inner)).toBe(inner);
    });

    it('extractElementFact returns ElementFact with attributes and classNames', () => {
      const lineOffsets = buildLineOffsets('');
      const el = {
        type: 'JSXOpeningElement',
        span: { start: 1, end: 50 },
        name: { value: 'div' },
        attributes: [
          {
            type: 'JSXAttribute',
            name: { value: 'className' },
            value: { type: 'StringLiteral', value: 'flex gap-4' },
          },
          {
            type: 'JSXAttribute',
            name: { value: 'onClick' },
            value: { type: 'JSXExpressionContainer', expression: { type: 'Identifier', value: 'x' } },
          },
        ],
      };
      const fact = extractElementFact(el, lineOffsets);
      expect(fact).toBeDefined();
      expect(fact!.tag).toBe('div');
      expect(fact!.attributes.className).toBe('flex gap-4');
      expect(fact!.attributes.onClick).toBeUndefined(); // expression, not string
      expect(fact!.classNames.map((c) => c.value)).toEqual(['flex gap-4']);
      expect(fact!.eventHandlers).toEqual(['onClick']);
    });
  });

  describe('literal extraction', () => {
    it('stringLiteralValue reads StringLiteral.value', () => {
      expect(stringLiteralValue({ type: 'StringLiteral', value: 'hello' })).toBe('hello');
      expect(stringLiteralValue({ type: 'StringLiteral' })).toBeUndefined();
    });

    it('numericLiteralValue reads NumericLiteral.value as string', () => {
      expect(numericLiteralValue({ type: 'NumericLiteral', value: 42 })).toBe('42');
      expect(numericLiteralValue({ type: 'NumericLiteral' })).toBeUndefined();
    });

    it('staticClassValue prefers StringLiteral over TemplateLiteral', () => {
      expect(staticClassValue({ type: 'StringLiteral', value: 'a' })).toBe('a');
      expect(staticClassValue({ type: 'TemplateLiteral', quasis: [{ raw: 'b', cooked: 'b' }], expressions: [] })).toBe('b');
    });
  });

  describe('function and source helpers', () => {
    it('getFunctionName reads identifier for FunctionDeclaration', () => {
      expect(getFunctionName({ type: 'FunctionDeclaration', identifier: { value: 'Foo' } })).toBe('Foo');
      expect(getFunctionName({ type: 'FunctionExpression', identifier: { value: 'Bar' } })).toBe('Bar');
      expect(getFunctionName({ type: 'ArrowFunctionExpression' })).toBeUndefined();
    });

    it('sourceText returns "expr" when span missing', () => {
      expect(sourceText({}, 'any source')).toBe('expr');
    });

    it('sourceText returns slice from source', () => {
      // SWC spans are 1-based; start=6 → index 5, end=11 → index 10
      // 'hello world'[5..10] = ' worl'
      expect(sourceText({ span: { start: 6, end: 11 } }, 'hello world')).toBe(' worl');
    });
  });
});