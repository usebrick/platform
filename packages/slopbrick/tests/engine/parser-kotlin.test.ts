/**
 * Smoke tests for `parser-kotlin` (v0.24.0 Phase 0).
 *
 * Mirrors the parser-rust pattern: verify the native binding loads,
 * the parser accepts valid Kotlin, and empty / whitespace / forced-
 * null inputs yield a null tree so callers fall through to the
 * non-AST path.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  forceKotlinParserFailure,
  isKotlinParserAvailable,
  parseKotlin,
} from '../../src/engine/parser-kotlin';

describe('Kotlin tree-sitter parser (smoke)', () => {
  // Always tear down any forced failure so a red test doesn't leak
  // into the next test in the suite (the parser module is shared).
  afterEach(() => {
    forceKotlinParserFailure(null);
  });

  it('parseKotlin returns a tree for valid trivial Kotlin', () => {
    const tree = parseKotlin('fun main() { println("hi") }');
    expect(tree).not.toBeNull();
    expect(tree!.rootNode.type).toBe('source_file');
  });

  it('parseKotlin returns null for empty source', () => {
    expect(parseKotlin('')).toBeNull();
  });

  it('parseKotlin returns null for whitespace-only source', () => {
    expect(parseKotlin('   \n   ')).toBeNull();
  });

  it('isKotlinParserAvailable returns true', () => {
    expect(isKotlinParserAvailable()).toBe(true);
  });

  it('parseKotlin returns null when the parser is forced to fail', () => {
    // `setKotlinParserForTests(null)` only resets the module cache
    // (mirroring parser-rust.ts) — it doesn't actually force a null
    // parse on non-empty source. `forceKotlinParserFailure` is the
    // intentional no-parser simulation knob.
    forceKotlinParserFailure(new Error('mocked missing prebuild'));
    expect(parseKotlin('fun main() { println("hi") }')).toBeNull();
  });
});
