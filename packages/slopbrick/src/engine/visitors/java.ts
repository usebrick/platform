// Inventory-first pattern extractor for Java source files.
//
// Pure functions that feed into `buildPatternInventory` (see
// `src/mcp/patterns.ts`). The lens: "did this code introduce a new
// pattern when an existing pattern already existed?" — so a file
// containing `class UserService` registers a service named "User"
// that the cross-file drift detector can later compare against
// `UserManager`, `UserRepository`, etc.
//
// v0.14.0 — regex-only, no Java parser dependency. Each call returns
// AT MOST one `PatternMatch` per category per file. The `imports`
// array is left empty — a later pass will populate it from the
// visitor's import graph.

import type { PatternMatch } from '../../mcp/patterns.js';
import type { LanguagePatternResult } from './_pattern-extractor-header.js';

/** Shape of a single extractor's output. Aliased for backward compat. */
export type JavaPatternResult = LanguagePatternResult;

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
  'Delegate',
  'Action',
  'Task',
] as const;

const SERVICE_SUFFIX_GROUP = `(?:${SERVICE_SUFFIXES.join('|')})`;

/**
 * `class X<ServiceSuffix>`, `interface X<ServiceSuffix>`,
 * `record X<ServiceSuffix>`. Captures the FULL name (e.g.
 * "UserService"). The cluster strips the suffix to derive the stem,
 * so we don't strip here.
 *
 * `public`, `private`, `protected`, `abstract`, `final`, `static`,
 * `sealed`, `non-sealed` are common Java modifiers and matched
 * optionally. The `^` anchor plus the `m` flag restricts matches to
 * start-of-line declarations.
 */
const JAVA_SERVICE_RE = new RegExp(
  `^(?:public\\s+|private\\s+|protected\\s+|abstract\\s+|final\\s+|static\\s+|sealed\\s+|non-sealed\\s+)*` +
    `(?:class|interface|record|enum)\\s+(\\w+?)${SERVICE_SUFFIX_GROUP}?\\b`,
  'gm',
);

/**
 * HTTP route registrations for the 3 dominant Java web frameworks:
 *
 *   - Spring MVC / WebFlux: `@GetMapping("/path")` / `@PostMapping` / `@RequestMapping`
 *   - JAX-RS: `@Path("/path")` on a class + `@GET` / `@POST` etc. on a method
 *   - Play Framework: `routes: GET /path controllers.X.y()` (skipped — multiline)
 *
 * The Spring form requires the path literal to start with `/`. The
 * JAX-RS form is split: the class-level `@Path` and method-level
 * verb annotation are combined by the cluster.
 */
const JAVA_SPRING_ROUTE_RE =
  /@(?:Get|Post|Put|Delete|Patch|Request)Mapping\s*\(\s*(?:value\s*=\s*)?\s*"(\/[^"]*)"/g;
const JAVA_JAXRS_CLASS_PATH_RE = /@Path\s*\(\s*"([^"]*)"\s*\)/g;

/**
 * JPA / Hibernate / EBean / Spring Data ORM model patterns:
 *
 *   - `@Entity` / `@Table(name = ...)` annotation on a class
 *   - Inherits from `BaseModel` / `AbstractPersistable` (Spring Data convention)
 *   - EBean: extends `Model` (note: too generic; restricted to known EBean import
 *     paths by upstream filter)
 */
const JAVA_ORM_ANNOTATION_RE = /@(?:Entity|Table)\b[\s\S]{0,300}?(?:class|record|interface)\s+(\w+)/g;
const JAVA_ORM_INHERIT_RE = /^(?:public\s+|private\s+|protected\s+|abstract\s+|final\s+)*(?:class|record)\s+(\w+)\s+extends\s+(?:BaseModel|AbstractPersistable|Model<)\b/gm;

export function extractJavaPatterns(
  filePath: string,
  source: string,
): JavaPatternResult {
  const service: PatternMatch[] = [];
  const route: PatternMatch[] = [];
  const ormModel: PatternMatch[] = [];

  const seenService = new Set<string>();
  for (const m of source.matchAll(JAVA_SERVICE_RE)) {
    const name = m[1]!;
    if (seenService.has(name)) continue;
    seenService.add(name);
    service.push({ name, files: [filePath], imports: [] });
  }

  const seenRoute = new Set<string>();
  for (const m of source.matchAll(JAVA_SPRING_ROUTE_RE)) {
    const name = m[1]!;
    if (seenRoute.has(name)) continue;
    seenRoute.add(name);
    route.push({ name, files: [filePath], imports: [] });
  }
  // JAX-RS class-level @Path. Method-level verb annotations are
  // skipped; the cluster treats the class path as the canonical
  // resource.
  for (const m of source.matchAll(JAVA_JAXRS_CLASS_PATH_RE)) {
    const name = m[1]!;
    if (name === '' || name === '/') continue; // root resource
    if (seenRoute.has(name)) continue;
    seenRoute.add(name);
    route.push({ name, files: [filePath], imports: [] });
  }

  const seenOrm = new Set<string>();
  for (const m of source.matchAll(JAVA_ORM_ANNOTATION_RE)) {
    const name = m[1]!;
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(JAVA_ORM_INHERIT_RE)) {
    const name = m[1]!;
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }

  return { service, route, ormModel };
}
