/**
 * Regex-based pattern extractor for Go source files.
 *
 * Three categories feed the project-wide `buildPatternInventory` so
 * cross-file drift detection can flag "this code introduced a new
 * pattern when an existing pattern already existed":
 *
 *   - **service**  — types whose name ends in a known service suffix
 *                    (`Service`, `Manager`, `Handler`, …). The bare
 *                    domain name is captured, so `UserService` and
 *                    `UserManager` from different files cluster as
 *                    competing patterns for "User".
 *   - **route**    — HTTP route registrations. The literal path is
 *                    the pattern name, so two files both registering
 *                    `/users` show up as drift.
 *   - **ormModel** — structs that embed `gorm.Model` directly.
 *
 * Pure function — no I/O. The caller reads the file and passes the
 * source string. Within a single file, results are deduplicated by
 * name; `buildPatternInventory` does the cross-file merge.
 */

import type { PatternMatch } from '../../mcp/patterns.js';

/**
 * Suffixes that mark a Go type as a service-shaped pattern. Listed
 * as a frozen array so the regex template below can interpolate them
 * while keeping the canonical list greppable.
 */
const GO_SERVICE_SUFFIXES = [
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

const GO_SERVICE_SUFFIX_GROUP = `(?:${GO_SERVICE_SUFFIXES.join('|')})`;

/**
 * Match a top-level `type XService struct` (or any other suffix
 * variant). The non-greedy `\w+?` lets the optional suffix group
 * peel `Service` (etc.) off the right edge so capture group 1 holds
 * the bare domain name. The `^` anchor plus the `m` flag restricts
 * matches to start-of-line declarations, avoiding accidental hits
 * on inline struct literals inside functions.
 */
const GO_SERVICE_RE = new RegExp(
  `^type\\s+(\\w+?)${GO_SERVICE_SUFFIX_GROUP}?\\s+struct\\b`,
  'gm',
);

/**
 * HTTP route registrations. Covers `net/http`'s `http.HandleFunc`
 * and the gin / chi / echo convention of naming the engine `router`
 * and chaining `.GET(...)` / `.POST(...)` / etc. Captures the path
 * literal as the pattern name.
 */
const GO_ROUTE_RE = new RegExp(
  `(?:http\\.HandleFunc|router\\.(?:GET|POST|PUT|DELETE|PATCH))\\(['"]([^'"]+)['"]`,
  'g',
);

/**
 * GORM model structs. Requires the struct body to embed `gorm.Model`
 * directly (not transitively through a project-local base model) —
 * that's a deliberate phase 1 simplification. `[^}]*` is greedy and
 * matches anything up to the closing `}`, then backtracks to find
 * `gorm.Model\b`.
 */
const GO_ORM_MODEL_RE = new RegExp(
  '^type\\s+(\\w+)\\s+struct\\s*\\{[^}]*gorm\\.Model\\b',
  'gm',
);

export interface GoPatterns {
  service: PatternMatch[];
  route: PatternMatch[];
  ormModel: PatternMatch[];
}

/**
 * Extract patterns from a single Go source file.
 *
 * @param filePath - absolute path; used as the `files` entry on each
 *                   returned PatternMatch.
 * @param source   - file contents (read by the caller).
 */
export function extractGoPatterns(
  filePath: string,
  source: string,
): GoPatterns {
  const service: PatternMatch[] = [];
  const route: PatternMatch[] = [];
  const ormModel: PatternMatch[] = [];

  // Dedupe by name within a single file so the same pattern
  // appearing twice (e.g. two `http.HandleFunc("/foo", …)` calls)
  // yields one PatternMatch instead of two identical entries that
  // would then push the same filePath onto the inventory twice.
  const seenService = new Set<string>();
  for (const m of source.matchAll(GO_SERVICE_RE)) {
    const name = m[1]!;
    if (seenService.has(name)) continue;
    seenService.add(name);
    service.push({ name, files: [filePath], imports: [] });
  }

  const seenRoute = new Set<string>();
  for (const m of source.matchAll(GO_ROUTE_RE)) {
    const name = m[1]!;
    if (seenRoute.has(name)) continue;
    seenRoute.add(name);
    route.push({ name, files: [filePath], imports: [] });
  }

  const seenOrm = new Set<string>();
  for (const m of source.matchAll(GO_ORM_MODEL_RE)) {
    const name = m[1]!;
    if (seenOrm.has(name)) continue;
    seenOrm.add(name);
    ormModel.push({ name, files: [filePath], imports: [] });
  }

  return { service, route, ormModel };
}