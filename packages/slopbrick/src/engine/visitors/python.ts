// Inventory-first pattern extractor for Python source files.
//
// Pure functions that feed into `buildPatternInventory` (see
// `src/mcp/patterns.ts`). The lens: "did this code introduce a new
// pattern when an existing pattern already existed?" — so a file
// containing `class UserService` registers a service named "User" that
// the cross-file drift detector can later compare against
// `UserManager`, `UserRepository`, etc.
//
// Phase 1 contract (v0.9.2): regex-only, no Python parser dependency.
// Each call returns AT MOST one `PatternMatch` per category per file.
// The `imports` array is left empty — a later pass will populate it
// from the visitor's import graph.

import type { PatternMatch } from '../../mcp/patterns.js';

/** Shape of a single extractor's output. */
export interface PythonPatternResult {
  service: PatternMatch[];
  route: PatternMatch[];
  ormModel: PatternMatch[];
}

/**
 * Canonical service-layer suffixes we strip from the captured class
 * name to derive the base pattern. Order is irrelevant — the regex
 * already consumes the longest matching suffix; we just sanitize the
 * result defensively in case the name contains additional suffixes
 * (e.g. `UserAPIHelper` collapses to `User`).
 *
 * NOTE: as of v0.9.2 phase 4, this function is no longer called for
 * the inventory — we emit the FULL class name (e.g. "UserService") so
 * the cluster's drift detector can count distinct variants. Kept here
 * for any callers that want the stem directly.
 */
const SERVICE_SUFFIXES = [
  'Service',
  'Manager',
  'Handler',
  'Repository',
  'Controller',
  'Helper',
  'Factory',
  'Provider',
  'Store',
  'API',
  'Client',
] as const;

/**
 * `class X<ServiceSuffix>:` or `class X<ServiceSuffix>(Base):`.
 * Non-greedy `\w+?` finds the shortest prefix such that the suffix
 * alternation matches; a bare `class X:` (no service suffix) does NOT
 * match — plain classes aren't services.
 *
 * Capture group is the FULL class name (e.g. "UserService"). The
 * cluster in `src/engine/cluster.ts` strips the suffix to derive the
 * stem, so we don't strip here — otherwise UserService + UserManager
 * + UserHandler all collapse to "User" before the cluster can see
 * them as 3 variants.
 */
const PY_SERVICE_RE = new RegExp(
  String.raw`^class\s+(\w+?(?:Service|Manager|Handler|Repository|Controller|Helper|Factory|Provider|Store|API|Client))(?:\s*(?:\([^)]*\))?)?\s*:`,
  'gm',
);

/**
 * Flask + FastAPI + Blueprint route decorators:
 *   @app.route('/foo')
 *   @router.get("/users")
 *   @bp.post('/items')
 * Captures the URL path (must start with `/`).
 * No `g` flag — `.match()` below is the single-call shape, and the
 * global flag would carry `lastIndex` state across invocations.
 */
const PY_ROUTE_RE = /@(?:app|router|bp)\.(?:route|get|post|put|delete|patch)\(\s*['"](\/[^'"]+)['"]/g;

/**
 * SQLAlchemy declarative Base, Django Model, Tortoise, TimescaleDB
 * hypertable, and soft-delete mixin. Matches `class User(Base):`
 * even when followed by additional bases or kwargs.
 */
const PY_ORM_RE = new RegExp(
  String.raw`^class\s+(\w+)\s*\(\s*(?:Base|Model|TimescaleMixin|SoftDeleteMixin)`,
  'gm',
);

function stripServiceSuffix(name: string): string {
  // Single pass is sufficient for the regex's capture (which already
  // consumes the longest matching suffix). The defensive loop handles
  // exotic compound names like `UserAPIHelper` that the regex might
  // leave partially unstripped.
  for (const suffix of SERVICE_SUFFIXES) {
    if (name.length > suffix.length && name.endsWith(suffix)) {
      return name.slice(0, -suffix.length);
    }
  }
  return name;
}

/**
 * Extract up to three pattern categories from a single Python file.
 *
 * - **service**: classes whose name ends in a service-layer suffix
 *   (Service, Manager, Handler, Repository, Controller, Helper,
 *   Factory, Provider, Store, API, Client). The returned `name` is
 *   the base (suffix stripped).
 * - **route**: the first HTTP route registered via Flask
 *   (`@app.route`), FastAPI (`@router.get`/`.post`/…), or Blueprint
 *   (`@bp.route`) decorator. The returned `name` is the URL path.
 * - **ormModel**: classes that inherit from a known ORM base
 *   (SQLAlchemy `Base`, Django `Model`, Tortoise, TimescaleDB,
 *   SoftDeleteMixin). The returned `name` is the class name.
 *
 * Pure function: no I/O, no caching. Caller passes the source string.
 */
export function extractPythonPatterns(
  filePath: string,
  source: string,
): PythonPatternResult {
  const service: PatternMatch[] = [];
  const route: PatternMatch[] = [];
  const ormModel: PatternMatch[] = [];

  // v0.9.2 — Emit ALL matches per file with the FULL class name (e.g.
  // "UserService"). The cluster in src/engine/cluster.ts strips suffixes
  // to derive the stem, so emitting the original name lets it see
  // UserService + UserManager + UserHandler as 3 distinct variants.
  // The inventory's buildPatternInventory then merges by name across
  // files (so cross-file UserService instances collapse to 1 entry
  // with multiple files), but within a file the variants stay
  // distinct.
  for (const m of source.matchAll(PY_SERVICE_RE)) {
    if (m[1].length === 0) continue;
    service.push({
      name: m[1],
      files: [filePath],
      imports: [],
    });
  }

  // Routes: every decorator-registered URL path in this file. Multiple
  // routes per file (e.g. /users and /users/:id) are emitted separately
  // — the cluster's route normalization (`normalizeRoute`) collapses
  // them to the same resource stem.
  for (const m of source.matchAll(PY_ROUTE_RE)) {
    route.push({
      name: m[1],
      files: [filePath],
      imports: [],
    });
  }

  // ORM models: every class inheriting from a known base.
  for (const m of source.matchAll(PY_ORM_RE)) {
    ormModel.push({
      name: m[1],
      files: [filePath],
      imports: [],
    });
  }

  return { service, route, ormModel };
}