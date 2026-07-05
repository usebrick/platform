// v0.42.0 tests for the shared tree-sitter parse helper at
// src/engine/parser-shared.ts. Verifies the contract that the four
// per-language parsers now rely on (cpp/rust/kotlin/swift).
import { describe, expect, it } from 'vitest';
import {
  parseTreeSitterSource,
  type Tree,
  type ParserResult,
  type TSNode,
} from '../../src/engine/parser-shared';

// Minimal Parser stub: only the `parse` method is exercised by
// the helper. The helper reads `source.trim()`, then calls
// `parser.parse(source)` and inspects the returned shape.
function fakeParserOk(): ParserResult {
  return {
    ok: true,
    parser: {
      parse: (source: string) => ({
        rootNode: { type: 'translation_unit', source, namedChildren: [] },
      }),
    } as unknown as Parameters<typeof parseTreeSitterSource>[0]['parser'],
  };
}

function fakeNullParser(): ParserResult {
  return {
    ok: true,
    parser: {
      parse: () => null,
    } as unknown as Parameters<typeof parseTreeSitterSource>[0]['parser'],
  };
}

function fakeErrorParser(): ParserResult {
  return {
    ok: true,
    parser: {
      parse: () => {
        throw new Error('parser binding crashed');
      },
    } as unknown as Parameters<typeof parseTreeSitterSource>[0]['parser'],
  };
}

function fakeErrorRootParser(): ParserResult {
  return {
    ok: true,
    parser: {
      parse: () => ({
        rootNode: { type: 'ERROR', childCount: 0 },
      }),
    } as unknown as Parameters<typeof parseTreeSitterSource>[0]['parser'],
  };
}

function fakeNoChildRootParser(): ParserResult {
  return {
    ok: true,
    parser: {
      parse: () => ({
        rootNode: undefined,
      }),
    } as unknown as Parameters<typeof parseTreeSitterSource>[0]['parser'],
  };
}

describe('parseTreeSitterSource — shared helper contract', () => {
  it('returns null when parserResult.ok is false (binding failed)', () => {
    const result: ParserResult = {
      ok: false,
      error: new Error('native binding unavailable'),
    };
    expect(parseTreeSitterSource(result, 'int main() { return 0; }')).toBeNull();
  });

  it('returns null for empty source', () => {
    expect(parseTreeSitterSource(fakeParserOk(), '')).toBeNull();
  });

  it('returns null for whitespace-only source', () => {
    expect(parseTreeSitterSource(fakeParserOk(), '   \n  \t  ')).toBeNull();
  });

  it('returns the parsed tree for valid source', () => {
    const tree = parseTreeSitterSource(fakeParserOk(), 'int x = 0;');
    expect(tree).not.toBeNull();
    expect(tree!.rootNode.type).toBe('translation_unit');
  });

  it('returns null when the underlying parser returns null', () => {
    expect(parseTreeSitterSource(fakeNullParser(), 'int x = 0;')).toBeNull();
  });

  it('returns null when the underlying parser throws', () => {
    // A binding crash mid-parse must NOT propagate as an exception;
    // the engine callers rely on null + graceful fallback.
    expect(() => parseTreeSitterSource(fakeErrorParser(), 'int x = 0;')).not.toThrow();
    expect(parseTreeSitterSource(fakeErrorParser(), 'int x = 0;')).toBeNull();
  });

  it('returns null when the root is an empty ERROR subtree', () => {
    expect(parseTreeSitterSource(fakeErrorRootParser(), 'int x = 0;')).toBeNull();
  });

  it('returns null when the rootNode is undefined', () => {
    expect(parseTreeSitterSource(fakeNoChildRootParser(), 'int x = 0;')).toBeNull();
  });
});

describe('Tree / TSNode structural types — shared surface', () => {
  // Sanity check: TS enforces the structural shape via the type
  // declarations. This test is a runtime fallback for compile-time
  // invariants — if anyone weakens the types, the cast warnings
  // would surface first.
  it('Tree and TSNode are exported and assignable from the stub shape', () => {
    const stub = { rootNode: { type: 'x' } };
    const tree = stub as unknown as Tree;
    expect(tree.rootNode.type).toBe('x');
  });

  it('TSNode structural fields are loosely typed (any opaque)', () => {
    // The structural types accept the dynamic shape that tree-sitter
    // actually returns. We use an opaque assertion to verify it
    // doesn't break the structural contract.
    const node = {
      type: 'identifier',
      startIndex: 0,
      endIndex: 7,
      startPosition: { row: 0, column: 0 },
      endPosition: { row: 0, column: 7 },
      text: 'slopbrk',
      childCount: 0,
      child: () => null,
      childForFieldName: () => null,
      fieldNameForChild: () => null,
      parent: null,
      namedChildCount: 0,
      namedChild: () => null,
    } satisfies TSNode;
    expect(node.text).toBe('slopbrk');
  });
});
