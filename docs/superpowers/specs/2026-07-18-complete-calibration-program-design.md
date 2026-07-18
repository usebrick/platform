# Complete SlopBrick calibration program design

- **Status:** approved in sections by the repository owner on 2026-07-18
- **Date:** 2026-07-18
- **Repository:** `usebrick/platform`
- **Planning revision at design time:** 25
- **Implementation authority:** none until spec and detailed plan approval
- **Preserves:** frozen evidence, source-use limits, owner/release boundaries,
  and user-owned paths

## Reason for existence

The first-scan UX exposes Zipf and Heaps findings as calibrated, but the shown
precision values come from legacy signal-strength metadata. The completed
CAL-001 holdout correctly excludes those non-AI rules from origin metrics and
records their usefulness as not evaluated. This design finishes the complete
119-rule program without converting AI/human origin labels into quality labels
or forcing a rule activation.

## Goal

Give every shipped rule current, claim-matched evidence and one explicit policy
outcome. Evaluate quality usefulness and origin discrimination in separate
lanes, resolve all owner-review rows, merge the results atomically, preserve an
explicit production no-admission decision, and make the first-scan evidence
labels state their provenance precisely.

## Current truth

- CAL-001 is complete: 10,000/10,000 source-bound files succeeded across the
  frozen train, validation, and test splits with clear exact, normalized, and
  family-split leakage checks.
- Its 119-row matrix contains 47 `quality-only` rows and 72 AI-specific
  `default-off` rows. Forty AI-specific rows require an owner policy decision.
- The matrix is `applied: false` and `admitted: false`; usefulness is
  `not-evaluated` for every row.
- Zipf and Heaps are non-AI quality rules and therefore ineligible for CAL-001
  origin denominators. Their current first-screen calibration metadata does not
  establish current quality usefulness.
- Corpus v1 is publisher-attested and permitted for internal origin measurement
  and calibration evaluation. It is not witnessed authorship, quality ground
  truth, public redistribution authority, or production admission.
- `SB-UX-001` and `VAL-001` currently consume the two implementation WIP slots.
  The current main worktree also contains unstaged SB-UX documentation and
  preserved user-owned untracked paths.

## Decisions

| Topic | Approved decision |
| --- | --- |
| Program scope | Complete all 119 rule dispositions and UX provenance. |
| Architecture | Separate quality and origin evidence lanes, then one atomic application gate. |
| Reuse | Reuse frozen origin outputs only when every governing hash matches; otherwise rerun. |
| Quality sampling | Adaptive 30/30 finding/control review, expanding to 100/100 when inconclusive. |
| Owner review | Resumable local terminal workflow with four closed labels. |
| Admission | Apply reviewed quality policy while retaining explicit production `admitted: false`. |
| Git layout | Sequential checkpointed commits directly on `main`; no calibration worktrees. |
| WIP | Return `VAL-001` to `ready`; open one umbrella `CAL-002` plan beside active `SB-UX-001`. |
| Release | No push, tag, publish, deploy, or baseline refresh is authorized by this design. |

## Architecture

```text
Frozen CAL-001 holdout ---> CAL-O-002 origin lane ----+
                                                       +--> CAL-APPLY-001 --> rule policy + UX provenance
Quality evidence --------> CAL-Q-001 quality lane ----+
```

`CAL-002` is the execution-plan umbrella. `CAL-Q-001`, `CAL-O-002`, and
`CAL-APPLY-001` name internal artifact and execution phases, not three
concurrent WIP plans.

The lanes never share labels or denominators. The application gate accepts one
row per current rule ID, rejects missing or duplicate rows, and records the
lane that owns each claim.

## Lane membership and reclassification

The 47/72 split is the starting projection, not an irreversible taxonomy. An
AI-specific row may move to the quality lane only after explicit review finds a
quality claim rather than an origin claim.

Transferred rows remain default-off until quality evidence passes. Transfers
record prior classification, rationale, reviewer, hashes, and claim ceiling. A
row never enters both lane denominators in one matrix revision.

## Quality lane

The quality lane evaluates the initial 47 non-AI rules plus any explicitly
reclassified rows. It uses three evidence classes.

| Evidence class | Appropriate rules | Required evidence |
| --- | --- | --- |
| Deterministic or standards oracle | Security, WCAG, syntax, broken references, exact contract failures | Standards-backed cases, mutation pairs, and real-source controls with exact expected outcomes |
| Contextual quality review | Visual, architectural, performance, product, and repository-level findings | Blinded owner review of stratified findings and matched controls |
| Statistical review utility | Zipf, Heaps, entropy, distribution, and similar file-level signals | Review-target yield and burden; never defect or authorship precision |

Fixtures and mutations prove behavior, not corpus usefulness. Real-source
samples require family/language/size stratification. Paths never create labels.

### Review labels

The owner terminal accepts exactly:

1. `actionable-defect`
2. `useful-no-safe-fix`
3. `not-useful`
4. `cannot-determine`

`cannot-determine` is excluded from positive and negative denominators and
reported separately. It is never coerced to a failure or success.

### Adaptive sampling

Each contextual or statistical rule starts with 30 deterministic finding
samples and 30 matched controls across at least five repository families when
the available source population permits it. The reducer computes uncertainty
and expands an inconclusive rule to at most 100 findings and 100 controls.

Insufficient source reach or unresolved uncertainty produces
`insufficient-evidence` or `quality-advisory`. Completion records that outcome;
it does not manufacture a calibrated verdict.

## Origin lane

Origin owns only reviewed AI-origin claims. Reuse requires exact protocol,
source, split, scanner, config, catalog, receipt, metrics, and reducer hashes;
any mismatch triggers a deterministic one-worker rerun.

Publisher polarity remains internal diagnostic evidence, not authorship proof.
Single-source data plus missing framework/semantic/era buckets cannot authorize
production origin claims. Remaining origin rules stay default-off; alternatives
are retire, hold for evidence, or reviewed transfer to quality.

This resolves all 40 owner-review-required rows without silently preserving a
default-on origin claim. No favorable metric bypasses the admission boundary.

## Local terminal workflow

The reviewer operates a resumable package-local terminal command. It:

1. validates source permissions, immutable identities, and catalog/config hashes;
2. selects finding and control records deterministically;
3. hides the finding/control role during review;
4. accepts only the four approved labels;
5. checkpoints local progress idempotently;
6. emits a canonical immutable receipt bound to reviewer authority and all input hashes; and
7. excludes raw source, absolute paths, and repository identity from durable receipts.

The local review UI may display bounded source context from verified local
bytes. That transient display is not persisted in the path-free receipt.

## Artifact flow

Versioned schemas cover quality candidates, blinded batches, resumable state,
immutable reviews, quality metrics, origin reuse/rerun, lane decisions, and the
final 119-row matrix.

The detailed plan decides whether these contracts are SlopBrick-local or can
reuse existing calibration schemas. No required `@usebrick/core` field or
breaking schema change is authorized by this design.

## Application gate

Each final row separates measurement status, evidence/claim ceiling, authority,
uncertainty/sample counts, usefulness, admission, policy, repair safety, and
application status.

Allowed rule outcomes are `default-on`, `default-off`, `quality-advisory`,
`insufficient-evidence`, and `retired`. Default-on requires claim-matched
quality evidence; origin evidence alone can never enable a rule under the
approved no-admission policy.

The gate first generates a dry-run patch. It applies tracked changes only after
the owner reviews the complete matrix and every focused, adversarial, recursive,
and self-scan gate passes. Application is atomic: no subset of rows may land as
the current policy.

## First-scan provenance

The UX must stop using unqualified `calibrated`. It distinguishes at least:

- deterministic finding evidence;
- current quality-calibrated evidence;
- internal origin-calibrated evidence;
- legacy-calibrated evidence; and
- advisory or insufficient evidence.

Every label exposes its evidence date/version and claim ceiling. Statistical
quality signals retain manual-review/no-safe-repair unless separate,
finding-bound repair evidence exists.

Application adds versioned current provenance; it never overwrites legacy
metrics or makes a historical calibration look current.

## Control-plane transition

Before calibration implementation starts:

1. preserve and separately checkpoint the current SB-UX owner-checkpoint docs;
2. create umbrella plan `CAL-002` and its evidence destination;
3. move `VAL-001` from `in_progress` to `ready` without deleting RUN-001;
4. keep `SB-UX-001` in progress with CAL-002 as its provenance closeout gate;
5. keep implementation WIP at 2/2 with `SB-UX-001` and `CAL-002`; and
6. leave `TEL-001` ready behind the completed first-scan outcome boundary.

Roadmap, execution index, status, changelog, and affected plans must transition
in one validated planning revision. `REL-001` remains unchanged.

## Direct-main execution sequence

1. Commit this design specification alone.
2. Obtain owner approval of the written specification.
3. Write and approve a detailed TDD implementation plan.
4. Checkpoint the existing SB-UX documentation without closing its acceptance gate.
5. Commit the CAL-002 control-plane transition.
6. Implement and verify contracts plus terminal review workflow.
7. Execute and checkpoint quality evidence batches.
8. Validate or rerun origin evidence and resolve lane membership.
9. Generate, adversarially review, and apply the 119-row matrix.
10. Rerun first-scan comprehension and close CAL-002 plus SB-UX-001 truthfully.
11. Hand the typed outcome boundary to TEL-001.

Each phase is a bounded commit. Existing user-owned untracked paths and
`.superpowers/sdd/progress.md` are never staged. No push occurs before the final
matrix, full verification, and a separate push decision.

## Failure and recovery behavior

- Hash, source, catalog, schema, or configuration drift aborts reuse and
  requires a new bound run; no stale metric is silently relabeled current.
- Missing, duplicate, cross-lane, or conflicting rows reject the merge.
- Missing source permissions fail closed without network acquisition or
  fallback labels.
- Interrupted review resumes from canonical local state and cannot overwrite a
  completed receipt.
- Uncertain reviews remain uncertain and do not enter binary denominators.
- Failed policy verification leaves the current rule registry untouched.
- Rollback restores the prior policy and UX while preserving immutable evidence
  receipts and historical decisions.

## Verification contract

Implementation verifies deterministic replay; stratification/control matching;
blinding; resume/idempotence; receipt privacy; uncertainty/expansion math;
lane separation/transfers; exact 119-row coverage; catalog-drift rejection;
dry-run/apply parity; zero partial mutation; frozen hashes; focused and recursive
gates; and package self-scan without baseline mutation.

The design document itself is verifiable with:

```bash
test -f docs/superpowers/specs/2026-07-18-complete-calibration-program-design.md
rg -q "47.*quality-only" docs/superpowers/specs/2026-07-18-complete-calibration-program-design.md
rg -q "72 AI-specific" docs/superpowers/specs/2026-07-18-complete-calibration-program-design.md
rg -q "admitted: false" docs/superpowers/specs/2026-07-18-complete-calibration-program-design.md
git diff --check
```

## Acceptance criteria

- Every current catalog rule appears exactly once in the final matrix.
- Every quality claim has deterministic, standards, contextual, statistical,
  advisory, or insufficient-evidence provenance.
- All 40 owner-review-required rows receive explicit outcomes.
- Origin and quality labels, metrics, and claim ceilings never mix.
- The final application is reviewed and atomic; `admitted: false` remains
  explicit.
- No AI-origin rule becomes default-on under the current source boundary.
- First-scan output identifies legacy versus current evidence and never implies
  authorship or a safe repair from a statistical signal.
- Frozen evidence remains byte-identical and all verification gates pass.
- Execution WIP remains within 2/2 and the canonical control plane agrees.
- No release, deployment, participant, or public-demand claim is inferred.

## Non-goals

- No hosted review, participant/team study, recruitment, or Corpus v1 redistribution.
- No file authorship verdict, test-split tuning, or completion-driven activation.
- No breaking Core schema change without separate approval.
- No tag, release, publish, deploy, or baseline refresh.

## Next step

The repository owner reviews this written specification. After explicit
approval, use the writing-plans workflow to produce the detailed CAL-002 TDD
implementation plan. Do not implement calibration code before that plan is
reviewed.
