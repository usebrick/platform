# Corpus source-use routing and owner-validation design

- **Status:** approved by the repository owner on 2026-07-18
- **Date:** 2026-07-18
- **Repository:** `usebrick/platform`
- **Primary package:** `packages/slopbrick`
- **Supersedes for new work:** binary source-blocking interpretations and the
  near-term five-participant GTM execution path
- **Does not rewrite:** frozen v10.3 evidence, completed Corpus v1 receipts,
  completed CAL-001 receipts, or historical release plans

## Goal

Make every reviewed source usable at the strongest claim its evidence supports
without requiring every source to satisfy a single gold-admission gate. Preserve
the current Mendeley Corpus v1 hashes and internal-analysis results, separate
source eligibility from rule activation and redistribution, and align all
active documentation with the repository owner's sole-tester workflow.

## Current truth

The pinned Mendeley `HumanVSAI_CodeDataset` v1 projection is already sufficient
for bounded internal origin analysis at authority tier `publisher_attested`:

- 10,000 source-bound rows and files;
- 5,000 publisher-declared AI positives and 5,000 publisher-declared Human
  negatives;
- exact source/archive/CSV/projection hashes;
- deterministic family-aware train, validation, and test splits;
- zero unresolved exact or normalized cross-label collisions;
- deterministic 100-positive/100-negative smoke output; and
- a successful 10,000-row one-worker calibration holdout.

The source is not independently witnessed authorship, redistribution approval,
or proof of code quality. Those limitations constrain claims and uses; they do
not make the source unusable for the internal purpose already accepted by the
Corpus v1 ADR.

The phrase `non-admitting` is currently overloaded across documentation. It can
mean any of the following:

1. the source is not v10.3 gold evidence;
2. the source bytes cannot be redistributed;
3. a measured rule has not passed usefulness review; or
4. a rule decision has not been applied.

This design separates those states so one does not block the others.

The repository owner is the only current product tester. No participant
recruitment, scheduling, consent collection, or five-pilot gate belongs on the
active execution path. Future team or market-demand evidence remains explicitly
unproven and cannot be inferred from owner testing.

## Decision

Adopt evidence-tiered source-use routing inside SlopBrick's Corpus v1 boundary.
A source has independent authority, integrity, and rights dispositions. A pure
policy function derives its permitted uses and claim ceiling. Source adapters
verify source-specific evidence but cannot widen policy.

Keep `@usebrick/core` unchanged. This is a SlopBrick calibration policy and
execution-document convergence, not a new cross-package repository-structure
schema.

Keep the current Mendeley path operational and byte-for-byte reproducible. Add
new sources only through source-specific adapters and independently reviewed
evidence. Do not revive the v10.3 two-reviewer machinery as a prerequisite for
Corpus v1 internal analysis.

Park `GTM-001` rather than deleting its consent-safe protocol. Replace its
near-term dependencies with owner-run validation. Preserve future team and
enterprise demand gates as parked, externally unproven work.

The execution artifacts introduced by this change are named explicitly:

- `CORPUS-002` — `docs/execution/plans/CORPUS-002-source-use-routing.md`, with
  evidence at `docs/execution/evidence/CORPUS-002-source-disposition.md`;
  implements evidence-tiered source-use routing, requires `CORPUS-001`, and
  preserves the completed CAL-001 inputs and outputs.
- `VAL-001` — `docs/execution/plans/VAL-001-owner-validation.md`, with evidence
  at `docs/execution/evidence/VAL-001-owner-validation.md`; runs owner-only
  scan, usefulness, fix, and rescan validation, requires `CAL-001`, and
  benefits from `CORPUS-002`.

`SB-UX-001`, `TEL-001`, and `LOCK-001` may benefit from `VAL-001`; none may
require or benefit from `GTM-001` after convergence. `ENT-001` remains parked
behind `LOCK-001` and explicit future external-demand evidence. Owner testing
cannot satisfy that demand gate.

## Source-state model

### Authority tier

| Tier | Meaning | Maximum source use |
| --- | --- | --- |
| `witnessed` | Exact generation or human-submission evidence is bound to the unit | High-confidence origin evaluation; redistribution only with separate rights approval |
| `publisher_attested` | A versioned publisher supplies the origin label and immutable bytes can be bound | Internal origin measurement and calibration evaluation; redistribution only with separate rights approval |
| `repo_self_attested` | An owner-controlled repository statement describes the repository as AI-built | Ecological validation; not fitted origin ground truth |
| `exposure_proxy` | Era, tooling, or exposure evidence supports a sensitivity cohort only | Sensitivity analysis |
| `unknown` | No adequate origin statement exists | Unlabeled prevalence analysis |

Directory names, repository age by itself, topics, agent files, commit velocity,
code style, perceived quality, and SlopBrick scores never create an authority
tier.

### Integrity status

| Status | Meaning |
| --- | --- |
| `verified` | Source identity, version, evidence references, and required hashes reconcile |
| `pending` | Evidence exists but the adapter or required immutable materialization is incomplete |
| `quarantined` | A source-wide identity, version, evidence, or integrity check failed |

Unit-level mismatches remain unit or family quarantines in the existing planner;
they do not silently downgrade the whole source unless a source-wide invariant
fails.

### Rights disposition

| Disposition | Meaning |
| --- | --- |
| `internal_analysis` | Exact bytes may be used locally for the accepted internal purpose; no redistribution claim |
| `reference_only` | Metadata and evidence may be retained, but source units do not enter an executable corpus |
| `redistribution_approved` | A separate rights review approved the exact intended redistribution |

The router never infers redistribution from a repository license, dataset card,
or source availability. Redistribution remains a separate decision.

### Permitted uses

The router derives a sorted, duplicate-free set from the three source axes:

- `origin_measurement`
- `calibration_evaluation`
- `ecological_validation`
- `sensitivity_analysis`
- `prevalence_analysis`
- `redistribution`

The minimum routing policy is:

| Authority | Integrity | Rights | Permitted use |
| --- | --- | --- | --- |
| `witnessed` or `publisher_attested` | `verified` | `internal_analysis` | origin measurement and calibration evaluation |
| `witnessed` or `publisher_attested` | `verified` | `redistribution_approved` | origin measurement, calibration evaluation, and redistribution |
| `repo_self_attested` | `verified` | `internal_analysis` | ecological validation |
| `exposure_proxy` | `verified` | `internal_analysis` | sensitivity analysis |
| `unknown` | `verified` | `internal_analysis` | prevalence analysis |
| any | `pending` or `quarantined` | any | no executable corpus use |
| any | any | `reference_only` | no executable corpus use |

No source or adapter may grant a use outside this table. A later expansion of
the table requires an explicit policy revision and tests.

## Initial source dispositions

| Source | Initial disposition | Current use |
| --- | --- | --- |
| Mendeley HumanVSAI v1 | `publisher_attested`, `verified`, `internal_analysis` | Origin measurement and calibration evaluation |
| FormAI v1 bounded projection | `repo_self_attested`, `pending`, `internal_analysis` | No current executable use; positive sensitivity analysis only after a dedicated adapter verifies the source |
| OSSForge HumanVsAICode | `publisher_attested`, `pending`, `reference_only` | Evidence reference only until upstream rights and row lineage close |
| Controlled HumanEval GPT-5 cohort | `witnessed`, `pending`, `reference_only` | Existing diagnostic evidence only until immutable materialization is supported |
| Legacy v10.3 register and corpus | historical quarantine evidence | No Corpus v1 fitting or release-calibration use |
| Ordinary recent repositories | `unknown` when integrity is verified | Unlabeled prevalence analysis only |
| Explicitly self-attested vibe-built repositories | `repo_self_attested` when integrity is verified | Ecological validation only |

Only Mendeley is routed into the initial executable Corpus v1 implementation.
The remaining rows document claim ceilings and extension points; they do not
authorize acquisition, materialization, or new corpus membership.

## Components

### 1. Source policy

A new pure SlopBrick module owns source-state types, the routing table, claim
ceilings, and deterministic disposition derivation. It performs no filesystem,
network, process, or clock access.

Implementation path:
`packages/slopbrick/src/calibration/corpus-v1/source-policy.ts`.

### 2. Source registry

A small SlopBrick-owned registry identifies supported Corpus v1 source adapters
and their reviewed policy input. The registry is not a discovery mechanism:
directory presence cannot register a source, and an unknown source fails
closed.

Implementation path:
`packages/slopbrick/src/calibration/corpus-v1/source-registry.ts`.

### 3. Source adapters

Each adapter verifies source-specific immutable inputs and emits the existing
normalized candidate fields plus a source disposition. The current inventory,
manifest, and raw-CSV source-binding behavior form the Mendeley adapter. Future
adapters are separate bounded changes with their own fixtures and real-source
opt-in tests.

### 4. Corpus planner and projections

The existing collision, family, split, smoke, and eligible-projection logic
remains the authority for unit-level eligibility. It receives only sources
whose requested use is permitted. Source routing does not bypass collision or
family quarantine.

### 5. Evaluation pipeline

Calibration consumes the eligible projection and records origin measurements.
It cannot change source authority, rights, permitted uses, rule defaults, or
release state.

### 6. Owner review ledger

A new owner-only validation plan records deterministic scan-to-finding-to-fix-
to-rescan walkthroughs and the owner's rule-usefulness decisions. It contains
no participant identity, consent, scheduling, recruitment, or synthetic pilot
claim. Missing owner review leaves a measured rule unapplied.

## Data flow

```text
pinned bytes + source evidence
  -> source-specific verifier
  -> normalized source disposition
  -> permitted-use router
  -> candidate rows
  -> content/family/collision planner
  -> deterministic smoke and eligible projection
  -> calibration measurements
  -> owner usefulness review
  -> explicit rule decision
  -> optional application in a later authorized change
```

Authority flows in one direction. Evaluation results cannot upgrade source
labels, owner review cannot grant redistribution, and source eligibility cannot
activate a rule.

## Failure behavior

- An unknown source ID or unsupported policy combination rejects the requested
  use before candidate rows are consumed.
- A source hash, version, publisher-label, or evidence-reference mismatch
  quarantines that source generation.
- A unit content mismatch, invalid UTF-8 payload, or cross-label collision
  quarantines the unit and related family under existing planner rules.
- Unclear redistribution rights force `internal_analysis` or `reference_only`;
  they never become `redistribution_approved` by default.
- Fewer than 100 unique eligible units in either polarity produces an explicit
  unavailable-cohort result; it never substitutes duplicates or weaker labels.
- Missing owner usefulness review preserves measurements and keeps
  `applied: false`.
- Failure of one source does not stop SlopBrick, the website, MemoryBrick, or
  any independently valid source.

## Testing

### Pure policy tests

- Cover every authority, integrity, rights, and requested-use combination.
- Reject unknown enum values, duplicate permitted uses, and manual widening.
- Prove deterministic ordering and byte-identical results for identical input.
- Place focused coverage in
  `packages/slopbrick/tests/calibration/corpus-v1-source-policy.test.ts`.

### Adapter contract tests

- Reuse portable fixtures for source identity, evidence, label, and hash drift.
- Mutate archive, CSV, projection, publisher label, source version, and rights
  evidence independently and require fail-closed results.
- Require adapters to emit the same normalized shape without source-specific
  exceptions in downstream code.

### Corpus pipeline tests

- Preserve existing collision, family, split, smoke, and eligible tests.
- Prove that sensitivity, ecological, prevalence, pending, and reference-only
  sources cannot enter fitting or calibration evaluation.
- Prove that a permitted source still cannot bypass unit-level quarantine.
- Prove that source eligibility cannot change a rule's `applied` state.

### Real-source verification

- Keep the Mendeley test opt-in and one-worker.
- Preserve the current candidate, plan, source-binding, smoke, eligible,
  calibration-smoke, holdout, and decision-matrix hashes.
- Preserve read-only source access and before/after source metadata checks.

### Repository gates

- Run focused policy and Corpus v1 tests during development.
- Run `corepack pnpm plans:validate` and `git diff --check` for every docs
  checkpoint.
- Before completion, run recursive lint, typecheck, test, and build gates.

## Documentation convergence

"Update all docs" means every active document that presents current source,
calibration, pilot, dependency, or next-action truth. It does not mean rewriting
frozen evidence or historical plans to look current.

### Current authority and package docs to update

- `README.md`
- `ROADMAP.md`
- `docs/ARCHITECTURE.md`
- `docs/methodology.md`
- `docs/calibration/README.md`
- `docs/decisions/corpus-v1-admission.md`
- `packages/slopbrick/README.md`
- `packages/slopbrick/docs/calibration/README.md`
- current-status headers in
  `packages/slopbrick/docs/calibration/v0.45.0-continuation-plan.md`,
  `packages/slopbrick/docs/calibration/rule-quality-review.md`, and
  `packages/slopbrick/docs/calibration/rules-literature-and-recommendations.md`
- `packages/slopbrick/CHANGELOG.md`

These documents will state that Mendeley is accepted for publisher-attested
internal analysis, distinguish that use from v10.3 gold admission and public
redistribution, describe evidence-tier routing, and remove five-participant
pilots as a current gate.

### Execution authority to update

- `docs/execution/index.json`
- `docs/execution/STATUS.md`
- `docs/execution/CHANGELOG.md`
- `docs/execution/plans/CORPUS-DEC-001-admission-contract.md`
- `docs/execution/plans/CORPUS-001-v1-seed.md`
- `docs/execution/plans/CAL-001-heldout-calibration.md`
- `docs/execution/plans/GTM-001-vibecoder-pilots.md`
- `docs/execution/plans/SB-UX-001-first-scan.md`
- `docs/execution/plans/TEL-001-local-outcomes.md`
- `docs/execution/plans/LOCK-001-new-debt-gate.md`
- `docs/execution/plans/ENT-001-demand-gate.md`
- current parallel-work notes in `SB-045` and `DOC-PRUNE-001`
- `docs/research/vibecoder-pilots.md`

The execution update will:

1. add `CORPUS-002`, the bounded Corpus v1 source-routing implementation plan;
2. add `VAL-001`, the owner-only validation/usefulness plan;
3. park `GTM-001` with its completed consent-safe protocol preserved;
4. replace near-term `GTM-001` dependencies and benefits with owner validation
   where owner testing can supply the needed evidence;
5. keep enterprise and paid-team demand gates parked and explicitly unproven;
6. remove participant recruitment from current next actions; and
7. bump the execution-index revision and regenerate `STATUS.md` consistently.

After the coordinated edit, a repository-wide Markdown/JSON search for
`GTM-001`, participant recruitment, `non-admitting`, `v10.3`,
`publisher_attested`, and `publisher-attested` must be reviewed in full. Every
remaining occurrence must either agree with current authority or sit inside a
document explicitly marked historical, frozen, parked, or research-only. This
search-based closure catches live claims outside the enumerated files without
rewriting valid historical evidence.

### Evidence and historical documents to preserve

The following classes remain byte-for-byte historical evidence and will not be
rewritten:

- completed `CORPUS-001` and `CAL-001` evidence receipts and frozen protocol;
- the CAL-001 decision matrix;
- v10.3 admission, release-asset, and historical calibration plans;
- earlier v0.45 handoffs, continuation plans, and execution evidence;
- earlier Superpowers designs and implementation plans; and
- historical changelog entries.

Current navigation and status documents will identify those artifacts as
historical and point to the new source-routing and owner-validation authority.
The new SlopBrick changelog entry is additive; old entries are not rewritten.

## Rollout boundaries

### Slice 1: policy and Mendeley compatibility

- Add the pure source policy and registry.
- Route Mendeley through the policy.
- Preserve all current output hashes.
- Add focused tests.

### Slice 2: owner validation

- Add the owner-only validation plan and evidence template.
- Park GTM-001.
- Replace active pilot dependencies that are genuinely satisfied by owner
  testing.
- Do not claim market demand, team validation, or participant evidence.

### Slice 3: documentation convergence

- Update every active file listed above in one coordinated revision.
- Add supersession/current-authority links without modifying frozen evidence.
- Validate the execution index and docs links.

### Slice 4: optional future source adapters

FormAI, self-attested repositories, controlled HumanEval, OSSForge, and other
sources each require a separate approved adapter slice. This design records
their claim ceilings but does not acquire, promote, or materialize them.

## Non-goals

- No new source acquisition, network fetch, upload, or publication.
- No corpus redistribution approval.
- No v10.3 source, register, review, or evidence mutation.
- No new `@usebrick/core` schema or package version.
- No threshold, default-state, score, or rule activation change.
- No participant recruitment or invented pilot evidence.
- No claim that owner testing proves market demand or team usability.
- No rewrite of historical receipts or changelog history.

## Acceptance criteria

- The Mendeley source is explicitly usable for publisher-attested internal
  origin analysis and calibration evaluation.
- Every supported source has one deterministic disposition and claim ceiling.
- Unsupported or weaker sources cannot enter a stronger use lane.
- Existing Mendeley and CAL-001 hashes remain unchanged.
- Source use, redistribution, usefulness review, and rule application are
  represented as separate decisions.
- GTM-001 is parked, participant recruitment is absent from current next
  actions, and owner validation is the active testing path.
- `CORPUS-002` and `VAL-001` are the only new active plan IDs introduced by
  this convergence, and no active plan depends on `GTM-001`.
- Future team and enterprise demand remain unproven and parked.
- Every active documentation file listed in this design agrees on source,
  calibration, validation-owner, and next-action truth.
- Frozen evidence and historical plans remain unchanged.
- Focused tests, execution-doc validation, recursive quality gates, and
  `git diff --check` pass.
