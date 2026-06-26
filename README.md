# usebrick/platform

**Monorepo for the [usebrick.dev](https://usebrick.dev) platform.**

`slopbrick` (the CLI) and `@usebrick/core` (the Repository Memory spec) live here as workspace packages. Future tools — `stackpick`, `gir`, `mcp`, `cli` — will join the same monorepo.

## Why one monorepo

The platform's tools all share:

- **Repository Memory Platform schema** (`.slopbrick/inventory.json`, `constitution.json`, `memory.md`)
- **AST models** (React, Vue, Svelte, Astro, HTML visitors)
- **MCP contracts** (slop_suggest, slop_suggest_with_memory, slop_check_constitution, slop_find_similar)
- **Test fixtures + corpus**
- **Calibration pipeline** (recall/FP ratio per rule)
- **Release cadence** (slopbrick releases today; future tools will share the version stream)

Splitting these into separate repos would create constant synchronization work. The monorepo keeps them in lock-step.

## Packages

| Package | Status | Purpose |
|---------|--------|---------|
| `@usebrick/core` | `private: true` — workspace-only | Types + JSON Schemas + readers/writers for the Repository Memory Platform. **Not published to npm** until the schema stabilizes (need at least 2 consumers writing/reading the schemas in production). |
| `@usebrick/slopbrick` | `published` | The CLI. `npx slopbrick scan`, `npx slopbrick drift`, `npx slopbrick security`, etc. 13 scores, 60+ rules, MCP server. |
| `@usebrick/stackpick` | (future) | Detects framework from `.slopbrick/inventory.json` + package.json. |
| `@usebrick/gir` | (future) | **G**ive-**I**mplementation-**R**eference — finds existing similar implementations before an agent writes a new one. |
| `@usebrick/mcp` | (future) | Standalone MCP server exposing all the slopbrick tools. |
| `@usebrick/cli` | (future) | Umbrella CLI: `usebrick scan`, `usebrick memory`, `usebrick mcp`, `usebrick stackpick`, `usebrick doctor`, `usebrick update`. |

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
│   │   │   ├── inventory.schema.json
│   │   │   ├── constitution.schema.json
│   │   │   ├── memory.schema.json
│   │   │   ├── health.schema.json
│   │   │   └── index.json
│   │   └── tests/
│   └── slopbrick/
│       ├── src/
│       ├── tests/
│       ├── bin/
│       ├── examples/
│       └── distribute/             (AUR PKGBUILD, Homebrew formula, etc.)
├── .github/workflows/
│   ├── ci.yml                      typecheck + test on every PR/push to main
│   └── publish.yml                 tag → build → npm publish @usebrick/slopbrick
├── docs/
├── examples/
├── package.json                    root (private workspace hub)
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

## Repository Memory Platform — the moat

The four JSON Schemas under `packages/core/schemas/` are the platform's canonical data model:

- **inventory.schema.json** — detected patterns + component fingerprints
- **constitution.schema.json** — declared project allow-list + deny-list
- **memory.schema.json** — agent-readable markdown summary
- **health.schema.json** — per-scan health snapshot

Every tool in the platform reads and writes data matching these schemas. Other agents (Claude Code, Cursor, Copilot) consume `memory.md` via MCP. If these schemas become a de-facto standard for "repository memory," every tool in the ecosystem speaks the same language.

## Release cadence

- **`@usebrick/slopbrick`** — published on npm. Bumps the patch version for fixes, minor for new scores/rules, major for breaking scan output changes.
- **`@usebrick/core`** — private for now. When published, every slopbrick release that depends on a schema bump will release a matching `@usebrick/core` major version bump.

## User-action checklist

For the maintainer (you):

1. **Create the GitHub repo** at https://github.com/organizations/usebrick/repositories/new → name `platform`, set description, **do not** initialize with README (we have one).
2. **Push from this local repo:**
   ```bash
   cd /Users/cheng/platform
   git init
   git add .
   git commit -m "feat: initial monorepo — usebrick/platform v0.11.1"
   git branch -M main
   git remote add origin https://github.com/usebrick/platform.git
   git push -u origin main
   ```
3. **Configure the publish environment** at https://github.com/usebrick/platform/settings/environments/new:
   - Name: `publish`
   - Deployment branches: `refs/tags/v*` only
   - Required reviewers: `@Dystx`
4. **Configure npm Trusted Publishers** at https://www.npmjs.com/package/@usebrick/slopbrick/access:
   - Add GitHub Actions publisher: `usebrick/platform` / `publish.yml` / environment `publish`
5. **Deprecate the old npm packages** (zero users per your confirmation, but the packages still exist):
   ```bash
   npm deprecate slop-audit "Renamed to @usebrick/slopbrick — see https://github.com/usebrick/platform"
   npm deprecate slopbrick "Renamed to @usebrick/slopbrick — see https://github.com/usebrick/platform"
   ```
6. **Tag v0.11.1 + push** to trigger the new publish.yml:
   ```bash
   git tag v0.11.1
   git push --tags
   ```
   The workflow runs in the `publish` environment, waits for your approval, then publishes `@usebrick/slopbrick@0.11.1` to npm via OIDC.
7. **Redirect the old `usebrick/slopbrick` repo**: replace its README with a one-line notice pointing here.

## License

[MIT](./LICENSE)
