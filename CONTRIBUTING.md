# Contributing to usebrick/platform

## Quality Gates (must pass before merge)

```bash
pnpm -r typecheck    # every package
pnpm -r test         # every package
pnpm -r build        # builds core first (workspace dep), then slopbrick
```

CI runs the same commands on every PR + push to main. A published GitHub
Release (or an explicitly supplied tag through the guarded workflow dispatch)
triggers `publish.yml` for `slopbrick`; pushing a tag alone does not publish.

For iteration on a single package, you can scope the test/typecheck run:

```bash
pnpm --filter @usebrick/core test -- <name>
pnpm --filter slopbrick typecheck
```

## Repo Layout

- `packages/core/` — `@usebrick/core` (private). The cross-language contract: JSON Schemas, types, loaders, validators, and the Verdict taxonomy. Touch sparingly.
- `packages/engine/` — `@usebrick/engine` (private). Pure scanning, parsing,
  scoring, and rule-combination logic, with explicit Node compatibility
  adapters at the root entry point.
- `packages/slopbrick/` — `slopbrick` (published). The CLI + MCP server. Scans repos, classifies against rules, persists the structure.
- `packages/website/` — `usebrick.dev` marketing site. Astro 7 + native browser APIs; no Lenis or GSAP runtime dependency.
- `ROADMAP.md` — canonical product direction and sequencing.
- `docs/execution/` — live status, dependency index, and bounded execution
  plans. Historical `docs/superpowers/` plans and specifications remain useful
  design evidence but do not own current status.
- `examples/` — example projects for testing slopbrick end-to-end.

## Conventions

### For new packages

1. **Pure functions where possible.** Detect + classify without I/O where feasible.
2. **Reuse `@usebrick/core` types.** Don't redefine `InventoryFile`, `ConstitutionFile`, `HealthFile`, etc. — import them from the workspace dep.
3. **Add tests in the package's `tests/` directory.** Run via `pnpm --filter <package> test`.
4. **Test against the JSON Schemas, not just TypeScript types.** Schemas are the cross-language contract.
5. **Update `packages/core/schemas/v1/index.json`** when adding a new schema.
6. **Update `README.md`** at the repo root + in your package's README.

### For new rules in slopbrick

1. **Reuse `facts.v2`.** Most new rules should be 5–20 line pure functions over `facts.v2`.
2. **Add `RULE_HINTS` entry in `src/snippet/data.ts`** (the engine auto-validates hints exist).
3. **Calibrate against admitted evidence.** Framework fixtures prove expected
   examples; they are not corpus-level activation evidence. Keep every new
   rule `defaultOff: true` until it meets the current admitted-corpus criteria.
   Historical v10.1 results do not substitute for current v10.3 admission.
4. **Add tests in `tests/rules/<rule-name>.test.ts`.**

### For changes touching `core/`

`packages/core/` is the shared spec. Touch it sparingly:

1. **Bump `STRUCTURE_SCHEMA_VERSION` only on a breaking schema change** (renaming a field, removing a field, changing a required→optional in the wrong direction).
2. **Always add new fields as optional with defaults.** Never add a required field to an existing schema.
3. **Update the validator** in `packages/core/src/structure-types.ts` to match.
4. **Update the schema file** in `packages/core/schemas/v1/`.
5. **Add a test** in `packages/core/tests/structure-types.test.ts` (or the new file's test) for the new validator behavior.
6. **Update the consuming package(s)** to write/read the new field.
7. **CHANGELOG entry** in the consuming package(s).

### For new verdicts (extending the taxonomy)

`VERDICTS` in `packages/core/src/verdicts.ts` is the single source of truth. Adding a value is a breaking change:

1. Add the value to `VERDICTS` (and update the JSDoc explaining the new verdict).
2. If the verdict has a non-`isDefaultOff()`-derived default, update `isDefaultOff()`.
3. Update `signalStrengthSchema` in `packages/core/src/signal-strength-schema.ts` — `z.enum(VERDICTS)` re-derives automatically, so this is usually a no-op.
4. Update slopbrick's rule classifications in `signal-strength.json` to use the new verdict.
5. Bump `STRUCTURE_SCHEMA_VERSION`.
6. CHANGELOG entry in slopbrick.

## Commit Messages

Use conventional commits:

- `feat(scope): ...` — new features
- `fix(scope): ...` — bug fixes
- `chore(scope): ...` — tooling, deps, config
- `refactor(scope): ...` — refactors (no behavior change)
- `docs(scope): ...` — docs only
- `test(scope): ...` — tests only

The `(scope)` should match the package directory name
(`slopbrick`, `core`, `engine`, `website`) so it's greppable
per-package and changelogs can be generated per-package instead
of one undifferentiated list.

Examples from this repo:

- `feat(core): add Zod schema for signal-strength.json (v0.15.0 A.2)`
- `feat(slopbrick): consume Verdict types from @usebrick/core (v0.15.0 A.3)`
- `refactor(core): rename memory.ts to structure.ts (v0.15.0 rebrand)`

## Release Process

The supported publish path is the checksum-bound GitHub Actions OIDC workflow,
normally triggered by a reviewed GitHub Release with guarded manual dispatch as
the recovery path. The five tracked `.changeset` files describe releases
0.39.0 through 0.43.0 that have already shipped. Their presence makes
`pnpm changeset status` report a misleading pending bump; do **not** run
`pnpm version-packages` against them. Current releases use an explicit reviewed
package-version and CHANGELOG update until those stale inputs are separately
approved for archival or deletion.

### Pre-release checklist

1. Bump `packages/slopbrick/package.json#version` and add the matching
   `## [version]` entry to `packages/slopbrick/CHANGELOG.md`.
2. Run `corepack pnpm -r typecheck`, `corepack pnpm -r test`, and
   `corepack pnpm -r build` from the repository root.
3. Run the release self-scan from `packages/slopbrick` with
   `--workspace . --threads 1 --no-telemetry` and record all four scores.
4. Commit and push the approved release commit to `main`; the pre-push hook
   enforces the recursive gates on that branch.
5. Create the exact tag (`git tag vX.Y.Z && git push origin vX.Y.Z`), then
   create the GitHub Release (`gh release create vX.Y.Z`). A tag push alone
   does not publish.
6. Approve the `publish` environment if requested, watch `publish.yml`, and
   verify `npm view slopbrick@X.Y.Z` plus a clean consumer install.
7. Update the website's published facts only after npm publication and verify
   the deployed commit through the Cloudflare owner workflow.

### Semver rules per package

- **`slopbrick` (published CLI)** — every release commit needs an explicit
  package version and CHANGELOG entry. A rule addition is `minor`, a bug fix is
  `patch`, and a breaking schema or CLI contract change is `major`.
- **`@usebrick/core`, `@usebrick/engine` (private workspace)** — `private: true`
  blocks accidental publication; consuming package changelogs still record
  contract-affecting changes.
- **`website`** — no semver; it is private and deploys only through the
  documented Cloudflare owner flow after release facts are verified.

### Why this matters

The publish workflow checks that the release tag resolves to the exact
checked-out commit and that the package version matches the tag. It builds and
uploads one checksum-bound tarball before requesting the `publish` environment;
the gated job publishes that exact artifact with npm OIDC provenance. Do not
use `pnpm publish` or `npm publish` locally, and do not treat a local tarball or
synthetic clean snapshot as a release.

## Pull Requests

1. **Branch from `main`** or the explicitly named in-flight release branch.
2. **Run the quality gates locally** before pushing.
3. **PR description explains**: what changed, why, and how to verify. Link to
   the relevant `docs/execution/plans/...` plan when the work belongs to an
   indexed roadmap lane.
4. **CI must be green** before merge.
5. **Squash-merge** with the PR title as the commit message.

## Working on plans

`ROADMAP.md` owns strategy, `docs/execution/index.json` owns live plan status,
and bounded executable plans live in `docs/execution/plans/`. Design specs and
historical evidence may be cited, but must not carry a competing status or next
action. Each executable task includes acceptance criteria and a verification
path. For plans that use a subagent-driven-development flow:

- Each task gets a fresh implementer subagent
- Two-stage review after each task: spec compliance first, then code quality
- The controller (the agent reading this file) dispatches the subagents and tracks the todo list

If you're a human contributor, just check off the boxes in order. If you're an agent, see the `subagent-driven-development` skill.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
