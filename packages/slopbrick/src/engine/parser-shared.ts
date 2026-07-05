// v0.42.0 (post-self-scan Tier-3 cleanup): shared boilerplate for the
// per-language tree-sitter parsers (parser-cpp, parser-rust,
// parser-kotlin, parser-swift). Each `parseXxx(source)` was 18 lines
// of identical try/catch + ERROR-root validation + tree cast. The
// dup/identical-block rule fired 42 times across the four files.
//
// This file holds:
//   - the structural `Tree` / `TSNode` interface (was duplicated in
//     every parser file)
//   - a `parseTreeSitterSource(parserResult, source)` helper that
//     consolidates the lazy-init failure gate + empty-source check +
//     tree-sitter parse call + ERROR-root filtering + tree-cast +
//     try/catch contract
//
// Each per-language parser still owns its own:
//   - Parser() initialisation (the cached native binding)
//   - forced-failure injection
//   - the public `parseXxx` symbol callers depend on
//
// That boundary keeps the savings focused on the duplicated
// algorithm — not on the per-language parser-binding plumbing.
//
// v0.21.0 already noted this refactor in its roadmap; the v0.42.0
// self-scan surfaced it as a 50-fire Tier-3 noise floor.

import type Parser from 'tree-sitter';

/**
 * Structural type for a tree-sitter `Tree`. The published `tree-sitter`
 * types don't strongly type this surface; we mirror it here so
 * visitors and the parsers can share the same name.
 */
export interface Tree {
  rootNode: TSNode;
  readonly [key: string]: unknown;
}

/**
 * Structural type for a tree-sitter `Node`. Mirrors the subset the
 * visitors consume.
 */
export interface TSNode {
  type: string;
  startIndex: number;
  endIndex: number;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  text: string;
  childCount: number;
  child(index: number): TSNode | null;
  /** First non-null child of a given type, or null. */
  childForFieldName(fieldName: string): TSNode | null;
  /** Field name for child at `index`, or null if no field name. */
  fieldNameForChild(index: number): string | null;
  /** Parent node, or null at the root. */
  parent: TSNode | null;
  /** Named child count (excludes anonymous tokens like `(`, `,`). */
  namedChildCount: number;
  /** Named child at `index`. */
  namedChild(index: number): TSNode | null;
  /** Iteration cursor. */
  readonly [key: string]: unknown;
}

/**
 * Result of a tree-sitter parser-resolution + null-handling pass.
 * Each per-language file's `effectiveParser()` returns one of these.
 */
export type ParserResult = { ok: true; parser: Parser } | { ok: false; error: Error };

/**
 * Run a tree-sitter parse on `source`, normalizing the per-language
 * parser files' identical boilerplate. Pure (modulo `parser.parse`,
 * which is a tree-sitter runtime call):
 *
 *   - If `parserResult.ok` is false → return null (binding failed to load).
 *   - If `source` is empty/whitespace → return null (tree-sitter returns
 *     a tree with `ERROR` root for an empty buffer; useless).
 *   - Otherwise call `parser.parse(source)` inside a try/catch (binding
 *     errors mid-parse are non-fatal in slopbrick — we surface null
 *     and the visitor walks what it can).
 *   - If the resulting `Tree` is null OR the root is an empty `ERROR`
 *     subtree → return null (treat as unparseable).
 *   - Else return the parsed `Tree`.
 */
export function parseTreeSitterSource(
  parserResult: ParserResult,
  source: string,
): Tree | null {
  if (!parserResult.ok) return null;
  if (!source || source.trim() === '') return null;

  try {
    const rawTree: unknown = parserResult.parser.parse(source);
    if (!rawTree) return null;
    // tree-sitter's runtime Tree shape matches our structural
    // interface but TS sees a distinct Symbol. Cast once at the
    // boundary.
    const tree = rawTree as Tree;
    if (!tree || !tree.rootNode) return null;
    // An empty/invalid source produces an `ERROR` root — surface as null.
    if (tree.rootNode.type === 'ERROR' && tree.rootNode.childCount === 0) {
      return null;
    }
    return tree;
  } catch {
    return null;
  }
}
