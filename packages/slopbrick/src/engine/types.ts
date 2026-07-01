/**
 * src/engine/types.ts —  grouped ScanFacts interface.
 * Phase 2 §10 + the  architectural refinement. The grouped shape
 * consolidates facts into logical domains so rules are pure 5-line
 * functions over a stable, typed snapshot.
 * During , BOTH the old flat shape and the new grouped shape are
 * emitted by `extractFacts` (dual-write). Rules migrate one category at
 * a time in  / . The old shape is removed in .
 */

import type { ClassNameFact, Severity, Category, Framework, ResolvedConfig } from '../types';

// ---------------------------------------------------------------------------
// Domain 1: file metadata
// ---------------------------------------------------------------------------

export interface FileMeta {
  /** Absolute path to the file (or relative path from cwd, whichever the
   *  caller passed in). */
  path: string;
  /** Lines of code, used by sizeNormalisation in the aggregator. */
  loc: number;
  /** File extension including the leading dot (".tsx", ".vue"). Empty
   *  string for extension-less files that were sniffed by `discover.ts`. */
  extension: string;
  /** Derived from extension (or config.framework as fallback). */
  framework: Framework;
}

// ---------------------------------------------------------------------------
// Domain 2: imports
// ---------------------------------------------------------------------------

export interface ImportSpecifier {
  /** Imported symbol name (`Button`, `useState`, `* as Foo`). */
  name: string;
  isDefault: boolean;
  /** `import { X as Y }` — the local alias. */
  alias?: string;
}

export interface ImportRecord {
  /** Import source as written. `'@/components/ui/button'`, `'react'`, `'./x'`. */
  source: string;
  specifiers: ImportSpecifier[];
  /** True if the source matches a prefix in `config.allowedImports`.
   *  Always false for relative or third-party imports. */
  isAllowed: boolean;
  /** Source location. */
  line: number;
  column: number;
}

// ---------------------------------------------------------------------------
// Domain 3: components
// ---------------------------------------------------------------------------

export interface ComponentProp {
  name: string;
  /** Inferred type as a string. We don't parse the actual TS type — we
   *  surface the literal type annotation when present. */
  type: string;
  isRequired: boolean;
}

export interface ComponentRecord {
  /** Component name if it can be derived (function name, default export
   *  alias). Empty string for anonymous components. */
  name: string;
  isExported: boolean;
  /** Component body line count. */
  loc: number;
  /** True for `'use client'` components and any non-server-compatible
   *  component (wrapped in `memo()`, `forwardRef()`, etc.). */
  isClientComponent: boolean;
  /** True if the source has `'use server'` directive. */
  isServerComponent: boolean;
  /** Declared props. Empty array for components without typed props. */
  props: ComponentProp[];
  /**
   *  `logic/reactive-hook-soup`'s per-component useEffect count. */
  hookCalls: Array<{ name: string; line: number; column: number }>;
  /** Source location of the component declaration. */
  line: number;
  column: number;
}

// ---------------------------------------------------------------------------
// Domain 4: JSX / render tree
// ---------------------------------------------------------------------------

export interface JsxElementRecord {
  /** Element tag name: `'div'`, `'Button'`, `'AlertDialog'`. */
  tag: string;
  /** True if the tag is an HTML primitive (`div`, `span`, `button`). False
   *  if it's a user component or imported component. */
  isPrimitive: boolean;
  /** Extracted className tokens (split by whitespace, no empty strings). */
  classNames: string[];
  /** Tailwind arbitrary values extracted from classNames (`'p-[13px]'`,
   *  `'mt-[10vh]'`, `'bg-[#fff]'`). Empty array if none. */
  arbitraryValues: string[];
  /** Parsed `style={{...}}` props as a flat key→value map. */
  inlineStyles: Record<string, string>;
  /** True for `<button>`, `<a>`, `<input>`, `<select>`, `<textarea>`,
   *  and elements with `role="button"`. */
  interactive: boolean;
  /** ARIA-related props on this element (`'aria-label'`, `'role'`). */
  ariaProps: string[];
  /** Raw attributes. String-valued entries hold the attribute value;
   *  boolean attributes (e.g. `disabled`) appear as `key: undefined` so
   *  `Object.keys(attributes)` exposes them. Rules use truthy checks. */
  attributes: Record<string, string | undefined>;
  /** Source location. */
  line: number;
  column: number;
}

export interface JsxTree {
  elements: JsxElementRecord[];
  /** Maximum depth of nested JSX elements anywhere in the file. */
  maxNestingDepth: number;
}

// ---------------------------------------------------------------------------
// Domain 5: logic & state
// ---------------------------------------------------------------------------

export type HookLocation = 'component-body' | 'useEffect' | 'handler' | 'callback';

export interface HookRecord {
  /** Hook name: `'useState'`, `'useEffect'`, `'useMemo'`, custom hooks. */
  name: string;
  /** Dependency array contents. Empty array means no deps. `undefined`
   *  means deps couldn't be inferred (e.g. spread). */
  dependencies: unknown[];
  /** Return type as a string (best-effort inference). */
  returnType: string;
  /** Where the hook was called. */
  location: HookLocation;
  line: number;
  column: number;
}

export interface StateVariableRecord {
  /** Variable name (`'count'`). */
  name: string;
  /** Setter name (`'setCount'`). Empty string if no setter. */
  setter: string;
  /** True if the value is referenced anywhere in JSX. */
  isUsedInJSX: boolean;
  /** True if the value is never read AND the setter is never called. */
  isZombie: boolean;
  line: number;
  column: number;
}

export interface DefensiveCheckRecord {
  type: 'nullish' | 'typeof' | 'truthy';
  /** The expression being checked (`'user'`, `'data?.x'`). */
  target: string;
  /** True if the check is redundant because the framework already
   *  guarantees the value (e.g. optional chaining on a non-nullable). */
  isGhost: boolean;
  line: number;
  column: number;
}

export interface ApiCallRecord {
  /** Method or path: `'fetch'`, `'axios.get'`, `'/api/users'`. */
  method: string;
  /** Where the call lives. */
  location: HookLocation;
  /** True for direct calls inside component body (not wrapped in a hook
   *  or async handler). Triggers `logic/boundary-violation`. */
  isDirect: boolean;
  line: number;
  column: number;
}

// ---------------------------------------------------------------------------
// Domain 6: design tokens
// ---------------------------------------------------------------------------

export interface DesignTokens {
  /** Numeric spacing values used in the file (e.g. `[4, 8, 12, 16, 13]`).
   *  Used by entropy rules and `spacing-grid` validation. */
  spacingUsage: number[];
  /** Color values: `'zinc-900'`, `'#fff'`, `'hsl(0 0% 0%)'`, `'rgb(...)'`. */
  colorValues: string[];
  /** Font sizes used in inline styles and classNames. */
  fontSizes: string[];
  /** Border radius values used in the file. */
  borderRadius: string[];
}

// ---------------------------------------------------------------------------
// Top-level ScanFacts (new grouped shape, )
// ---------------------------------------------------------------------------

export interface ScanFactsV2 {
  file: FileMeta;
  imports: ImportRecord[];
  components: ComponentRecord[];
  jsx: JsxTree;
  logic: {
    hooks: HookRecord[];
    stateVariables: StateVariableRecord[];
    defensiveChecks: DefensiveCheckRecord[];
    apiCalls: ApiCallRecord[];
    logicalExpressions: import('../types').LogicalExpressionFact[];
    keyProps: import('../types').KeyPropFact[];
    optimisticUpdates: import('../types').OptimisticUpdateFact[];
  };
  designTokens: DesignTokens;
  /**
   *  dead-code detector rules. Populated by the visitor's identifier
   *  walk + import/declaration/branch handlers. See `DeadCodeFacts`
   *  above for the shape. */
  deadCode: DeadCodeFacts;
  /**
   *  templates. Replaces the synthetic `<template>` elements that the
   *  migration injected into `jsx.elements`. */
  templateClassNames: ClassNameFact[];
  /**
   *  multiple-components-per-file. */
  componentSizes: import('../types').ComponentSizeFact[];
  astroComponents: import('../types').AstroComponentFact[];
  /**
   *  comments (and block equivalents). Issues matching these are filtered
   *  out before scoring. */
  disabledRules: import('../types').DisabledLintRuleFact[];
  /**
   * v0.18.9 — Rust AST structure for `.rs` files. Populated by the
   * tree-sitter-backed visitor in `visitors/rust.ts`. Absent for
   * non-Rust files. Powers the four `rust/*` rules (unused-pub-fn,
   * unwrap-in-production, todo-macro, stringly-typed). */
  rustFile?: RustFileRecord;
  /** Optional source text (cached for `unified-diff`, `formatAdvice`,
   *  and `--suggest` output). Not all rules need this. */
  _source?: string;
}

// ---------------------------------------------------------------------------
// v0.18.9 — Rust file structure (tree-sitter output)
// ---------------------------------------------------------------------------

/**
 * Per-language (Rust) variant of an import. Mirrors `ImportRecord`
 * for the AST-walker path; absent for non-Rust files.
 */
export interface RustImportRecord {
  /** Source path as written (`'std::collections::HashMap'`). */
  path: string;
  /** Local bindings introduced by the import. Empty for `use foo::*;`. */
  names: Array<{ name: string; alias?: string }>;
  /** True for `use foo::*;` — the import has no local name. */
  isGlob: boolean;
  /** Source location. */
  line: number;
  column: number;
}

/**
 * Per-function declaration captured from the Rust AST. Covers free
 * functions and impl-block methods uniformly.
 */
export interface RustFunctionRecord {
  /** Function name as written (`add`, `from_str`). */
  name: string;
  /** Source location. */
  line: number;
  column: number;
  /** True for `pub fn` / `pub(crate) fn` / `pub(super) fn`. */
  isPublic: boolean;
  /** True for methods inside `impl` blocks. */
  isMethod: boolean;
  /** Receiver text when `isMethod` (`'self'`, `'&self'`, `'&mut self'`). */
  receiver?: string;
  /** Body length in source lines. */
  bodyLines: number;
  /** True if the function is decorated with `#[cfg(test)]` or `#[test]`,
   *  or is enclosed in a `#[cfg(test)] mod tests { ... }`. */
  inTestConfig: boolean;
}

/** Per-struct declaration. Mirrors `RustFunctionRecord` for the
 *  struct-item node. */
export interface RustStructRecord {
  name: string;
  line: number;
  column: number;
  isPublic: boolean;
  /** True if any `#[derive(...)]` attribute preceded the struct. */
  isDerive: boolean;
  /** Names of the derive macros. */
  derives: string[];
}

/** Per-trait declaration. */
export interface RustTraitRecord {
  name: string;
  line: number;
  column: number;
  isPublic: boolean;
}

/** Per-impl block. */
export interface RustImplRecord {
  /** Trait name when `impl Trait for Type` (otherwise absent). */
  trait?: string;
  /** The type the impl targets (`Type` in `impl Type` or `impl Trait for Type`). */
  type: string;
  /** Names of methods defined inside this impl. */
  methods: string[];
  line: number;
  column: number;
}

/** Captured AST-level structure of a `.rs` file, populated by
 *  `parseRustFile` in `engine/visitors/rust.ts`. Absent for files
 *  whose extension isn't `.rs`, or when tree-sitter failed to load. */
export interface RustFileRecord {
  imports: RustImportRecord[];
  functions: RustFunctionRecord[];
  structs: RustStructRecord[];
  traits: RustTraitRecord[];
  impls: RustImplRecord[];
}

// ---------------------------------------------------------------------------
// Helper: derive framework from extension
// ---------------------------------------------------------------------------

export function deriveFramework(extension: string, fallback: string = 'react'): Framework {
  const ext = extension.toLowerCase();
  if (ext === '.tsx' || ext === '.jsx') return 'react';
  if (ext === '.vue') return 'vue';
  if (ext === '.svelte') return 'svelte';
  if (ext === '.astro') return 'astro';
  if (ext === '.html' || ext === '.htm') return 'html';
  if (ext === '.ts' || ext === '.js') return 'react'; // assume React TS
  return (fallback as Framework) ?? 'react';
}

// ---------------------------------------------------------------------------
// Domain 7: dead code (v0.18.5)
// ---------------------------------------------------------------------------
//
// Captures what the `dead/*` rules need to detect the AI-iteration
// pattern: AI writes scaffolding (imports, state, branches) and then
// rewrites the function without cleaning up. The visitor walks
// declarations and references once per file and emits the per-binding
// "is this ever used" answer that rules turn into Issues.
//
// Why a new domain: the existing visitor tracks per-frame binding
// membership (for state-binding liveness) but doesn't emit "unused
// imports" or "dead branches" because nothing else needed it.

/** What kind of declaration produced a binding. */
export type BindingKind =
  | 'import-specifier'
  | 'import-default'
  | 'import-namespace'
  | 'var'
  | 'let'
  | 'const'
  | 'function'
  | 'class'
  | 'type'
  | 'interface'
  | 'enum'
  | 'parameter'
  | 'catch-clause';

/** A single binding declaration the visitor found in the file.
 *
 *  `isReferenced` is set to true if ANY identifier reference to this
 *  name appeared in the file. The visitor uses a single global
 *  referenced-name set per file (intra-scope shadowing is rare enough
 *  in practice that file-level resolution catches ~95% of dead code
 *  with negligible false positives — the remaining 5% is mostly
 *  intentional re-exports which are handled separately). */
export interface BindingRecord {
  /** The local name as written (`Button` for `import { Button } from ...`,
   *  `setFoo` for a parameter, etc.). */
  name: string;
  kind: BindingKind;
  /** Source line (1-indexed). */
  line: number;
  /** Source column (0-indexed). */
  column: number;
  /** The owning source — used to differentiate top-level imports from
   *  inline `import()` expressions, which are dynamic and out of
   *  scope for the dead-import rule. */
  source?: string;
  /** Set to true when the visitor saw at least one reference to this
   *  name later in the file. */
  isReferenced: boolean;
}

/** A literal boolean condition (`if (true)`, `while (false)`,
 *  ternary `cond ? a : false`) that makes the branch statically
 *  decidable. */
export interface ConstantConditionRecord {
  /** The kind of construct. */
  kind: 'if-true' | 'if-false' | 'while-true' | 'while-false' | 'ternary';
  /** The condition's source text. */
  condition: string;
  line: number;
  column: number;
}

/** A statement that is unreachable because an earlier statement in
 *  the same function body unconditionally exited (`return`, `throw`,
 *  `break`, `continue`). */
export interface UnreachableStatementRecord {
  /** Why the earlier statement exited. */
  terminator: 'return' | 'throw' | 'break' | 'continue';
  /** First line of the unreachable statement. */
  line: number;
  column: number;
  /** A short snippet (first 60 chars) for the rule's message. */
  snippet: string;
}

/** The dead-code domain. Empty when the file has nothing the visitor
 *  classified as suspicious. */
export interface DeadCodeFacts {
  bindings: BindingRecord[];
  constantConditions: ConstantConditionRecord[];
  unreachableStatements: UnreachableStatementRecord[];
}

// ---------------------------------------------------------------------------
// Helper: build RuleContext for v2 rule execution
// ---------------------------------------------------------------------------

export interface RuleContextV2 {
  /** Read-only access to resolved config (thresholds, allowedImports,
   *  spacingScale, categoryWeights, etc.). */
  config: Readonly<ResolvedConfig>;
  /** Framework derived from extension. */
  framework: Framework;
  /** Absolute file path. */
  filePath: string;
}

// Type aliases re-exported from src/types.ts to keep backward compat.
// The new code uses these directly; the old `ScanFacts` (flat shape) is
// still emitted alongside the new one until  removes it.
export type { Severity, Category };
