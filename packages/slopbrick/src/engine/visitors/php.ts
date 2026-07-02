// Inventory-first pattern extractor for PHP source files.
//
// Pure functions that feed into `buildPatternInventory` (see
// `src/mcp/patterns.ts`). The lens: "did this code introduce a new
// pattern when an existing pattern already existed?" — so a file
// containing `class UserService` registers a service named "User"
// that the cross-file drift detector can later compare against
// `UserManager`, `UserRepository`, etc.
//
// v0.14.0 — regex-only, no PHP parser dependency. Each call returns
// AT MOST one `PatternMatch` per category per file. The `imports`
// array is left empty — a later pass will populate it from the
// visitor's import graph.

import type { PatternMatch } from '../../mcp/patterns.js';
import type { LanguagePatternResult } from './_pattern-extractor-header.js';

/** Shape of a single extractor's output. Aliased for backward compat. */
export type PhpPatternResult = LanguagePatternResult;

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
  'Action',
  'Middleware',
  'UseCase',
  'Interactor',
] as const;

const SERVICE_SUFFIX_GROUP = `(?:${SERVICE_SUFFIXES.join('|')})`;

/**
 * `class X<ServiceSuffix>`, `interface X<ServiceSuffix>`,
 * `trait X<ServiceSuffix>`. Captures the FULL name (e.g.
 * "UserService"). The cluster strips the suffix to derive the stem,
 * so we don't strip here.
 *
 * `public`, `private`, `protected`, `abstract`, `final`, `static`
 * are common PHP modifiers and matched optionally. The `^` anchor
 * plus the `m` flag restricts matches to start-of-line declarations.
 */
const PHP_SERVICE_RE = new RegExp(
  `^(?:public\\s+|private\\s+|protected\\s+|abstract\\s+|final\\s+|static\\s+|readonly\\s+)*` +
    `(?:class|interface|trait)\\s+(\\w+?)${SERVICE_SUFFIX_GROUP}?\\b`,
  'gm',
);

/**
 * HTTP route registrations for the 4 dominant PHP web frameworks:
 *
 *   - Laravel: `Route::get('/path', [Controller::class, 'method'])`
 *   - Lumen:   same as Laravel (`Route::get` etc.)
 *   - Symfony: `@Route("/path", name="...")` annotation on a method
 *   - Slim:    `$app->get('/path', function ...)` or
 *              `$app->group('/prefix', function ...)`
 *
 * The Laravel form uses static method calls on a `Route` facade. The
 * Symfony form is an annotation.
 */
const PHP_LARAVEL_ROUTE_RE =
  /Route::(?:get|post|put|delete|patch|any|match|resource|apiResource|group)\s*\(\s*['"]([^'"]+)['"]/g;
const PHP_SYMFONY_ROUTE_RE =
  /@Route\s*\(\s*(?:[^)]*?path\s*=\s*)?['"]([^'"]+)['"]/g;
const PHP_SLIM_ROUTE_RE = /\$\w+\s*->(?:get|post|put|delete|patch|map|group)\s*\(\s*['"]([^'"]+)['"]/g;

/**
 * Eloquent + Doctrine ORM model patterns:
 *
 *   - Eloquent: `class X extends Model` or `class X extends Authenticatable`
 *   - Doctrine: `@Entity` / `@Table(name=...)` annotation on a class
 *   - CakePHP: `class X extends AppModel`
 *   - Propel (rare): skipped
 */
const PHP_ELOQUENT_RE = /^(?:public\s+|private\s+|protected\s+|abstract\s+|final\s+)*class\s+(\w+)\s+extends\s+(?:Model|Authenticatable|BaseModel)\b/gm;
const PHP_DOCTRINE_RE = /@(?:Entity|Table)\b[\s\S]{0,300}?(?:class|final\s+class)\s+(\w+)/g;
const PHP_CAKEPHP_RE = /^(?:public\s+|private\s+|protected\s+|abstract\s+|final\s+)*class\s+(\w+)\s+extends\s+AppModel\b/gm;

export function extractPhpPatterns(
  filePath: string,
  source: string,
): PhpPatternResult {
  const service: PatternMatch[] = [];
  const route: PatternMatch[] = [];
  const ormModel: PatternMatch[] = [];

  const seenService = new Set<string>();
  for (const m of source.matchAll(PHP_SERVICE_RE)) {
    const name = m[1]!;
    if (seenService.has(name)) continue;
    seenService.add(name);
    service.push({ name, files: [filePath], imports: [] });
  }

  const seenRoute = new Set<string>();
  for (const m of source.matchAll(PHP_LARAVEL_ROUTE_RE)) {
    const name = m[1]!;
    if (seenRoute.has(name)) continue;
    seenRoute.add(name);
    route.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(PHP_SYMFONY_ROUTE_RE)) {
    const name = m[1]!;
    if (seenRoute.has(name)) continue;
    seenRoute.add(name);
    route.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(PHP_SLIM_ROUTE_RE)) {
    const name = m[1]!;
    if (seenRoute.has(name)) continue;
    seenRoute.add(name);
    route.push({ name, files: [filePath], imports: [] });
  }

  const seenOrm = new Set<string>();
  for (const m of source.matchAll(PHP_ELOQUENT_RE)) {
    const name = m[1]!;
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(PHP_DOCTRINE_RE)) {
    const name = m[1]!;
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }
  for (const m of source.matchAll(PHP_CAKEPHP_RE)) {
    const name = m[1]!;
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }

  return { service, route, ormModel };
}
