# AGENTS.md

> How AI agents should work with `usebrick/platform`.

Apply silently. Do not restate unless the user asks for project rules.

---

## What this monorepo is

The home of every `usebrick.dev` tool:

| Package | Status | Notes |
|---------|--------|-------|
| `packages/core/` | **private** — workspace-only, not on npm | The Repository Structure Platform spec (types + loaders + JSON Schemas). The moat. |
| `packages/engine/` | **private** — workspace-only | The pure scanning engine. 4-score model, Bayesian LR combiner, parser, scoring. No I/O, no `console.log`, no `process.exit`. Reusable from CLI, MCP, and future web IDEs. |
| `packages/slopbrick/` | **published** as `slopbrick` | The CLI. 4 scores, 95 rules in 15 categories, MCP server. The flagship. |
| `packages/website/` | **private** — workspace-only, deployed to Cloudflare Pages | The usebrick.dev marketing site. Astro + Lenis + GSAP, WebGL brick shader hero. |

Future packages (`stackpick`, `gir`, `cli`) join here as they're built. (The MCP server already ships inside `slopbrick`; a standalone `@usebrick/mcp` package is a future extraction.)

## What this monorepo is NOT

- **Not a place for one-off experiments.** Tools land here when they're real, named, versioned, and tested.
- **Not a polyglot monorepo.** All packages are TypeScript + Node 20+. If a tool needs Rust or Python, it lives in its own repo and consumes `@usebrick/core` from npm.
- **Not synchronized with per-package npm releases.** Each package has its own version, but they evolve in lock-step (slopbrick's `package.json` bumps `@usebrick/core` workspace dep version on every schema change).

## The contract — `@usebrick/core` schemas

`packages/core/schemas/` defines the four canonical JSON Schemas:

- `inventory.schema.json` — detected patterns + component fingerprints
- `constitution.schema.json` — declared allow-list + deny-list
- `structure.schema.json` — agent-readable markdown summary
- `health.schema.json` — per-scan health snapshot

**These schemas are the API.** Every tool in the platform reads and writes data matching them. Changing a schema field is a breaking change for every consumer. When you need to add a field:

1. Add it as **optional** with a sensible default in the schema
2. Bump `STRUCTURE_SCHEMA_VERSION` only if the new field is **required**
3. Bump the consuming package's version + emit a CHANGELOG entry

## Conventions for new packages

1. **Pure functions where possible.** Detect + classify without I/O where feasible.
2. **Reuse `@usebrick/core` types.** Don't redefine `InventoryFile`, `ConstitutionFile`, etc. — import them from the workspace dep.
3. **Add tests in the package's `tests/` directory.** Run via `pnpm --filter <package> test`.
4. **Test against the JSON Schemas**, not just TypeScript types. Schemas are the cross-language contract.
5. **Update `packages/core/schemas/index.json`** when adding a new schema.
6. **Update `README.md`** at the repo root + in your package's README.

## Conventions for new rules / detection logic in slopbrick

1. **Reuse `facts.v2`.** Most new rules should be 5–20 line pure functions over `facts.v2`.
2. **Add `RULE_HINTS` entry in `src/snippet/data.ts`** (the engine auto-validates hints exist).
3. **Calibrate against the corpus.** New rules must have `recall/FP ratio ≥ 1.5×` against `tests/fixtures/frameworks/`. Without calibration, the rule is `defaultOff: true` until proven.
4. **Add tests in `tests/rules/<rule-name>.test.ts`.**

## Quality gates

Run from repo root before committing:

```bash
pnpm -r typecheck    # every package
pnpm -r test         # every package
pnpm -r build        # builds core first (workspace dep), then slopbrick
```

CI runs the same commands on every PR + push to main. Publishing the `slopbrick` package to npm is triggered by `release: types: [published]` (when you cut a GitHub release), not by tag pushes. The `publish.yml` workflow has two human gates: the `publish` environment approval + the release itself.

## Conventions for changes touching `core/`

`packages/core/` is the shared spec. Touch it sparingly:

1. **Bump `STRUCTURE_SCHEMA_VERSION` only on a breaking schema change** (renaming a field, removing a field, changing a required→optional in the wrong direction).
2. **Always add new fields as optional with defaults.** Never add a required field to an existing schema.
3. **Update the validator** in `packages/core/src/structure-types.ts` to match.
4. **Update the schema file** in `packages/core/schemas/`.
5. **Add a test in `packages/core/tests/structure-types.test.ts`** for the new validator behavior.
6. **Update the consuming package(s)** to write/read the new field.
7. **CHANGELOG entry** in the consuming package(s).

## License

[MIT](./LICENSE)
