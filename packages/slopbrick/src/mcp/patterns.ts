// Pattern inventory + constitution checking for the slop_suggest and
// slop_check_constitution MCP tools.
//
//   buildPatternInventory(cwd, config)   — project-wide: which patterns
//                                           exist (modals, buttons, api
//                                           clients, state libs, etc.)
//   checkFileConstitution(source, const) — per-file: which imports
//                                           violate declared constitution
//                                           (state, data fetching, UI,
//                                           forms, styling, routing) or
//                                           hit the deny-list
//   extractImports(source)               — regex-based import extraction
//                                           (ESM + dynamic + CommonJS)
//
// Patterns are derived from filenames + import signals so a single
// project scan stays cheap and deterministic. No AST parsing — the
// goal is "give the agent a list of canonical imports + flag obvious
// constitution violations", not a full static analysis.

import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { discoverFiles } from '../engine/discover.js';
import { CONSTITUTION_SIGNALS, matchForbidden } from '../config/conventions.js';
import type { Constitution, ResolvedConfig } from '../types.js';

// ---- Types ----------------------------------------------------------------

export interface PatternMatch {
  /** Canonical pattern name within its category. */
  name: string;
  /** Files in the project that contribute to this pattern. */
  files: string[];
  /** Canonical package imports associated with this pattern. */
  imports: string[];
}

export interface PatternInventory {
  /** How many files were scanned to build this inventory. */
  scannedFiles: number;
  /** Detected patterns grouped by category. */
  patterns: {
    modal: PatternMatch[];
    button: PatternMatch[];
    api: PatternMatch[];
    state: PatternMatch[];
    dataFetching: PatternMatch[];
    /** v0.9.2 — backend service classes (Python) / structs (Go). */
    service: PatternMatch[];
    /** v0.9.2 — HTTP route registrations (Flask/FastAPI/net.http/gin). */
    route: PatternMatch[];
    /** v0.9.2 — ORM model classes (SQLAlchemy/Django/gorm/sqlx). */
    ormModel: PatternMatch[];
  };
}

export interface ConstitutionViolation {
  /** The import that violated the declared constitution. */
  import: string;
  /** Which constitution field it conflicts with (e.g. "stateManagement",
   *  or "forbidden" if it was matched by the deny-list). */
  category: keyof Constitution;
  /** The values the project declared for this field. For a deny-list
   *  hit, this is the single matched entry from `constitution.forbidden`. */
  declared: string[];
  /** Human-readable explanation. */
  message: string;
}

export interface ConstitutionCheckResult {
  /** All imports extracted from the file. */
  imports: string[];
  /** Constitution violations, empty if the file is clean. */
  violations: ConstitutionViolation[];
}

// ---- Import extraction ----------------------------------------------------

const ESM_IMPORT_RE =
  /(?:^|\n)\s*(?:import\s+(?:type\s+)?(?:[\w*${},\s]+\s+from\s+)?|import\s+|export\s+(?:type\s+)?[\w*${},\s]+\s+from\s+)(['"])([^'"]+)\1/g;
const DYNAMIC_IMPORT_RE = /import\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
const COMMONJS_REQUIRE_RE = /require\s*\(\s*(['"])([^'"]+)\1\s*\)/g;

/**
 * Extract all import specifiers from a source string. Returns a
 * deduplicated list preserving first-seen order. Skips relative
 * imports — only reports bare specifiers (so we don't flag
 * `../components/Button` against the constitution).
 */
export function extractImports(source: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (spec: string) => {
    if (spec.startsWith('.') || spec.startsWith('/')) return;
    if (seen.has(spec)) return;
    seen.add(spec);
    out.push(spec);
  };

  for (const re of [ESM_IMPORT_RE, DYNAMIC_IMPORT_RE, COMMONJS_REQUIRE_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      push(m[2]!);
    }
  }
  return out;
}

// ---- Signal matching ------------------------------------------------------

interface CategorizedImport {
  field: keyof Constitution;
  signal: string;
  /** Original package name that matched. */
  matchedPackage: string;
}

/**
 * Look up a single import against the constitution signal table.
 * Returns the canonical (field, signal) pair or null if unknown.
 */
export function categorizeImport(spec: string): CategorizedImport | null {
  // Try the bare spec first, then strip subpath (e.g.
  // "@tanstack/react-query/devtools" -> "@tanstack/react-query").
  const candidates: string[] = [spec, spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!];
  for (const c of candidates) {
    const hit = CONSTITUTION_SIGNALS[c];
    if (hit) return { ...hit, matchedPackage: c };
  }
  return null;
}

// ---- Pattern inventory ----------------------------------------------------

// Match component-name basenames only — PascalCase identifier that
// ends with the component type. Avoids false positives like
// `math-button-label-uniformity.ts` (a rule file whose basename
// happens to contain "button"). The prefix group is optional so
// bare names (`Button`, `Modal`) match as well as prefixed variants
// (`IconButton`, `ConfirmDialog`).
const MODAL_NAME_RE = /^(?:[A-Z][a-zA-Z0-9]+)?(Modal|Dialog|Drawer|Sheet|Popover|Sidebar)$/;
const BUTTON_NAME_RE = /^(?:[A-Z][a-zA-Z0-9]+)?(Button|Btn)$/;
const API_PATH_RE = /(?:^|\/)(?:lib\/api|services|api-client|clients)\//;

/**
 * Build a project-wide pattern inventory. Scans up to `maxFiles`
 * source files (defaults to 200) and groups them by category.
 */
export async function buildPatternInventory(
  cwd: string,
  config: ResolvedConfig,
  maxFiles = 200,
): Promise<PatternInventory> {
  const files = await discoverFiles(cwd, config);
  const limited = files.slice(0, maxFiles);

  const modalMap = new Map<string, PatternMatch>();
  const buttonMap = new Map<string, PatternMatch>();
  const apiFiles: string[] = [];
  const stateMap = new Map<string, PatternMatch>();
  const fetchingMap = new Map<string, PatternMatch>();
  // v0.9.2 — backend pattern categories. Each is a map keyed by pattern
  // name so multiple files contributing the same name cluster together
  // (the cross-file drift detection in phase 3 reads from these).
  const serviceMap = new Map<string, PatternMatch>();
  const routeMap = new Map<string, PatternMatch>();
  const ormModelMap = new Map<string, PatternMatch>();

  for (const file of limited) {
    const rel = file;
    const base = basename(file).replace(/\.(tsx|ts|jsx|js|vue|svelte|astro)$/i, '');

    // ---- Filename-based categories (Modal, Button, API) --------------
    if (MODAL_NAME_RE.test(base)) {
      const name = base;
      const entry = modalMap.get(name) ?? { name, files: [], imports: [] };
      entry.files.push(rel);
      modalMap.set(name, entry);
    } else if (BUTTON_NAME_RE.test(base)) {
      const name = base;
      const entry = buttonMap.get(name) ?? { name, files: [], imports: [] };
      entry.files.push(rel);
      buttonMap.set(name, entry);
    }
    if (API_PATH_RE.test(rel)) {
      apiFiles.push(rel);
    }

    let source: string;
    try {
      source = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    // ---- Import-signal categories (state, data fetching) --------------
    const imports = extractImports(source);
    for (const spec of imports) {
      const hit = categorizeImport(spec);
      if (!hit) continue;
      const map = hit.field === 'stateManagement' ? stateMap : fetchingMap;
      const entry = map.get(hit.signal) ?? {
        name: hit.signal,
        files: [],
        imports: [],
      };
      if (!entry.files.includes(rel)) entry.files.push(rel);
      if (!entry.imports.includes(hit.matchedPackage)) entry.imports.push(hit.matchedPackage);
      map.set(hit.signal, entry);
    }

    // ---- v0.9.2 / v0.14.0 — Backend pattern extraction ---------------
    // Detect the file's language by extension and run the appropriate
    // regex-based extractor. The visitors are lazy-imported to avoid
    // forcing parser/babel dependency on pure-frontend projects.
    //
    // v0.14.0 — added 8 new languages: Swift, Kotlin, Dart, Rust, C++,
    // Java, Ruby, PHP. Each language has a dedicated visitor in
    // `src/engine/visitors/{lang}.ts` exporting the standard
    // `extractXxxPatterns(filePath, source) → { service, route, ormModel }`
    // contract. The C++ visitor intentionally returns an empty
    // `ormModel` array because C++ has no dominant ORM (ODB, SOCI,
    // Sqlpp11 are rare).
    const ext = extname(file).toLowerCase();
    const visitor = await pickBackendVisitor(ext);
    if (visitor) {
      try {
        const result = await visitor(rel, source);
        for (const m of result.service) mergeInto(serviceMap, m, rel);
        for (const m of result.route) mergeInto(routeMap, m, rel);
        for (const m of result.ormModel) mergeInto(ormModelMap, m, rel);
      } catch {
        // Visitor unavailable or threw — skip silently to keep the
        // inventory builder resilient.
      }
    }
  }

  // api category is just a list, not a map (no canonical names to derive)
  const api: PatternMatch[] =
    apiFiles.length > 0
      ? [{ name: 'api-clients', files: apiFiles, imports: [] }]
      : [];

  return {
    scannedFiles: limited.length,
    patterns: {
      modal: Array.from(modalMap.values()),
      button: Array.from(buttonMap.values()),
      api,
      state: Array.from(stateMap.values()),
      dataFetching: Array.from(fetchingMap.values()),
      service: Array.from(serviceMap.values()),
      route: Array.from(routeMap.values()),
      ormModel: Array.from(ormModelMap.values()),
    },
  };
}

/** Merge a `PatternMatch` into the named map. If a match with the same
 *  name already exists, append the current file path to its `files`
 *  array (deduped). Otherwise insert the match as-is. */
function mergeInto(
  map: Map<string, PatternMatch>,
  m: PatternMatch,
  filePath: string,
): void {
  const existing = map.get(m.name);
  if (existing) {
    if (!existing.files.includes(filePath)) existing.files.push(filePath);
    return;
  }
  map.set(m.name, { ...m, files: [filePath] });
}

/** Shape of the per-language visitor. Mirrors the signature of
 *  `extractPythonPatterns` / `extractGoPatterns` so the
 *  `buildPatternInventory` caller can dispatch generically. */
type BackendPatternExtractor = (
  filePath: string,
  source: string,
) => Promise<{
  service: PatternMatch[];
  route: PatternMatch[];
  ormModel: PatternMatch[];
}>;

/**
 * v0.14.0 — pick the right backend visitor based on file extension.
 * Returns null for extensions we don't have a visitor for (frontend
 * extensions, plus rarer languages not in the v0.14.0 set).
 *
 * The map is built lazily inside the function body so adding a new
 * language is a one-line change. We deliberately don't precompute the
 * map at module load — that would force every consumer to pull in
 * the visitor modules (some users may only scan Python projects, for
 * example).
 */
async function pickBackendVisitor(
  ext: string,
): Promise<BackendPatternExtractor | null> {
  switch (ext) {
    case '.py':
      return async (filePath, source) => {
        const { extractPythonPatterns } = await import(
          '../engine/visitors/python.js'
        );
        return extractPythonPatterns(filePath, source);
      };
    case '.go':
      return async (filePath, source) => {
        const { extractGoPatterns } = await import(
          '../engine/visitors/go.js'
        );
        return extractGoPatterns(filePath, source);
      };
    // v0.14.0 — 8 new languages
    case '.swift':
      return async (filePath, source) => {
        const { extractSwiftPatterns } = await import(
          '../engine/visitors/swift.js'
        );
        return extractSwiftPatterns(filePath, source);
      };
    case '.kt':
    case '.kts':
      return async (filePath, source) => {
        const { extractKotlinPatterns } = await import(
          '../engine/visitors/kotlin.js'
        );
        return extractKotlinPatterns(filePath, source);
      };
    case '.dart':
      return async (filePath, source) => {
        const { extractDartPatterns } = await import(
          '../engine/visitors/dart.js'
        );
        return extractDartPatterns(filePath, source);
      };
    case '.rs':
      return async (filePath, source) => {
        const { extractRustPatterns } = await import(
          '../engine/visitors/rust.js'
        );
        return extractRustPatterns(filePath, source);
      };
    case '.cpp':
    case '.cc':
    case '.cxx':
    case '.c':
    case '.h':
    case '.hpp':
    case '.hxx':
      return async (filePath, source) => {
        const { extractCppPatterns } = await import(
          '../engine/visitors/cpp.js'
        );
        return extractCppPatterns(filePath, source);
      };
    case '.java':
      return async (filePath, source) => {
        const { extractJavaPatterns } = await import(
          '../engine/visitors/java.js'
        );
        return extractJavaPatterns(filePath, source);
      };
    case '.rb':
      return async (filePath, source) => {
        const { extractRubyPatterns } = await import(
          '../engine/visitors/ruby.js'
        );
        return extractRubyPatterns(filePath, source);
      };
    case '.php':
      return async (filePath, source) => {
        const { extractPhpPatterns } = await import(
          '../engine/visitors/php.js'
        );
        return extractPhpPatterns(filePath, source);
      };
    default:
      return null;
  }
}

// ---- Constitution checking ------------------------------------------------

/**
 * Check a single file's imports against the declared constitution.
 * Reports two kinds of violations:
 *
 *  1. **Deny-list hits** — imports that match an entry in
 *     `constitution.forbidden` (matched by `matchForbidden`). These
 *     fire regardless of whether the import also has a known
 *     canonical signal, and are pushed first so reviewers see the
 *     most actionable violation at the top of the list.
 *  2. **Canonical-category mismatches** — imports that resolve to a
 *     known signal in `CONSTITUTION_SIGNALS` whose canonical
 *     field/signal pair is not in the user's declared allow-list
 *     for that field. Free-form `custom` declarations are not
 *     auto-checked.
 *
 * An empty `violations` array means the file is conformant. An
 * undefined `constitution` skips both checks (nothing declared).
 */
export function checkFileConstitution(
  source: string,
  constitution: Constitution | undefined,
): ConstitutionCheckResult {
  const imports = extractImports(source);
  if (!constitution) {
    return { imports, violations: [] };
  }

  const violations: ConstitutionViolation[] = [];
  for (const spec of imports) {
    // ---- 1. Deny-list check (forbidden takes priority) ---------------
    const forbiddenMatch = matchForbidden(spec, constitution.forbidden);
    if (forbiddenMatch) {
      violations.push({
        import: spec,
        category: 'forbidden',
        declared: [forbiddenMatch],
        message: `Constitution violation: '${spec}' is on the deny-list ('${forbiddenMatch}').`,
      });
    }

    // ---- 2. Canonical-category check (always runs) -------------------
    const hit = categorizeImport(spec);
    if (!hit) continue;
    const field = hit.field;
    if (field === 'custom') continue; // free-form, can't auto-check

    const declared = constitution[field];
    // Field not declared = no constraint, nothing to check.
    if (!declared || declared.length === 0) continue;
    // Match against canonical signals, not raw package names.
    if (declared.includes(hit.signal)) continue;

    const humanField = {
      stateManagement: 'state management',
      dataFetching: 'data fetching',
      uiLibrary: 'UI library',
      forms: 'form library',
      styling: 'styling',
      routing: 'routing',
    }[field as string] ?? field;

    violations.push({
      import: spec,
      category: field,
      declared: declared.slice(),
      message:
        `Constitution violation: project declares ${declared.map((d: string) => `'${d}'`).join(', ')} for ${humanField}, ` +
        `but this file imports '${spec}' (canonical: '${hit.signal}').`,
    });
  }

  return { imports, violations };
}
