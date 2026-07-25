# UseBrick architecture

**Updated:** 2026-07-25
**Status:** Current product and package reference

UseBrick keeps AI-generated software coherent. It is the repository-owned
quality, coherence, and verification layer for agent-built software and the
sole customer-facing product: one contract shared by developers, coding
agents, and CI.

Product direction lives in [`ROADMAP.md`](../ROADMAP.md). Live implementation
status and dependency edges live in
[`docs/execution/index.json`](./execution/index.json), not in this reference.

## Product and capability model

```text
                             UseBrick
             repository-owned coherence contract
                                │
       observe -> preserve -> compile -> prevent -> repair -> verify
          │          │          │          │          │         │
      SlopBrick    policy     Memory      Lock       Mend      Render
       shipped     authoring  M0 local   qualified  exact M0  Labs
```

| Product or capability | Architectural role | Delivery boundary |
| --- | --- | --- |
| **UseBrick** | Repository-owned quality, coherence, and verification contract | Sole customer-facing product |
| **SlopBrick** | Detect visual, frontend, code, and repository slop; emit evidence, scores, artifacts, MCP, and CI primitives | Shipped npm package, current CLI, free scanner, and acquisition surface |
| **Memory capability** | Compile observed facts, declared intent, rationale, evolution, provenance, and freshness into bounded agent context | Private four-fact M0 locally qualified and unshipped; broader adapters/store remain gated |
| **Pick flow** | Initialization, approved intent, and policy authoring | Part of onboarding, not a product or package |
| **Lock capability** | Deterministic enforcement of approved policy against newly introduced verified drift | One import-policy family locally qualified in the unreleased CLI; team and paid value remain unproven |
| **Mend capability** | Narrow deterministic and reversible repairs with receipts for findings teams already trust | One exact repository-owned import rewrite is in local proof; no arbitrary repository-wide AI refactoring |
| **RenderBrick Labs** | Compare source-only analysis with screenshots and runtime evidence | Draft benchmark only; not a browser product, package, or proven customer capability |

The Memory capability is not vendor-owned chat history, a transcript archive,
or an unbounded vector store. The repository remains the authority, memory
changes must be reviewable, and agents may propose rather than silently author
normative facts. These capability names define architecture and sequencing;
none implies a separately marketed product or package extraction.

Earlier names fold into this model: StackPick and PickBrick become onboarding
and Constitution authoring; the MCP Registry Bridge remains an integration;
GIR becomes future deterministic Mend logic; BRICK Cloud remains delayed
hosted history and governance.

## Intelligence planes and coherence graph

```text
repository intelligence                 global slop intelligence
facts + intent + provenance             privacy-safe opted-in outcomes
             \                           /
              \                         /
                 SlopBrick evidence
                        │
             Lock decisions and waivers
                        │
       Mend diff + tests + rescan + rollback
                        │
              runtime verification
```

Repository intelligence owns private facts, approved policy, exceptions, and
rationale. Global outcomes may improve confidence and thresholds only after
consent and review. A global prior cannot override local approved intent or
silently become a calibration label.

The coherence graph connects observed facts, declared intent, provenance and
freshness, outcomes, enforcement state, repair receipts, runtime evidence, and
cross-agent benchmark results. This connected evidence—not the rule list—is
the architectural moat.

## Verified delivery state

- Latest verified npm release: `slopbrick@0.43.0`.
- Published generated catalog: 103 rules in 22 categories.
- Known drift: npm registry metadata says 24 categories; that metadata is not
  the catalog truth and must be corrected in the next publication.
- Workspace candidate: unreleased `0.45.0`, 119 rules in 27 categories.
- Historical calibration: v10.1 analyzed 576,750 files from 581,550 sampled
  paths; that result is not current v10.3 admission evidence.
- Current Corpus v1 source: pinned Mendeley v1, verified as
  `publisher_attested` + `internal_analysis` for origin measurement and
  calibration evaluation; its labels are not witnessed authorship or quality.
- Current v10.3 admission: zero admitted units.
- Private Memory M0: complete local Slices A-C fixture-conformance proof;
  unshipped and unchanged Structure v5.
- LOCK-001: complete local owner-only proof for explicit
  `ci --lock-new-debt` over one repository import-policy family; unshipped and
  not team-validated.

## Monorepo boundaries

```text
platform/
├── packages/
│   ├── core/        @usebrick/core, private workspace contract package
│   ├── engine/      @usebrick/engine, private scanning package
│   ├── slopbrick/   slopbrick, published CLI and MCP server
│   └── website/     private Astro marketing site
├── docs/
│   ├── execution/   live portfolio status and bounded plans
│   ├── calibration/ calibration navigation
│   ├── archive/     recoverable superseded narratives
│   └── superpowers/ frozen design and implementation capsules
├── ROADMAP.md       canonical product roadmap
├── AGENTS.md        agent operating rules
└── CONTRIBUTING.md  contributor and release workflow
```

### `@usebrick/core`

`packages/core/` owns cross-package data contracts:

- repository structure types, validators, readers, and writers;
- the verdict taxonomy used by rule calibration;
- versioned JSON Schemas under `packages/core/schemas/v1/`;
- calibration control-plane schemas and validators.

The four canonical repository-structure contracts are:

- `inventory.schema.json` — observed patterns and component fingerprints;
- `constitution.schema.json` — declared allow-list, deny-list, and policy;
- `health.schema.json` — a completed-scan health snapshot;
- `structure.schema.json` — the structured projection used to render the
  agent-readable Markdown summary.

Adding an optional field with a default is the normal compatible change.
Required fields, removals, or semantic renames require explicit schema-version
and consumer review.

### `@usebrick/engine`

`packages/engine/` owns parsing, facts, rule execution, scoring, combination,
and repository-structure computation. Embedded hosts should use the
`@usebrick/engine/pure` surface when they already own source bytes. The package
root retains explicit Node compatibility adapters for filesystem-backed CLI
consumers.

The pure boundary must not own CLI rendering, process termination, network
reporting, or hidden filesystem discovery. Those effects belong to adapters.

### `slopbrick`

`packages/slopbrick/` owns the shipping user experience:

- Commander-based CLI and exit-code contract;
- repository discovery and filesystem adapters;
- generated rule registry and hints;
- pretty, brief, JSON, HTML, Markdown, and SARIF reporting;
- baseline, diff, CI, and policy surfaces;
- MCP server and its documented tools;
- local flywheel persistence and optional outbound usage beacon;
- calibration and admission tooling;
- packed npm artifact and release checks.

It imports the core contracts and engine instead of redefining their public
types or scoring logic.

### Website

`packages/website/` is a static Astro marketing site. Its build-time product
facts must be generated from verified package sources. A successful local
build is not proof of a live deployment; owner and deployed-commit SHA must be
verified separately.

The website is not part of the scan data path and does not receive repository
source through the current static product.

## Scan data flow

```text
source files + slopbrick.config.mjs
                  │
                  ▼
        SlopBrick CLI adapters
    discovery, selection, persistence
                  │
                  ▼
       @usebrick/engine/pure
   parse → facts → rules → scores
                  │
          ┌───────┴────────┐
          │                │
          ▼                ▼
     reports/exit       .slopbrick/
      decisions         inventory.json
                        constitution.json
                        health.json
                        structure.md
                               │
                               ▼
                   MCP, CI, and future adapters
```

With project memory enabled, a valid whole-project `slopbrick scan` writes
three canonical JSON snapshots, one Markdown summary, and separate local run
history:

| On-disk artifact | Meaning |
| --- | --- |
| `.slopbrick/inventory.json` | Deterministically observed repository patterns |
| `.slopbrick/constitution.json` | Declared repository intent and constraints |
| `.slopbrick/health.json` | Score and issue-count snapshot for an applicable scan |
| `.slopbrick/structure.md` | Derived human- and agent-readable summary |
| `.slopbrick/structure.json` | Bounded legacy/local scan history; not a Structure-schema projection |

The JSON `structure.schema.json` describes a structured projection;
`structure.md` is its Markdown rendering. The run-history `structure.json` has
a different legacy contract. Neither on-disk file should be fed to the
Structure-schema validator as if it were the projection.

## Score and evidence model

The current report has four headline scores:

| Score | Direction | Role |
| --- | --- | --- |
| `aiSlopScore` | lower is cleaner | Calibrated AI-associated signal burden |
| `engineeringHygiene` | higher is better | General implementation-hygiene posture |
| `security` | higher is better | Security-finding posture |
| `repositoryHealth` | higher is better | Composite health with AI slop inverted internally |

Rules have an internal verdict (`USEFUL`, `OK`, `NOISY`, `INVERTED`,
`HYGIENE`, or `DORMANT`) and a user-facing bucket. Candidate signals without
adequate calibration are default-off. A broad historical corpus run cannot be
used as evidence for a current release unless its inputs satisfy the current
admission contract.

SlopBrick's strategic report taxonomy grows toward:

1. Visual Slop;
2. Frontend Implementation Slop;
3. Code and Logic Slop;
4. Repository Coherence;
5. Accessibility and Resilience.

Each finding must identify its evidence quality—deterministic, calibrated, or
advisory—so qualitative visual judgement is never represented as certain
static-analysis fact.

The future Slop Index is a possible shareable projection over these dimensions,
not a current field or formula. The current four scores and Repository Health
first-screen headline remain the implemented contract until a separate score
compatibility and calibration decision is approved.

### Corpus v1 source-use boundary

Corpus source routing is a SlopBrick calibration concern, not a Core schema.
`source-policy.ts` derives permitted uses from independent authority, integrity,
and rights fields; `source-registry.ts` fails closed for unknown sources. The
use assertion rederives the canonical disposition so an adapter cannot widen,
duplicate, reorder, or replace its permitted uses. A source adapter must assert
the requested use before projecting candidate bytes.

```text
pinned source bytes + evidence
            │
            ▼
 source-specific verifier
            │
            ▼
authority + integrity + rights
            │
            ▼
  deterministic use router
            │
            ├── origin/calibration evaluation
            ├── ecological validation
            ├── sensitivity/prevalence analysis
            └── redistribution only with separate approval
```

The current Mendeley route is `publisher_attested`, `verified`, and
`internal_analysis`. It permits internal origin measurement and calibration
evaluation. It does not establish v10.3 gold admission, redistribution,
finding usefulness, or rule application. Pending, quarantined, reference-only,
and unregistered sources cannot enter an executable corpus path.

## Persistence and network boundary

A normal scan is local-first but stateful:

- repository artifacts are written under `.slopbrick/` unless their configured
  persistence is disabled;
- local flywheel scan history is enabled by default and can be disabled with
  `--no-telemetry` or `telemetry: false`;
- the incremental cache and baseline are written only when their relevant
  options are used;
- the v1 outcome-event ledger is written only through the explicit public
  library API to a caller-selected, owner-private canonical POSIX path; normal
  scans do not create it;
- managed `AGENTS.md` or `CLAUDE.md` blocks are rewritten only with
  `--refresh-snippets` or the corresponding explicit configuration.

Outbound usage reporting is off by default. A scan sends the one-shot beacon
only when both `--report-usage` and `SLOPBRICK_TELEMETRY_ENDPOINT` are present.
`watch`, `ci`, and programmatic `scanProject` do not send that beacon through
this path. Network failure does not change the scan exit code.

These local and outbound mechanisms are separate. `--no-telemetry` disables
the local flywheel; it is not a generic read-only mode.

The outcome-event v1 contract is a third, separately controlled local path. It
has a closed schema, coarse context and time buckets, explicit inspect/export/
delete operations, and no network adapter. The validator captures canonical
fixed-key snapshots and accepts only the closed v1 `0.45.0` producer
coordinate; the bounded JSONL store rejects symlink, hard-link, and
filesystem-equivalent export aliases, honors the sibling lock across every
lifecycle operation, validates and appends through one descriptor, exports
by private atomic replacement, and checks inode identity before deletion.
Unsupported no-follow semantics fail closed. The existing usage
beacon cannot carry outcome events. Any future outcome transport requires a
separate privacy and authorization decision.

## Planned Memory capability flow

The Memory capability must extend the existing deterministic model in bounded
stages. M0 stops at local compilation and offline coverage:

```text
registered root/package JSON bytes
          │
          ▼
 explicit registered byte arrays
          │
          ▼
 local Memory projection
 four declared package facts │ conflicts
          │
          ▼
 bounded target-labelled previews
          │
          ▼
 exact 3/9/27 offline conformance vector

future live agents and Lock policy require separate ADRs
```

`MEM-001` has locally qualified and locally checkpointed the complete private
M0 across Slices A-C. Revision 68 makes its focused
[requirement-to-test contract](./decisions/memorybrick-m0-acceptance.md) the
sole active behavioral authority under the accepted
[M0 ADR](./decisions/memorybrick-m0.md). Pinned
[registry v2](./decisions/memorybrick-m0-registry-v2.json) and the exact
[benchmark vector v2](./decisions/memorybrick-m0-benchmark-vector-v2.json)
remain fixed test data. A trusted private request carries untrusted
root/package-manifest bytes into bounded JSON parsing, four declared fact
families, immutable projection, target-independent selection, three previews,
and one internal deterministic conformance result. Structure v5 stays
unchanged. M0 defines no public hostile-host-object API, static-module parser,
filesystem acquisition, live client/provider, credentials, persistence,
retention, or deletion. The former numeric review-score gate is retired;
Revision 69 records the owner's **Accept Slice A** decision and green local
profile/parser receipt. Revision 70 separately authorized the private
compiler/projection Slice B, Revision 71 records its green local receipt,
Revision 72 authorized preview/exact-vector Slice C, and Revision 73 records
the complete local M0 receipt. Revision 74 authorizes exactly one local
checkpoint commit and no remote or public action. The proof is deterministic
local fixture conformance only. Any filesystem adapter, source parser, live agent, durable
store, or live outcome evaluation needs separate authority.

A durable `.usebrick/` store, required-field schema migration, new package,
automatic approval path, or in-place native instruction-file writer remains a
separate future decision with its own ownership and compatibility plan.

## RenderBrick Labs boundary

Rendered evidence is not part of the current scan data path. `LABS-001` may
compare a source-only agent with the same agent given Playwright/Chrome
screenshots and runtime evidence, plus an existing visual-testing baseline
where available. The benchmark must use fixed defects, blind scoring, the same
model and time budget, and incremental detection and false-positive measures.

If rendered evidence adds no material value, the experiment stops. This Labs
path does not authorize a Chromium fork, standalone browser, workspace package,
runtime integration, or customer-facing capability claim.

## Release and deployment boundary

The normal SlopBrick publish path is:

1. review the release version and CHANGELOG;
2. run recursive typecheck, full tests, build, packed-consumer checks, and the
   package-local self-scan;
3. push the reviewed release commit and exact tag;
4. publish a GitHub Release for that tag;
5. let `publish.yml` verify one checksum-bound tarball and publish it with npm
   OIDC provenance after the environment gate;
6. verify the registry and a clean consumer install.

A tag push alone does not publish. Local `npm publish` and `pnpm publish` are
unsupported. The website deployment has its own owner/SHA verification and
must not be inferred from package publication.

The guarded `workflow_dispatch` entry is a recovery path: it accepts an exact
existing release tag and then runs the same validation and publishing
workflow. It does not make arbitrary refs or local package publication valid.

## Planning and evidence hierarchy

```text
ROADMAP.md                       product outcomes and sequencing
    ↓
docs/execution/index.json        live status and dependency authority
    ↓
docs/execution/plans/*.md        bounded executable work
    ├── frozen specifications    technical contracts
    └── immutable evidence       proof of completed checks
```

Historical plans, handoffs, release notes, and calibration receipts remain
valuable evidence. They must retain their original scope and dates rather than
being rewritten as current status.

## Historical references

- [`packages/slopbrick/CHANGELOG.md`](../packages/slopbrick/CHANGELOG.md) —
  package release history.
- [`docs/superpowers/specs/`](./superpowers/specs/) — design contracts and
  architecture decisions.
- [`packages/slopbrick/docs/calibration/`](../packages/slopbrick/docs/calibration/)
  — calibration protocols and evidence.
- [`docs/archive/`](./archive/) — recoverable superseded narrative plans.
