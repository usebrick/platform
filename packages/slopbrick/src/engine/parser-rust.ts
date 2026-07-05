// v0.18.9 — Tree-sitter-backed Rust source parser.
//
// Replaces the regex-based `extractRustPatterns` walker with a real
// AST produced by `tree-sitter-rust`. Produces a `Tree` we can walk
// to extract imports, functions, structs, traits, impls, calls, and
// macros with much higher fidelity than the regex stub.
//
// Loading: tree-sitter's native binding is a `node-gyp-build` artifact
// (a `.node` shared object). Both `tree-sitter` (^0.22.4) and
// `tree-sitter-rust` (^0.24.0) ship prebuilt binaries for
// darwin-arm64, darwin-x64, linux-arm64, linux-x64, win32-arm64, and
// win32-x64; pnpm install picks the matching one without compiling.
// If the native binding is missing (e.g. unsupported architecture),
// `parseRust` returns null and callers fall back to the regex-based
// visitor in `./visitors/rust.ts`.
//
// Error handling: tree-sitter ALWAYS produces a tree (with `ERROR`
// nodes for syntax errors). We return it as-is — callees walk only
// the node types they care about and silently skip ERROR subtrees.

import Parser from 'tree-sitter';
// `tree-sitter-rust` exports the language directly as the default
// export on Node.js. The package's `bindings/node/index.js` shape is:
//   module.exports = require('./bindings/node');
// Tree-sitter's Rust grammar at v0.24 ships a native `tree-sitter-rust.node`
// under `prebuilds/<platform>/`. pnpm picks the matching one.
import Rust from 'tree-sitter-rust';
// v0.42.0: shared tree-sitter parse helper + structural Tree/TSNode types. Each per-language parser still re-exports Tree/TSNode from parser-shared for source compat.
import { parseTreeSitterSource } from './parser-shared.js';
import type { Tree, TSNode } from './parser-shared.js';

// ---------------------------------------------------------------------------
// Lazily-initialised module-level parser. We construct it once at module
// init (it's thread-safe to use across the scan workers as long as no
// two threads call `parse()` simultaneously — each worker has its own
// import of this module).
// ---------------------------------------------------------------------------

let cachedParser: Parser | null = null;
let rustLanguage: RustLang | null = null;
let loadError: Error | null = null;

/**
 * Minimal structural type for the tree-sitter Rust language object.
 * `tree-sitter-rust`'s types aren't a perfect match for the runtime
 * shape across versions, so we keep the surface narrow.
 */
export interface RustLang {
  /** Underlying native reference; opaque. */
  // tree-sitter internals treat this as `unknown` here.
  readonly [key: string]: unknown;
}

/**
 * Build (or reuse) the module-level Parser and Rust language.
 *
 * Returns `{ ok: true, parser }` on success, `{ ok: false, error }` when
 * the native binding failed to load (missing prebuild, unsupported
 * architecture, etc.). Callers MUST handle the failure case — tree-sitter
 * is a hard requirement for full-fidelity Rust parsing, and silently
 * returning empty results would mask configuration drift.
 */
export function getRustParser(): { ok: true; parser: Parser } | { ok: false; error: Error } {
  if (cachedParser) return { ok: true, parser: cachedParser };
  if (loadError) return { ok: false, error: loadError };

  try {
    rustLanguage = Rust as unknown as RustLang;
    if (!rustLanguage || typeof rustLanguage !== 'object') {
      throw new Error('tree-sitter-rust: language export is missing or malformed');
    }
    const parser = new Parser();
    // The runtime API uses `.setLanguage()`; the TS types accept any
    // shape that exposes the language ABI. tree-sitter-rust@0.24's
    // default export is the language object.
    (parser as unknown as { setLanguage: (l: RustLang) => void }).setLanguage(rustLanguage);
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
 * `resetRustParserForTests()` to clear.
 */
let forcedFailure: Error | null = null;
export function setRustParserForTests(value: Parser | null): void {
  cachedParser = value;
  loadError = null;
  rustLanguage = null;
}
export function forceRustParserFailure(error: Error | null): void {
  forcedFailure = error;
  if (error) {
    cachedParser = null;
    loadError = error;
  }
}
function effectiveParser(): { ok: true; parser: Parser } | { ok: false; error: Error } {
  if (forcedFailure) return { ok: false, error: forcedFailure };
  return getRustParser();
}

/**
 * Parse a Rust source file into a tree-sitter `Tree`.
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
export function parseRust(source: string): Tree | null {
  // v0.42.0: shared with parser-cpp/rust/kotlin via
  // engine/parser-shared.ts:parseTreeSitterSource. The 18-line
  // try/catch + ERROR-root validation body was duplicated verbatim
  // across all four per-language files (42 dup/identical-block
  // fires during self-scan).
  return parseTreeSitterSource(effectiveParser(), source);
}

/**
 * Tree-sitter's runtime `Tree` and `Node` objects aren't strongly typed
 * in the published types. We re-export a structural type here so the
 * visitor can name its parameters.
 */
// v0.42.0: Tree + TSNode are declared in engine/parser-shared.ts.
// Re-exported here for source-compatibility (callers and
// visitors import these names from this module's path).
export type { Tree, TSNode } from './parser-shared.js';



/** True when the parser is loaded and ready. Used by tests + CLI flags
 *  to produce a loud "tree-sitter unavailable" diagnostic. */
export function isRustParserAvailable(): boolean {
  // Trigger lazy init on first call so `isRustParserAvailable()`
  // always reflects the actual load result (not "uninitialised").
  const result = getRustParser();
  return result.ok;
}

/** Returns the load error if the parser failed to load. */
export function getRustParserError(): Error | null {
  return loadError;
}
