// Inventory-first pattern extractor for Kotlin source files.
//
// Pure functions that feed into `buildPatternInventory` (see
// `src/mcp/patterns.ts`). The lens: "did this code introduce a new
// pattern when an existing pattern already existed?" — so a file
// containing `class UserService` registers a service named "User" that
// the cross-file drift detector can later compare against
// `UserManager`, `UserRepository`, etc.
//
// v0.14.0 — regex-only, no Kotlin parser dependency. Each call returns
// AT MOST one `PatternMatch` per category per file. The `imports`
// array is left empty — a later pass will populate it from the
// visitor's import graph.

import type { PatternMatch } from '../../mcp/patterns.js';

/** Shape of a single extractor's output. */
export interface KotlinPatternResult {
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
  'UseCase',
  'Interactor',
] as const;

const SERVICE_SUFFIX_GROUP = `(?:${SERVICE_SUFFIXES.join('|')})`;

/**
 * `class X<ServiceSuffix>`, `data class X<ServiceSuffix>`,
 * `object X<ServiceSuffix>`, `interface X<ServiceSuffix>`.
 *
 * Captures the FULL name (e.g. "UserService"). The cluster in
 * `src/engine/cluster.ts` strips the suffix to derive the stem, so we
 * don't strip here — otherwise UserService + UserManager +
 * UserHandler all collapse to "User" before the cluster can see them
 * as 3 variants.
 *
 * `public`, `private`, `internal`, `protected`, `abstract`, `open`,
 * `final`, `sealed`, `data` are common Kotlin modifiers and matched
 * optionally. The `^` anchor plus the `m` flag restricts matches to
 * start-of-line declarations.
 */
const KOTLIN_SERVICE_RE = new RegExp(
  `^(?:public\\s+|private\\s+|internal\\s+|protected\\s+|abstract\\s+|open\\s+|final\\s+|sealed\\s+|data\\s+)*` +
    `(?:class|object|interface)\\s+(\\w+?)${SERVICE_SUFFIX_GROUP}?\\b`,
  'gm',
);

/**
 * Spring (`@GetMapping`, `@PostMapping`, `@RequestMapping`) and Ktor
 * (`get("/path")`, `post("/path")` etc.) route declarations.
 *
 * The Spring form requires the path literal to start with `/`. The
 * Ktor form permits string interpolation so we capture the raw
 * literal.
 */
const KOTLIN_SPRING_ROUTE_RE =
  /@(?:Get|Post|Put|Delete|Patch|Request)Mapping\s*\(\s*(?:value\s*=\s*)?"(\/[^"]*)"/g;
const KOTLIN_KTOR_ROUTE_RE =
  /\b(?:get|post|put|delete|patch|route)\(\s*"(\/[^"]+)"\s*[,)]/g;

export type KotlinRouteCapture =
  | { kind: 'spring'; raw: string }
  | { kind: 'ktor'; raw: string };

/**
 * JPA / Hibernate / Spring Data / Exposed ORM model detection.
 *
 *   - `@Entity` or `@Table(name = ...)` annotation on a class
 *   - Inherits from `BaseEntity` or `AbstractEntity` (Spring Data convention)
 *   - Exposed: `object X : Table()` or `class X : Table()`
 */
const KOTLIN_ORM_ANNOTATION_RE = /@(?:Entity|Table)\b[\s\S]{0,200}?(?:class|data\s+class|object)\s+(\w+)/g;
const KOTLIN_ORM_INHERIT_RE = /^(?:public\s+|private\s+|internal\s+|abstract\s+|open\s+|sealed\s+|data\s+)*(?:class|data\s+class|object)\s+(\w+)\s*:\s*(?:BaseEntity|AbstractEntity|Model)\b/gm;
const KOTLIN_EXPOSED_RE = /^(?:public\s+|private\s+|internal\s+)?(?:object|class)\s+(\w+)\s*(?::\s*Table\s*\(\s*\)|:\s*IdTable\s*<)/gm;

export function extractKotlinPatterns(
  filePath: string,
  source: string,
): KotlinPatternResult {
  const service: PatternMatch[] = [];
  const route: PatternMatch[] = [];
  const ormModel: PatternMatch[] = [];

  const seenService = new Set<string>();
  for (const m of source.matchAll(KOTLIN_SERVICE_RE)) {
    const name = m[1];
    if (seenService.has(name)) continue;
    seenService.add(name);
    service.push({ name, files: [filePath], imports: [] });
  }

  const seenRoute = new Set<string>();
  for (const m of source.matchAll(KOTLIN_SPRING_ROUTE_RE)) {
    const name = m[1];
    if (seenRoute.has(name)) continue;
    seenRoute.add(name);
    route.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(KOTLIN_KTOR_ROUTE_RE)) {
    const name = m[1];
    if (seenRoute.has(name)) continue;
    seenRoute.add(name);
    route.push({ name, files: [filePath], imports: [] });
  }

  const seenOrm = new Set<string>();
  for (const m of source.matchAll(KOTLIN_ORM_ANNOTATION_RE)) {
    const name = m[1];
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(KOTLIN_ORM_INHERIT_RE)) {
    const name = m[1];
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(KOTLIN_EXPOSED_RE)) {
    const name = m[1];
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }

  return { service, route, ormModel };
}
