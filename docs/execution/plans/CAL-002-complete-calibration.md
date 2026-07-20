# CAL-002 — Complete claim-matched rule calibration

- **Status:** `in_progress`
- **Priority:** 7
- **Track / lane:** implementation / calibration
- **Owner:** calibration maintainers and repository owner
- **Updated:** 2026-07-20

## Outcome

Resolve every current rule through separate quality and origin evidence lanes,
apply one reviewed non-admitting 119-row policy atomically, and expose precise
current-versus-legacy provenance in the first-scan contract.

## Current truth

The approved amendment preserves the completed CAL-002 v1 implementation
boundary through `e6c9695ea`, the frozen v1 evidence, and the locked 119-rule
catalog. The old three-way origin questionnaire is paused after one historical
hold. The replacement uses exactly 26/4/3/7 owner rows and the whole-catalog
projection is 47 starting quality + 26 transferred quality + 4 blocked quality
+ 3 superseded + 7 retired + 32 research-origin = 119. CAL-001's v1 matrix
remains `applied: false` and `admitted: false`; the v2 proposal is also
`applied: false` and `admitted: false`. `SB-UX-001` is the other active
implementation plan. `VAL-001-RUN-001` remains recorded but `VAL-001` returns
to ready, so CAL-002 owns the calibration and provenance closeout without
inventing owner evidence. Progressive authority Tasks 1–8 are implementation-
checkpointed and independently approved through `e8e62b779`; Tasks 9–11 are
implementation-checkpointed through `651f52d78` after controller adversarial
audit, with no external approval claimed because their independent reviewers
stalled. Task 12 is integrated at `473ceafc3` after two independent final
approvals. Its fail-closed TypeScript-AST doctrine covers exactly 73 active
quality rows and the deterministic 119-row catalog without changing detector
behavior or legacy provenance. The quality-disposition, parity, and
supersession receipt schemas are closed through `66251c9fa`; the reproducible
revision-34 four-file gate remains 213/213 on exact Node 22.22.3 and 24.15.0
with SlopBrick typecheck on both runtimes. Task 13 is integrated on main at
`e956f7900` and `366246e5d`, with protected lock hardening at `8c8760783`;
originating sidecar `34bf81fe1` / `fa5d452c5` is provenance only. It projects
exactly 32 canonical `research-only` origin rows, binds frozen governing and
replay identities, consumes no v1 owner-decision rows, stores no raw source or
path, and gives every row `runtimeOutcome: default-off`,
`enabledByDefault: false`, `runnableByExplicitOptIn: true`,
`scoreEligible: false`, `gateEligible: false`, and `admitted: false`. Task 13
created no application artifact and did not apply policy; the proposed policy
remains `applied: false`. Its three-file gate passes 76/76 on exact Node
22.22.3 and 24.15.0 with SlopBrick typecheck on both. Independent specification
and code-quality review approved the lock/session-lock alias fix with no
remaining findings. Task 4 closes
the exact 32 quality rows without labels and keeps them disabled, score-
neutral, gate-neutral, non-admitting, and without a claimed safe repair. Task
5 freezes fixed parity cases and receipt validators that require each
supersession migration to bind an independent implementation commit. Tasks
6–8 implement the canonical SQL, console, and `any` semantics while the old
IDs remain runnable; their tests use synthetic valid commit SHAs and do not
write durable parity or supersession receipts. Task 9 adds the shared transfer-
oracle fixture contract and complete C++/Rust cases, plus the comment-masking
correction required by its approved control; it writes no durable receipt and
does not activate a rule. Task 10 adds complete dead-code and unused-binding
transfer fixtures and the narrow classic React/JSX runtime guard required by
its approved control; it also writes no durable receipt and does not activate a
rule. Task 11 closes the two security fixtures, comment-masks hardcoded-secret
scanning, and adds the canonical strict 41-row v2 oracle reducer/schema without
writing a durable receipt or applying policy. Task 12 writes no durable
receipt and applies no policy. Task 13 neither changes a v1 owner decision nor
creates a durable receipt, applies policy, admits evidence, or grants release
authority; remote state is outside its receipt.

## Scope

- Build one hash-bound current 119-rule catalog and separate quality and
  internal-origin evidence lanes.
- Reconcile the v2 authority taxonomy across 47 starting quality, 26
  transferred quality, 4 blocked quality, 3 superseded, 7 retired, and 32
  research-origin rows, with blocked rows disabled and assignment-ineligible.
- Review deterministic, contextual, and statistical quality claims against
  their claim-matched evidence without treating origin labels as quality
  labels.
- Reuse or rerun origin evidence only when its frozen governing hashes match.
- Merge one reviewed, complete, non-admitting policy atomically and expose
  current-versus-legacy provenance to the first-scan contract.

## Non-goals

- Acquiring data, refreshing a score or debt baseline, recruiting
  participants, or inferring usefulness from source polarity.
- Activating a rule from origin evidence, asserting authorship, or admitting
  the policy to production.
- Pushing, tagging, publishing, deploying, or changing the separate REL-001
  release boundary.

## Dependencies

- `requires`: `CAL-001`
- `benefitsFrom`: `SB-UX-001`

## Acceptance criteria

- Every current rule has exactly one final row and lane-owned claim ceiling;
  the projection is exactly 119 rows with the approved six-part counts.
- Quality usefulness and origin association retain separate labels,
  denominators, metrics, and evidence receipts.
- The atomic policy rejects missing, duplicate, stale, or catalog-drifted
  rows and retains explicit `admitted: false`.
- First-scan provenance distinguishes deterministic, current quality, internal
  origin, legacy, advisory, and insufficient evidence without implying a safe
  repair or authorship.
- Frozen evidence and release boundaries remain unchanged unless a separately
  authorized later revision records otherwise.

## Execution steps

1. Red-test the additive v2 authority taxonomy and exact 119-row projection ->
   verify the focused one-worker CAL-002 authority and v2 contract tests fail
   for missing behavior before implementation.
2. Implement the separate quality and origin lane contracts -> verify focused
   lane, schema, receipt, and adversarial tests with one worker.
3. Generate and review the complete matrix dry run -> verify exact 119-row
   coverage, lane ownership, no duplicate rows, and `admitted: false`.
4. Apply only an owner-reviewed atomic policy -> verify the recorded focused,
   recursive, and self-scan gates before writing a current policy artifact.
5. Reconcile first-scan provenance and owner comprehension -> verify
   deterministic first-scan fixtures and bounded owner receipts without
   changing REL-001.

## Verification

Continue with the focused one-worker Task 14 five-file matrix/application,
v1-compatibility, and CLI command. Before any later policy application, verify
frozen identities, exact 119-row coverage, lane separation, non-admission, and
the prescribed recursive and package-local self-scan gates. This Task 14
implementation must not write a policy file under `src/rules`, consume an
owner decision, create a durable receipt, apply policy, admit evidence, or take
a release action.

## Evidence destination

`docs/execution/evidence/CAL-002-complete-calibration.md`

## Rollback

Keep CAL-001 and every frozen receipt immutable. Revert an unapproved or
invalid current-policy artifact atomically, preserve adversarial failures and
review receipts, and return the affected rule to its prior non-admitting state
until a complete replacement matrix is reviewed.

## Next action

Red-test/build Task 14's fail-closed exact 119-row v2 matrix, approval, and
policy projection in `matrix-v2.ts` and `application-v2.ts`, four schemas, and
CLI tests. Do not write a policy file under `src/rules`, consume an owner
decision, create a durable receipt, apply policy, admit evidence, or take a
release action.
