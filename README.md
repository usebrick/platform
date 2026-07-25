# usebrick/platform

> **UseBrick keeps AI-generated software coherent.**

UseBrick is the repository-owned quality, coherence, and verification layer
for agent-built software. It is the sole customer-facing product behind
[usebrick.dev](https://usebrick.dev): one contract shared by developers,
coding agents, and CI.

> The app works, but is it actually well built?

SlopBrick gives serious solo developers and vibe coders a useful local scan
without requiring a platform account. They are the free entry audience, not a
proven buyer segment. The initial buyer hypothesis is AI-native software teams
and agencies with roughly 5–100 developers; external evidence for that
hypothesis has not yet been collected.

## Product and capability model

| Product or capability | Role | Current status |
| --- | --- | --- |
| **UseBrick** | The quality, coherence, and verification product and repository-owned contract | Sole customer-facing product |
| **SlopBrick** | Detect and explain visual, frontend, code, and repository slop | Shipped npm package, current CLI, free local scanner, and acquisition surface |
| **Memory capability** | M0 proves four declared package facts and bounded previews; broader observed facts and approved intent remain separately gated | Complete private Slices A-C locally qualified, locally checkpointed, and unshipped; no new package, adapter, or store is authorized |
| **Lock capability** | Prevent newly introduced verified drift with approved policy | One import-policy family is locally qualified in the unreleased v0.45 CLI; paid/team value remains unproven |
| **Mend capability** | Apply narrow, deterministic, reversible repairs with receipts | Parked until detection and enforcement earn trust |
| **RenderBrick Labs** | Compare source-only work with rendered/runtime evidence | Draft benchmark only; not a browser product or package |
| **Pick flow** | Initialize repository policy and approved intent | Part of onboarding and policy authoring, not a product |

The Memory capability does not mean vendor-owned chat history or unrestricted
agent memory. M0 compiles only current package-manager, Node-range, command-
presence, and package-name declarations with exact evidence; broader observed
facts, approved intent, and rationale require separate authority. The
deterministic Repository Structure schemas
already in this monorepo are its technical starting point. Capability names
describe responsibilities and sequencing boundaries; they do not authorize
separately marketed products or workspace packages.

Current Memory decision work is tracked by
[`MEM-001`](./docs/execution/plans/MEM-001-read-only-m0.md). Its
[M0 ADR](./docs/decisions/memorybrick-m0.md) and focused
[requirement-to-test contract](./docs/decisions/memorybrick-m0-acceptance.md)
now have a locally qualified and locally checkpointed private Slice A-C
implementation;
pinned [registry v2](./docs/decisions/memorybrick-m0-registry-v2.json)
and exact [benchmark vector
v2](./docs/decisions/memorybrick-m0-benchmark-vector-v2.json) are fixed test
data. M0 covers only deterministic local compilation of four declared facts
from trusted internal registrations containing untrusted root/package JSON,
bounded previews with visible omission warnings, and one internal
3-fixture/9-task/27-cell conformance harness. It defines no public
hostile-host-object contract, source-code parser, filesystem acquisition,
client/provider invocation, credentials, private run state, persistence,
retention, or deletion system. Structure v5 remains unchanged. The former
numeric reviewer-score gate is retired; Revision 69 records the owner's
**Accept Slice A** decision and its green local receipt. Revision 70 separately
authorized Slice B, Revision 71 records its green local receipt, and Revision
72 authorized Slice C. Revision 73 records the complete private M0 local
receipt after focused Node 22/24 checks, exact-vector reconstruction, targeted
review, and bounded workspace qualification. Revision 74 records the owner's
authorization for one local checkpoint commit only. This is deterministic
local fixture conformance only, not agent efficacy or a shipped Memory product. Current
state and full history live exclusively in the
[execution index](./docs/execution/index.json),
[execution status](./docs/execution/STATUS.md), and
[changelog](./docs/execution/CHANGELOG.md).

`LOCK-001` is also locally complete in the unreleased workspace candidate.
After a reviewed baseline, `slopbrick ci --lock-new-debt` can block only exact
new import-policy violations authorized by repository `allowedImports`.
Built-in defaults, incomplete scans, and incompatible baselines fail closed;
owned expiring waivers and decision evidence remain visible. This is one
owner-controlled implementation proof, not a shipped paid feature or evidence
of team demand. See the
[Lock receipt](./docs/execution/evidence/LOCK-001-owner-validation.md).

AI slop and repository memory solve different halves of one problem. Slop is
the visible inconsistency; context loss is one major cause. Memory learns one
repository, while separately consented privacy-safe outcomes may later improve
global rule priors. Local approved policy always wins.

The earlier StackPick and PickBrick ideas are now onboarding and Constitution
authoring. GIR is retained only as future deterministic Mend logic. Hosted
BRICK Cloud ideas remain delayed until real team adoption.

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

# In the unreleased workspace candidate, opt into the bounded Lock gate after
# reviewing a baseline and declaring allowedImports in repository config.
npx slopbrick scan --baseline
npx slopbrick ci --lock-new-debt
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

The memorable **Slop Index** remains a future shareable report concept. It is
not a current CLI field, formula, or release claim. The current four-score
contract remains authoritative until a separate compatibility, calibration,
UX, and release decision changes it.

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

The unreleased candidate's explicit Lock gate is narrower than the generic
finding-delta gate: it considers only exact new
`context/import-path-mismatch` findings from repository-authored
`allowedImports`. Omitting `--lock-new-debt` preserves existing CI behavior.

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
- the unreleased v0.45 candidate also exposes an explicit-path, local-only
  outcome-event library API; normal scans do not write it, and it has no
  outbound transport. Its v1 store is bounded and fail-closed: writes require
  an owner-private canonical POSIX path, reject symbolic/hard-link aliases,
  reject filesystem-equivalent export aliases even before the ledger exists,
  and serialize only fixed-key validated snapshots. Its producer coordinate is
  closed to `0.45.0` rather than accepting caller-selected version text.

Do not describe the current CLI as having “no telemetry” or “no network”
without those distinctions. The outbound beacon sends no source files or file
paths; its exact current payload is documented in
[`packages/slopbrick/README.md`](./packages/slopbrick/README.md#outbound-usage-beacon-off-by-default).
The separate outcome contract is documented in
[`packages/slopbrick/docs/outcome-events.md`](./packages/slopbrick/docs/outcome-events.md).

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

The long-term moat is the coherence graph connecting observed facts, approved
intent, provenance and freshness, human outcomes, enforcement decisions,
repair receipts, runtime evidence, and cross-agent benchmark results. The rule
catalog alone is not the moat.

Read [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the package boundaries
and data flow, and the dated
[market research](./docs/research/usebrick-market-positioning-2026-07-19.md)
for competitive and pricing hypotheses.

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
