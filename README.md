# usebrick/platform

**Monorepo for the [usebrick.dev](https://usebrick.dev) platform.**

`slopbrick` (the CLI) and `@usebrick/core` (the Repository Structure spec) live here as workspace packages. Future tools — `stackpick`, `gir`, `mcp`, `cli` — will join the same monorepo.

## Why one monorepo

The platform's tools all share:

- **Repository Structure Platform schema** (`.slopbrick/inventory.json`, `constitution.json`, `structure.md`)
- **AST models** (React, Vue, Svelte, Astro, HTML visitors)
- **MCP contracts** (slop_suggest, slop_suggest_with_memory, slop_check_constitution, slop_find_similar)
- **Test fixtures + corpus**
- **Calibration pipeline** (recall/FP ratio per rule)
- **Release cadence** (slopbrick releases today; future tools will share the version stream)

Splitting these into separate repos would create constant synchronization work. The monorepo keeps them in lock-step.

## Packages

| Package | Status | Purpose |
|---------|--------|---------|
| `slopbrick` | `published` | The flagship CLI. `npx slopbrick scan`, `npx slopbrick drift`, `npx slopbrick security`. 13 scores, 60+ rules, MCP server, migrate subcommand. |
| `@usebrick/core` | `private: true` — workspace-only | Types + JSON Schemas + readers/writers for the Repository Structure Platform. **Not published to npm** until the schema stabilizes (need at least 2 consumers writing/reading the schemas in production). |
| `@usebrick/website` | `private: true` — workspace-only | The [usebrick.dev](https://usebrick.dev) marketing site. Astro + Lenis + GSAP, full-bleed WebGL brick shader hero, click-to-break tool cards. Built to `dist/` and deployed via GitHub Pages. |
| `@usebrick/mcp` | (future) | Standalone MCP server exposing all the slopbrick tools as a library. |
| `@usebrick/sdk` | (future) | Programmatic SDK for embedding usebrick.dev tools in other pipelines. |

## Why unscoped `slopbrick` (not `@usebrick/slopbrick`)

Per a design-review call: **libraries use the `@usebrick/` scope; the flagship CLI stays unscoped**. Reasoning:

- `npx slopbrick` is shorter and more memorable than `npx @usebrick/slopbrick`
- The CLI is what most users touch; the library boundary is a developer concern
- Future CLIs (`usebrick` umbrella for `usebrick scan` / `usebrick memory` / `usebrick doctor`) can grow under a separate brand without crowding the `@usebrick/` scope
- Scope is for libraries that get `import`ed. The CLI gets `npx`'d.

So:

```
slopbrick              ← the CLI (this monorepo, published)
@usebrick/core         ← the schema + readers (workspace-only for now)
@usebrick/mcp          ← future: standalone MCP server (library)
@usebrick/sdk          ← future: programmatic SDK (library)
```

## Future package extractions

Two extractions are tracked but **not done yet**:

- `packages/structure/` (or `packages/repository-structure/`) — when the structure module outgrows the schema. See `docs/future-extractions.md`.
- `packages/contracts/` — when a non-TypeScript consumer needs the schemas (Python stackpick analyzer, Go CI binary). At that point, `contracts/` becomes the language-agnostic spec, `core/` becomes the TypeScript implementation.

## Quick start (development)

```bash
pnpm install
pnpm -r build         # build @usebrick/core first (workspace dep), then slopbrick
pnpm -r typecheck
pnpm -r test
```

## Layout

```
platform/
├── packages/
│   ├── core/
│   │   ├── src/                    types + loaders/savers
│   │   ├── schemas/                canonical JSON Schemas (the platform's API contract)
│   │   │   └── v1/
│   │   │       ├── inventory.schema.json
│   │   │       ├── constitution.schema.json
│   │   │       ├── structure.schema.json
│   │   │       ├── health.schema.json
│   │   │       └── index.json
│   │   └── tests/
│   ├── slopbrick/
│   │   ├── src/
│   │   ├── tests/
│   │   ├── bin/
│   │   ├── examples/
│   │   └── distribute/             (AUR PKGBUILD, Homebrew formula, etc.)
│   └── website/                    usebrick.dev marketing site (Astro + Lenis + GSAP)
│       ├── src/
│       │   ├── components/         Nav, Hero, Tools, Compare, Calibration, CTA, Footer
│       │   ├── layouts/            Base.astro (Lenis + GSAP init)
│       │   ├── pages/              index.astro (single-page site)
│       │   ├── scripts/            brick-shader, reveal, counter, break-on-hover, copy-install, lenis
│       │   ├── styles/             global.css (tokens), theme.css, components.css
│       │   └── data/               version.json (sourced from sibling packages at build time)
│       ├── public/                 favicon, logo-mark, brick-pattern SVGs
│       ├── scripts/                prebuild.ts (version substitution)
│       ├── astro.config.mjs
│       └── .github/workflows/      deploy.yml (GitHub Pages)
├── .github/workflows/
│   ├── ci.yml                      typecheck + test on every PR/push to main
│   ├── publish.yml                 release:published → build → npm publish slopbrick (two human gates)
│   └── (per-package deploy workflows under each package)
├── docs/
│   ├── old-repo-redirect.md        (content for usebrick/slopbrick README redirect)
│   └── future-extractions.md       (packages/structure + packages/contracts criteria)
├── examples/
├── package.json                    root (private workspace hub)
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

## Repository Structure Platform — the moat

The four versioned JSON Schemas under `packages/core/schemas/v1/` are the platform's canonical data model:

- **`v1/inventory.schema.json`** — detected patterns + component fingerprints
- **`v1/constitution.schema.json`** — declared project allow-list + deny-list
- **`v1/structure.schema.json`** — agent-readable markdown summary
- **`v1/health.schema.json`** — per-scan health snapshot

Every tool in the platform reads and writes data matching these schemas. Other agents (Claude Code, Cursor, Copilot) consume `structure.md` via MCP. If these schemas become a de-facto standard for "repository structure," every tool in the ecosystem speaks the same language.

The versioned path (`schemas/v1/`, future `schemas/v2/`) is the contract version. Older tools keep reading `v1/` after `v2/` ships. Backward-compatible changes never bump the schema version — only add new optional fields with defaults.

## Release cadence

- **`slopbrick`** — published on npm. Bumps the patch version for fixes, minor for new scores/rules, major for breaking scan output changes.
- **`@usebrick/core`** — private for now. When published, every slopbrick release that depends on a schema bump will release a matching `@usebrick/core` major version bump.

## User-action checklist

For the maintainer (you):

1. **Create the GitHub repo** at https://github.com/organizations/usebrick/repositories/new → name `platform`, set description, **do not** initialize with README (we have one).
2. **Push from this local repo:**
   ```bash
   cd /Users/cheng/platform
   git remote add origin https://github.com/usebrick/platform.git
   git push -u origin main
   ```
3. **Configure the `publish` environment** at https://github.com/usebrick/platform/settings/environments/new:
   - Name: `publish`
   - Required reviewers: `@Dystx`
   - The workflow trigger (`release: published`) is what gates the run; no deployment branch restriction needed
4. **Configure npm Trusted Publishers** at https://www.npmjs.com/package/slopbrick/access:
   - Add GitHub Actions publisher: `usebrick/platform` / `publish.yml` / environment `publish`
5. **Deprecate the old npm packages** (zero users per your confirmation, but the packages still exist):
   ```bash
   npm deprecate slop-audit "Renamed to slopbrick — see https://github.com/usebrick/platform"
   npm deprecate slopbrick "Re-published from usebrick/platform monorepo"
   ```
6. **First monorepo publish — v0.11.1.** Version is already set in `packages/slopbrick/package.json`. Trigger:
   ```bash
   git add . && git commit -m "chore: ready v0.11.1" && git push
   # Wait for CI to pass on main.
   # Then create the GitHub Release in the UI:
   #   https://github.com/usebrick/platform/releases/new
   #   - Tag: v0.11.1
   #   - Title: v0.11.1
   #   - Description: paste the CHANGELOG entry
   #   - Click "Publish release"
   # The workflow triggers → waits for your approval in the `publish`
   # environment → publishes slopbrick@0.11.1 to npm via OIDC.
   # Two human gates per release: Release creation + env approval.
   ```
7. **Verify the install works:**
   ```bash
   mkdir /tmp/slopbrick-verify && cd /tmp/slopbrick-verify
   npm init -y && npm install --save-dev slopbrick
   npx slopbrick --version          # should print 0.11.1
   ```
8. **Update the old `usebrick/slopbrick` repo** (defer archive to **June 2027** — at least 6 months):
   - Copy `docs/old-repo-redirect.md` from this repo → paste as the README of `usebrick/slopbrick`
   - **Do NOT** archive/delete yet. GitHub links have a long tail.

## Local cleanup (deferred — do NOT delete yet)

Keep `/Users/cheng/slop-audit/` and `/Users/cheng/core/` around until you've successfully:

1. ✅ Published `slopbrick@0.11.1` from the monorepo via the new workflow
2. ✅ Tagged the GitHub Release + verified it's visible in the UI
3. ✅ Cloned the monorepo elsewhere (e.g. `git clone https://github.com/usebrick/platform ~/platform-verify`) and verified it builds + 1521 + 27 tests pass
4. ✅ Verified CI runs on the new repo (push to a feature branch, see checks pass)
5. ✅ Verified the **next** release (v0.11.2 or v0.12.0) publishes correctly through the new workflow

Once all five are green, you can safely delete the legacy local repos. Storage is cheap; don't rush it.

## License

[MIT](./LICENSE)
