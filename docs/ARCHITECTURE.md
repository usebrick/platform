# usebrick architecture

**Updated:** 2026-07-17
**Status:** Current product and package reference

Usebrick keeps AI-generated software coherent. Vibe coders and AI-assisted
builders enter through SlopBrick: a local scanner that answers whether a
working application is also coherent, maintainable, accessible, and aligned
with its repository. Teams can later reuse the same verified repository
understanding for policy enforcement and repair.

Product direction lives in [`ROADMAP.md`](../ROADMAP.md). Live implementation
status and dependency edges live in
[`docs/execution/index.json`](./execution/index.json), not in this reference.

## Product layers

```text
                           usebrick
              quality and coherence for AI-built software
                                │
                 repository-owned understanding
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
    SlopBrick               LockBrick              MendBrick
  detect and explain     prevent new drift       repair trusted drift
        │                       │                       │
        └───────────────────────┴───────────────────────┘
                                │
                         MemoryBrick substrate
                facts, intent, provenance, freshness
```

| Layer | Architectural role | Delivery boundary |
| --- | --- | --- |
| **SlopBrick** | Deterministic local scanning, evidence, scores, repository artifacts, MCP, and CI primitives | Shipping; the main entry point |
| **MemoryBrick** | Repository-owned model of observed facts, declared intent, rationale, evolution, provenance, and freshness; compiler for bounded agent context | Planned; starts as a read-only projection of existing artifacts before any new store or schema migration |
| **Pick flow** | Initialisation and policy authoring | Part of onboarding, not a separate package or product surface |
| **LockBrick** | Deterministic enforcement of approved policy and newly introduced slop | First planned paid team layer; begin inside the existing CLI |
| **MendBrick** | Deterministic and reversible repairs for findings teams already trust | Later; no arbitrary repository-wide AI refactoring |

MemoryBrick is not vendor-owned chat history, a transcript archive, or an
unbounded vector store. The repository remains the authority, memory changes
must be reviewable, and agents may propose rather than silently author
normative facts.

## Verified delivery state

- Latest verified npm release: `slopbrick@0.43.0`.
- Published generated catalog: 103 rules in 22 categories.
- Known drift: npm registry metadata says 24 categories; that metadata is not
  the catalog truth and must be corrected in the next publication.
- Workspace candidate: unreleased `0.45.0`, 119 rules in 27 categories.
- Historical calibration: v10.1 analyzed 576,750 files from 581,550 sampled
  paths; that result is not current v10.3 admission evidence.
- Current v10.3 admission: zero admitted units.

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

## Persistence and network boundary

A normal scan is local-first but stateful:

- repository artifacts are written under `.slopbrick/` unless their configured
  persistence is disabled;
- local flywheel scan history is enabled by default and can be disabled with
  `--no-telemetry` or `telemetry: false`;
- the incremental cache and baseline are written only when their relevant
  options are used;
- managed `AGENTS.md` or `CLAUDE.md` blocks are rewritten only with
  `--refresh-snippets` or the corresponding explicit configuration.

Outbound usage reporting is off by default. A scan sends the one-shot beacon
only when both `--report-usage` and `SLOPBRICK_TELEMETRY_ENDPOINT` are present.
`watch`, `ci`, and programmatic `scanProject` do not send that beacon through
this path. Network failure does not change the scan exit code.

These local and outbound mechanisms are separate. `--no-telemetry` disables
the local flywheel; it is not a generic read-only mode.

## Future MemoryBrick flow

MemoryBrick must extend the existing deterministic model in bounded stages:

```text
code + config + approved docs and decisions
                    │
                    ▼
        repository-owned memory model
 observed facts │ declared intent │ rationale │ evolution
                    │
          provenance + freshness
                    │
          ┌─────────┴──────────┐
          ▼                    ▼
  native agent adapters   LockBrick policy
  boot/scoped/on-demand   deterministic CI
```

The first stage is read-only projection and evaluation. A new `.usebrick/`
store, schema migration, or instruction-file writer requires its own ADR,
threat model, ownership rules, and compatibility plan.

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
