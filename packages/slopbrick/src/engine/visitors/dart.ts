// Inventory-first pattern extractor for Dart source files.
//
// Pure functions that feed into `buildPatternInventory` (see
// `src/mcp/patterns.ts`). The lens: "did this code introduce a new
// pattern when an existing pattern already existed?" — so a file
// containing `class UserService` registers a service named "User" that
// the cross-file drift detector can later compare against
// `UserManager`, `UserRepository`, etc.
//
// v0.14.0 — regex-only, no Dart parser dependency. Each call returns
// AT MOST one `PatternMatch` per category per file. The `imports`
// array is left empty — a later pass will populate it from the
// visitor's import graph.

import type { PatternMatch } from '../../mcp/patterns.js';
import type { LanguagePatternResult } from './_pattern-extractor-header.js';

/** Shape of a single extractor's output. Aliased for backward compat. */
export type DartPatternResult = LanguagePatternResult;

/**
 * Canonical service-layer suffixes we strip from the captured class
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
  'Bloc',
  'Cubit',
  'Notifier',
] as const;

const SERVICE_SUFFIX_GROUP = `(?:${SERVICE_SUFFIXES.join('|')})`;

/**
 * `class X<ServiceSuffix>`, `abstract class X<ServiceSuffix>`,
 * `mixin X<ServiceSuffix>`, `extension X<ServiceSuffix>`. Captures the
 * FULL name (e.g. "UserService"). The cluster strips the suffix to
 * derive the stem, so we don't strip here.
 */
const DART_SERVICE_RE = new RegExp(
  `^(?:abstract\\s+|base\\s+|sealed\\s+)*(?:class|mixin|extension)\\s+(\\w+?)${SERVICE_SUFFIX_GROUP}?\\b`,
  'gm',
);

/**
 * Server-side Dart HTTP route registrations.
 *
 *   - shelf: `router.get('/path', handler)`, `router.all('/path', ...)`
 *   - Aqueduct / Conduit (older): `router.route('/path')`
 *   - dart_frog: `router.get('/path', ...)` (shelf-compatible)
 *
 * Flutter's `GoRouter` is also captured because it's commonly used
 * with named routes that may overlap with server-side resources.
 * GoRoute path is captured from `path: '/path'`.
 */
const DART_ROUTE_RE = new RegExp(
  `\\b(?:(?:router|app|handler)\\.(?:get|post|put|delete|patch|all)|router\\.route)\\(\\s*['"](\\/[^'"]+)['"]`,
  'g',
);
const DART_GO_ROUTE_RE = /GoRoute\s*\(\s*path:\s*['"](\/[^'"]+)['"]/g;

/**
 * Drift (`class X extends Table`), Floor (`@Database` annotation),
 * and Hive (`@HiveType(typeId: N)` annotation). Drift is the dominant
 * SQLite ORM; Floor adds NoSQL; Hive is widely used for in-app state
 * persistence and is a "model-like" pattern.
 */
const DART_DRIFT_RE = /^(?:abstract\s+)?class\s+(\w+)\s+extends\s+Table\b/gm;
const DART_HIVE_RE = /@HiveType\b[\s\S]{0,200}?class\s+(\w+)/g;

export function extractDartPatterns(
  filePath: string,
  source: string,
): DartPatternResult {
  const service: PatternMatch[] = [];
  const route: PatternMatch[] = [];
  const ormModel: PatternMatch[] = [];

  const seenService = new Set<string>();
  for (const m of source.matchAll(DART_SERVICE_RE)) {
    const name = m[1]!;
    if (seenService.has(name)) continue;
    seenService.add(name);
    service.push({ name, files: [filePath], imports: [] });
  }

  const seenRoute = new Set<string>();
  for (const m of source.matchAll(DART_ROUTE_RE)) {
    const name = m[1]!;
    if (seenRoute.has(name)) continue;
    seenRoute.add(name);
    route.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(DART_GO_ROUTE_RE)) {
    const name = m[1]!;
    if (seenRoute.has(name)) continue;
    seenRoute.add(name);
    route.push({ name, files: [filePath], imports: [] });
  }

  const seenOrm = new Set<string>();
  for (const m of source.matchAll(DART_DRIFT_RE)) {
    const name = m[1]!;
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(DART_HIVE_RE)) {
    const name = m[1]!;
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }

  return { service, route, ormModel };
}
