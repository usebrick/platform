// Inventory-first pattern extractor for Rust source files.
//
// Pure functions that feed into `buildPatternInventory` (see
// `src/mcp/patterns.ts`). The lens: "did this code introduce a new
// pattern when an existing pattern already existed?" — so a file
// containing `struct UserService` registers a service named "User"
// that the cross-file drift detector can later compare against
// `UserManager`, `UserRepository`, etc.
//
// v0.14.0 — regex-only, no Rust parser dependency. Each call returns
// AT MOST one `PatternMatch` per category per file. The `imports`
// array is left empty — a later pass will populate it from the
// visitor's import graph.
//
// v0.18.9 — added `parseRustFile()`, an AST walker backed by
// `tree-sitter-rust` (see `../parser-rust.ts`). The regex path is
// kept as a fallback for environments where the native binding
// fails to load (no prebuilt binary for the host architecture).

import type { PatternMatch } from '../../mcp/patterns.js';
import {
  parseRust,
  type Tree,
  type TSNode,
  isRustParserAvailable,
} from '../parser-rust.js';

/** Shape of a single extractor's output. */
export interface RustPatternResult {
  service: PatternMatch[];
  route: PatternMatch[];
  ormModel: PatternMatch[];
}

// ---------------------------------------------------------------------------
// v0.18.9 — Rust AST extraction shape.
// ---------------------------------------------------------------------------
//
// `parseRustFile` walks the tree-sitter AST and surfaces what the
// downstream v2 builder needs to populate `facts.v2.rustFile` and to
// power the new `rust/*` rules.
//
// All entries carry a `{ name, filePath, line, column }` shape so the
// downstream code can ignore the AST entirely — it's the same shape
// every engine visitor produces for live facts.

/** A `use foo::bar::Baz;` import. `path` is the source string as written
 *  (`'std::collections::HashMap'`, `'crate::foo'`). `names` lists the
 *  explicit bindings — empty for `use foo::*;` (glob) and for
 *  `use foo::bar as baz;` (alias = `as`). */
export interface RustImport {
  path: string;
  names: { name: string; alias?: string }[];
  line: number;
  column: number;
  /** True for `use foo::*;`. */
  isGlob: boolean;
}

/** A `pub fn add(...) -> i32 { ... }` declaration. Applies equally to
 *  free functions, methods on impl blocks, and trait methods. */
export interface RustFunction {
  name: string;
  line: number;
  column: number;
  isPublic: boolean;
  isMethod: boolean;
  /** Receiver kind when `isMethod` — `'self'`, `'&self'`, `'&mut self'`,
   *  `'_`, or absent. Methods without an obvious receiver are still
   *  reported as methods (impl-block methods). */
  receiver?: string;
  /** Number of function-item source lines. */
  bodyLines: number;
  /** Set when the function is decorated with `#[cfg(test)]` or
   *  `#[test]` (or `#[cfg(any(test, ...))]` containing `test`). */
  inTestConfig: boolean;
}

/** A `pub struct Foo<T> { x: T }` declaration. */
export interface RustStruct {
  name: string;
  line: number;
  column: number;
  isPublic: boolean;
  /** True if the struct is decorated with `#[derive(...)]`. */
  isDerive: boolean;
  /** Names of the derive macros (e.g. `['Debug', 'Clone']`). */
  derives: string[];
}

/** A `pub trait Foo { fn ... }` declaration. */
export interface RustTrait {
  name: string;
  line: number;
  column: number;
  isPublic: boolean;
}

/** An `impl Trait for Type { ... }` or `impl Type { ... }` block. */
export interface RustImpl {
  trait?: string;
  type: string;
  /** Names of methods defined in this impl block. */
  methods: string[];
  line: number;
  column: number;
}

/** Aggregate shape returned by `parseRustFile`. */
export interface RustFileStructure {
  imports: RustImport[];
  functions: RustFunction[];
  structs: RustStruct[];
  traits: RustTrait[];
  impls: RustImpl[];
}

// ---------------------------------------------------------------------------
// regex-based fallback (kept for backward compatibility + environments
// where tree-sitter fails to load)
// ---------------------------------------------------------------------------

/**
 * Canonical service-layer suffixes we strip from the captured type
 * name to derive the base pattern.
 */
const SERVICE_SUFFIXES = [
  'Service', 'Manager', 'Handler', 'Repository', 'Controller',
  'Helper', 'Factory', 'Provider', 'Store', 'API', 'Client',
  'Adapter', 'Resolver', 'Mapper', 'Transformer', 'Serializer',
  'Validator', 'Strategy', 'Facade', 'Decorator', 'Observer',
  'Builder', 'Command', 'Processor', 'Worker', 'Job', 'Actor',
  'Executor',
] as const;

const SERVICE_SUFFIX_GROUP = `(?:${SERVICE_SUFFIXES.join('|')})`;

const RUST_SERVICE_STRUCT_RE = new RegExp(
  `^(?:pub(?:\\(crate\\)|\\(super\\))?\\s+)?struct\\s+(\\w+?)${SERVICE_SUFFIX_GROUP}?\\b`,
  'gm',
);
const RUST_SERVICE_IMPL_RE = new RegExp(
  `^impl(?:<[^>]+>)?\\s+(?:${SERVICE_SUFFIX_GROUP}\\s+for\\s+)?(\\w+?)${SERVICE_SUFFIX_GROUP}?\\b`,
  'gm',
);

/**
 * HTTP route registrations for the 3 dominant Rust web frameworks:
 * Actix-web, Axum, Rocket.
 */
const RUST_ACTIX_ROUTE_RE =
  /#\[(?:get|post|put|delete|patch|head|route)\(\s*"(\/[^"]+)"\s*[\),]/g;
const RUST_AXUM_ROUTE_RE =
  /\.route\(\s*"(\/[^"]+)"\s*,\s*(?:get|post|put|delete|patch)/g;

/**
 * Rust ORM model patterns: Diesel, SeaORM, sqlx.
 */
const RUST_DIESEL_RE =
  /#\[derive\([^\]]*Queryable[^\]]*\)\][\s\S]{0,200}?struct\s+(\w+)/g;
const RUST_SEAORM_RE =
  /#\[derive\([^\]]*DeriveEntityModel[^\]]*\)\][\s\S]{0,200}?struct\s+(\w+)/g;
const RUST_SQLX_RE =
  /#\[derive\([^\]]*sqlx::FromRow[^\]]*\)\][\s\S]{0,200}?struct\s+(\w+)/g;

export function extractRustPatterns(
  filePath: string,
  source: string,
): RustPatternResult {
  const service: PatternMatch[] = [];
  const route: PatternMatch[] = [];
  const ormModel: PatternMatch[] = [];

  const seenService = new Set<string>();
  for (const m of source.matchAll(RUST_SERVICE_STRUCT_RE)) {
    const name = m[1]!;
    if (seenService.has(name)) continue;
    seenService.add(name);
    service.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(RUST_SERVICE_IMPL_RE)) {
    const name = m[1]!;
    if (seenService.has(name)) continue;
    seenService.add(name);
    service.push({ name, files: [filePath], imports: [] });
  }

  const seenRoute = new Set<string>();
  for (const m of source.matchAll(RUST_ACTIX_ROUTE_RE)) {
    const name = m[1]!;
    if (seenRoute.has(name)) continue;
    seenRoute.add(name);
    route.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(RUST_AXUM_ROUTE_RE)) {
    const name = m[1]!;
    if (seenRoute.has(name)) continue;
    seenRoute.add(name);
    route.push({ name, files: [filePath], imports: [] });
  }

  const seenOrm = new Set<string>();
  for (const m of source.matchAll(RUST_DIESEL_RE)) {
    const name = m[1]!;
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(RUST_SEAORM_RE)) {
    const name = m[1]!;
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(RUST_SQLX_RE)) {
    const name = m[1]!;
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }

  return { service, route, ormModel };
}

// ---------------------------------------------------------------------------
// v0.18.9 — tree-sitter-backed AST walker
// ---------------------------------------------------------------------------

/**
 * Parse and extract a structured representation of a Rust source file.
 *
 * Returns an empty `RustFileStructure` when tree-sitter fails to load
 * (no prebuilt binary for this platform, native binding missing) OR
 * when the source is empty. Errors mid-parse (a syntax-broken file) do
 * NOT return an empty structure; they return whatever the walker
 * successfully recognised — Rust files have forgiving syntax, and the
 * recoverable cases (missing semicolons, stray braces) still produce
 * useful ASTs.
 *
 * Pass `forceFallback: true` to skip tree-sitter entirely and use the
 * regex path — used by tests that want to exercise both code paths.
 */
export function parseRustFile(
  filePath: string,
  source: string,
  options: { forceFallback?: boolean } = {},
): RustFileStructure {
  const empty: RustFileStructure = {
    imports: [],
    functions: [],
    structs: [],
    traits: [],
    impls: [],
  };

  if (!isRustParserAvailable() || options.forceFallback) {
    // Return the regex-shaped fallback as an empty RustFileStructure
    // (the regex path populates its own separate `RustPatternResult`
    // shape; the v2 builder merges them).
    return empty;
  }

  const tree = parseRust(source);
  if (!tree) return empty;

  return walkRustTree(tree);
}

// ---------------------------------------------------------------------------
// Internal: AST walk
// ---------------------------------------------------------------------------

/**
 * Walk tree-sitter's source_file root, dispatching by node type. The
 * walker is intentionally flat (one recursive walk per shape we
 * want) rather than a single tree-traversal with a giant switch — it
 * keeps each extractor small and lets new rule shapes (e.g. enums,
 * macros) add without retrofitting the dispatcher.
 *
 * `ctx.inTestConfig` threads up to `#[cfg(test)]` and `#[test]`
 * annotations on enclosing function_item / mod_item. Inner functions
 * inherit `true` once the ancestor declares test-config.
 */
interface WalkContext {
  /** True if we're inside a `#[cfg(test)] mod tests { ... }` or a
   *  function annotated with `#[cfg(test)]` / `#[test]`. */
  inTestConfig: boolean;
}

function walkRustTree(tree: Tree): RustFileStructure {
  const ctx: WalkContext = { inTestConfig: false };
  const out: RustFileStructure = {
    imports: [],
    functions: [],
    structs: [],
    traits: [],
    impls: [],
  };
  walkChildren(tree.rootNode, ctx, out);
  return out;
}

function walkChildren(
  node: TSNode,
  ctx: WalkContext,
  out: RustFileStructure,
): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;
    visitNode(child, ctx, out);
  }
}

function visitNode(
  node: TSNode,
  ctx: WalkContext,
  out: RustFileStructure,
): void {
  const innerCtx = { ...ctx };
  // Pre-pass for attributes (decorating the next item).
  const attrState = readPrecedingAttributes(node);

  switch (node.type) {
    case 'use_declaration': {
      out.imports.push(extractUse(node));
      return;
    }
    case 'function_item': {
      const isMethod = isInImplBlock(node);
      out.functions.push(extractFunction(node, attrState, innerCtx.inTestConfig, isMethod));
      // Recurse into body — nested fn items, nested calls, etc.
      walkChildren(getField(node, 'body') ?? node, innerCtx, out);
      return;
    }
    case 'struct_item': {
      out.structs.push(extractStruct(node, attrState));
      // Recurse into body (might contain nested struct definitions).
      const body = getField(node, 'body');
      if (body) walkChildren(body, innerCtx, out);
      return;
    }
    case 'trait_item': {
      out.traits.push(extractTrait(node, attrState));
      const body = getField(node, 'body');
      if (body) walkChildren(body, innerCtx, out);
      return;
    }
    case 'impl_item': {
      const implEntry = extractImpl(node, attrState, innerCtx);
      out.impls.push(implEntry.entry);
      // Recurse into the impl body to pick up methods (already done
      // by extractImpl, but also any nested struct/impl declarations).
      const body = getField(node, 'body');
      if (body) walkChildren(body, innerCtx, out);
      return;
    }
    case 'mod_item': {
      const modIsTest = innerCtx.inTestConfig || attrState.isTestCfg;
      const modCtx = { ...innerCtx, inTestConfig: modIsTest };
      const body = getField(node, 'body');
      if (body) walkChildren(body, modCtx, out);
      return;
    }
    default: {
      // Generic recursion for unknown node types — visits named children
      // so nested use_declarations / function_items / etc. are still picked up.
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child) visitNode(child, innerCtx, out);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Attribute extraction
// ---------------------------------------------------------------------------

interface AttributeState {
  isTestCfg: boolean;
  isTest: boolean;
  isPub: boolean;
  derives: string[];
}

/**
 * Read `#[...]` attributes that immediately precede a node and decode
 * the ones we care about (`#[cfg(test)]`, `#[test]`, `#[derive(...)]`,
 * `pub` visibility modifier on a parent item).
 */
function readPrecedingAttributes(node: TSNode): AttributeState {
  const state: AttributeState = {
    isTestCfg: false,
    isTest: false,
    isPub: false,
    derives: [],
  };

  const parent = node.parent;
  if (!parent) return state;

  // Walk parent's children; anything that ends at or before our
  // startIndex and is an attribute_item is ours.
  for (let i = 0; i < parent.namedChildCount; i++) {
    const sibling = parent.namedChild(i);
    if (!sibling || sibling === node) continue;
    if (sibling.endIndex > node.startIndex) continue;
    if (sibling.type !== 'attribute_item') continue;
    decodeAttribute(sibling, state);
  }
  return state;
}

function decodeAttribute(attr: TSNode, state: AttributeState): void {
  for (let i = 0; i < attr.namedChildCount; i++) {
    const child = attr.namedChild(i);
    if (!child || child.type !== 'attribute') continue;
    // The attribute holds a value field: for `cfg(test)` it's
    // `cfg(test)`, for `test` it's just `test`.
    const name = firstIdentifier(child);
    if (!name) continue;

    if (name === 'cfg') {
      // Decode the cfg expression: `test`, `not(test)`, `any(test, ...)`,
      // `all(test, ...)`. We treat `test` (in any position) as a
      // positive `isTestCfg` signal.
      const cfgText = child.text;
      if (/\btest\b/.test(cfgText) && !/\bnot\(test\)/.test(cfgText)) {
        state.isTestCfg = true;
      }
    } else if (name === 'test') {
      state.isTest = true;
    } else if (name === 'derive') {
      for (let j = 0; j < child.namedChildCount; j++) {
        const inner = child.namedChild(j);
        // derive args: token_tree containing identifiers; just
        // text-scan the derive's source for the identifier list.
        if (inner) {
          const matches = inner.text.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g);
          for (const m of matches) state.derives.push(m[1]!);
        }
      }
    }
  }
}

function firstIdentifier(node: TSNode): string | null {
  // Skip `identifier` children; the attribute's first identifier is the
  // macro path (e.g. `cfg`, `derive`, `serde::Serialize`).
  const text = node.text;
  const idMatch = text.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
  return idMatch ? idMatch[1]! : null;
}

// ---------------------------------------------------------------------------
// Per-node-type extractors
// ---------------------------------------------------------------------------

function extractUse(node: TSNode): RustImport {
  const text = node.text;
  const argument = node.namedChild(0); // usually a scoped_identifier / use_list / identifier / token_tree

  // Path: the textual representation starting after `use ` and before
  // any alias/rename (e.g. `std::collections::HashMap`). Tree-sitter
  // exposes a `argument` field for this.
  const argField = node.childForFieldName('argument');
  const path = argField?.text ?? argument?.text ?? '';

  const names: { name: string; alias?: string }[] = [];
  let isGlob = false;

  // Tree-sitter's `use_declaration` argument can be one of:
  //   use_list         — `use foo::{A, B}`
  //   scoped_use_list  — `use foo::bar::{A, B}` (the `use_list` is a child)
  //   scoped_identifier— `use foo::bar::Baz`
  //   identifier       — `use baz`
  //   use_wildcard     — `use foo::*`
  //   use_as_clause    — `use foo as bar;`
  //   token_tree       — `use foo::{self}` and similar
  const useListNode = findUseListNode(argument);

  if (useListNode) {
    // `use foo::{A, B as C, *};` (and scoped_use_list's inner use_list)
    for (let i = 0; i < useListNode.namedChildCount; i++) {
      const item = useListNode.namedChild(i)!;
      if (item.type === 'use_wildcard') {
        isGlob = true;
      } else if (item.type === 'identifier') {
        names.push({ name: item.text });
      } else if (item.type === 'use_as_clause') {
        // `A as B`
        const alias = item.childForFieldName('alias');
        const binding = item.childForFieldName('path');
        if (binding) {
          names.push({ name: binding.text, alias: alias?.text });
        } else {
          names.push({ name: item.text });
        }
      } else if (item.type === 'scoped_identifier') {
        // `foo::Bar` in a use_list — last segment is the binding name.
        const idents = collectIdentifiers(item);
        names.push({ name: idents[idents.length - 1] ?? item.text });
      } else if (item.text.includes(' as ')) {
        const [head, alias] = item.text.split(/\s+as\s+/);
        names.push({ name: (head ?? '').trim(), alias: alias?.trim() });
      } else {
        names.push({ name: item.text });
      }
    }
  } else if (argument?.type === 'use_wildcard') {
    isGlob = true;
  } else if (argument) {
    // Simple form: `use foo::bar::Baz;`. The local binding IS the
    // last identifier in the path, unless an `as` rename is given
    // (in which case tree-sitter represents the rename as a sibling
    // `use_as_clause`).
    const idents = collectIdentifiers(argument);
    const last = idents[idents.length - 1] ?? argument.text;
    names.push({ name: last });
    // Detect `use foo::bar as baz;` via the raw text.
    const asMatch = text.match(/\s+as\s+(\w+)\s*;?\s*$/);
    if (asMatch) names[0]!.alias = asMatch[1]!;
  }

  return {
    path: path.trim(),
    names,
    isGlob,
    line: node.startPosition.row + 1,
    column: node.startPosition.column,
  };
}

function extractFunction(
  node: TSNode,
  attrs: AttributeState,
  inheritedTestConfig: boolean,
  isMethod: boolean,
): RustFunction {
  const nameNode = node.childForFieldName('name');
  const name = nameNode?.text ?? '<anon>';
  const params = node.childForFieldName('parameters');
  const body = node.childForFieldName('body');
  const visibilityMod = node.namedChild(0);
  const isPublic = visibilityMod?.type === 'visibility_modifier';

  let receiver: string | undefined;
  if (isMethod && params) {
    const selfParam = findSelfParameter(params);
    if (selfParam) receiver = selfParam.text;
  }

  const bodyLines = body
    ? body.endPosition.row - body.startPosition.row + 1
    : 0;

  // `#[test]` directly on the function, or `#[cfg(test)]` on the
  // function, or inherited from an enclosing `#[cfg(test)] mod tests`.
  const inTestConfig =
    inheritedTestConfig ||
    attrs.isTest ||
    attrs.isTestCfg ||
    isFunctionAttrTest(node);

  return {
    name,
    line: node.startPosition.row + 1,
    column: node.startPosition.column,
    isPublic,
    isMethod,
    receiver,
    bodyLines,
    inTestConfig,
  };
}

function extractStruct(node: TSNode, attrs: AttributeState): RustStruct {
  const nameNode = node.childForFieldName('name');
  return {
    name: nameNode?.text ?? '<anon>',
    line: node.startPosition.row + 1,
    column: node.startPosition.column,
    isPublic: hasVisibility(node),
    isDerive: attrs.derives.length > 0,
    derives: [...attrs.derives],
  };
}

function extractTrait(node: TSNode, _attrs: AttributeState): RustTrait {
  const nameNode = node.childForFieldName('name');
  return {
    name: nameNode?.text ?? '<anon>',
    line: node.startPosition.row + 1,
    column: node.startPosition.column,
    isPublic: hasVisibility(node),
  };
}

/**
 * Returns the impl entry plus the body-collected method list, so the
 * caller can both append it and (optionally) walk into it for nested
 * items. To keep the recursive walker simple, we wrap the entry with
 * methods populated up-front.
 */
function extractImpl(
  node: TSNode,
  _attrs: AttributeState,
  _ctx: WalkContext,
): { entry: RustImpl } {
  const traitNode = node.childForFieldName('trait');
  const typeNode = node.childForFieldName('type');
  const typeText = typeNode?.text ?? '<anon>';
  const traitText = traitNode?.text;

  const body = node.childForFieldName('body');
  const methods: string[] = [];
  if (body) {
    for (let i = 0; i < body.namedChildCount; i++) {
      const child = body.namedChild(i);
      if (child?.type === 'function_item') {
        const m = child.childForFieldName('name');
        if (m) methods.push(m.text);
      }
    }
  }

  return {
    entry: {
      type: typeText,
      trait: traitText ?? undefined,
      methods,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * For `use foo::bar::{A, B}`, the use_declaration's `argument` is a
 * `scoped_use_list` whose own named child is the `use_list` we want
 * to iterate. For `use foo::{A, B}`, the argument IS the use_list.
 * Returns the actual use_list node (or null if none applies).
 */
function findUseListNode(argument: TSNode | null): TSNode | null {
  if (!argument) return null;
  if (argument.type === 'use_list') return argument;
  if (argument.type === 'scoped_use_list') {
    for (let i = 0; i < argument.namedChildCount; i++) {
      const c = argument.namedChild(i);
      if (c?.type === 'use_list') return c;
    }
  }
  return null;
}

function getField(node: TSNode, fieldName: string): TSNode | null {
  return node.childForFieldName(fieldName);
}

function collectIdentifiers(node: TSNode): string[] {
  const out: string[] = [];
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;
    if (child.type === 'identifier' || child.type === 'type_identifier') {
      out.push(child.text);
    } else if (
      child.type === 'scoped_identifier' ||
      child.type === 'nested_identifier'
    ) {
      out.push(...collectIdentifiers(child));
    }
  }
  return out;
}

function hasVisibility(node: TSNode): boolean {
  // Visibility is the first named child for `pub` (and `pub(crate)` etc.)
  return node.namedChild(0)?.type === 'visibility_modifier';
}

function isInImplBlock(node: TSNode): boolean {
  // Walk up the parent chain; if we hit an impl_item before a
  // source_file / function_item boundary, this function is a method.
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === 'impl_item') return true;
    if (p.type === 'function_item' || p.type === 'source_file') return false;
  }
  return false;
}

function findSelfParameter(params: TSNode): TSNode | null {
  for (let i = 0; i < params.namedChildCount; i++) {
    const child = params.namedChild(i);
    if (child?.type === 'self_parameter') return child;
  }
  return null;
}

function isFunctionAttrTest(node: TSNode): boolean {
  // belt-and-suspenders: also scan the immediate text preceding the
  // function for `#[test]` / `#[cfg(test)]`. Catches a rare case
  // where the attribute is several lines away but still adjacent.
  // `node.startPosition` gives us the row to look at.
  // The `readPrecedingAttributes` walk already handled this; keep this
  // as a stub for future refinement.
  void node;
  return false;
}
