# usebrick/platform

> **Usebrick keeps AI-generated software coherent.**

Usebrick is the monorepo behind [usebrick.dev](https://usebrick.dev). It starts
with a simple question for vibe coders and AI-assisted builders:

> The app works, but is it actually well built?

The product path is deliberately progressive. SlopBrick gives an individual
developer a useful local scan without requiring a platform account. The same
verified repository understanding can later support team enforcement and safe
repair.

## Product model

| Product | Role | Current status |
| --- | --- | --- |
| **SlopBrick** | Free local scanner and the main entry point | Shipping on npm; product-quality and trust work continues |
| **MemoryBrick** | Repository-owned knowledge substrate and context compiler | Planned; begins by projecting and validating existing structure artifacts |
| **LockBrick** | Deterministic team policy and new-drift enforcement | Planned as the first paid team layer |
| **MendBrick** | Deterministic, reversible repair | Later, after detection and enforcement earn trust |
| **Pick flow** | Initialisation and policy authoring | Folded into onboarding; not a separate product for now |

MemoryBrick does not mean vendor-owned chat history or unrestricted agent
memory. Its intended job is to combine observed repository facts with approved
intent, rationale, provenance, and freshness, then compile bounded context for
agents and CI. The deterministic Repository Structure schemas already in this
monorepo are its technical starting point.

See the [canonical roadmap](./ROADMAP.md), the
[execution index](./docs/execution/index.json), and the
[current status](./docs/execution/STATUS.md). Those files own future direction
and live progress; package changelogs and historical plans remain evidence, not
parallel roadmaps.

## Verified release state

| Surface | Verified state |
| --- | --- |
| npm | `slopbrick@0.43.0` |
| Published rule catalog | 103 rules in **22** generated categories |
| Workspace candidate | Unreleased `0.45.0`, 119 rules in 27 categories |
| Calibration | The 576,750-file v10.1 result is historical; it is not v10.3 admission evidence |
| v10.3 admission | Zero units admitted for current-release calibration |

The npm registry metadata currently describing 24 categories is known metadata
drift. The v0.43.0 tagged generated catalog and exact npm tarball README both
record 103 rules in 22 categories; the pinned public-artifact receipt lives at
[`packages/website/src/data/published-release-receipt.json`](./packages/website/src/data/published-release-receipt.json).
The metadata drift must be corrected in the next publication rather than
repeated in documentation.

## Quick start

The workspace candidate and current repository-development policy support
Node.js 22 and 24 (`^22.0.0 || ^24.0.0`). The already-published
`slopbrick@0.43.0` package declared Node.js `>=20`; that historical package
metadata does not widen the v0.45.0 candidate's qualification matrix.

```bash
npm install -D slopbrick
npx slopbrick init
npx slopbrick scan
```

Optional integrations:

```bash
# Give MCP-compatible agents access to SlopBrick's repository tools.
npx slopbrick mcp

# Gate new work against the repository policy.
npx slopbrick ci
```

See [`packages/slopbrick/README.md`](./packages/slopbrick/README.md) for the
CLI contract and current workspace-candidate status, and
[`packages/slopbrick/EXAMPLES.md`](./packages/slopbrick/EXAMPLES.md) for CI
examples.

## What a scan writes

With project memory enabled (the default), a valid whole-project scan writes
three canonical JSON snapshots, one derived Markdown summary, and a separate
bounded local run-history file:

```text
<project-root>/
├── .slopbrick/
│   ├── inventory.json     # observed patterns and component fingerprints
│   ├── constitution.json  # declared allow-list, deny-list, and policy
│   ├── health.json        # scan health and score snapshot
│   ├── structure.md       # generated agent- and human-readable summary
│   └── structure.json     # legacy local run history; not the Structure schema projection
└── .slopbrick-cache.json  # optional per-file scan cache
```

The four canonical schemas describe inventory, constitution, health, and the
structured projection used to render `structure.md`:

| Artifact | Contract |
| --- | --- |
| `inventory.json` | [`inventory.schema.json`](./packages/core/schemas/v1/inventory.schema.json) |
| `constitution.json` | [`constitution.schema.json`](./packages/core/schemas/v1/constitution.schema.json) |
| `health.json` | [`health.schema.json`](./packages/core/schemas/v1/health.schema.json) |
| `structure.md` | Derived Markdown; its structured projection is defined by [`structure.schema.json`](./packages/core/schemas/v1/structure.schema.json) |

`.slopbrick/structure.json` is local scan history and does **not** implement
`structure.schema.json`. Consumers of `structure.md` must treat it as Markdown;
consumers must not validate either file as the structured projection solely
because their names contain "structure".

The tree highlights stable public artifacts. Internal Core freshness caches and
the default local flywheel state under `.slopbrick/` are intentionally omitted;
they are implementation state, not interchange contracts.

## Scores and findings

SlopBrick reports four independent scores on a 0–100 scale:

| Score | Direction | Meaning |
| --- | --- | --- |
| `aiSlopScore` | lower is cleaner | Burden from calibrated AI-associated signals |
| `engineeringHygiene` | higher is better | General engineering-hygiene posture |
| `security` | higher is better | Security-finding posture |
| `repositoryHealth` | higher is better | Composite health, including the inverse of AI slop |

The headline does not replace evidence. Reports separate AI findings,
engineering hygiene, security, and suppressed/default-off rules. Candidate
signals without adequate calibration remain off by default.

## Local data and outbound reporting

SlopBrick is local-first, but a normal scan is not read-only:

- generated repository artifacts are written under `.slopbrick/`;
- local flywheel scan history is enabled by default and can be disabled with
  `--no-telemetry` or `telemetry: false`;
- outbound usage reporting is **off by default** and occurs only when both
  `--report-usage` and `SLOPBRICK_TELEMETRY_ENDPOINT` are supplied.

Do not describe the current CLI as having “no telemetry” or “no network”
without those distinctions. The outbound beacon sends no source files or file
paths; its exact current payload is documented in
[`packages/slopbrick/README.md`](./packages/slopbrick/README.md#outbound-usage-beacon-off-by-default).

## Packages

| Package | Status | Purpose |
| --- | --- | --- |
| [`packages/core`](./packages/core) | Private, workspace-only | Types, validators, loaders, and versioned JSON Schemas |
| [`packages/engine`](./packages/engine) | Private, workspace-only | Pure scanning, parsing, scoring, and rule-combination logic, with explicit Node adapters |
| [`packages/slopbrick`](./packages/slopbrick) | Published as `slopbrick` | CLI, reports, MCP server, calibration tools, and local persistence |
| [`packages/website`](./packages/website) | Private, workspace-only | Astro marketing site prepared for Cloudflare Pages |

SlopBrick remains unscoped because `npx slopbrick` is the user-facing entry
point. Library packages use the `@usebrick/` scope.

## Architecture

```text
source + config
      │
      ▼
slopbrick CLI ──► @usebrick/engine ──► findings and scores
      │                                      │
      ├──────────────► .slopbrick/ artifacts │
      │                                      ▼
      └──────────────► MCP and CI consume @usebrick/core contracts

future MemoryBrick: verified facts + approved intent + provenance/freshness
future LockBrick:   deterministic delta enforcement in CI
future MendBrick:   reversible repairs for trusted findings
```

Read [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the package boundaries
and data flow.

## Contributing

```bash
corepack pnpm install
corepack pnpm -r typecheck
corepack pnpm -r test
corepack pnpm -r build
```

The full test suite is intentionally substantial. During development, run the
smallest relevant package test first, then the recursive release gates before a
merge or release decision. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Release boundary

Publishing is performed only by the GitHub Actions OIDC workflow. A published
GitHub Release is the normal trigger; guarded `workflow_dispatch` with an exact
tag is the recovery path. Tag pushes do not publish, and local `npm publish` or
`pnpm publish` is not supported. A website build is not evidence of a live
deployment; owner and deployed-commit verification remain separate gates.

## License

[MIT](./LICENSE)
