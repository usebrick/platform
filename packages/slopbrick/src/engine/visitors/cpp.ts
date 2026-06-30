// Inventory-first pattern extractor for C++ source files.
//
// Pure functions that feed into `buildPatternInventory` (see
// `src/mcp/patterns.ts`). The lens: "did this code introduce a new
// pattern when an existing pattern already existed?" — so a file
// containing `class UserService` registers a service named "User"
// that the cross-file drift detector can later compare against
// `UserManager`, `UserRepository`, etc.
//
// v0.14.0 — regex-only, no C++ parser dependency. Each call returns
// AT MOST one `PatternMatch` per category per file. The `imports`
// array is left empty — a later pass will populate it from the
// visitor's import graph.
//
// C++ has no dominant ORM (ODB, SOCI, Sqlpp11 exist but are rare),
// so `ormModel` extraction is intentionally a no-op for C++.

import type { PatternMatch } from '../../mcp/patterns.js';

/** Shape of a single extractor's output. */
export interface CppPatternResult {
  service: PatternMatch[];
  route: PatternMatch[];
  ormModel: PatternMatch[];
}

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
] as const;

const SERVICE_SUFFIX_GROUP = `(?:${SERVICE_SUFFIXES.join('|')})`;

/**
 * `class X<ServiceSuffix>`, `struct X<ServiceSuffix>`. Captures the
 * FULL name (e.g. "UserService"). The cluster strips the suffix to
 * derive the stem, so we don't strip here.
 *
 * `public`, `private`, `protected`, `virtual`, `abstract`,
 * `static`, `inline`, `constexpr`, `explicit`, `final`, `extern`
 * are common C++ modifiers and matched optionally. The `^` anchor
 * plus the `m` flag restricts matches to start-of-line declarations.
 */
const CPP_SERVICE_RE = new RegExp(
  `^(?:public\\s+|private\\s+|protected\\s+|virtual\\s+|abstract\\s+|static\\s+|inline\\s+|constexpr\\s+|explicit\\s+|final\\s+|extern\\s+)*` +
    `(?:class|struct)\\s+(\\w+?)${SERVICE_SUFFIX_GROUP}?\\b`,
  'gm',
);

/**
 * HTTP route registrations for the 3 dominant C++ web frameworks:
 *
 *   - Crow:     `CROW_ROUTE(app, "/path")` and `CROW_ROUTE(app, "/path/<int>")`
 *   - Drogon:   `app().registerHandler("/path", ...)` and
 *               `app().get("/path", ...)` etc.
 *   - Pistache: `Routes::get(router, "/path", handler)`
 *   - cpprestsdk: noisy (lambda-based), skipped.
 */
const CPP_CROW_ROUTE_RE = /CROW_ROUTE\s*\(\s*\w+\s*,\s*"(\/[^"]+)"/g;
const CPP_DROGON_ROUTE_RE =
  /\.registerHandler\(\s*"(\/[^"]+)"[\s,)]|\.\b(?:get|post|put|delete|patch)\(\s*"(\/[^"]+)"/g;
const CPP_PISTACHE_ROUTE_RE =
  /Routes::(?:get|post|put|delete|patch)\s*\(\s*[^,]+,\s*"(\/[^"]+)"/g;

export function extractCppPatterns(
  filePath: string,
  source: string,
): CppPatternResult {
  const service: PatternMatch[] = [];
  const route: PatternMatch[] = [];
  const ormModel: PatternMatch[] = []; // C++ has no dominant ORM; intentional no-op.

  const seenService = new Set<string>();
  for (const m of source.matchAll(CPP_SERVICE_RE)) {
    const name = m[1]!;
    if (seenService.has(name)) continue;
    seenService.add(name);
    service.push({ name, files: [filePath], imports: [] });
  }

  const seenRoute = new Set<string>();
  for (const m of source.matchAll(CPP_CROW_ROUTE_RE)) {
    const name = m[1]!;
    if (seenRoute.has(name)) continue;
    seenRoute.add(name);
    route.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(CPP_DROGON_ROUTE_RE)) {
    // Drogon regex has 2 capture groups (handler + method). Pick the
    // non-empty one.
    const name = m[1]! || m[2]!;
    if (!name) continue;
    if (seenRoute.has(name)) continue;
    seenRoute.add(name);
    route.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(CPP_PISTACHE_ROUTE_RE)) {
    const name = m[1]!;
    if (seenRoute.has(name)) continue;
    seenRoute.add(name);
    route.push({ name, files: [filePath], imports: [] });
  }

  return { service, route, ormModel };
}
