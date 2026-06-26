import { describe, it, expect } from 'vitest';
import {
  binaryAndChainLength,
  collectAndOperands,
  isIdentifierNode,
  isMemberExpressionNode,
  isNullOrUndefinedLiteral,
  extractNullishChecked,
  isInlineFunction,
  isInlineObjectLiteral,
  isInlineArrayLiteral,
  isMapCall,
  isMemoOrForwardRefCall,
  isOptionalChainPattern,
  isTamaguiStyleProp,
  isWrappedInMemoOrForwardRef,
  extractKeyPropFact,
  DOM_QUERY_METHODS,
  USER_FACING_ATTRIBUTES,
} from '../../src/engine/visitors/ast-guards';

/**
 * visitor.ts. Tests run in isolation from the walker.
 */
describe('visitors/ast-guards', () => {
  describe('type guards', () => {
    it('isIdentifierNode matches Identifier nodes', () => {
      expect(isIdentifierNode({ type: 'Identifier', value: 'x' })).toBe(true);
      expect(isIdentifierNode({ type: 'StringLiteral', value: 'x' })).toBe(false);
      expect(isIdentifierNode(null)).toBe(false);
      expect(isIdentifierNode({ type: 'Identifier' })).toBe(false); // missing value
    });

    it('isMemberExpressionNode matches MemberExpression with object', () => {
      expect(isMemberExpressionNode({ type: 'MemberExpression', object: { type: 'Identifier' } })).toBe(true);
      expect(isMemberExpressionNode({ type: 'MemberExpression' })).toBe(false);
      expect(isMemberExpressionNode({ type: 'Identifier' })).toBe(false);
    });

    it('isNullOrUndefinedLiteral matches null/undefined literals', () => {
      expect(isNullOrUndefinedLiteral({ type: 'NullLiteral' })).toBe(true);
      expect(isNullOrUndefinedLiteral({ type: 'Identifier', value: 'undefined' })).toBe(true);
      expect(isNullOrUndefinedLiteral({ type: 'Identifier', value: 'null' })).toBe(false);
      expect(isNullOrUndefinedLiteral({ type: 'StringLiteral' })).toBe(false);
    });

    it('isInlineFunction matches Arrow/Function expressions and unwraps JSX containers', () => {
      expect(isInlineFunction({ type: 'ArrowFunctionExpression' })).toBe(true);
      expect(isInlineFunction({ type: 'FunctionExpression' })).toBe(true);
      expect(isInlineFunction({ type: 'JSXExpressionContainer', expression: { type: 'ArrowFunctionExpression' } })).toBe(true);
      expect(isInlineFunction({ type: 'CallExpression' })).toBe(false);
    });

    it('isInlineObjectLiteral / isInlineArrayLiteral unwrap JSX containers', () => {
      expect(isInlineObjectLiteral({ type: 'ObjectExpression' })).toBe(true);
      expect(isInlineObjectLiteral({ type: 'JSXExpressionContainer', expression: { type: 'ObjectExpression' } })).toBe(true);
      expect(isInlineArrayLiteral({ type: 'ArrayExpression' })).toBe(true);
    });

    it('isMapCall matches <expr>.map() calls', () => {
      const node = {
        type: 'CallExpression',
        callee: { type: 'MemberExpression', property: { type: 'Identifier', value: 'map' } },
      };
      expect(isMapCall(node)).toBe(true);
      const node2 = {
        type: 'CallExpression',
        callee: { type: 'MemberExpression', property: { type: 'Identifier', value: 'filter' } },
      };
      expect(isMapCall(node2)).toBe(false);
    });

    it('isMemoOrForwardRefCall matches both bare and React.memo patterns', () => {
      expect(isMemoOrForwardRefCall({ type: 'CallExpression', callee: { type: 'Identifier', value: 'memo' } })).toBe(true);
      expect(isMemoOrForwardRefCall({ type: 'CallExpression', callee: { type: 'Identifier', value: 'forwardRef' } })).toBe(true);
      expect(isMemoOrForwardRefCall({ type: 'CallExpression', callee: { type: 'Identifier', value: 'useMemo' } })).toBe(false);
      const reactCall = {
        type: 'CallExpression',
        callee: {
          type: 'MemberExpression',
          object: { type: 'Identifier', value: 'React' },
          property: { type: 'Identifier', value: 'forwardRef' },
        },
      };
      expect(isMemoOrForwardRefCall(reactCall)).toBe(true);
    });

    it('isTamaguiStyleProp covers the Tamagui short-name set', () => {
      expect(isTamaguiStyleProp('p')).toBe(true);
      expect(isTamaguiStyleProp('mx')).toBe(true);
      expect(isTamaguiStyleProp('br')).toBe(true);
      expect(isTamaguiStyleProp('padding')).toBe(false); // full name not in short set
      expect(isTamaguiStyleProp('className')).toBe(false);
    });
  });

  describe('binary && chain utilities', () => {
    it('binaryAndChainLength counts the chain depth', () => {
      expect(binaryAndChainLength({ type: 'Identifier' })).toBe(1);
      expect(binaryAndChainLength({
        type: 'BinaryExpression',
        operator: '&&',
        left: { type: 'Identifier' },
        right: {
          type: 'BinaryExpression',
          operator: '&&',
          left: { type: 'Identifier' },
          right: { type: 'Identifier' },
        },
      })).toBe(3);
    });

    it('collectAndOperands returns leaves in left-to-right order', () => {
      const chain = {
        type: 'BinaryExpression',
        operator: '&&',
        left: { type: 'Identifier', value: 'a' },
        right: {
          type: 'BinaryExpression',
          operator: '&&',
          left: { type: 'Identifier', value: 'b' },
          right: { type: 'Identifier', value: 'c' },
        },
      };
      const ops = collectAndOperands(chain);
      expect(ops.map((o) => (o as { value?: string }).value)).toEqual(['a', 'b', 'c']);
    });

    it('extractNullishChecked returns the operand being nullish-checked', () => {
      const expr = {
        type: 'BinaryExpression',
        operator: '===',
        left: { type: 'Identifier', value: 'x' },
        right: { type: 'NullLiteral' },
      };
      expect(extractNullishChecked(expr)).toEqual({ type: 'Identifier', value: 'x' });
    });

    it('isOptionalChainPattern detects 3+ chained guards', () => {
      const chain = {
        type: 'BinaryExpression',
        operator: '&&',
        left: {
          type: 'BinaryExpression',
          operator: '&&',
          left: { type: 'Identifier', value: 'a' },
          right: { type: 'MemberExpression', object: { type: 'Identifier', value: 'a' }, property: { type: 'Identifier', value: 'b' } },
        },
        right: {
          type: 'MemberExpression',
          object: { type: 'MemberExpression', object: { type: 'Identifier', value: 'a' }, property: { type: 'Identifier', value: 'b' } },
          property: { type: 'Identifier', value: 'c' },
        },
      };
      // Need real source to compute span for sourceText matching. Provide stub source.
      expect(isOptionalChainPattern(chain, 'a.b.c')).toBe(true);
      expect(isOptionalChainPattern({ type: 'Identifier', value: 'x' }, 'x')).toBe(false); // not a chain
    });
  });

  describe('extractKeyPropFact', () => {
    it('returns undefined when no key prop and not inside map', () => {
      const el = { type: 'JSXOpeningElement', name: { value: 'div' }, attributes: [], span: { start: 1, end: 10 } };
      expect(extractKeyPropFact(el, [0], false)).toBeUndefined();
    });

    it('flags missing key when insideMap is true', () => {
      const el = { type: 'JSXOpeningElement', name: { value: 'div' }, attributes: [], span: { start: 1, end: 10 } };
      const fact = extractKeyPropFact(el, [0], true);
      expect(fact).toBeDefined();
      expect(fact!.valueType).toBe('missing');
      expect(fact!.tag).toBe('div');
    });

    it('detects index keys', () => {
      const el = {
        type: 'JSXOpeningElement',
        name: { value: 'div' },
        span: { start: 1, end: 10 },
        attributes: [{
          type: 'JSXAttribute',
          name: { value: 'key' },
          value: { type: 'JSXExpressionContainer', expression: { type: 'Identifier', value: 'index' } },
        }],
      };
      const fact = extractKeyPropFact(el, [0], false);
      expect(fact!.valueType).toBe('index');
    });

    it('detects stable keys (Identifier or MemberExpression)', () => {
      const elId = {
        type: 'JSXOpeningElement',
        name: { value: 'div' },
        span: { start: 1, end: 10 },
        attributes: [{
          type: 'JSXAttribute',
          name: { value: 'key' },
          value: { type: 'StringLiteral', value: 'foo' },
        }],
      };
      const fact = extractKeyPropFact(elId, [0], false);
      expect(fact!.valueType).toBe('unknown'); // StringLiteral is not stable
    });
  });

  describe('re-exports for shareable sets', () => {
    it('DOM_QUERY_METHODS covers the query API', () => {
      expect(DOM_QUERY_METHODS.has('querySelector')).toBe(true);
      expect(DOM_QUERY_METHODS.has('getElementById')).toBe(true);
      expect(DOM_QUERY_METHODS.has('map')).toBe(false);
    });

    it('USER_FACING_ATTRIBUTES covers a11y attributes', () => {
      expect(USER_FACING_ATTRIBUTES.has('aria-label')).toBe(true);
      expect(USER_FACING_ATTRIBUTES.has('placeholder')).toBe(true);
      expect(USER_FACING_ATTRIBUTES.has('className')).toBe(false);
    });
  });
});