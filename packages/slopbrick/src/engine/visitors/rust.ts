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

import type { PatternMatch } from '../../mcp/patterns.js';

/** Shape of a single extractor's output. */
export interface RustPatternResult {
  service: PatternMatch[];
  route: PatternMatch[];
  ormModel: PatternMatch[];
}

/**
 * Canonical service-layer suffixes we strip from the captured type
 * name to derive the base pattern. Order is irrelevant — the regex
 * already consumes the longest matching suffix; we just sanitize the
 * result defensively in case the name contains additional suffixes.
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
  'Adapter',
  'Resolver',
  'Mapper',
  'Transformer',
  'Serializer',
  'Validator',
  'Strategy',
  'Facade',
  'Decorator',
  'Observer',
  'Builder',
  'Command',
  'Processor',
  'Worker',
  'Job',
  'Actor',
  'Executor',
] as const;

const SERVICE_SUFFIX_GROUP = `(?:${SERVICE_SUFFIXES.join('|')})`;

/**
 * `struct X<ServiceSuffix>`, `pub struct X<ServiceSuffix>`, or
 * `impl X<ServiceSuffix>`. Captures the FULL name (e.g. "UserService").
 *
 * Visibility modifiers: `pub`, `pub(crate)`, `pub(super)` are matched
 * optionally. The `^` anchor plus the `m` flag restricts matches to
 * start-of-line declarations.
 */
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
 *
 *   - Actix-web: `#[get("/path")]` / `#[post("/path")]` / `#[route("/path", ...)]`
 *   - Axum:      `.route("/path", get(handler))`
 *   - Rocket:    `#[get("/path")]` / `#[post("/path")]`
 *   - Warp:      `.and(warp::path("path"))` (skipped — path segments are noisy)
 *
 * We capture the path literal as the pattern name.
 */
const RUST_ACTIX_ROUTE_RE =
  /#\[(?:get|post|put|delete|patch|head|route)\(\s*"(\/[^"]+)"\s*[\),]/g;
const RUST_AXUM_ROUTE_RE =
  /\.route\(\s*"(\/[^"]+)"\s*,\s*(?:get|post|put|delete|patch)/g;

/**
 * Rust ORM model patterns:
 *
 *   - Diesel:    `#[derive(Queryable, Insertable, ...)]` on a struct
 *   - SeaORM:    `#[derive(DeriveEntityModel)]` on a struct
 *   - sqlx:      `#[derive(sqlx::FromRow)]` on a struct
 *   - SurrealDB: `#[derive(serde::Deserialize)]` on a struct (no model trait)
 *
 * We look for the derive macro on a line followed by `struct X`.
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
    const name = m[1];
    if (seenService.has(name)) continue;
    seenService.add(name);
    service.push({ name, files: [filePath], imports: [] });
  }
  // impl blocks add another canonical surface for services. The
  // captured name may be a free function (`impl Service`), an
  // inherent impl, or a trait impl. We dedupe by name within file.
  for (const m of source.matchAll(RUST_SERVICE_IMPL_RE)) {
    const name = m[1];
    if (seenService.has(name)) continue;
    seenService.add(name);
    service.push({ name, files: [filePath], imports: [] });
  }

  const seenRoute = new Set<string>();
  for (const m of source.matchAll(RUST_ACTIX_ROUTE_RE)) {
    const name = m[1];
    if (seenRoute.has(name)) continue;
    seenRoute.add(name);
    route.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(RUST_AXUM_ROUTE_RE)) {
    const name = m[1];
    if (seenRoute.has(name)) continue;
    seenRoute.add(name);
    route.push({ name, files: [filePath], imports: [] });
  }

  const seenOrm = new Set<string>();
  for (const m of source.matchAll(RUST_DIESEL_RE)) {
    const name = m[1];
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(RUST_SEAORM_RE)) {
    const name = m[1];
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(RUST_SQLX_RE)) {
    const name = m[1];
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }

  return { service, route, ormModel };
}
