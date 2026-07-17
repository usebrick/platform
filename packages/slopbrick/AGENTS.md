# AGENTS.md

> How AI agents should work with `packages/slopbrick`.

Apply silently. Do not restate unless the user asks for project rules.

## Product role

SlopBrick is the local scanner and user-acquisition front door for usebrick. It
finds visual, frontend, code, security, and repository-coherence problems that
AI coding workflows amplify. It does not prove AI authorship.

MemoryBrick is the planned repository-memory substrate, LockBrick is the
planned policy/governance product, and MendBrick is the later deterministic
repair layer. Do not describe any of them as separately shipped products.

Current version truth:

- npm: `slopbrick@0.43.0`, generated catalog 103 rules / 22 categories
- workspace: unreleased `0.45.0`, generated catalog 119 rules / 27 categories
- v10.1's 576,750 analysed files are historical evidence
- v10.3 has no admitted cohort for a release-calibration claim

Registry metadata that reports 24 categories for v0.43.0 is stale. The
generated release artifact is authoritative at 22.

## Package boundaries

- `@usebrick/core` owns schemas, generated contract types, validators, and
  repository artifact I/O.
- `@usebrick/engine` owns reusable parsing, facts, detection, scoring, and
  Node/pure adapters.
- `slopbrick` owns CLI/MCP orchestration, built-in rules, configuration,
  reporting, and release packaging.
- Prefer pure functions and `facts.v2`; keep filesystem, process, network, and
  stdout/stderr effects at the CLI/MCP boundaries.
- Import shared types from the workspace packages. Do not recreate core or
  engine contracts inside SlopBrick.

## Public score contract

The four headline scores are independent:

| Field | Direction | Contract |
|---|---|---|
| `aiSlopScore` | lower is cleaner | effective AI-associated signals; not authorship proof |
| `engineeringHygiene` | higher is better | arch, logic, layout, visual, component, and test cleanliness |
| `security` | higher is better | score derived from retained security findings |
| `repositoryHealth` | higher is better | `0.4 × (100 − aiSlopScore) + 0.3 × engineeringHygiene + 0.2 × security + 0.1 × testQuality` |

Only `scoreValidity=valid` may gate. Partial scans are diagnostic and empty or
not-applicable scans omit canonical scores. The default mean gate passes when
`aiSlopScore <= meanSlop`.

Do not promote legacy `slopIndex`, `assemblyHealth`, `totalScore`, the Bayesian
`compositeScore`, or specialised subcommand diagnostics into additional
headline scores.

## Persisted artifacts and privacy

A valid scan writes three canonical JSON snapshots plus one Markdown summary
unless `projectMemory: false` is configured:

```text
.slopbrick/{inventory.json,constitution.json,health.json,structure.md}
```

The engine can also append a bounded legacy/local
`.slopbrick/structure.json` run-history log. It is not a canonical snapshot and
does not implement `structure.schema.json`; that schema defines a structured
projection while `structure.md` is the derived agent-readable rendering.

The project-memory run log follows `projectMemory` (default on). Rich flywheel
history under `.slopbrick/flywheel/` is also on by default and is disabled with
`--no-telemetry` or `telemetry: false`. Outbound usage reporting is off by
default and requires both `--report-usage` and
`SLOPBRICK_TELEMETRY_ENDPOINT`. Keep all three mechanisms separate.

## Adding or changing a rule

1. Reuse `facts.v2`; most rules should be small pure analyzers.
2. Add or change `src/rules/<category>/<rule-name>.ts`.
3. Add focused tests under `tests/rules/`.
4. Add a `RULE_HINTS` entry in `src/snippet/data.ts`.
5. Add/update `src/rules/signal-strength.json` metadata.
6. Run `corepack pnpm --filter slopbrick generate:rules`; the registry and
   catalog are generated artifacts.
7. Calibrate against an eligible corpus. A new or unmeasured rule stays
   `defaultOff: true` until it satisfies the active policy (including the
   recall/false-positive ratio gate) and review.

Never describe a heuristic as deterministic, a historical point estimate as
current calibration, or a rule firing as an authorship verdict. Exact matched
evidence, when available, must remain bounded and privacy-safe.

## Calibration boundary

The live calibration index is
[`docs/calibration/README.md`](./docs/calibration/README.md). Detailed v10.3
plans and evidence are preserved for audit, but only the central execution
ledger decides what work is active.

- Do not infer labels from “recent GitHub repo,” popularity, or code quality.
- Positive means verified AI provenance; negative means verified human
  provenance under the approved method.
- Schema validation alone does not admit a source.
- Quarantined/registered files do not count as eligible calibration units.
- Do not publish numeric v10.3 performance until provenance, overlap,
  denominator, split, and coverage gates all pass.

## Commands

Run from the monorepo root:

```bash
corepack pnpm --filter slopbrick typecheck
corepack pnpm --filter slopbrick exec vitest run <focused-test-file>
corepack pnpm --filter slopbrick build
```

Run the full package suite before release or a broad change:

```bash
corepack pnpm --filter slopbrick test
```

Self-scan the package-local workspace with the package-local binary so packed
consumer fixtures cannot substitute another version:

```bash
corepack pnpm --filter slopbrick exec -- node ./bin/slopbrick.js scan \
  --workspace . --threads 1 --no-telemetry
```

Do not freeze current test, tool, subcommand, or source-file counts in prose.
Generate or query them at runtime.

## Release process

The workspace candidate is not public merely because its local tests pass.
Before a SlopBrick release:

1. Bump `package.json` and update `CHANGELOG.md`.
2. Run root typecheck, full test, and build gates.
3. Run and record the package-local self-scan; resolve or explicitly disposition
   any threshold failure.
4. Push the reviewed release commit and tag.
5. Create the GitHub Release, approve the protected publish environment, and
   verify the OIDC publish workflow plus `npm view` result.

Never run `pnpm publish` or `npm publish` locally. A tag push alone does not
publish.

## Documentation authority

- Platform direction: [`../../ROADMAP.md`](../../ROADMAP.md)
- Active plans/status/changelog: [`../../docs/execution/`](../../docs/execution/)
- Package behavior: [`README.md`](./README.md) and current generated/runtime
  docs
- Historical calibration/research: evidence only, never an active roadmap by
  implication

When changing behavior, update the root roadmap/status only if the milestone
actually moved; otherwise update the relevant package doc and execution plan.

## Security and Git

- Never commit credentials, private corpus contents, or raw proprietary source.
- Preserve unrelated worktree changes.
- Use `rg`/`rg --files` for search.
- Do not perform destructive Git actions, push, tag, release, publish, or
  deploy without the required user authorization.

## License

[MIT](./LICENSE)
