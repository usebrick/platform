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

Recent GitHub code is not treated as a human-negative default. AI-tool exposure
is common enough that an undisclosed 2025+ repository is a mixed/unknown sample,
not evidence of human-only authorship. Conversely, GitHub is a useful positive
source when a repository owner explicitly says an application was built with an
AI coding tool. Corpus provenance therefore records evidence strength instead
of forcing every public repository into a false binary claim.

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
docs/execution/plans/*.md
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

Vibe coders and AI-assisted builders are the entry market and main product
door. SlopBrick must first answer their immediate question—"the app works, but
is it actually well built?"—with a useful local scan. The deeper platform is a
progression from individual diagnosis to repository memory, team enforcement,
and trusted repair; it must not make first use depend on adopting the whole
suite.

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

### Current truth boundary

- The latest verified npm release is `slopbrick@0.43.0`; its generated catalog
  contains 103 rules in 22 categories. Registry metadata saying 24 categories
  is known publication drift, not product truth.
- The workspace is an unreleased `0.45.0` candidate with 119 rules in 27
  categories.
- The candidate is a trust and reliability release. It adds no further rules,
  keeps unmeasured candidate signals default-off, and cannot claim current
  calibration from historical evidence.
- The v10.1 result covering 576,750 analyzed files is historical. Current v10.3
  admission contains zero admitted units.
- A valid whole-project scan with project memory enabled writes three canonical
  JSON snapshots (`inventory.json`, `constitution.json`, and `health.json`),
  derived `structure.md`, and a separate legacy/local `structure.json` run
  history. The run-history file is not the Structure-schema projection.
- Local flywheel scan history is enabled by default. Outbound reporting is off
  by default and requires both `--report-usage` and
  `SLOPBRICK_TELEMETRY_ENDPOINT`.
- MemoryBrick, LockBrick, and MendBrick are roadmap layers, not shipped
  standalone products.

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
- `externalGates` — evidence or approval outside local execution, attached only
  to the affected milestone;
- `benefitsFrom` — useful but not required; and
- `conflictsWith` — work that cannot safely run concurrently.

Only `requires` affects ordinary scheduling.

Every `waiting_external` plan must record:

- the exact missing input;
- the responsible owner;
- the most recent verification date and evidence path;
- an objective resume condition;
- a read-only recheck command; and
- a prose `parallel-safe` list of plan IDs that can continue immediately. This
  is required in the plan document when waiting; it is not currently a separate
  `index.json` field.

The scheduler rule is mandatory:

> When a lane enters `waiting_external`, preserve its evidence and immediately
> select the highest-priority `ready` task from another lane.

## Independent execution lanes

### Corpus v1 reconstruction and calibration

This lane preserves the v10.3 tree until the replacement passes, then builds v1
from source-attested material already present under
`/Users/cheng/corpus-expansion`, verify every projected byte and label, group
related problems into one split, quarantine exact/normalized cross-label
overlap, and emit a balanced manifest plus reproducible receipt. AI is positive
and human is negative.

The initial seed is Mendeley `HumanVSAI_CodeDataset` version 1: 10,000 locally
materialized records with dataset metadata reporting 5,000 AI and 5,000 human
examples, AI sources ChatGPT-3.5/ChatGPT-4, human source CodeNet, and CC BY 4.0
dataset metadata. Its label authority is explicitly `source_attested`, not a
claim of independently witnessed authorship. The v1 build decides the final
eligible count after bounded byte, label, collision, and family-split checks.

The ecological GitHub tranche follows immediately and remains part of Corpus
v1 without delaying use of the verified seed:

| Cohort | Corpus label | Evidence tier | Allowed use |
| --- | --- | --- | --- |
| Publisher-labeled AI rows | positive | `publisher_attested` | fit, validation, and test |
| Repository owner explicitly says the app was AI/vibe-built | positive | `repo_self_attested` | ecological validation and, after audit, fitting |
| 2025+ repository with AI-tool/topic signals but no explicit authorship statement | none | `ai_exposed` exposure proxy | sensitivity and prevalence only; never positive ground truth |
| Exact repository snapshot before GitHub Copilot's 2021-06-29 technical preview, without authorship evidence | none | `pre_llm_proxy` | temporal sensitivity analysis only; never human-ground-truth fitting |
| Ordinary recent repository without disclosure | none | `unknown_recent` | unlabeled prevalence only |

Topic membership, an agent configuration file, commit velocity, or a recent
creation date alone never upgrades a repository to `repo_self_attested`.
Positive application candidates must contain an owner-controlled README or
repository-description statement that the application itself was built with
AI. Tooling repositories, tutorials, awesome lists, prompt collections, and AI
products whose own implementation provenance is unstated are excluded from the
positive application cohort.

The first GitHub target is a frontend sensitivity tranche of at least 25
`repo_self_attested` positive repositories plus a matched set of 25 pre-LLM
temporal-proxy snapshots whose corpus label remains `none`, capped at 200
eligible source files per repository. This is not a balanced labeled dataset,
and the temporal proxies never act as human-negative fitting data. Files are
matched by language, framework, size, and application role; forks and
upstream-related repositories share one family; and every split occurs at
repository-family level. Each record binds repository URL, immutable commit
SHA, commit time, license identifier and license-file hash, evidence tier,
evidence-text hash, source path, byte count, and content SHA-256. A repository
without redistribution permission may remain a reference record but its bytes
cannot enter the materialized corpus.

Repository age is not authorship evidence. A pre-Copilot snapshot is useful for
temporal-confound analysis, but it cannot be promoted to the human-negative
class without separate source-attested provenance.

Origin and quality remain separate axes. AI-positive means AI-origin exposure;
it does not assert that every positive file is bad, and human-negative does not
assert that every negative file is good. SlopBrick rule usefulness must be
reported separately from origin-class discrimination so the scanner does not
learn only repository age, framework generation, or novice-project style.

After seed verification, run a deterministic 100 plus 100 smoke immediately.
The GitHub tranche can acquire in parallel and then adds repository-family
holdouts and temporal-confound reporting. Only after the standalone seed has
verified may the old v10.3 corpus be moved to a dated archive; that cleanup does
not wait for the GitHub tranche. Release and publication still require their
ordinary explicit authorization; corpus construction does not.

### SlopBrick product quality

This lane can progress independently of corpus acquisition. Its scope includes scan/report trust,
evidence tiers, visual/frontend taxonomy, baseline and new-finding UX, and
repository-role context. No uncalibrated signal is silently activated or used
to change a canonical verdict.

The v0.45 release-candidate lane is deliberately narrower than the complete UX
roadmap: reconcile exit decisions, prove finding-specific fixes are safe,
preserve durable baselines/new-debt behavior, repair public metadata drift, and
produce a truthful go/no-go packet. No new-rule expansion belongs in that
release.

### MemoryBrick M0/M1

This lane covers the store-location ADR, threat/privacy
model, a read-only projection of existing artifacts, deterministic freshness,
bounded managed agent instructions, and cross-agent evaluation.

### LockBrick delta MVP

This lane productizes "do not introduce new critical slop" using
deterministic findings and fresh approved policy. Reuse the existing CLI,
constitution, diff, and threshold primitives before considering extraction.

### Telemetry and evaluation

This lane defines an opt-in,
inspectable, exportable, deletable event contract without raw source or
proprietary repository identifiers by default. Hosted collection waits for
privacy and adoption evidence.

### Website and adoption

This lane aligns the public hierarchy, publishes truthful benchmark methods,
run at least five first-scan vibe-coder pilots, and keep live deployment behind
its separate authorization gate. Product interviews and local pilot materials
do not require a production deployment.

### MendBrick

This lane must not start until LockBrick findings have demonstrated sufficient precision. Begin
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
│   └── plans/
│       ├── PLAT-001-planning-control.md
│       ├── SB-045-trust-release.md
│       ├── CORPUS-DEC-001-admission-contract.md
│       ├── GTM-001-vibecoder-pilots.md
│       ├── CORPUS-001-v1-seed.md
│       ├── CAL-001-heldout-calibration.md
│       ├── SB-UX-001-first-scan.md
│       ├── TEL-001-local-outcomes.md
│       ├── MEM-001-read-only-m0.md
│       ├── LOCK-001-new-debt-gate.md
│       ├── MEND-001-repair-proof.md
│       └── ENT-001-demand-gate.md
└── archive/
    ├── README.md
    ├── MANIFEST.json
    └── plans/2026-07/
scripts/
└── validate-execution-docs.mjs
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
  work (excluding this approved consolidation design while its migration is in
  progress).

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

`specs/PLAN-AUDIT_LATEST.md` and other checksum-bound evidence remain unchanged
at their original paths and are cited as historical evidence, not navigation
authority.

## Machine-readable execution index

`docs/execution/index.json` contains:

- schema/version and revision;
- global status;
- updated date;
- ordered plan entries;
- stable plan ID, title, path, lane, status, and priority;
- `requires`, `externalGates`, `benefitsFrom`, and `conflictsWith` edges;
- the current next action; and
- evidence or resume metadata where applicable.

The index contains status, not duplicated mutable test or corpus counts. Those
belong in `STATUS.md` and immutable evidence links.

## Validation

`node scripts/validate-execution-docs.mjs` must:

1. reject unknown statuses, duplicate IDs, or a global `blocked` state;
2. verify every indexed plan exists and every active plan is indexed;
3. verify `requires` dependencies exist and are acyclic;
4. require scope, non-goals, success criteria, commands, rollback, evidence
   destination, and next action in executable plans;
5. require an exact input, owner, resume condition, and parallel-safe next work
   for any `waiting_external` plan;
6. require at least one executable plan while global status is `advancing`;
7. verify archive manifest paths, archived files, Git blob IDs, and SHA-256
   values against the archived bytes;
8. ensure `STATUS.md` and the planning changelog revision match the
   execution-index revision; and
9. verify required roadmap and execution-guide pointers.

The consolidation review also checks preserved specification hashes,
active-navigation references to superseded plans, mutable counts, unexplained
absolute host paths, Markdown targets, and `git diff --check`. Those checks are
currently review gates, not capabilities falsely attributed to the validator;
they can move into a separate documentation linter when their allow-list and
false-positive contract are specified.

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
7. Mark `PLAT-001` done and immediately begin `CORPUS-DEC-001`, `SB-045`, and
   `GTM-001` in separate lanes. Once the corpus contract decision is recorded,
   replace that slot with `CORPUS-001`; build and verify the replacement v1
   corpus before archiving v10.3. `SB-UX-001`, `MEM-001`, and `LOCK-001` remain
   parallel-safe if a corpus operation is long-running.

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
