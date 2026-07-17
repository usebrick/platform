# Usebrick Roadmap Consolidation Design

**Date:** 2026-07-17  
**Status:** Approved for implementation  
**Owner:** usebrick platform  

## Objective

Replace the scattered, append-only planning surface with one product roadmap,
one machine-readable execution index, bounded active plans, an append-only
planning changelog, and a recoverable archive. A waiting dependency may delay
one milestone, but it must never make the whole project wait.

## Problem

The repository currently mixes four different kinds of document:

1. product strategy;
2. active execution instructions;
3. frozen technical specifications; and
4. historical evidence.

The largest documents combine several of these roles. The current continuation
plan is more than 7,000 lines, the historical handoff is more than 2,600 lines,
and the SlopBrick package roadmap still describes the older v0.7-v0.10 product
strategy. Mutable test counts and status statements are repeated across files,
and the plan-audit hashes no longer describe the current bytes.

This makes one externally waiting calibration lane look like a project-wide
blocker and makes it difficult to identify the next executable task.

### Corpus-authority correction

The v10.3 source bytes are local. The missing `authority/`, static-ledger, and
witness trees are generated metadata, not evidence that must arrive from an
external party. Treating their absence as an external dependency was a planning
error.

The v10.3 admission protocol is retained as historical engineering evidence,
but it is not the only legitimate definition of a calibration corpus. The
replacement v1 corpus uses a smaller source-attested contract: publisher
metadata, immutable input bytes, explicit label mapping, per-unit hashes,
license and source records, family-aware splits, leakage checks, and a
reproducible build receipt. It does not require invented reviewer identities,
an externally published local bundle, or an authority tree whose only purpose
is to approve artifacts produced by the same local workflow.

## Chosen approach

Use an archive-and-redirect migration with portfolio scheduling.

- Archive superseded narrative plans instead of deleting their history.
- Keep hash-bound v10.3 specifications and review evidence at their exact
  paths.
- Replace high-inbound legacy roadmap paths with compatibility redirects.
- Separate strategy, live status, executable plans, specifications, and
  evidence.
- Schedule independent execution lanes instead of one linear release train.

Deleting old plans was rejected because it would destroy useful provenance and
break links. Merely adding more supersession notices was rejected because it
would preserve the current ambiguity and document growth.

## Canonical authority hierarchy

```text
ROADMAP.md
  Product direction, outcomes, product roles, Now/Next/Later
        |
        v
docs/execution/index.json
  Live portfolio status, priority, dependencies, next executable item
        |
        v
docs/execution/active/*.md
  Bounded scope, acceptance criteria, commands, rollback, next action
        |
        +--> frozen specifications define contracts
        +--> evidence records prove completed work
```

Authority rules:

- `ROADMAP.md` is the sole strategic roadmap.
- `docs/execution/index.json` is the sole live status and dependency authority.
- Active plans describe work; they do not redefine product strategy.
- Frozen specifications define contracts; they do not report current progress.
- Evidence documents record results; they do not choose the next task.
- `docs/execution/CHANGELOG.md` records every plan addition, supersession,
  priority change, and status transition.
- README, architecture, package documentation, and calibration navigation link
  to this authority hierarchy instead of carrying independent roadmaps.

## Product model

Usebrick's canonical thesis is:

> Usebrick keeps AI-generated software coherent.

The product roles are:

| Product | Role | Current boundary |
| --- | --- | --- |
| SlopBrick | Free scanner and acquisition wedge | Shipped product; continue quality, UX, evidence tiers, and repository-aware analysis. |
| MemoryBrick | Repository-owned intelligence substrate | Begin with ADR, threat model, read-only projection, freshness, adapters, and evaluation. |
| Pick flow | `usebrick init` and policy authoring | Fold into onboarding; do not market as a separate product now. |
| LockBrick | Deterministic new-drift enforcement | Build the MVP inside the existing CLI before extracting a package. |
| MendBrick | Deterministic, reversible repair | Start only after detection and enforcement are trusted. |
| Telemetry | Privacy-safe global calibration flywheel | Local and inspectable first; no raw source by default. |

MemoryBrick means repository-owned verified memory, not vendor/model memory,
chat history, embeddings, or RAG. Existing Repository Structure schemas remain
the deterministic substrate; no `.usebrick/` migration occurs before an ADR.

## Portfolio status model

Allowed plan statuses:

- `draft`
- `ready`
- `in_progress`
- `waiting_external`
- `done`
- `parked`
- `superseded`
- `cancelled`

Allowed global statuses:

- `advancing` — at least one plan is `ready` or `in_progress`;
- `at_risk` — an important milestone waits externally, but executable work
  remains; and
- `paused` — no safe executable plan exists anywhere.

`blocked` is not a valid global or plan status.

Dependency types:

- `requires` — the dependent plan consumes an output and cannot proceed without
  it;
- `external_gate` — evidence or approval outside local execution, attached only
  to the affected milestone;
- `benefits_from` — useful but not required; and
- `conflicts_with` — work that cannot safely run concurrently.

Only `requires` affects ordinary scheduling.

Every `waiting_external` plan must record:

- the exact missing input;
- the responsible owner;
- the most recent verification date and evidence path;
- an objective resume condition;
- a read-only recheck command; and
- `parallel_safe` plan IDs that can continue immediately.

The scheduler rule is mandatory:

> When a lane enters `waiting_external`, preserve its evidence and immediately
> select the highest-priority `ready` task from another lane.

## Independent execution lanes

### Corpus v1 reconstruction and calibration

Active locally. Preserve the v10.3 tree until the replacement passes, build v1
from source-attested material already present under
`/Users/cheng/corpus-expansion`, verify every projected byte and label, group
related problems into one split, quarantine exact/normalized/near cross-label
overlap, and emit a balanced manifest plus reproducible receipt. AI is positive
and human is negative.

The initial seed is Mendeley `HumanVSAI_CodeDataset` version 1: 10,000 locally
materialized records with dataset metadata reporting 5,000 AI and 5,000 human
examples, AI sources ChatGPT-3.5/ChatGPT-4, human source CodeNet, and CC BY 4.0
dataset metadata. Its label authority is explicitly `source_attested`, not a
claim of independently witnessed authorship. The v1 build decides the final
eligible count after leakage, family, quality, and privacy checks.

After v1 verification, run a deterministic 100 plus 100 smoke, a balanced main
calibration/holdout split, and the SlopBrick calibration report. Only then may
the old v10.3 corpus be moved to a dated archive. Release and publication still
require their ordinary explicit authorization; corpus construction does not.

### SlopBrick product quality

Active independently of corpus authority. Work includes scan/report trust,
evidence tiers, visual/frontend taxonomy, baseline and new-finding UX, and
repository-role context. No uncalibrated signal is silently activated or used
to change a canonical verdict.

### MemoryBrick M0/M1

Ready independently. Work includes the store-location ADR, threat/privacy
model, a read-only projection of existing artifacts, deterministic freshness,
bounded managed agent instructions, and cross-agent evaluation.

### LockBrick delta MVP

Ready independently. Productize "do not introduce new critical slop" using
deterministic findings and fresh approved policy. Reuse the existing CLI,
constitution, diff, and threshold primitives before considering extraction.

### Telemetry and evaluation

Ready for specification and local implementation. Define an opt-in,
inspectable, exportable, deletable event contract without raw source or
proprietary repository identifiers by default. Hosted collection waits for
privacy and adoption evidence.

### Website and adoption

Ready locally. Align the public hierarchy, publish truthful benchmark methods,
and keep live deployment behind its separate authorization gate.

### MendBrick

Parked until LockBrick findings have demonstrated sufficient precision. Begin
with deterministic, reversible transformations and verify each repair through
the scanner and repository tests.

## Target file structure

```text
ROADMAP.md
docs/
├── execution/
│   ├── README.md
│   ├── index.json
│   ├── STATUS.md
│   ├── CHANGELOG.md
│   └── active/
│       ├── PLAT-001-planning-control.md
│       ├── CORPUS-001-v1-rebuild.md
│       ├── SB-045-release-candidate.md
│       ├── SB-UX-001-scan-report-trust.md
│       ├── MEM-001-memorybrick-m0.md
│       ├── LOCK-001-delta-enforcement-mvp.md
│       └── TEL-001-outcome-telemetry.md
└── archive/
    ├── README.md
    ├── MANIFEST.json
    └── plans/2026-07/
scripts/
└── validate-plans.mjs
```

## Pruning and preservation policy

### Preserve at exact paths

These are frozen contracts or audit evidence:

- `packages/slopbrick/docs/calibration/v10.3-corpus-source-admission-plan.md`
- `packages/slopbrick/docs/calibration/v10.3-release-asset-materialization-plan.md`
- `.superpowers/sdd/` review and receipt documents
- `specs/IMPACT_LATEST.md`

The new execution index references them as specifications or evidence, never as
live status authorities.

### Freeze and stop extending

- `packages/slopbrick/docs/calibration/v0.45.0-continuation-plan.md`
- `packages/slopbrick/docs/calibration/v0.45.0-handoff.md`
- `packages/slopbrick/docs/calibration/v0.45.0-execution-evidence.md`
- `.superpowers/sdd/progress.md`

Current status and next actions move into `docs/execution/`. These files remain
recoverable historical evidence and receive no future status appendices.

### Archive narrative plans

- the old contents of `packages/slopbrick/ROADMAP.md`;
- `packages/slopbrick/docs/calibration/master-plan-v0.45.md`;
- `packages/slopbrick/docs/calibration/plan-validation-2026-07-09.md`;
- `packages/slopbrick/docs/calibration/v10.2-plan.md`;
- `packages/slopbrick/docs/research/v0.18.8-plan.md`;
- `packages/slopbrick/docs/research/v0.18.9-plan.md`;
- `packages/slopbrick/docs/research/v9-plan.md`;
- `packages/slopbrick/docs/research/v9-plan-2026-07-02-update.md`; and
- completed `docs/superpowers/` design and plan capsules that no longer direct
  work.

High-inbound paths receive small compatibility redirects. Archive metadata
records the original path, Git blob ID, content SHA-256, archive path,
superseding plan ID, date, and reason.

### Reconcile navigation

Update these documents to point to the new authority hierarchy:

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/calibration/README.md`
- `docs/calibration/v0.45-continuation.md`
- `packages/slopbrick/ROADMAP.md`
- `packages/slopbrick/docs/calibration/README.md`
- `packages/slopbrick/docs/calibration/artifact-classification.md`
- `specs/PLAN-AUDIT_LATEST.md`

## Machine-readable execution index

`docs/execution/index.json` contains:

- schema/version and revision;
- global status;
- updated date;
- ordered plan entries;
- stable plan ID, title, path, lane, status, and priority;
- `requires`, `external_gate`, `benefits_from`, `conflicts_with`, and
  `parallel_safe` edges;
- the current next action; and
- evidence or resume metadata where applicable.

The index contains status, not duplicated mutable test or corpus counts. Those
belong in `STATUS.md` and immutable evidence links.

## Validation

`node scripts/validate-plans.mjs` must:

1. reject unknown statuses, duplicate IDs, or a global `blocked` state;
2. verify every indexed plan exists and every active plan is indexed;
3. verify `requires` dependencies exist and are acyclic;
4. require scope, non-goals, success criteria, commands, rollback, evidence
   destination, and next action in executable plans;
5. require complete resume and `parallel_safe` metadata for
   `waiting_external` plans;
6. require at least one executable plan while global status is `advancing`;
7. verify preserved specification hashes recorded in the index;
8. verify archive manifest paths, blobs, and content hashes;
9. ensure planning changelog revision matches the execution-index revision;
10. reject active-navigation links to superseded plans except as explicit
    evidence/archive citations;
11. warn about mutable counts and absolute user paths in active plans;
12. verify required roadmap pointers; and
13. run cleanly alongside `git diff --check`.

## Migration sequence

1. Create the root roadmap, execution authority files, active lane plans, and
   validator.
2. Capture archive metadata from the original tracked bytes.
3. Archive narrative plans and create compatibility redirects where inbound
   links require them.
4. Reconcile README, architecture, calibration indexes, artifact
   classification, and the plan audit.
5. Run the plan validator, Markdown-link checks, JSON parsing, and
   `git diff --check`.
6. Record the migration in the planning changelog and commit the documentation
   control plane.
7. Mark `PLAT-001` done and immediately begin `CORPUS-001`; build and verify the
   replacement v1 corpus before archiving v10.3. `SB-UX-001`, `MEM-001`, and
   `LOCK-001` remain parallel-safe if a corpus operation is long-running.

## Success criteria

- One discoverable strategic roadmap exists.
- One machine-readable file owns live plan status and dependency edges.
- Active plans contain no historical execution narrative.
- Frozen specifications and evidence remain recoverable and hash-verifiable.
- Legacy high-inbound paths resolve to the current authority or an archive
  record.
- Current documentation describes corpus reconstruction as local executable
  work, not an external blocker.
- The validator reports at least one `ready` or `in_progress` plan.
- README and architecture describe the same product hierarchy as the roadmap.
- The planning changelog records the migration and every subsequent status
  transition.
- JSON parsing, link validation, the plan validator, and `git diff --check`
  pass.

## Non-goals

- No corpus labels, manifests, verdicts, or calibration thresholds change.
- No release, publish, deployment, push, or remote state changes.
- No `.usebrick/` schema or migration is implemented before the ADR.
- No standalone PickBrick package or marketing surface is created.
- No hosted telemetry backend is created.
- No arbitrary AI repair system is started.
- No frozen v10.3 contract is weakened to make a status appear green.

## Rollback

The migration is documentation-only and Git-reversible. Archived originals are
retained byte-for-byte with blob IDs and SHA-256 values. Reverting the migration
commit restores the previous navigation; no product, corpus, release, or remote
state is changed.
