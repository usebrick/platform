# usebrick/platform

> **AI agents forget your architecture. Every session starts fresh.**
> usebrick.dev fixes that by making your repository's structure explicit
> and machine-readable — so Claude Code, Cursor, Copilot, Aider follow
> your patterns instead of reinventing them.

**Monorepo for the [usebrick.dev](https://usebrick.dev) platform.** Home of the `slopbrick` CLI, the `@usebrick/core` Repository Structure spec, the pure-function `@usebrick/engine`, and the marketing site.

---

## What is usebrick?

usebrick is a four-product platform for the **Repository Structure Platform** (RSP) — a versioned, cross-language data model for the structure of a codebase. The four products revolve around one noun: **structure**.

| Product | Purpose | Status |
|---------|---------|--------|
| **PickBrick** | Defines the **intended** structure (the Constitution) | planned |
| **SlopBrick** | Discovers the **actual** structure (the scanner) | **latest published** as `slopbrick@0.43.0` on npm (103 rules; its 576,750-file v10.1 result is historical); v0.44.0 trust-restoration work is unreleased and v10.3 admission is open |
| **MendBrick** | Repairs the structure (the migrator) | planned |
| **LockBrick** | Protects the structure (the enforcer, in CI) | planned |

The user reads the model as:

```
Repository
  ├── Constitution (desired structure)
  ├── Inventory (observed structure)
  ├── Structure (agent-readable summary)
  ├── Health (quality of structure)
  └── History (how structure evolved)
```

usebrick is **not** an LLM-memory product. It does not embed code, does not chat, does not RAG. It is **deterministic analysis** — every output is reproducible from the input source files plus a calibration dataset.

One-sentence positioning: **"BRICK continuously discovers and maintains your repository's structure."**

---

## Quick start (for users)

```bash
# 1. Install
npm install -D slopbrick

# 2. Initialize (8 quick questions about your stack)
npx slopbrick init

# 3. Scan (writes .slopbrick/ artifacts)
npx slopbrick scan

# 4. Optional: start the MCP server so Claude Code / Cursor can
# consume the artifacts
npx slopbrick mcp
```

That's it. The next time an AI agent writes a file in your repo, it reads
`.slopbrick/structure.md` instead of re-parsing the AST. The cached artifact
avoids repeated parsing; measure the improvement on your own repository rather
than relying on a fixed speed-up claim.

### Runtime support

The workspace and published CLI support the maintained Node.js LTS lines
**22 and 24** (`^22.0.0 || ^24.0.0`). CI and the packed-package consumer
matrix exercise both lines. Node 20 and odd-numbered release lines are not
supported; run `nvm install 22` (or use Node 24) before installing.

**This isn't CLAUDE.md.** CLAUDE.md is a static file the agent reads once per session. `.slopbrick/structure.md` is a generated artifact that updates on every scan — your repository, encoded for the next agent.

For a CI gate, see [`packages/slopbrick/EXAMPLES.md`](./packages/slopbrick/EXAMPLES.md#strict-ci-gate).

---

## The 4 .slopbrick/ artifacts

Every `slopbrick scan` writes four atomic artifacts (and one cache file at the project root). Together they form the **Repository Structure** — a structured summary that downstream consumers (MCP tools, CI gates, dashboards, future usebrick.dev tools) read **instead of re-parsing the AST**.

```
<project-root>/
├── .slopbrick/
│   ├── inventory.json     # detected patterns + component fingerprints
│   ├── constitution.json  # declared stack (mirrors slopbrick.config.mjs)
│   ├── health.json        # 4-score model + per-severity issue counts
│   └── structure.md       # agent-readable markdown summary
└── .slopbrick-cache.json  # per-file mtime + hash (NOT in public schema)
```

| Artifact | Purpose | Schema |
|----------|---------|--------|
| `inventory.json` | Detected patterns + component fingerprints | [`v1/inventory.schema.json`](./packages/core/schemas/v1/inventory.schema.json) |
| `constitution.json` | Declared project allow-list + deny-list | [`v1/constitution.schema.json`](./packages/core/schemas/v1/constitution.schema.json) |
| `structure.md` | Agent-readable markdown summary | [`v1/structure.schema.json`](./packages/core/schemas/v1/structure.schema.json) |
| `health.json` | Per-scan 4-score snapshot | [`v1/health.schema.json`](./packages/core/schemas/v1/health.schema.json) |

**This is the moat.** If these schemas become a de-facto standard for "repository structure," every tool in the ecosystem speaks the same language. The versioned path (`schemas/v1/`, future `schemas/v2/`) is the contract version. Older tools keep reading `v1/` after `v2/` ships. Backward-compatible changes never bump the schema version — only add new optional fields with defaults.

---

## The 4-score model (v0.21.0+)

The single `slopIndex` is replaced by **4 independent scores** (all 0-100):

| Score | What it measures | Direction | CI gate? |
|-------|------------------|-----------|----------|
| **`aiSlopScore`** | AI-slop signatures (16 `ai/*` rules). Raw amount of slop detected. | **lower = cleaner** (0=clean, 100=saturated) | **Yes** (`≤ meanSlop: 30` passes) |
| **`engineeringHygiene`** | Inverted average burden across 6 category scores: arch, logic, layout, visual, component, test | higher = better | No (informational) |
| **`security`** | Security-finding posture: `100 / (1 + findingCount / 5)` | higher = better | No (informational) |
| **`repositoryHealth`** (composite) | Weighted: `0.4 × (100 − aiSlopScore) + 0.3 × eng + 0.2 × sec + 0.1 × test` (inverts `aiSlopScore` internally) | higher = better | No (informational) |

**v0.21.0 score-direction flip:** in v0.15.0–v0.20.1, `aiSlopScore` was
the inverted "cleanliness" reading (100 = no slop). That triggered the
natural-reading confusion: "AI Slop Score: 100" reads as "100% slop".
v0.21.0 flips the field to the **raw amount** (lower = cleaner), matching
the natural reading of the name. The composite `repositoryHealth`
inverts internally so the dashboard headline stays "higher = better".
See [`packages/slopbrick/CHANGELOG.md`](./packages/slopbrick/CHANGELOG.md)
for the full migration checklist.

**Why 4 scores, not 1:** The legacy `slopIndex` conflated AI-specific findings with engineering hygiene. Two repos could both score 70/100 for completely different reasons — one had AI drift, the other had pattern fragmentation. The 4-score model lets users see the actual problem.

The legacy `slopIndex` field is kept as optional on `ProjectReport` for backward compat with existing test fixtures and historical telemetry; the v0.14-compat removal is tracked separately.

---

## v0.15.0 — what's new

v0.15.0 is a **hard-break release** that ships the full v0.15.0 plan:

- **Rebrand**: "Repository Memory Platform" → **"Repository Structure Platform"**. The on-disk artifact `.slopbrick/memory.md` is now `.slopbrick/structure.md`. Types renamed: `MemoryFile` → `StructureFile`, `loadMemory` → `loadStructure`, etc.
- **Engine extraction**: `packages/engine/` contains host/editor-safe parsing/
  scoring APIs at `@usebrick/engine/pure` plus explicit Node compatibility
  adapters at the root entry point. The pure subpath prohibits filesystem
  discovery, `console.log`, and process control; it is not a browser
  portability guarantee.
- **Multi-score model**: The single `slopIndex` is replaced by 4 independent scores: `aiSlopScore` / `engineeringHygiene` / `security` / `repositoryHealth` (composite). (Originally `aiQuality` in v0.15.0; renamed in v0.21.0 when the field was flipped to the natural-reading "raw amount of slop" direction.)
- **Engine/UI taxonomy seam**: The engine's 6 verdict taxonomy (USEFUL/OK/NOISY/INVERTED/HYGIENE/DORMANT) is decoupled from the user-facing 3-bucket taxonomy (AI Findings / Engineering Hygiene / Suppressed) via `bucketForVerdict()`.
- **Schema codegen**: JSON Schemas are now the single source of truth; TypeScript types are codegen'd from them. CI fails if schemas and types drift.
- **Website hardening**: Skip-to-content link, keyboard-accessible tool cards, axe-core a11y in CI, native reduced-motion handling, and deterministic static build facts.
- **slopbrick CLI slimmed** from 1469 to 451 lines (69% reduction) by extracting report generation into `packages/engine/`.

See [`packages/slopbrick/CHANGELOG.md`](./packages/slopbrick/CHANGELOG.md) for full release notes.

---

## Packages

| Package | Status | Purpose |
|---------|--------|---------|
| `slopbrick` | **published** | The flagship CLI. `npx slopbrick scan`, `npx slopbrick drift`, `npx slopbrick security`, `npx slopbrick calibration`. Published v0.43.0 exposes the 4-score model, 103 rules, MCP server, and calibrate subcommand; its 576,750-file v10.1 result is historical and does not close current v10.3 admission. |
| `@usebrick/core` | `private: true` — workspace-only | Types + JSON Schemas + readers/writers + verdict taxonomy for the Repository Structure Platform. **Not published to npm** until the schema stabilizes (need at least 2 consumers writing/reading the schemas in production). |
| `@usebrick/engine` | `private: true` — workspace-only (new in v0.15.0) | Pure scanning APIs at `@usebrick/engine/pure`; the root retains explicit Node adapters for CLI compatibility. |
| `@usebrick/website` | `private: true` — workspace-only | The [usebrick.dev](https://usebrick.dev) marketing site. Astro + native browser animation APIs, CSS brick surface, click-to-break tool cards, and axe-core a11y in CI. Built to `dist/` for Cloudflare Pages; live deployment still requires owner/SHA verification. |
| `@usebrick/mcp` | (future) | Standalone MCP server exposing all the slopbrick tools as a library. |
| `@usebrick/sdk` | (future) | Programmatic SDK for embedding usebrick.dev tools in other pipelines. |

### Why unscoped `slopbrick` (not `@usebrick/slopbrick`)

Per a design-review call: **libraries use the `@usebrick/` scope; the flagship CLI stays unscoped**.

- `npx slopbrick` is shorter and more memorable than `npx @usebrick/slopbrick`
- The CLI is what most users touch; the library boundary is a developer concern
- Future CLIs (`usebrick` umbrella for `usebrick scan` / `usebrick structure` / `usebrick doctor`) can grow under a separate brand without crowding the `@usebrick/` scope
- Scope is for libraries that get `import`ed. The CLI gets `npx`'d.

So:

```
slopbrick              ← the CLI (this monorepo, published)
@usebrick/core         ← the schema + readers (workspace-only for now)
@usebrick/engine/pure  ← pure parsing/scoring API (workspace-only, new in v0.15.0)
@usebrick/mcp          ← future: standalone MCP server (library)
@usebrick/sdk          ← future: programmatic SDK (library)
```

---

## Data flow

```
                    ┌──────────────────────┐
                    │  slopbrick scan      │  ← CLI (slopbrick/)
                    └──────────┬───────────┘
                               │ calls
                               ▼
                  ┌────────────────────────────┐
                  │   @usebrick/engine/pure    │  ← pure functions (packages/engine/)
                  │   parser, scoring,         │
                  │   lr-combiner, visitors    │
                  └────────────┬───────────────┘
                               │ produces
                               ▼
                  ┌────────────────────────────┐
                  │   .slopbrick/              │  ← on-disk artifacts
                  │   ├─ inventory.json        │
                  │   ├─ constitution.json     │
                  │   ├─ health.json           │  (4 scores)
                  │   └─ structure.md          │  (agent-readable)
                  └────────────┬───────────────┘
                               │ validated against
                               ▼
                  ┌────────────────────────────┐
                  │   @usebrick/core           │  ← JSON Schemas (the API contract)
                  │   (schemas/v1/*.json)      │
                  └────────────┬───────────────┘
                               │ consumed by
                               ▼
                  ┌────────────────────────────┐
                  │   MCP server               │  ← exposed to AI agents
                  │   (slopbrick/mcp/)         │  via `npx slopbrick mcp`
                  └────────────┬───────────────┘
                               │ queried by
                               ▼
                  ┌────────────────────────────┐
                  │   Claude Code / Cursor /   │  ← any MCP-compatible agent
                  │   Copilot / Continue       │
                  └────────────────────────────┘
```

The website is separate (static marketing, no data ingestion).

---

## Why one monorepo

The platform's tools all share:

- **Repository Structure Platform schema** (`.slopbrick/inventory.json`, `constitution.json`, `structure.md`, `health.json`)
- **AST models** (React, Vue, Svelte, Astro, HTML visitors)
- **MCP contracts** (slop_suggest, slop_suggest_with_structure, slop_check_constitution, slop_find_similar)
- **Test fixtures + corpus**
- **Calibration pipeline** (recall/FP ratio per rule)
- **Release cadence** (slopbrick releases today; future tools will share the version stream)

Splitting these into separate repos would create constant synchronization work. The monorepo keeps them in lock-step.

---

## Quick start (for contributors)

```bash
pnpm install
pnpm -r build         # build @usebrick/core → @usebrick/engine → slopbrick → website
pnpm -r typecheck
pnpm -r test
```

## Layout

```
platform/
├── packages/
│   ├── core/                       @usebrick/core — schemas + types (private)
│   │   ├── src/                    types + loaders/savers + verdicts
│   │   ├── schemas/                canonical JSON Schemas (the platform's API contract)
│   │   │   └── v1/
│   │   │       ├── inventory.schema.json
│   │   │       ├── constitution.schema.json
│   │   │       ├── structure.schema.json
│   │   │       ├── health.schema.json
│   │   │       └── index.json
│   │   ├── scripts/                codegen-types.ts (JSON Schema → TypeScript)
│   │   └── tests/
│   ├── engine/                     @usebrick/engine — pure scanning logic (private, new in v0.15.0)
│   │   ├── src/                    parser, scoring, lr-combiner, structure persistence
│   │   └── tests/
│   ├── slopbrick/                  slopbrick CLI (published as `slopbrick`)
│   │   ├── src/
│   │   │   ├── cli/                19 command modules + program.ts
│   │   │   ├── rules/              published 103-rule catalog (v10-calibrated)
│   │   │   ├── mcp/                MCP server
│   │   │   ├── report/             pretty, JSON, HTML, markdown reporters
│   │   │   ├── engine/             CLI-side I/O adapters
│   │   │   └── types.ts
│   │   ├── tests/
│   │   ├── bin/
│   │   ├── examples/
│   │   └── distribute/             (AUR PKGBUILD, Homebrew formula, etc.)
│   └── website/                    usebrick.dev marketing site (Astro + native browser APIs)
│       ├── src/
│       │   ├── components/         Nav, Hero, Tools, Compare, Calibration, CTA, Footer
│       │   ├── layouts/            Base.astro (global scripts + native browser APIs)
│       │   ├── pages/              index.astro (single-page site)
│       │   ├── scripts/            native reveals, counters, structure demo, live terminal, copy feedback
│       │   ├── styles/             global.css (tokens), theme.css, components.css
│       │   └── data/               version.json + product-facts.json (generated from sibling packages at build time)
│       ├── public/                 favicon, logo-mark, brick-pattern SVGs
│       ├── scripts/                prebuild.ts (version substitution)
│       ├── astro.config.mjs
│       └── .github/workflows/      (Cloudflare Pages deployment target via /github/workflows/deploy-website.yml)
├── .github/workflows/
│   ├── ci.yml                      typecheck + test on every PR/push to main
│   ├── publish.yml                 release:published → build → npm publish slopbrick (two human gates)
│   └── (per-package deploy workflows under each package)
├── docs/
│   ├── ARCHITECTURE.md             full architectural reference
│   ├── CHANGELOG.md                full release notes (per package, under packages/*/CHANGELOG.md)
│   ├── future-extractions.md       packages/structure + packages/contracts criteria
│   └── old-repo-redirect.md        (content for usebrick/slopbrick README redirect)
├── examples/
├── package.json                    root (private workspace hub)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── AGENTS.md
└── README.md
```

---

## Future package extractions

Two extractions are tracked but **not done yet**:

- `packages/structure/` (or `packages/repository-structure/`) — when the structure module outgrows the schema. See [`docs/future-extractions.md`](./docs/future-extractions.md).
- `packages/contracts/` — when a non-TypeScript consumer needs the schemas (Python stackpick analyzer, Go CI binary). At that point, `contracts/` becomes the language-agnostic spec, `core/` becomes the TypeScript implementation.

---

## Release cadence

- **`slopbrick`** — published on npm. Bumps the patch version for fixes, minor for new scores/rules, major for breaking scan output changes.
- **`@usebrick/core`** — private for now. When published, every slopbrick release that depends on a schema bump will release a matching `@usebrick/core` major version bump.
- **`@usebrick/engine`** — workspace-only. Tracks slopbrick version in lock-step.
- **`@usebrick/website`** — workspace-only. Prepared for Cloudflare Pages; a live deployment claim requires verified owner/SHA evidence.

## License

[MIT](./LICENSE)
