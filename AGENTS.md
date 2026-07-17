# AGENTS.md

> How AI agents should work with `usebrick/platform`.

Apply silently. Do not restate unless the user asks for project rules.

---

## What this monorepo is

The home of every `usebrick.dev` tool:

| Package | Status | Notes |
|---------|--------|-------|
| `packages/core/` | **private** — workspace-only, not on npm | The Repository Structure contract (types + loaders + JSON Schemas), and the deterministic starting point for future MemoryBrick work. |
| `packages/engine/` | **private** — workspace-only | The scanning engine. `@usebrick/engine/pure` owns pure parsing/scoring APIs; the root exposes explicit Node compatibility adapters. The pure boundary has no hidden I/O, `console.log`, or `process.exit`. Reusable from CLI, MCP, and future web IDEs. |
| `packages/slopbrick/` | **published** as `slopbrick` | The free local scanner and main product entry point. Latest verified npm release v0.43.0: its tagged generated catalog and exact tarball README record 103 rules in 22 categories; package metadata saying 24 is known drift. The workspace is an unreleased v0.45.0 candidate with 119 rules in 27 categories; historical v10.1 evidence covers 576,750 analyzed files from 581,550 sampled paths and is not current v10.3 admission evidence. |
| `packages/website/` | **private** — workspace-only, prepared for Cloudflare Pages | The usebrick.dev marketing site. Astro + native browser APIs + CSS brick surface; live deployment still requires owner/SHA verification. |

The roadmap folds Pick into `init` and policy authoring. MemoryBrick is the
repository-owned substrate/compiler, LockBrick is the first paid team layer,
and MendBrick follows only with deterministic, reversible repairs. Do not
create standalone packages for these names before an approved architecture
decision. The MCP server already ships inside `slopbrick`; a standalone
`@usebrick/mcp` package remains a possible future extraction.

## Planning authority

- `ROADMAP.md` owns product direction and product roles.
- `docs/execution/index.json` owns live status, dependencies, and next actions.
- `docs/execution/STATUS.md` owns mutable project facts.
- Active execution plans live under `docs/execution/plans/`.
- Historical plans and evidence may explain past decisions, but do not override
  the current roadmap or execution index.

## What this monorepo is NOT

- **Not a place for one-off experiments.** Tools land here when they're real, named, versioned, and tested.
- **Not a polyglot monorepo.** All packages are TypeScript + Node.js 22 or 24 (`^22.0.0 || ^24.0.0`). If a tool later needs Rust or Python, it lives in its own repo and consumes a deliberately published, versioned schema artifact. `@usebrick/core` is private today, so do not document an npm integration that does not exist.
- **Not synchronized with per-package npm releases.** Each package has its own version, but they evolve in lock-step (slopbrick's `package.json` bumps `@usebrick/core` workspace dep version on every schema change).

## The contract — `@usebrick/core` schemas

`packages/core/schemas/v1/` defines four canonical repository-structure JSON
Schemas alongside the calibration control-plane schemas:

- `inventory.schema.json` — detected patterns + component fingerprints
- `constitution.schema.json` — declared allow-list + deny-list
- `structure.schema.json` — structured projection used to render the
  agent-readable `structure.md` summary
- `health.schema.json` — per-scan health snapshot

**These schemas are the API.** Every tool in the platform reads and writes data
matching them. Required-field, removal, rename, or semantic changes can break
every consumer. When you need to add a field:

1. Add it as **optional** with a sensible default in the schema
2. Bump `STRUCTURE_SCHEMA_VERSION` only if the new field is **required**
3. Bump the consuming package's version + emit a CHANGELOG entry

## Conventions for new packages

1. **Pure functions where possible.** Detect + classify without I/O where feasible.
2. **Reuse `@usebrick/core` types.** Don't redefine `InventoryFile`, `ConstitutionFile`, etc. — import them from the workspace dep.
3. **Add tests in the package's `tests/` directory.** Run via `pnpm --filter <package> test`.
4. **Test against the JSON Schemas**, not just TypeScript types. Schemas are the cross-language contract.
5. **Update `packages/core/schemas/v1/index.json`** when adding a new schema.
6. **Update `README.md`** at the repo root + in your package's README.

## Conventions for new rules / detection logic in slopbrick

1. **Reuse `facts.v2`.** Most new rules should be 5–20 line pure functions over `facts.v2`.
2. **Add `RULE_HINTS` entry in `src/snippet/data.ts`** (the engine auto-validates hints exist).
3. **Calibrate against admitted evidence.** Framework fixtures are useful test
   cases, not corpus-level release evidence. A new rule remains
   `defaultOff: true` until its activation criteria are satisfied by an
   admitted, leakage-checked corpus. Current v10.3 admission is zero, so do not
   present historical v10.1 results as proof for a new activation.
4. **Add tests in `tests/rules/<rule-name>.test.ts`.**

## Quality gates

Run from repo root before committing:

```bash
pnpm -r typecheck    # every package
pnpm -r test         # every package
pnpm -r build        # builds core first (workspace dep), then slopbrick
```

CI runs the same recursive commands on every PR + push to main. Publishing the
`slopbrick` package normally starts from `release: types: [published]`; a
guarded `workflow_dispatch` with an exact tag is the recovery trigger. Tag
pushes alone do not publish. The publish job always uses the `publish`
environment; it pauses for human approval only when that environment has a
protection rule requiring it.

### Pre-push hook (the "local tests pass, CI fails" trap)

The `slopbrick` suite is large and its exact test count is mutable. Running a
scoped subset (for example `pnpm vitest run tests/rules/kotlin/`) is fast and
useful during development, but it can miss full-suite invariants such as
`tests/engine/signal-strength-guardrails.test.ts`. Do not use a historical test
count as current release evidence.

`packages/slopbrick/scripts/pre-push` is a git hook that runs the **same gates as `publish.yml`** (typecheck + full `pnpm test` + build) before allowing a push to `main`. Install it once:

```bash
ln -s ../../packages/slopbrick/scripts/pre-push .git/hooks/pre-push
chmod +x .git/hooks/pre-push
```

After install, `git push origin main` will block on any failure that would fail `publish.yml`. To bypass in an emergency (e.g. a docs-only commit that doesn't need a full test run): `SKIP_PRE_PUSH_TESTS=1 git push --no-verify`.

The hook only enforces on publish branches (`main`); feature branches skip the full gate so iteration stays fast.

### Pre-release checklist (cutting a version)

1. Bump `packages/slopbrick/package.json#version` and the v0.X.Y tag in your release commit
2. Update `packages/slopbrick/CHANGELOG.md` (the `## [version]` header at the top)
3. Run the full gate locally: `pnpm -r typecheck && pnpm -r test && pnpm -r build`
4. Self-scan: `corepack pnpm --filter slopbrick exec -- node ./bin/slopbrick.js scan --workspace . --threads 1 --no-telemetry` — invoke the package-local bin explicitly so a stale packed `node_modules/slopbrick` from consumer tests cannot substitute an older build; `pnpm --filter ... exec` still runs from `packages/slopbrick`, so `.` preserves package-relative include and self-scan exclusion semantics; record the scores in the release commit body
5. Commit + push to `main` (the pre-push hook enforces #3 automatically)
6. `git tag v0.X.Y && git push origin v0.X.Y` — pushes the tag, but **does not** publish
7. `gh release create v0.X.Y --notes-file <CHANGELOG excerpt>` — this is what triggers `publish.yml`
8. If the `publish` environment has required reviewers, approve the job; OIDC trusted publishing does not bypass environment protection
9. Watch the `publish` workflow run; on green, `npm view slopbrick@<version>` should show the new version within ~3 minutes

**Do not** use `pnpm publish` or `npm publish` locally. The OIDC trusted publishing in `publish.yml` is the only supported path; local publish will fail with 401 and the local `~/.npmrc` token is no longer used.

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
