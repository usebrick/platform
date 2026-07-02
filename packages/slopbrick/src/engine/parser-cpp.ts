// v0.24.0 — Tree-sitter-backed C++ source parser.
//
// Mirrors `parser-rust.ts` (v0.18.9). Produces a `Tree` we can walk to
// extract includes, namespaces, classes, structs, templates, functions,
// and macros with the fidelity tree-sitter gives us over a regex walker.
//
// `++` isn't a valid TS identifier, so the parser exports use the
// `Cpp` suffix (e.g. `getCppParser`, `parseCpp`) instead of `C++`.
//
// Loading: tree-sitter's native binding is a `node-gyp-build` artifact
// (a `.node` shared object). `tree-sitter-cpp` (^0.23.4) ships prebuilt
// binaries for darwin-arm64, darwin-x64, linux-arm64, linux-x64,
// win32-arm64, and win32-x64; pnpm install picks the matching one
// without compiling. If the native binding is missing (e.g. unsupported
// architecture), `parseCpp` returns null and callers fall back to
// whatever non-AST heuristic they had before.
//
// Error handling: tree-sitter ALWAYS produces a tree (with `ERROR`
// nodes for syntax errors). We return it as-is — callees walk only
// the node types they care about and silently skip ERROR subtrees.

import Parser from 'tree-sitter';
// `tree-sitter-cpp` exports the language directly as the default
// export on Node.js. The package's `bindings/node/index.js` shape is:
//   module.exports = require('./bindings/node');
// pnpm picks the matching prebuild under `prebuilds/<platform>/`.
import Cpp from 'tree-sitter-cpp';

// ---------------------------------------------------------------------------
// Lazily-initialised module-level parser. We construct it once at module
// init (it's thread-safe to use across the scan workers as long as no
// two threads call `parse()` simultaneously — each worker has its own
// import of this module).
// ---------------------------------------------------------------------------

let cachedParser: Parser | null = null;
let cppLanguage: CppLang | null = null;
let loadError: Error | null = null;

/**
 * Minimal structural type for the tree-sitter C++ language object.
 * `tree-sitter-cpp`'s types aren't a perfect match for the runtime
 * shape across versions, so we keep the surface narrow.
 */
export interface CppLang {
  /** Underlying native reference; opaque. */
  // tree-sitter internals treat this as `unknown` here.
  readonly [key: string]: unknown;
}

/**
 * Build (or reuse) the module-level Parser and C++ language.
 *
 * Returns `{ ok: true, parser }` on success, `{ ok: false, error }` when
 * the native binding failed to load (missing prebuild, unsupported
 * architecture, etc.). Callers MUST handle the failure case — tree-sitter
 * is a hard requirement for full-fidelity C++ parsing, and silently
 * returning empty results would mask configuration drift.
 */
export function getCppParser(): { ok: true; parser: Parser } | { ok: false; error: Error } {
  if (cachedParser) return { ok: true, parser: cachedParser };
  if (loadError) return { ok: false, error: loadError };

  try {
    cppLanguage = Cpp as unknown as CppLang;
    if (!cppLanguage || typeof cppLanguage !== 'object') {
      throw new Error('tree-sitter-cpp: language export is missing or malformed');
    }
    const parser = new Parser();
    // The runtime API uses `.setLanguage()`; the TS types accept any
    // shape that exposes the language ABI.
    (parser as unknown as { setLanguage: (l: CppLang) => void }).setLanguage(cppLanguage);
    cachedParser = parser;
    return { ok: true, parser };
  } catch (err) {
    loadError = err instanceof Error ? err : new Error(String(err));
    return { ok: false, error: loadError };
  }
}

/**
 * Force-fail flag (test-only). Sets loadError to simulate a missing
 * native binding so callers can verify the fallback path. Use
 * `resetCppParserForTests()` to clear.
 */
let forcedFailure: Error | null = null;
export function setCppParserForTests(value: Parser | null): void {
  cachedParser = value;
  loadError = null;
  cppLanguage = null;
}
export function forceCppParserFailure(error: Error | null): void {
  forcedFailure = error;
  if (error) {
    cachedParser = null;
    loadError = error;
  }
}
function effectiveParser(): { ok: true; parser: Parser } | { ok: false; error: Error } {
  if (forcedFailure) return { ok: false, error: forcedFailure };
  return getCppParser();
}

/**
 * Parse a C++ source file into a tree-sitter `Tree`.
 *
 * Returns `null` when:
 *   - the native binding failed to load (architecture mismatch, missing
 *     prebuild, etc.)
 *   - the input is empty (tree-sitter returns a tree with root type
 *     `ERROR` for an empty buffer, which is useless — we treat it as
 *     unparseable)
 *
 * Parse errors mid-file yield a tree whose ERROR subtrees the visitor
 * walks past. Callers should rely on the visitor's type-driven dispatch
 * (only named node types are matched) rather than re-checking errors.
 */
export function parseCpp(source: string): Tree | null {
  const result = effectiveParser();
  if (!result.ok) return null;
  if (!source || source.trim() === '') return null;

  try {
    const rawTree: unknown = result.parser.parse(source);
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

/**
 * Tree-sitter's runtime `Tree` and `Node` objects aren't strongly typed
 * in the published types. We re-export a structural type here so the
 * visitor can name its parameters. Mirrors `parser-rust.ts:147-173`.
 */
export interface Tree {
  rootNode: TSNode;
  readonly [key: string]: unknown;
}

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

/** True when the parser is loaded and ready. Used by tests + CLI flags
 *  to produce a loud "tree-sitter unavailable" diagnostic. */
export function isCppParserAvailable(): boolean {
  // Trigger lazy init on first call so `isCppParserAvailable()`
  // always reflects the actual load result (not "uninitialised").
  const result = getCppParser();
  return result.ok;
}

/** Returns the load error if the parser failed to load. */
export function getCppParserError(): Error | null {
  return loadError;
}
