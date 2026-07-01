# Contributing to usebrick/platform

## Quality Gates (must pass before merge)

```bash
pnpm -r typecheck    # every package
pnpm -r test         # every package
pnpm -r build        # builds core first (workspace dep), then slopbrick
```

CI runs the same commands on every PR + push to main. Tag pushes additionally trigger `publish.yml` for the `slopbrick` package.

For iteration on a single package, you can scope the test/typecheck run:

```bash
pnpm --filter @usebrick/core test -- <name>
pnpm --filter @usebrick/slopbrick typecheck
```

## Repo Layout

- `packages/core/` — `@usebrick/core` (private). The cross-language contract: JSON Schemas, types, loaders, validators, and the Verdict taxonomy. Touch sparingly.
- `packages/slopbrick/` — `slopbrick` (published). The CLI + MCP server. Scans repos, classifies against rules, persists the structure.
- `packages/website/` — `usebrick.dev` marketing site. Astro 4 + GSAP + Lenis.
- `docs/` — architecture, update summaries, and the implementation plans under `docs/superpowers/plans/`.
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
3. **Calibrate against the corpus.** New rules must have `recall/FP ratio ≥ 1.5×` against `tests/fixtures/frameworks/`. Without calibration, the rule is `defaultOff: true` until proven.
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

We use [Changesets](https://github.com/changesets/changesets) for
version management. Every change that affects a published package
must add a changeset file alongside the code change.

```bash
# After making your change, with the change staged or un-staged:
pnpm changeset            # prompts: which package, semver bump, one-line summary

# This writes a markdown file under .changeset/ like:
#   .changeset/random-words-123.md
# Edit that file if you want a longer description, then:
git add .changeset/*.md
git commit -m "feat(slopbrick): ..."
```

### What happens after you push

1. CI runs the normal quality gates on your PR.
2. When your PR merges to `main`, a GitHub Action
   (`.github/workflows/publish.yml`) sees the pending changeset
   and opens (or updates) a **"chore: version packages"** PR.
3. A maintainer reviews that PR — it bumps
   `packages/slopbrick/package.json` (and any other published
   package), writes a CHANGELOG entry from your changeset text,
   and syncs `packages/website/src/data/version.json` to the new
   version.
4. Merging the version PR triggers `pnpm changeset publish`,
   which calls `npm publish` for each bumped package. The actual
   publish is gated by the `publish` GitHub Environment, so a
   human approves in the UI before `npm publish` runs.

### Pre-publish checklist (READ BEFORE MERGING THE VERSION PR)

The version-bump PR is the last place to catch version-drift
before `npm publish` runs. Before approving it, verify the
following files are in sync with the bumped version:

- [ ] `README.md` — the product table on line ~19 says
  `slopbrick@X.Y.Z on npm` (X.Y.Z = the new version).
- [ ] `README.md` — the `## The 4-score model (vX.Y.Z+)` section
  header (line ~90) uses the new version suffix.
- [ ] `packages/slopbrick/README.md` — the `**Status:**` line
  (line ~49) says `vX.Y.Z (current)`.
- [ ] `packages/slopbrick/README.md` — the section header on
  line ~79 uses the new version suffix.
- [ ] `docs/ARCHITECTURE.md` — the `**Status**:` line (line ~4)
  says `vX.Y.Z shipped` and lists the right "since v0.15"
  milestones.
- [ ] `docs/ARCHITECTURE.md` — the product table on line ~25
  says `slopbrick@X.Y.Z on npm`.
- [ ] `packages/website/src/data/version.json` — `slopbrick`
  field is the new version and `built` field is today's date
  (this is auto-set by `pnpm version-packages`, so usually no
  manual edit is needed — but verify).
- [ ] `packages/slopbrick/package.json` — `version` field is
  the new version (auto-set by `pnpm version-packages`).
- [ ] `packages/slopbrick/CHANGELOG.md` — new entry at the top
  with the right content (auto-generated from the changeset,
  but verify the format is sane).

This checklist existed because v0.20.0 shipped with the
README product table still saying `slopbrick@0.17.0` — the
drift accumulated across ~8 releases where the manual
release flow skipped the README update. The fix for v0.20.0
was a one-off commit; this checklist makes the fix
permanent.

### Semver rules per package

- **`slopbrick` (published CLI)** — every change needs a
  changeset. A rule addition is `minor`, a bug fix is `patch`,
  a breaking schema or CLI contract change is `major`.
- **`@usebrick/core`, `@usebrick/engine` (private workspace)** —
  `private: true` in their package.json blocks accidental
  publish. Changesets ignores them, but a CHANGELOG entry in
  the consuming package (`slopbrick`) still tracks the
  dependency bump.
- **`website`** — no semver. `ignore`'d in
  `.changeset/config.json`. Commits deploy on merge to `main`
  via the website's own CI. A CHANGELOG for a static site is
  noise.
- **Future packages (`stackpick`, `gir`, `mcp`, `cli`)** — the
  day a new package gets its own `package.json`, add it to
  `.changeset/config.json` (`ignore` if private, otherwise
  just start writing changesets). Costs nothing to set up
  upfront; retrofitting later is the expensive option.

### Why this matters

Before changesets, every release ran via
`.github/workflows/publish.yml`'s `workflow_dispatch` trigger,
which could fire `npm publish` with no git tag and no GitHub
Release. The changesets flow makes the version bump a regular
git commit, so `npm publish` is now structurally impossible
without a corresponding commit on `main` — the version PR
*is* the commit that bumps `package.json`. There is no path
to `npm publish` that skips git.

## Pull Requests

1. **Branch from `main`** (or the in-flight release branch, e.g. `v0.14.5d`).
2. **Run the quality gates locally** before pushing.
3. **PR description explains**: what changed, why, and how to verify. Link to the relevant plan task (`docs/superpowers/plans/...`).
4. **CI must be green** before merge.
5. **Squash-merge** with the PR title as the commit message.

## Working on plans

Multi-step plans live in `docs/superpowers/plans/`. Each task in a plan has its own checkbox + acceptance criteria. For plans that use the Superpowers subagent-driven-development flow:

- Each task gets a fresh implementer subagent
- Two-stage review after each task: spec compliance first, then code quality
- The controller (the agent reading this file) dispatches the subagents and tracks the todo list

If you're a human contributor, just check off the boxes in order. If you're an agent, see the `subagent-driven-development` skill.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
