/**
 * Smoke tests for `parser-swift` (v0.24.0 Phase 0).
 *
 * Mirrors the parser-rust pattern: verify the native binding loads,
 * the parser accepts valid Swift, and empty / whitespace / forced-
 * null inputs yield a null tree so callers fall through to the
 * non-AST path.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  forceSwiftParserFailure,
  isSwiftParserAvailable,
  parseSwift,
} from '../../src/engine/parser-swift';

describe('Swift tree-sitter parser (smoke)', () => {
  // Always tear down any forced failure so a red test doesn't leak
  // into the next test in the suite (the parser module is shared).
  afterEach(() => {
    forceSwiftParserFailure(null);
  });

  it('parseSwift returns a tree for valid trivial Swift', () => {
    const tree = parseSwift('func greet() { print("hi") }');
    expect(tree).not.toBeNull();
    expect(tree!.rootNode.type).toBe('source_file');
  });

  it('parseSwift returns null for empty source', () => {
    expect(parseSwift('')).toBeNull();
  });

  it('parseSwift returns null for whitespace-only source', () => {
    expect(parseSwift('   \n   ')).toBeNull();
  });

  it('isSwiftParserAvailable returns true', () => {
    expect(isSwiftParserAvailable()).toBe(true);
  });

  it('parseSwift returns null when the parser is forced to fail', () => {
    // `setSwiftParserForTests(null)` only resets the module cache
    // (mirroring parser-rust.ts) — it doesn't actually force a null
    // parse on non-empty source. `forceSwiftParserFailure` is the
    // intentional no-parser simulation knob.
    forceSwiftParserFailure(new Error('mocked missing prebuild'));
    expect(parseSwift('func greet() { print("hi") }')).toBeNull();
  });
});
