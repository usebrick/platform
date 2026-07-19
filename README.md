# usebrick/platform

> **UseBrick is the coherence and verification layer for agent-built
> software.**

UseBrick is the sole customer-facing product behind
[usebrick.dev](https://usebrick.dev): one repository-owned contract shared by
developers, coding agents, and CI. It starts with a practical question after
an agent-assisted build:

> The app works, but is it actually well built?

SlopBrick gives serious solo developers and vibe coders a useful local scan
without requiring a platform account. They are the free entry audience, not a
proven buyer segment. The initial buyer hypothesis is AI-native software teams
and agencies with roughly 5–100 developers; external evidence for that
hypothesis has not yet been collected.

## Product and capability model

| Product or capability | Role | Current status |
| --- | --- | --- |
| **UseBrick** | The coherence and verification product and repository-owned contract | Sole customer-facing product |
| **SlopBrick** | Observe, detect, explain, and emit repository evidence | Shipped npm package, current CLI, free local scanner, and acquisition surface |
| **Memory capability** | Compile facts, approved intent, provenance, and freshness into bounded agent context | Planned read-only substrate; no new package or store is authorized |
| **Lock capability** | Prevent newly introduced verified drift with approved policy | Planned paid-workflow hypothesis inside the current CLI |
| **Mend capability** | Apply narrow, deterministic, reversible repairs with receipts | Parked until detection and enforcement earn trust |
| **RenderBrick Labs** | Compare source-only work with rendered/runtime evidence | Draft benchmark only; not a browser product or package |
| **Pick flow** | Initialize repository policy and approved intent | Part of onboarding and policy authoring, not a product |

The Memory capability does not mean vendor-owned chat history or unrestricted
agent memory. Its intended job is to combine observed repository facts with
approved intent, rationale, provenance, and freshness, then compile bounded
context for agents and CI. The deterministic Repository Structure schemas
already in this monorepo are its technical starting point. Capability names
describe responsibilities and sequencing boundaries; they do not authorize
separately marketed products or workspace packages.

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
| Corpus v1 source use | Pinned Mendeley v1: 5,000 publisher-labeled AI / 5,000 publisher-labeled Human rows, verified for internal origin measurement and calibration evaluation |
| Calibration | The 576,750-file v10.1 result is historical; it is not v10.3 admission evidence |
| v10.3 admission | Zero units admitted for current-release calibration |

The npm registry metadata currently describing 24 categories is known metadata
drift. The v0.43.0 tagged generated catalog and exact npm tarball README both
record 103 rules in 22 categories; the pinned public-artifact receipt lives at
[`packages/website/src/data/published-release-receipt.json`](./packages/website/src/data/published-release-receipt.json).
The metadata drift must be corrected in the next publication rather than
repeated in documentation.

## Corpus v1 evidence boundary

Corpus v1 currently uses the pinned Mendeley `HumanVSAI_CodeDataset` v1 for
publisher-attested internal origin analysis and calibration evaluation. Its
5,000 AI / 5,000 Human labels are publisher claims bound to exact local bytes,
family-safe splits, and collision checks; they are not witnessed authorship or
quality labels. The source is not approved for public redistribution, and its
use does not admit v10.3 data or activate a rule.

The boundaries are independent:

- source permitted use is not v10.3 gold admission;
- source permitted use is not redistribution approval;
- origin measurement is not usefulness review; and
- a calibration decision is not a rule-state change unless `applied: true` is
  recorded in a separately authorized change.

The repository owner is the only completed product tester. Near-term product
validation uses deterministic owner-run scan-to-finding-to-fix-to-rescan
walkthroughs under
[`VAL-001`](./docs/execution/plans/VAL-001-owner-validation.md). `GTM-001` is
ready to plan 10–20 consent-safe observed external sessions, but zero sessions
are complete and outreach, scheduling, and recording remain unauthorized.
Owner evidence is never market evidence. Source routing is owned by
[`CORPUS-002`](./docs/execution/plans/CORPUS-002-source-use-routing.md).

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

## First-scan contract

The default `scan` terminal output starts with a bounded first screen: one
`Repository Health` headline, these five areas, and at most three recommended
actions:

1. Visual Slop
2. Frontend Implementation
3. Code and Logic
4. Repository Coherence
5. Accessibility and Resilience

Use `scan --full` when you need every active score and finding after that first
screen. The separately labeled AI Slop policy result remains the configured
gate; the Repository Health headline does not replace it.

Evidence labels describe what supports a finding. `deterministic` means the
rule attached an exact source span or deliberately omitted an oversized span;
`calibrated` means measured rule behavior is attached; and `advisory` means
review guidance has no rule-authored span or rule metrics. These labels explain
finding confidence and are not proof of authorship. A repair is called safe
only when it is bound to the current finding's rule, file, line, and column;
otherwise SlopBrick presents manual review and says that no safe bounded repair
is available.

`scan --baseline` is the explicit, reviewed checkpoint that writes the debt
baseline. Ordinary rescans never refresh it automatically. A compatible rescan
reports `new`, `resolved`, and `unchanged` findings; missing or incompatible
baselines claim no comparison. JSON and SARIF preserve their existing fields
and expose `firstScan` as an additive, optional contract.

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
observe facts and runtime evidence
              -> preserve approved intent and rationale
              -> compile fresh bounded agent context
              -> block newly introduced drift
              -> apply narrow reversible repairs
              -> rescan, test, and verify
```

Today, the `slopbrick` CLI and embedded MCP server implement the observation
and evidence front door over `@usebrick/engine` and `@usebrick/core`. Memory,
Lock, Mend, and Render Labs remain planned, parked, or experimental capability
boundaries as labeled above.

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
