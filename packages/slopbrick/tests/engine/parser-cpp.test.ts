/**
 * Smoke tests for `parser-cpp` (v0.24.0 Phase 0).
 *
 * Mirrors the parser-rust pattern: verify the native binding loads,
 * the parser accepts valid C++, and empty / whitespace / forced-
 * null inputs yield a null tree so callers fall through to the
 * non-AST path.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  forceCppParserFailure,
  isCppParserAvailable,
  parseCpp,
} from '../../src/engine/parser-cpp';

describe('C++ tree-sitter parser (smoke)', () => {
  // Always tear down any forced failure so a red test doesn't leak
  // into the next test in the suite (the parser module is shared).
  afterEach(() => {
    forceCppParserFailure(null);
  });

  it('parseCpp returns a tree for valid trivial C++', () => {
    const tree = parseCpp('int main() { return 0; }');
    expect(tree).not.toBeNull();
    expect(tree!.rootNode.type).toBe('translation_unit');
  });

  it('parseCpp returns null for empty source', () => {
    expect(parseCpp('')).toBeNull();
  });

  it('parseCpp returns null for whitespace-only source', () => {
    expect(parseCpp('   \n   ')).toBeNull();
  });

  it('isCppParserAvailable returns true', () => {
    expect(isCppParserAvailable()).toBe(true);
  });

  it('parseCpp returns null when the parser is forced to fail', () => {
    // `setCppParserForTests(null)` only resets the module cache
    // (mirroring parser-rust.ts) — it doesn't actually force a null
    // parse on non-empty source. `forceCppParserFailure` is the
    // intentional no-parser simulation knob.
    forceCppParserFailure(new Error('mocked missing prebuild'));
    expect(parseCpp('int main() { return 0; }')).toBeNull();
  });
});
