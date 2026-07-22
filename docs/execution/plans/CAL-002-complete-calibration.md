# CAL-002 — Complete claim-matched rule calibration

- **Status:** `in_progress`
- **Priority:** 7
- **Track / lane:** implementation / calibration
- **Owner:** calibration maintainers and repository owner
- **Updated:** 2026-07-22

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
remaining findings.

Task 14 is integrated on main from `d7b11b70e` through `c13ce8f47`. It
implements the closed 119-row matrix, approval, unapplied/applied policy
contracts, application receipt, strict schemas, six CLI commands, and
immutable paired publication without creating a live policy.

Task 14 independently validates exactly 41 evidence-ready deterministic rows:
32 starting and nine transferred. Every row carries the five ordered protocol
slots `alternate-syntax`, `baseline`, `comment-adjacent`, `near-miss`, and
`regression-safe`; these are not semantic source families.

The top-level and per-control binding is frozen to Corpus v1 receipt SHA-256
`47bd66907ec2efa67da718e0cfb38458151ca84d3cdedc941488fe4b001475ac`.
Durable output stores no source text or path. Final application publication is
receipt-first and policy-commit-marker-last under shared session locks, with
proof-limited rollback.

The expanded 13-file Task 13/14 gate passes 198/198 on exact Node 22.22.3 and
24.15.0 with SlopBrick typecheck on both. A bounded Node 24 full-suite run
passes 4,485 tests with 15 skipped. Independent final review approved the
specification and code quality with no findings.

Task 14 tests application only with temporary fixtures. Task 15 then consumed
the two exact owner decisions and generated the closed immutable evidence set.
The primary evidence checkpoint is `6a85e4346`; the additive single-root
manifest contract and artifact are checkpointed at `80acf1ada`.

Task 15 records the approved exact 26 transfer / 4 blocked / 3 supersede / 7
retire authority batch and the approved exact 119-row matrix. All 41
deterministic rows passed, all 32 unmeasured quality candidates remain score-
and gate-ineligible, and all 32 research-origin rows remain default-off. The
one human-facing evidence root is
`53ab07e7fd5dbbd09f595c87c255a636f3fb902abe7ec0cbfe923a5392198f8a`;
its manifest binds the exact 13 primary artifacts. The proposed policy remains
`applied: false` and `admitted: false`, and no live runtime policy exists.

Task 16 is implementation-checkpointed through `417ca5668`, with the clean-
install schema-test dependency correction at `3c1572f89`. It adds pure,
fail-closed current-policy accessors that accept only a complete applied policy
matching the exact approved Task 15 projection. The accessors copy and freeze
validated state, keep blocked, superseded, and retired rows non-runnable,
separate diagnostic visibility from score eligibility, and preserve legacy
fallback for unknown IDs. The production provider deliberately returns
`undefined`, so Task 16 does not bind or change scanner runtime behavior.

The focused accessor contract passes 7/7 on exact Node 22.22.3 and 24.15.0
with SlopBrick typecheck on both. Recursive test, typecheck, and build gates are
green; the SlopBrick suite passes 4,496 tests with 15 intentional skips. Two
independent final reviews returned 99/100 and 100/100 with no findings.

Task 17 is implementation-checkpointed through `61dc8f803`; its separate
orchestration diagnosis is `36137d740`. Registry context creation now rejects
policy-known blocked, superseded, and retired rules before instantiation,
including when configuration requests a severity. Permitted default-off rows
still require an own explicit opt-in. The canonical score selector keeps
current score-ineligible quality and research-origin diagnostics out of every
score, Bayesian input, and composite chain while preserving visible audit
evidence where policy permits. Explicit `off` remains stronger than policy,
and IDs absent from current policy retain legacy behavior. Scan and watch use
the same normalization boundary. The review correction preserves exact dormant-
provider composite behavior, applies explicit `off` to active-policy synthetic
findings, and routes the project-level identical-block coordinator through
current authority.

The production provider still returns `undefined`; Task 17 proves the future
runtime contract through the exact approved Task 15 projection without
activating it. The nine-file focused gate passes 188/188 on exact Node 22.22.3
and 24.15.0 with SlopBrick typecheck on both. Recursive tests pass Core 285,
Engine 60, Website 54, and SlopBrick 4,511 with 15 intentional skips;
recursive typecheck and build are green. Two independent final re-reviews
returned 100/100 with no remaining findings.

Task 18 is implementation-checkpointed through `be1be85b8`, with its security
review at `e17f736e5`. It projects one current-policy evidence object through
first-scan, terminal, JSON, Markdown, HTML, and SARIF while keeping exact
source evidence and explicitly historical signal metrics separate. Matching
uses the complete finding identity and fails closed across file, message, and
absolute-path collisions. Non-runnable tombstones are absent from findings,
recommendations, and baseline deltas; grouped recommendations preserve the
weakest source-span truth; safe-repair language remains finding-bound and
limited to deterministic or current-quality-calibrated evidence.

The production provider still returns `undefined`. The eight-file focused gate
passes 123/123 on exact Node 22.22.3 and 24.15.0 with SlopBrick typecheck on
both. Recursive tests pass Core 285, Engine 60, Website 54, and SlopBrick 4,530
with 15 intentional skips; recursive typecheck and build are green. Targeted
report coverage records 84.55% statements/lines, 77.27% branches, and 97.77%
functions. Two independent final re-reviews returned 99/100 with no remaining
findings.

Task 19 is implementation-checkpointed at `52af3e272`. Explain, CLI, MCP, and
generated catalog surfaces separate current policy from frozen v10.1
historical metrics. The exact 119-row catalog independently exposes runnable,
score, and gate authority. Repository config and invocation provenance remain
distinct across main and v10.3 workers; repository `off` wins. Direct docs and
secondary diagnostic paths use the same current authority. Strict docs exit
follows the independent gate projection. Durable history migration removes
only immutable policy-ineligible IDs, while temporary config filters flywheel
input in memory and remains reversible.

The exact 35-file matrix passes 637/637 on Node 22.22.3 and 24.15.0. Recursive
tests pass Core 285, Engine 60, Website 54, and SlopBrick 4,580 with 15
intentional skips; recursive lint, typecheck, and build pass. The package-local
self-scan scores 99.81/100, reports 13 active medium findings, auto-suppresses
803 policy-ineligible findings, and passes its policy gate. Two fresh final
reviews returned 98/100 with zero findings. The production provider remains
`undefined`; no policy is applied or activated. The single human-facing Task
19 checkpoint is the implementation identifier above; leaf SHA-256 values stay
machine-only. High dependency advisories remain a separate `REL-001` release
blocker.

Task 4 closes
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
creates a durable receipt. Task 14 provides the code contract used by Task 15's
committed authority, matrix, receipts, and evidence manifest. Task 16 validates
and exposes that projection only through pure accessors and an inactive
provider; it does not apply policy or create a live runtime binding. Remote
state is outside this receipt.

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

Run Task 20 Steps 1–6 only. Reverify frozen state, generate the exact local
applied-policy candidate and immutable receipt, bind the candidate provider,
regenerate catalog truth, run the complete focused and recursive gates, and
self-scan without baseline mutation. Then stop before commit at the exact
two-choice owner comprehension gate.

Do not infer the owner's choice. Until choice 1 is recorded, leave the
candidate uncommitted. A green local candidate does not authorize admission,
push, tag, publish, deploy, or release.

## Evidence destination

`docs/execution/evidence/CAL-002-complete-calibration.md`

## Rollback

Keep CAL-001 and every frozen receipt immutable. Revert an unapproved or
invalid current-policy artifact atomically, preserve adversarial failures and
review receipts, and return the affected rule to its prior non-admitting state
until a complete replacement matrix is reviewed.

## Next action

Run Task 20 Steps 1–6 from the approved progressive-authority plan, then show
the owner exactly:

1. the finding, provenance, score, and action boundaries are understandable;
   apply this exact policy locally; or
2. one or more boundaries are unclear; leave the candidate uncommitted and
   name the failed surface.

Do not commit or activate the candidate before choice 1. Do not infer
admission, push, tag, publish, deploy, or release authority from either choice.
