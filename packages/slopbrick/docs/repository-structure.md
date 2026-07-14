# Repository Structure — the `.slopbrick/` artifact contract

Every completed or partial `slopbrick scan` writes four artifacts to
`.slopbrick/` (and one sibling to the project root). An empty or
not-applicable scan returns a score-free report envelope and does not create
a score-bearing health artifact. Together the persisted artifacts form the
**Repository Structure** — a structured summary of the codebase that downstream
consumers (MCP tools, CI gates, dashboards, future usebrick.dev tools)
read **instead of re-parsing the AST**.

> **v0.15.0+:** The on-disk artifact `.slopbrick/memory.md` was renamed to
> `.slopbrick/structure.md` (the historical schema bump was from `'2'` to
> `'3'`). The current `STRUCTURE_SCHEMA_VERSION` is `'5'`.
> Types: `MemoryFile` → `StructureFile`, `MemoryPattern` → `StructurePattern`.
> Functions: `loadMemory` / `saveMemory` → `loadStructure` / `saveStructure`.

This is the contract. Every artifact is JSON, every artifact has a
schema in `packages/core/schemas/v1/`, every loader is graceful
(returns `null` on missing / malformed / version-mismatched files).

## On-disk layout

```
<project-root>/
├── .slopbrick/
│   ├── inventory.json     # detected patterns + component fingerprints
│   ├── constitution.json  # declared constitution (mirrors config.constitution)
│   ├── health.json        # 4-score model + per-severity issue counts
│   └── structure.md       # agent-readable summary (markdown, was memory.md)
└── .slopbrick-cache.json  # per-file mtime + hash (NOT in public schema)
```

`.slopbrick-cache.json` lives at the project root, not under
`.slopbrick/`, because it's a per-file refresh cache that's safe to
delete without losing project structure. The other four files are the
**public** surface.

## `inventory.json`

**Schema:** [`inventory.schema.json`](../../core/schemas/v1/inventory.schema.json) (v0.15.0)

```ts
interface InventoryFile {
  version: '5';
  generatedAt: string;        // ISO 8601
  workspace: string;          // absolute path
  scannedFiles: number;
  scanDurationMs: number;
  patterns: StructurePattern[];  // sorted by fileCount desc
  components: ComponentFingerprint[];  // sorted by name
}
```

A `StructurePattern` records *what the codebase uses* (e.g.
`"zustand"` for state management, `"react-hook-form"` for forms). The
list comes from `buildPatternInventory()` in `src/mcp/patterns.ts` and
groups imports by category.

A `ComponentFingerprint` is a 16-char sha256 prefix over the
component's canonical name + sorted hooks + sorted props. Two
components with the same fingerprint dedupe to one entry with both
files listed.

## `constitution.json`

**Schema:** [`constitution.schema.json`](../../core/schemas/v1/constitution.schema.json)

```ts
interface ConstitutionFile {
  version: '5';
  generatedAt: string;
  workspace: string;
  declared: Partial<Record<MemoryCategory, string>>;
  forbidden: string[];            // bare specifiers (e.g. "redux")
  forbiddenPrefixes: string[];    // scope prefixes (e.g. "@shadcn/")
}
```

This is the **declared** mirror of the user's `slopbrick.config.mjs`.
It's a separate file (not just embedded in the config) so external
tools can read it without parsing TS/JS.

## `health.json`

**Schema:** [`health.schema.json`](../../core/schemas/v1/health.schema.json) (new in v0.14.5d)

```ts
// Current schema version '5'
interface HealthFile {
  version: '5';
  generatedAt: string;
  workspace: string;
  // Canonical 4-score model — aiSlopScore is lower = cleaner;
  // engineeringHygiene, security, and repositoryHealth are higher = better.
  aiSlopScore: number;
  engineeringHygiene: number;
  security: number;
  repositoryHealth: number;
  issueCounts: { high: number; medium: number; low: number };
  // v0.15.0+ kept these optional for backward compat with v0.14
  // dashboards. Will be removed in v0.16.0.
  slopIndex?: number;                      // 0-100, lower is better (legacy)
  categoryScores?: Record<string, number>; // per-category (legacy)
  constitutionDrift?: number;              // # of constitution violations
  topOffenseIds?: string[];                // top 3 most-firing rule IDs
  scanDurationMs?: number;
}
```

The headline artifact for **dashboards, CI status checks, and the
website's project page**. Compare to `inventory.json` (what exists)
and `constitution.json` (what should exist) — `health.json` is **how
good the current state is**.

Built by `buildHealthFromReport(report, workspace, options)` in
`@usebrick/engine/src/structure.ts` — a pure function over the `ProjectReport`.

## `structure.md` (was `memory.md` in v0.14.5)

**Renderer:** [`renderStructureMarkdown()`](../src/engine/structure-md.ts) (pure function, was `renderMemoryMarkdown()` in v0.14.5)

A markdown summary that AI agents read **directly** to ground their
decisions in the codebase's actual architecture. Used by MCP
`slop_suggest_with_structure` for a 100–1000× latency win over a
fresh re-scan.

Stable section structure — downstream tools can pattern-match on the
headings without parsing the body:

```markdown
# slopbrick structure
Generated: 2026-06-27T18:00:00Z
Workspace: /path/to/repo
Scanned files: 226
Scan duration: 4m 12s

## Detected patterns (canonical, use these)
### State management
- **zustand** (12 files, 1 import)
...

## Canonical components
- **Button** (defined in 8 files; props: variant, size; hooks: useState)
...

## Declared constitution
- **State management:** zustand

## DO NOT CREATE
- redux (forbidden)
- @mui/ (any package under this scope)

## Top issues (most impactful)
_Run `slopbrick scan` to populate cross-file drift findings._
```

## How artifacts are written

`scan.ts` writes the project-memory artifacts **atomically** at the end of
every successful scan (see `src/cli/scan.ts` ~line 1035). Score-bearing
`health.json` is written only for completed or partial scans; an empty or
not-applicable scan uses the score-free report envelope. Each writer
goes through `writeJsonAtomic()` (write to `.tmp` + `renameSync`),
which is atomic on POSIX — a crash mid-write leaves either the old or
the new version, never a partial mix.

The order is:
1. `inventory.json` — `buildInventoryFromScan` + `saveInventory`
2. `constitution.json` — `buildConstitutionFromConfig` + `saveConstitution`
3. `structure.md` — `renderStructureMarkdown` + structure writer
4. `health.json` — `buildHealthFromReport` + `saveHealth` (score-bearing scans)

The project-memory writers share a single `try` block; health persistence is
skipped for not-applicable empty scans because there are no headline scores.

## How artifacts are read

Every consumer goes through the loaders in `@usebrick/core`:

```ts
import { loadInventory, loadConstitution, loadHealth } from '@usebrick/core';
import { readMemoryMarkdown } from 'slopbrick/internals';

const inv = loadInventory(cwd);        // null on missing/malformed
const con = loadConstitution(cwd);     // null on missing/malformed
const health = loadHealth(cwd);        // null on missing/malformed
const md = await readStructureMarkdown(cwd);  // null on missing/malformed
```

The loaders all return `null` on:
- file missing
- JSON parse error
- schema version mismatch (different `STRUCTURE_SCHEMA_VERSION`)

This is the **graceful degradation** contract — readers fall back to
re-scanning instead of crashing.

## The `slopbrick structure` subcommand (was `slopbrick memory` in v0.14.5)

v0.15.0 renames the subcommand to `slopbrick structure` to match the
artifact name:

```bash
slopbrick structure             # print .slopbrick/structure.md to stdout
slopbrick structure --regenerate   # re-render from inventory+constitution (no scan)
```

`--regenerate` is the workflow for "I just changed my
`slopbrick.config.mjs` and want a fresh structure.md without paying for
another full AST scan." It runs the pure renderer over the existing
inventory + constitution, which is sub-second.

## The `slopbrick doctor` check

`slopbrick doctor` now verifies the four artifacts and warns if any
are missing. This is the user-facing health check for the artifact
pipeline itself — if structure.md is stale or missing, the warning
points the user at `slopbrick scan` to refresh.

## Versioning

The artifacts are versioned via the top-level `version: '5'` field
(`STRUCTURE_SCHEMA_VERSION` in `@usebrick/core`, was `'2'` in v0.14.5).
Adding an optional field is non-breaking. Renaming a required field,
or changing the on-disk directory from `.slopbrick/` to something
else, requires a version bump + a `slopbrick migrate` path.

Until `@usebrick/core` ships as a public npm package, the schema is
**internal** to the monorepo. The contract is what the schemas
describe, not the TypeScript types — types may have a richer shape
than the JSON contract to keep internal code ergonomic. The
`isInventoryFile()` / `isConstitutionFile()` / `isHealthFile()`
validators are the canonical type guards.

## Future: cross-tool consumers

The schemas are designed to be consumed by:

- **MCP tools** (slop_suggest_with_structure reads `structure.md`)
- **CI status checks** (read score-bearing `health.json`, exit 1 when `aiSlopScore > meanSlop`; empty/not-applicable scans use the score-free report envelope)
- **The website's `/projects` page** (read `health.json` for badges)
- **Future usebrick.dev tools** (stackpick, gir, mendbrick) — all
  read these artifacts instead of re-scanning
- **Custom dashboards** — `health.json` is a single-file view of
  project health that Grafana / Datadog / etc. can ingest directly

When `@usebrick/core` ships publicly, the schemas become the
**language-agnostic platform API** — Python stackpick, Go CI
binaries, and Rust analyzers can all read these without depending
on slopbrick's TypeScript implementation.
