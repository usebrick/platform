// Inventory-first pattern extractor for Swift source files.
//
// Pure functions that feed into `buildPatternInventory` (see
// `src/mcp/patterns.ts`). The lens: "did this code introduce a new
// pattern when an existing pattern already existed?" — so a file
// containing `class UserService` registers a service named "User" that
// the cross-file drift detector can later compare against
// `UserManager`, `UserRepository`, etc.
//
// v0.14.0 — regex-only, no Swift parser dependency. Each call returns
// AT MOST one `PatternMatch` per category per file. The `imports`
// array is left empty — a later pass will populate it from the
// visitor's import graph.

import type { PatternMatch } from '../../mcp/patterns.js';
import type { LanguagePatternResult } from './_pattern-extractor-header.js';

/** Shape of a single extractor's output. Aliased for backward compat. */
export type SwiftPatternResult = LanguagePatternResult;

/**
 * Canonical service-layer suffixes we strip from the captured type
 * name to derive the base pattern. Order is irrelevant — the regex
 * already consumes the longest matching suffix; we just sanitize the
 * result defensively in case the name contains additional suffixes
 * (e.g. `UserAPIHelper` collapses to `User`).
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
] as const;

const SERVICE_SUFFIX_GROUP = `(?:${SERVICE_SUFFIXES.join('|')})`;

/**
 * `class X<ServiceSuffix>`, `struct X<ServiceSuffix>`,
 * `actor X<ServiceSuffix>`, `final class X<ServiceSuffix>`.
 *
 * Captures the FULL type name (e.g. "UserService"). The cluster in
 * `src/engine/cluster.ts` strips the suffix to derive the stem, so we
 * don't strip here — otherwise UserService + UserManager + UserHandler
 * all collapse to "User" before the cluster can see them as 3 variants.
 *
 * The `^` anchor plus the `m` flag restricts matches to start-of-line
 * declarations, avoiding accidental hits on inline type references.
 * `public`, `private`, `internal`, `open`, `fileprivate` are common
 * access modifiers and matched optionally.
 */
const SWIFT_SERVICE_RE = new RegExp(
  `^(?:public\\s+|private\\s+|internal\\s+|open\\s+|fileprivate\\s+)?(?:final\\s+)?(?:class|struct|actor)\\s+(\\w+?)${SERVICE_SUFFIX_GROUP}?\\b`,
  'gm',
);

/**
 * Vapor router registrations. Vapor uses string paths so we capture
 * the path literal. We don't try to extract SwiftUI NavigationStack
 * or SwiftData queries — those are not HTTP routes.
 *
 * Captures both the chained form `app.get("path", ...)` and the
 * `routes.add(...)` / `try routes.register(...)` form by anchoring on
 * common Vapor router methods.
 */
const SWIFT_ROUTE_RE = new RegExp(
  `\\b(?:router|app|routes|app\\.routes|router\\.routes)\\.(?:get|post|put|delete|patch|on|group|redirect)\\(\\s*"([^"]+)"`,
  'g',
);

/**
 * Vapor Fluent model: `class X: Model, Content` or
 * `final class X: Model`. SwiftData's `@Model` macro is also
 * supported: a class annotated with `@Model` is treated as an ORM
 * model regardless of inheritance.
 *
 * `@Model` annotation — captured as the class name following the
 * `@Model` macro. The regex permits the macro to appear on the line
 * before the class declaration or on the same line.
 */
const SWIFT_ORM_FLIENT_RE = /^(?:public\s+|private\s+|internal\s+|open\s+|fileprivate\s+)?(?:final\s+)?class\s+(\w+)\s*:\s*Model\b/gm;
const SWIFT_ORM_SWIFTDATA_RE = /@Model\b[\s\S]{0,80}?class\s+(\w+)/g;

export function extractSwiftPatterns(
  filePath: string,
  source: string,
): SwiftPatternResult {
  const service: PatternMatch[] = [];
  const route: PatternMatch[] = [];
  const ormModel: PatternMatch[] = [];

  const seenService = new Set<string>();
  for (const m of source.matchAll(SWIFT_SERVICE_RE)) {
    const name = m[1]!;
    if (seenService.has(name)) continue;
    seenService.add(name);
    service.push({ name, files: [filePath], imports: [] });
  }

  const seenRoute = new Set<string>();
  for (const m of source.matchAll(SWIFT_ROUTE_RE)) {
    const name = m[1]!;
    if (seenRoute.has(name)) continue;
    seenRoute.add(name);
    route.push({ name, files: [filePath], imports: [] });
  }

  const seenOrm = new Set<string>();
  for (const m of source.matchAll(SWIFT_ORM_FLIENT_RE)) {
    const name = m[1]!;
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(SWIFT_ORM_SWIFTDATA_RE)) {
    const name = m[1]!;
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }

  return { service, route, ormModel };
}
