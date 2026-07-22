# Execution planning changelog

This is an append-only history of roadmap and plan-control changes. Product
release notes remain in package changelogs.

## Revision 39 — 2026-07-22

### Changed

- Recorded the CAL-002 Task 17 implementation checkpoint through `61dc8f803`;
  the separate orchestration diagnosis is `36137d740`.
- Routed policy-known runnable authority through registry context creation, so
  blocked, superseded, and retired rules cannot instantiate even when a
  severity override requests them.
- Routed current score authority through the canonical effective-issue
  selector and worker Bayesian/composite inputs. Explicitly permitted
  diagnostics can remain visible, but score-ineligible findings cannot affect
  scoring or synthetic-composite chaining.
- Preserved explicit `off`, unknown-rule legacy fallback, shared scan/watch
  normalization, and the inactive production provider. Production scanner
  behavior therefore remains unchanged.
- Closed the independent-review gaps around dormant-provider composite
  fallback, explicit-off filtering of active-policy synthetic findings, and
  current-policy parity for the project-level identical-block coordinator.
- Advanced CAL-002 to Task 18: project current policy provenance through one
  first-scan evidence contract shared by terminal, JSON, Markdown, HTML, and
  SARIF.

### Evidence

- The exact nine-file Task 17 gate passes 188/188 on Node 22.22.3 and 24.15.0
  with SlopBrick typecheck on both runtimes.
- The recursive test gate passes Core 285, Engine 60, Website 54, and SlopBrick
  4,511 tests with 15 intentional skips; recursive typecheck and build pass.
- The post-correction targeted authority coverage run passes 141/141; the
  canonical score selector is fully covered, including its branches.
- The Task 17 security review reports no finding at confidence 8/10 or higher.
- Two independent final re-reviews returned 100/100 with no remaining
  findings.

### Boundary

- `CAL-002` remains `in_progress`; implementation WIP remains `2/2` and
  company WIP remains `0/1`.
- The one Task 15 evidence root remains the only aggregate hash repeated in
  human-facing authority docs. Leaf identities remain machine-only.
- The matrix and approval remain `applied: false`; all evidence remains
  `admitted: false`. No runtime activation, push, tag, publish, deployment, or
  release is recorded or authorized.

## Revision 38 — 2026-07-22

### Changed

- Recorded the CAL-002 Task 16 implementation checkpoint through `417ca5668`,
  after the clean-install schema-test dependency correction at `3c1572f89`.
- Added pure, fail-closed current-policy accessors that require a complete
  applied policy matching the exact owner-approved Task 15 projection, detach
  and freeze validated state, keep blocked/superseded/retired rows non-runnable,
  and separate explicit diagnostic visibility from score authority.
- Kept the production provider returning `undefined`; no registry, CLI, watch,
  worker, score, baseline, or report path consumes current policy in production.
- Kept the single Task 15 evidence root as the human-facing aggregate. Exact
  matrix, approval, and row identities remain machine-only bindings.
- Advanced CAL-002 to Task 17: integrate runnable and score authority through
  exact approved-policy mocks while the production provider remains inactive.

### Evidence

- The focused current-policy contract passes 7/7 on exact Node 22.22.3 and
  24.15.0 with SlopBrick typecheck on both runtimes.
- The recursive test gate passes Core 285, Engine 60, Website 54, and SlopBrick
  4,496 tests with 15 intentional skips; recursive typecheck and build pass.
- Two independent final reviews returned 99/100 and 100/100 with no findings.

### Boundary

- `CAL-002` remains `in_progress`; implementation WIP remains `2/2` and
  company WIP remains `0/1`.
- The matrix and approval remain `applied: false`; all evidence remains
  `admitted: false`. No runtime activation, push, tag, publish, deployment, or
  release is recorded or authorized.

## Revision 37 — 2026-07-22

### Changed

- Recorded both exact Task 15 owner decisions: the 26 transfer / 4 blocked / 3
  supersede / 7 retire authority batch and the exact 119-row matrix are
  approved.
- Recorded the primary immutable-evidence checkpoint at `6a85e4346`: all 41
  deterministic rows passed, 32 quality candidates remain deliberately
  unmeasured and score/gate-ineligible, and all 32 research-origin rows remain
  default-off and non-admitting.
- Recorded the additive evidence-manifest checkpoint at `80acf1ada`. Human-
  facing authority documents now cite one Task 15 evidence root while the
  manifest retains the exact sorted name, byte count, and file identity of all
  13 primary artifacts.
- Advanced CAL-002 to Task 16: pure validated current-policy accessors behind
  an inactive provider. Runtime scanner binding remains outside this slice.

### Evidence

- The integrated nine-file Task 15 preflight passes 122/122 on exact Node
  22.22.3 and 24.15.0.
- The deterministic reducer completed 41/41 rows with zero failed or source-
  shortage rows; the matrix/application adversarial gate passes 43/43.
- The final manifest and artifact-I/O focused gate passes 18/18 on both exact
  Node runtimes, with SlopBrick typecheck green on both.
- The single evidence root is
  `53ab07e7fd5dbbd09f595c87c255a636f3fb902abe7ec0cbfe923a5392198f8a`.
- Controller self-audit corrected fresh-checkout file-mode portability before
  checkpoint. Two rounds of independent reviewer attempts stalled and were
  closed, so no independent manifest-review approval is claimed.

### Boundary

- `CAL-002` remains `in_progress`; implementation WIP remains `2/2` and
  company WIP remains `0/1`.
- The matrix and approval remain `applied: false`; all evidence remains
  `admitted: false`. No runtime activation, push, tag, publish, deployment, or
  release is recorded or authorized.

## Revision 36 — 2026-07-20

### Changed

- Recorded Task 14 integration from `d7b11b70e` through `c13ce8f47`: the
  closed 119-row matrix reducer, approval and application contracts, six CLI
  commands, four new schemas, schema-registry hardening, and immutable receipt
  publication are now on main.
- Recorded exactly 41 evidence-ready deterministic rows: 32 starting plus nine
  transferred. Each row requires the five fixed protocol slots
  `alternate-syntax`, `baseline`, `comment-adjacent`, `near-miss`, and
  `regression-safe`; those slots are not semantic source families.
- Recorded top-level and per-control binding to frozen Corpus v1 source receipt
  SHA-256 `47bd66907ec2efa67da718e0cfb38458151ca84d3cdedc941488fe4b001475ac`.
  Durable receipts contain no raw source or path.
- Recorded receipt-first, policy-commit-marker-last paired publication with
  immutable destinations, shared session locks, fsync, and proof-limited
  rollback. Task 14 exercises only temporary fixtures and does not apply the
  proposed policy.
- Advanced CAL-002 to Task 15 Steps 1–3: integrated preflight, exact catalog
  replay, and presentation of the closed 26 transfer / 4 blocked / 3
  supersede / 7 retire authority batch for an explicit owner choice.

### Evidence

- Task 14 commit range: `d7b11b70e..c13ce8f47`.
- The expanded 13-file Task 13/14 gate passes 198/198 on exact Node 22.22.3
  and 24.15.0, with SlopBrick typecheck on both runtimes.
- The bounded Node 24 full suite passes 383 files with 5 skipped and 4,485
  tests with 15 skipped using `--maxWorkers=4 --minWorkers=1`.
- Independent final review returned `SPEC APPROVED` and
  `CODE QUALITY APPROVED`, with no Critical, Important, or Minor findings.
- The protected owner-state input remains mode 0600, 256 bytes, and SHA-256
  `07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd`.

### Boundary

- `CAL-002` remains `in_progress`; implementation WIP remains `2/2` and
  company WIP remains `0/1`.
- The proposed policy remains `applied: false` and `admitted: false`. No Task
  15 owner decision, policy application, admission, push, tag, publish,
  deployment, or release is recorded or authorized.

## Revision 35 — 2026-07-20

### Changed

- Recorded CAL-002 Task 13 as integrated on main at `e956f7900` and
  `366246e5d`, with protected lock hardening at `8c8760783`. The originating
  sidecar commits `34bf81fe1` and `fa5d452c5` are provenance only.
- Task 13 projects exactly 32 canonical `research-only` origin rows. It binds
  frozen governing and replay identities, consumes no v1 owner-decision row,
  stores no raw source or path, and gives every row `runtimeOutcome: default-off`,
  `enabledByDefault: false`, `runnableByExplicitOptIn: true`,
  `scoreEligible: false`, `gateEligible: false`, and `admitted: false`. Task 13
  created no application artifact and did not apply policy; the proposed policy
  remains `applied: false`.
- Recorded independent specification and code-quality approval of the
  lock/session-lock alias hardening with no remaining findings.
- Advanced the next bounded action to Task 14: red-test/build the fail-closed
  exact 119-row v2 matrix, approval, and policy projection in `matrix-v2.ts`
  and `application-v2.ts`, four schemas, and CLI tests. Task 14 does not write
  a policy file under `src/rules`, consume an owner decision, create a durable
  receipt, apply policy, admit evidence, or perform a release action.

### Evidence

- `e956f7900`
- `366246e5d`
- `8c8760783`
- The revision-35 three-file one-worker gate passes 76/76 on exact Node
  22.22.3 and 24.15.0, with SlopBrick typecheck on both runtimes.
- On main, the protected owner-state assertion verified mode 0600, 256 bytes,
  and SHA-256
  `07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd`.
- Revision 34's four-file 213/213 receipt remains preserved and reproducible.
- This checkpoint grants no authority to write runtime policy, admit evidence,
  push, tag, publish, deploy, or release. Remote state is outside this receipt.

## Revision 34 — 2026-07-20

### Changed

- Recorded CAL-002 progressive authority Task 12 as integrated at
  `473ceafc3` from originating implementation `5adba9714` after two independent
  final approvals.
- Added the fail-closed TypeScript-AST public-copy doctrine across exactly 73
  active quality rows, including descriptions, emitted messages and advice,
  `RULE_HINTS`, and the generated 119-row catalog. Current quality-facing copy
  no longer asserts AI/human causation or authorship; legacy provenance remains
  available in its separate historical boundary.
- Closed the pre-existing quality-disposition, parity, and supersession receipt
  schemas at `dd8360fba`, `b5bd09090`, and `66251c9fa` so malformed open shapes
  fail validation without creating or applying any receipt.
- Advanced the next bounded action to Task 13's exact 32-row research-origin
  v2 evidence projection and verifier.

### Evidence

- `473ceafc3`
- `dd8360fba`
- `b5bd09090`
- `66251c9fa`
- `docs/superpowers/plans/2026-07-19-cal-002-progressive-quality-authority.md`
- `docs/execution/evidence/CAL-002-complete-calibration.md`
- The revision-34 bounded gate runs exactly four named tests and passes 213/213
  on exact Node 22.22.3 and 24.15.0, with SlopBrick typecheck on both runtimes.
- The generated 119-row catalog replays identically on both runtimes at
  SHA-256
  `9bc6ede48b7df38d0b0e71be32691c3eebb9258817a95916752e442c7e771efd`.
- Protected owner state remains mode 0600, 256 bytes, and SHA-256
  `07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd`.
- This checkpoint grants no authority to apply policy, admit evidence, push,
  tag, publish, deploy, or release. Remote state is outside this receipt.

## Revision 33 — 2026-07-19

### Changed

- Recorded CAL-002 progressive authority Task 11 as implementation-
  checkpointed at `651f52d78` after controller adversarial audit. Two
  independent reviewers stalled and were closed, so no external approval is
  claimed.
- Added complete security transfer fixtures for `security/hardcoded-secret`
  and `security/sql-construction`, closing the canonical nine-transfer set.
- Added the strict canonical 32-starting + 9-transferred = 41-row v2 oracle
  reducer and schema. It revalidates authority, frozen v1 evidence, hashes,
  Corpus v1 source binding, five control families, non-admission, and source/
  path exclusion; a failed row cannot become default-on.
- Recorded the narrow comment-mask correction exposed by the approved
  hardcoded-secret control. It preserves issue lines and does not change
  activation, policy, or admission.
- Advanced the next bounded action to Task 12's exact 73-row quality-only
  public-copy doctrine and generated-catalog guard.

### Evidence

- `651f52d78`
- `docs/superpowers/plans/2026-07-19-cal-002-progressive-quality-authority.md`
- `docs/execution/evidence/CAL-002-complete-calibration.md`
- The exact integrated Task 11 matrix plus signal-strength guardrails passes
  134/134 on Node 22.22.3 and 24.15.0 with SlopBrick typecheck on both.
- The scoped commit self-scan passed at AI Slop Score 4.2/100, Engineering
  Hygiene 100/100, and Security 100/100; its one low compression-profile
  diagnostic is informational and non-admitting.
- Protected owner state remains mode 0600, 256 bytes, and SHA-256
  `07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd`.
- No durable oracle receipt, current-policy application, owner run, admission,
  push, tag, publish, deploy, or release was produced.

## Revision 32 — 2026-07-19

### Changed

- Recorded CAL-002 progressive authority Task 10 as implementation-
  checkpointed at `aeef2915a` after controller adversarial audit. Its
  independent reviewer stalled and was closed, so no external approval is
  claimed.
- Added complete real-execution transfer fixtures for `dead/unreachable`,
  `dead/unused-import`, `dead/unused-local`, and `dead/unused-parameter`, with
  exact positive, negative, adversarial, and five-family controls.
- Recorded the narrow classic React/JSX runtime guard exposed by the approved
  unused-import control. It requires the exact default name/source and actual
  JSX and does not change activation, default state, policy, or admission.
- Advanced the next bounded action to Task 11's two security transfers and
  combined exact 41-row v2 oracle receipt.

### Evidence

- `aeef2915a`
- `docs/superpowers/plans/2026-07-19-cal-002-progressive-quality-authority.md`
- `docs/execution/evidence/CAL-002-complete-calibration.md`
- The exact Task 10 matrix passes 50/50 on Node 22.22.3 and 24.15.0 with
  SlopBrick typecheck on both; 45 broader visitor assertions and signal-
  strength guardrails pass.
- Protected owner state remains mode 0600, 256 bytes, and SHA-256
  `07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd`.
- No durable transfer-oracle receipt, current-policy application, owner run,
  admission, push, tag, publish, deploy, or release was produced.

## Revision 31 — 2026-07-19

### Changed

- Recorded CAL-002 progressive authority Task 9 as implementation-
  checkpointed at `33ea0d732` after controller adversarial audit. The
  independent reviewer stalled and was closed, so no external approval is
  claimed.
- Added the reusable nine-ID transferred-oracle fixture contract, canonical
  five-family control order, normalized language-path and unique-identity
  guards, and source-free/path-free durable case projection.
- Recorded complete positive, negative, adversarial, and five-family cases for
  `cpp/c-style-cast`, `cpp/raw-new-delete`, and `rust/todo-macro` through real
  parser/facts/rule execution.
- Recorded the bounded `cpp/c-style-cast` comment-masking correction exposed by
  the approved comment-adjacent control. It preserves source offsets and does
  not change rule activation, default state, policy, admission, or release.
- Advanced the next bounded action to Task 10's four dead-code and unused-
  binding transfer fixtures and native controls.

### Evidence

- `33ea0d732`
- `docs/superpowers/plans/2026-07-19-cal-002-progressive-quality-authority.md`
- `docs/execution/evidence/CAL-002-complete-calibration.md`
- The exact Task 9 matrix passes 53/53 on Node 22.22.3 and 24.15.0 with
  SlopBrick typecheck on both runtimes; signal-strength guardrails also pass.
- Protected owner state remains mode 0600, 256 bytes, and SHA-256
  `07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd`.
- No durable transfer-oracle receipt, current-policy application, owner run,
  admission, push, tag, publish, deploy, or release was produced.

## Revision 30 — 2026-07-19

### Changed

- Recorded CAL-002 progressive authority Tasks 1–8 as implementation-
  checkpointed and independently approved through `e8e62b779`.
- Recorded Task 6's bounded linear SQL CTE parser and canonical parity fixture
  after corrections for pathological backtracking, broad prose, terminal
  `SELECT` without `FROM`, multiple CTEs, and all four approved terminal DML
  forms.
- Recorded Task 7's five-`console.log` clustering in a true 30-line inclusive
  span after its physical-line boundary correction, while retaining the
  production-sized exact 10/9 total-debug behavior and canonical guards.
- Recorded Task 8's unchanged declaration-ratio detector and threshold,
  explicit rejection of the old line denominator, retained annotation/
  assertion/generic reach, and quality-only public framing.
- Advanced the next bounded action to Task 9's shared transfer-oracle fixture
  contract and complete C++/Rust deterministic cases.
- Preserved active `SB-UX-001` and `CAL-002` at implementation WIP `2/2`.
  The workspace rule implementations changed as specified, but no default
  state, score, baseline, current policy, owner state, application, admission,
  release, deployment, tag, publish, or push changed.

### Evidence

- `docs/superpowers/plans/2026-07-19-cal-002-progressive-quality-authority.md`
- `docs/execution/plans/CAL-002-complete-calibration.md`
- `docs/execution/evidence/CAL-002-complete-calibration.md`
- Task 6 passes 31 focused tests, Task 7 passes 21, and Task 8 passes 17. The
  integrated Tasks 6–8 matrix passes 51/51 on exact Node 22.22.3 and 24.15.0
  with SlopBrick typecheck on both runtimes.
- The parity receipts produced in tests use synthetic valid commit SHAs; no
  durable actual-commit parity or supersession receipt was written, and the
  old rule IDs remain runnable pending a later atomic policy application.

## Revision 29 — 2026-07-19

### Changed

- Recorded CAL-002 progressive authority Tasks 1–5 as implementation-
  checkpointed and independently approved through `67a777c27`.
- Recorded Task 4's exact 32-row zero-label quality disposition and optional
  readiness-gated private cohort planner. The disposition is non-admitting,
  keeps every row disabled/score-neutral/gate-neutral, and does not claim a
  safe repair.
- Recorded Task 5's fixed SQL, console, and `any` parity cases, required fields
  for independent future migration commits, and exact three-row non-admitting
  supersession contract. The rule migrations remain Tasks 6–8.
- Advanced the next bounded action to the parallel-safe Tasks 6–8 parity wave:
  SQL CTE coverage, console five-in-thirty clustering guards, and declaration-
  ratio `any` density without the rejected line-based heuristic.
- Preserved active `SB-UX-001` and `CAL-002` at implementation WIP `2/2`.
  No protected owner workflow was run and no authority proposal, private
  cohort, quality receipt, parity receipt, supersession receipt, runtime
  policy, application, admission, or release state was created.

### Evidence

- `docs/superpowers/plans/2026-07-19-cal-002-progressive-quality-authority.md`
- `docs/execution/plans/CAL-002-complete-calibration.md`
- `docs/execution/evidence/CAL-002-complete-calibration.md`
- Task 4's final focused matrix passes 92/92 on exact Node 22.22.3 and 24.15.0
  with typecheck on both; the integrated Task 4 + Task 5 matrix passes 101/101
  on both runtimes with typecheck on both.
- This implementation checkpoint changes no live owner state, runtime policy,
  package version, rule activation, score, source, baseline, admission,
  release, deployment, tag, publish, push, or acquired data.

## Revision 28 — 2026-07-19

### Changed

- Approved UseBrick as the sole customer-facing coherence and verification
  product, with one repository-owned contract shared by developers, coding
  agents, and CI. SlopBrick remains the shipped npm package, current CLI, free
  local scanner, and acquisition surface; Memory, Lock, Mend, and Render Labs
  remain bounded capabilities rather than separate products or packages.
- Added one dated market-positioning note that separates observed evidence
  from assumptions and scenarios. Cross-study seat and spend arithmetic is not
  a measured UseBrick market, forecast, or product-demand claim.
- Moved `GTM-001` from `parked` to `ready` for planning 10–20 consent-safe
  observed external sessions. Completed sessions remain **0** and outreach is
  `false`; the next action prepares a participant profile, script, consent
  text, and redacted receipt without contacting or scheduling anyone.
- Added draft `LABS-001` to compare source-only work with rendered/runtime
  evidence using fixed defects, blind scoring, equal model/time budgets,
  incremental detection and false-positive measures, and an explicit stop
  decision.
- Preserved active `SB-UX-001` and `CAL-002` at implementation WIP `2/2` and
  company WIP at `0/1`. Ready and draft plans consume no WIP.
- Recorded CAL-002 progressive authority Tasks 1–3 as implementation-
  checkpointed and independently approved through `5f5a1c554`. The next
  bounded action is Task 4's exact 32-row zero-label quality disposition and
  optional readiness-gated cohort plan. No protected owner workflow was run,
  and no runtime policy, application, admission, or release state changed.

### Evidence

- `docs/superpowers/specs/2026-07-19-usebrick-coherence-positioning-design.md`
- `docs/research/usebrick-market-positioning-2026-07-19.md`
- `docs/superpowers/plans/2026-07-19-usebrick-coherence-docs.md`
- `docs/superpowers/plans/2026-07-19-cal-002-progressive-quality-authority.md`
- `docs/execution/plans/GTM-001-vibecoder-pilots.md`
- `docs/execution/plans/LABS-001-rendered-evidence-benchmark.md`
- This strategy and execution-document revision changes no runtime code,
  package version, rule, score, source, baseline, calibration application,
  admission, historical evidence, or protected owner state. It authorizes no
  outreach, participant data, push, tag, GitHub Release, npm publication,
  website deployment, or public release.

## Revision 27 — 2026-07-19

### Changed

- Reconciled the execution control plane to the approved additive CAL-002 v2
  authority amendment. The v1 implementation boundary remains checkpointed
  through `e6c9695ea`, and the old three-way origin questionnaire is paused
  after one historical hold.
- Locked the whole-catalog projection at 47 starting quality + 26 transferred
  quality + 4 blocked quality + 3 superseded + 7 retired + 32 research-origin
  rows = 119. The owner-row transition is exactly `26/4/3/7`; blocked rows
  remain assignment-ineligible.
- Kept `CAL-002` `in_progress`, implementation WIP at `2/2`, and the proposed
  policy `applied: false` and `admitted: false`. Local application remains
  distinct from push, tag, publish, deploy, and release authority.

### Evidence

- `docs/execution/plans/CAL-002-complete-calibration.md`
- `docs/execution/evidence/CAL-002-complete-calibration.md`
- This documentation-only reconciliation changed no runtime policy, frozen
  evidence artifact, owner state, rule, score, source, baseline, admission,
  release, deployment, tag, publish, push, or acquired data.

## Revision 26 — 2026-07-18

### Changed

- Entered `CAL-002` from the approved complete-calibration design and detailed
  plan. It is active beside `SB-UX-001` to resolve separate quality and origin
  evidence lanes, then apply one reviewed non-admitting 119-row policy
  atomically and expose current-versus-legacy first-scan provenance.
- Returned `VAL-001` to `ready` while retaining `VAL-001-RUN-001`. `SB-UX-001`
  remains active with CAL-002 as its evidence-provenance closeout gate;
  `TEL-001` remains ready. Implementation WIP remains exactly `2/2`:
  `SB-UX-001` and `CAL-002`.
- Kept `REL-001` and every public release boundary unchanged. No rule, score,
  source, baseline, admission, release, deployment, tag, publish, push, or
  acquired data changed in this revision.

### Evidence

- `docs/superpowers/specs/2026-07-18-complete-calibration-program-design.md`
- `docs/superpowers/plans/2026-07-18-complete-calibration-program.md`
- `docs/execution/plans/CAL-002-complete-calibration.md`
- `docs/execution/evidence/CAL-002-complete-calibration.md`
- This control-plane revision creates no calibration implementation, policy
  application, or red/green test evidence; the next action is the red CAL-002
  catalog and local-schema contract tests.

## Revision 25 — 2026-07-18

### Changed

- Approved execution of the reviewed `SB-UX-001` detailed implementation plan
  and moved it from `ready` to `in_progress` in the second implementation WIP
  slot. `VAL-001` remains `in_progress` in the first slot; `TEL-001` remains
  ready.
- Set the first code action to the failing first-scan projection tests for the
  owner-observed calibrated, no-safe-repair, and unchanged-rescan states.
- Reconciled the roadmap, status snapshot, bounded plan, and execution index at
  revision 25. No score, rule, baseline, source, release, or public artifact
  changed.

### Evidence

- `docs/execution/plans/SB-UX-001-first-scan.md`
- `specs/PLAN-AUDIT_LATEST.md`
- `specs/IMPACT_LATEST.md`
- This execution transition changes documentation only; no product code or
  TDD red/green evidence is required at this checkpoint.

## Revision 24 — 2026-07-18

### Changed

- Prepared the reviewed eight-task `SB-UX-001` TDD implementation plan around
  one additive first-scan projection, five exhaustive areas, a single
  Repository Health headline, no more than three rule-grouped actions, and a
  backward-compatible new/resolved/unchanged baseline delta.
- Locked evidence labels to finding-level deterministic evidence, measured
  rule behavior with an explicit non-authorship claim, and advisory review.
  Only finding-bound fixes may be described as safe; the owner-observed
  Heaps/Zipf state must say that no safe bounded repair is available.
- Kept `SB-UX-001` `ready` and implementation WIP at `1/2`. Product-code
  execution starts only when Task 1 moves it to `in_progress`; `TEL-001`
  remains ready behind the typed first-scan boundary.

### Evidence

- `docs/superpowers/plans/2026-07-18-slopbrick-first-scan-experience.md`
- `specs/PLAN-AUDIT_LATEST.md`
- `specs/IMPACT_LATEST.md`
- This planning checkpoint changes no product code, report bytes, baseline,
  score, threshold, rule state, CAL-001 row, corpus state, release decision, or
  public artifact.

## Revision 23 — 2026-07-18

### Changed

- Started `VAL-001` with the first real repository-owner walkthrough and moved
  it from `ready` to `in_progress`, consuming one of two implementation WIP
  slots.
- Recorded `VAL-001-RUN-001` against the package-local v0.45 candidate: both
  full scans completed 270/270 files with zero runtime failures, 11 active
  medium hygiene findings, 690 audit-only suppressed findings, AI Slop Score
  `0.0`, and exit `0`.
- Preserved the owner's explicit `useful` decision while recording that the
  file-level Heaps/Zipf evidence exposed no safe bounded repair. No source edit
  was made, and the repeated scan reproduced every decision-bearing outcome.
- Routed the observed `useful + no safe action + unchanged rescan` states into
  the ready `SB-UX-001` and `TEL-001` contracts without starting either plan.

### Evidence

- `docs/execution/evidence/VAL-001-owner-validation.md`
- The target source SHA-256 remained
  `58d6fc3f02edd1b36b4edb322672752c8438586588b9b4e21b6b91d0e648bdcc`.
- The stale local score baseline was rejected for a config-hash mismatch and
  was not refreshed. No CAL-001 row, threshold, default state, score formula,
  corpus admission, participant state, release decision, or public artifact
  changed.

## Revision 22 — 2026-07-18

### Changed

- Split completed local SlopBrick qualification from public release authority:
  `SB-045` now ends at the local go/no-go packet, while new `REL-001` owns the
  independent npm and website dispositions.
- Removed the false scheduler dependency on a public decision. `SB-UX-001` and
  `TEL-001` retain their `SB-045` requirement, which is now satisfied, and move
  to `ready`; priority keeps first-scan UX ahead of the outcome-event contract.
- Kept `VAL-001` ready for real owner-selected runs and `GTM-001` parked with no
  participant recruitment or target-count gate.
- Recorded the completed recovery integration at
  `11769b3a6d88faa94b16e8a3de96536a8bbc5ca6`: `main` and `origin/main`
  converged after the installed pre-push gate, without a tag, GitHub Release,
  npm publish, or website deployment.
- Corrected the current status risk entry for `ci --max-new-issues`; `SB-045`
  implemented its stable-identity new-debt contract, so it is no longer an
  advertised silent no-op.

### Status transitions

- `SB-045`: `waiting_external` -> `done` (local qualification complete).
- `REL-001`: added as `waiting_external` (explicit npm and website owner
  dispositions only; no WIP consumed).
- `SB-UX-001`: `draft` -> `ready` (next local implementation plan).
- `TEL-001`: `draft` -> `ready` (ordered after the first UX contract).

### Evidence

- `docs/superpowers/specs/2026-07-18-release-boundary-split-design.md`
- `docs/execution/evidence/SB-045-release-qualification.md`
- `docs/execution/evidence/REL-001-public-claim-disposition.md`
- JSON parsing, the 16-plan control-plane validator, all 20 validator tests,
  explicit transition/self-dependency assertions, and `git diff --check`
  passed with implementation WIP `0/2` and company WIP `0/1`.
- This planning revision changes no product code and authorizes no tag, GitHub
  Release, npm publish, website deployment, participant action, or rule-state
  change.

## Revision 21 — 2026-07-18

### Changed

- Hardened the CORPUS-002 requested-use assertion so it rederives the canonical
  disposition and rejects malformed runtime enums plus duplicated, reordered,
  narrowed, or manually widened permitted-use arrays.
- Expanded the pure-policy matrix to exercise every authority, integrity,
  rights, and requested-use combination and to prove deterministic canonical
  output.
- Closed final current-document drift: the roadmap now treats CORPUS-002 as
  completed; SB-045 and DOC-PRUNE-001 no longer call it parallel work; MEND-001
  uses owner-controlled validation instead of pilot users or repositories; and
  the future LockBrick evidence path is owner-validation named.

### Evidence

- The review-first policy run reproduced five failures against the original
  assertion. After hardening, the policy file passed 22/22 tests.
- Portable Corpus v1 verification passed 10 files and 65 tests with 6 explicit
  real-source skips; opt-in real-source verification passed 6 files and 41
  tests with no source mutation and unchanged frozen hashes.
- Final recursive lint, typecheck, test, and build gates passed. The package
  test totals were Core 285, Website 47, Engine 60, and SlopBrick 3,852 passed
  with 15 explicit SlopBrick opt-in skips; the build emitted only the existing
  non-fatal Zod declaration-bundling warnings.
- No source acquisition, redistribution, participant action, rule-state
  change, publish, deployment, tag, push, or remote mutation occurred.

## Revision 20 — 2026-07-18

### Changed

- Completed CORPUS-002 with a pure source-use policy, closed source registry,
  inventory disposition, and fail-closed manifest preflight.
- Routed the verified Mendeley source to internal origin measurement and
  calibration evaluation while keeping FormAI, OSSForge, and controlled
  HumanEval non-executable under their current dispositions.
- Preserved all eight frozen Corpus v1/CAL-001 artifact hashes and kept source
  use separate from redistribution, v10.3 admission, usefulness review, and
  rule application.
- Converged current roadmap, architecture, methodology, package, calibration,
  and execution documentation on the owner-only validation path. VAL-001 stays
  ready; GTM-001 stays parked.

### Evidence

- `docs/execution/evidence/CORPUS-002-source-disposition.md`
- Portable Corpus v1 verification passed 10 files and 57 tests with 6 explicit
  real-source skips; the opt-in real-source verification passed 6 files and 41
  tests and reproduced all frozen hashes.
- Recursive lint, typecheck, test, and build gates passed. The package test
  totals were Core 285, Website 47, Engine 60, and SlopBrick 3,844 passed with
  15 explicit SlopBrick opt-in skips.
- No source acquisition, redistribution, participant action, rule-state
  change, publish, deployment, tag, push, or remote mutation occurred.

## Revision 19 — 2026-07-18

### Changed

- Started CORPUS-002 to route reviewed Corpus v1 sources by authority,
  integrity, rights, and permitted use without changing source bytes or any
  completed Corpus v1/CAL-001 evidence.
- Added VAL-001 as an owner-only scan-to-rescan validation contract with an
  intentionally empty ledger; the repository owner is the only current tester.
- Parked GTM-001 and removed it from active implementation dependencies. Its
  consent-safe protocol remains dormant with zero sessions and no recruitment
  authorization.
- Kept future team and enterprise demand explicitly unproven; owner testing
  cannot satisfy `future-external-demand-evidence`.

### Evidence

- `docs/superpowers/specs/2026-07-18-corpus-source-use-routing-design.md`
- `docs/execution/plans/CORPUS-002-source-use-routing.md`
- `docs/execution/plans/VAL-001-owner-validation.md`
- `docs/execution/evidence/VAL-001-owner-validation.md`
- No source acquisition, participant action, rule-state change, publish,
  deployment, tag, push, or remote mutation occurred.

## Revision 18 — 2026-07-18

### Changed

- Reran the current checkout's recursive lint, typecheck, full test, and build
  gates; all passed with no tracked generated-file drift.
- Rechecked the live site read-only; it remains the published v0.43.0 artifact
  with the previously recorded rule-count and privacy-copy contradictions.
- Refreshed the canonical snapshot and SB-045 plan so the current green run is
  separated from the older host-sensitive qualification receipt.

### Evidence

- `docs/execution/STATUS.md`
- `docs/execution/plans/SB-045-trust-release.md`
- `docs/execution/index.json`
- No publish, deployment, tag, push, admission, or remote mutation occurred.

## Revision 17 — 2026-07-17

### Changed

- Reran the current checkout's recursive lint, typecheck, full test, and build
  gates after the CAL-001 holdout and decision-matrix slice; all passed.
- Updated the canonical status snapshot so the current gate state is not
  confused with the older SB-045 host-sensitive qualification receipt.

### Evidence

- `docs/execution/STATUS.md`
- `docs/execution/index.json`
- No publish, deployment, tag, push, admission, or remote mutation occurred.

## Revision 16 — 2026-07-17

### Changed

- Completed the bounded CAL-001 decision boundary with a deterministic matrix
  covering all 119 registry rules: 72 AI-specific rows remain `default-off`
  and 47 non-AI rows remain `quality-only`.
- Recorded 40 AI-specific rows as `owner-review-required` because the matrix
  does not silently change current shipped policy; the output is
  `applied: false` and `admitted: false`.
- Marked CAL-001 `done` for this protocol while leaving independent
  usefulness review, threshold changes, default-state changes, and admission
  as a new owner-reviewed follow-up boundary.

### Evidence

- `docs/execution/evidence/CAL-001-calibration-decision-matrix.md`
- `docs/execution/plans/CAL-001-heldout-calibration.md`
- `docs/execution/index.json`
- No publish, deployment, tag, push, admission, or remote mutation occurred.

## Revision 15 — 2026-07-17

### Changed

- Executed the frozen CAL-001 Corpus v1 holdout at
  `45d2dd038107d3d1d7731192126bf0d48dd6f84b` with one worker across all
  10,000 eligible source-bound rows: 7,970 train, 991 validation, and 1,039
  test.
- Recorded 10,000/10,000 successful scans with zero parse, timeout, scanner,
  exact cross-label, normalized cross-label, or family-split leakage failures.
- Kept the result diagnostic-only with binary scanner output measured as-is;
  no threshold was fitted or selected, no rule was activated, and usefulness
  and admission remain unevaluated.
- Kept CAL-001 `in_progress` for the per-rule confound review and bounded
  non-admitting decision matrix.

### Evidence

- `docs/execution/evidence/CAL-001-calibration-holdout-receipt.md`
- `docs/execution/plans/CAL-001-heldout-calibration.md`
- `docs/execution/index.json`
- No publish, deployment, tag, push, admission, or remote mutation occurred.

## Revision 14 — 2026-07-17

### Changed

- Added the deterministic CAL-001 100-positive/100-negative one-worker smoke
  adapter and package runner without admitting data, tuning thresholds, or
  activating rules.
- Recorded the source-bound scanner receipt and path-free metrics: 200/200
  selected files succeeded, the catalog contained 119 rules, and the receipt
  remains `admitted: false`.
- Bound the smoke evidence to the frozen protocol, Corpus v1 manifests,
  source-binding receipt, eligible projection, implementation commit, and
  repeated byte-identical output hashes.
- Moved CAL-001 to `in_progress` for the full frozen holdout evaluation while
  keeping GTM-001 `ready` until a real pilot is scheduled.

### Evidence

- `docs/execution/evidence/CAL-001-calibration-smoke-receipt.md`
- `docs/execution/plans/CAL-001-heldout-calibration.md`
- `docs/execution/index.json`
- No threshold, default state, admission, publish, deployment, or remote
  mutation occurred.

## Revision 13 — 2026-07-17

### Changed

- Created and froze the `CAL-001-v1` leakage-safe calibration protocol at
  `docs/execution/evidence/CAL-001-protocol.md`.
- Bound the protocol to the verified Corpus v1 candidate, source-binding,
  family-safe split, eligible projection, and non-admitting smoke receipts.
- Registered the required train/validation/test boundary, per-rule metrics,
  confound and leakage report, separate origin/usefulness tables, and the
  admission-matrix contract before any calibration run.
- Moved CAL-001 from `draft` to `ready`; no calibration smoke, heldout
  evaluation, rule activation, admission decision, publish, deployment, or
  remote mutation occurred.

### Evidence

- `docs/execution/evidence/CAL-001-protocol.md`
- `docs/execution/plans/CAL-001-heldout-calibration.md`
- `docs/execution/index.json`
- No calibration result or new admission claim was created.

## Revision 12 — 2026-07-17

### Changed

- Moved `SB-045` from `in_progress` to `waiting_external` after a read-only
  live-site check confirmed the remaining claim drift. The exact resume input
  is now an owner decision to deploy a named reviewed SHA or to keep the live
  v0.43 site unchanged while v0.45 remains local-only.
- Created the consent-safe `GTM-001` pilot protocol and blank outcome table at
  `docs/research/vibecoder-pilots.md`. It records zero sessions, forbids raw
  source and identity collection by default, and keeps participant behavior
  separate from calibration evidence.
- Kept GTM-001 `ready` until the first pilot is actually scheduled; no
  participant recruitment, external message, publish, deployment, or remote
  mutation occurred.

### Evidence

- `docs/execution/plans/SB-045-trust-release.md`
- `docs/execution/plans/GTM-001-vibecoder-pilots.md`
- `docs/research/vibecoder-pilots.md`
- No tag, push, release, publish, deployment, admission, or remote mutation
  occurred.

## Revision 11 — 2026-07-17

### Changed

- Resolved the SB-045 self-scan no-go without changing the score threshold or
  claiming current v10.3 calibration: `ai/compression-profile` is now
  explicitly default-off/opt-in because the current admitted v10.3 evidence
  set is zero. Historical calibration metadata remains diagnostic-only.
- Added the red/green signal-strength contract and updated synthetic score
  fixtures to opt in explicitly when they are testing the calibration signal.
- Regenerated the local website product facts so the candidate's
  `defaultOffCount` is 37 and the compression signal is represented as
  default-off in the artifact-derived metadata.
- Re-ran the exact package-local self-scan: 263/263 files analyzed, zero
  runtime failures, zero active AI-specific signals, 11 non-AI hygiene
  findings, 671 audit-only suppressed findings, AI Slop Score `0.0 <= 15`,
  and process exit `0`.
- Recorded the serialized full-package receipt at 350 files and 3,822 tests
  passed with 5 files and 15 tests skipped. Recursive typecheck/build pass;
  the recursive test command retains seven host-sensitive failures in beacon,
  special-mode, and sandboxed packed-install cases, all isolated from the
  green package receipt.
- Packed Node 22/24 diagnostic passed against tarball SHA-256
  `a1289b32f42e6b1018661918ea866f88f2d5757c1a769c34b96eb596fcb7555e`.

### Evidence

- `docs/execution/evidence/SB-045-gate-decision.md`
- `docs/execution/evidence/SB-045-release-qualification.md`
- No tag, push, release, publish, deployment, admission, or remote mutation
  occurred.

## Revision 10 — 2026-07-17

### Changed

- Completed the SB-045 trust-release implementation checkpoint at
  `aa2bb36328da0434a6fea7a1fba24552de9c78af`: one typed gate decision now
  drives report projections and scan exit, incomplete scans fail closed, and
  fix/dry-run/heatmap paths cannot bypass the decision.
- Bound automated fixes to finding identity and source/target snapshots, with
  explicit stale/ambiguous/unbound skip reasons and no gated opportunistic
  file-wide codemods.
- Implemented the durable finding-identity debt baseline and tested
  `ci --max-new-issues` against current-versus-new debt, including fail-closed
  missing/config-mismatched baseline behavior.
- Completed the current release qualification: recursive typecheck, tests,
  build, RAM-safe package tests, and packed Node 22/24 diagnostic are green.
  The package-local self-scan is complete but remains a no-go at
  `18.831558603262913 > 15`.

### Evidence

- `docs/execution/evidence/SB-045-gate-decision.md`
- `docs/execution/evidence/SB-045-release-qualification.md`
- No tag, push, release, publish, deployment, admission, or remote mutation
  occurred.

## Revision 9 — 2026-07-17

### Changed

- Completed the bounded post-smoke eligible local projection and its
  independent cross-label leak audit.
- The pinned source retained 5,000 positive and 5,000 negative eligible rows,
  with 7,970 train, 991 validation, and 1,039 test rows; quarantine and
  unresolved exact/normalized cross-label counts were zero.
- The eligible manifest SHA-256 is
  `286134799c7f75837a7c292f0d18721d8da9263c25c041eef0ac4734801b52d8`; the
  projection receipt SHA-256 is
  `9f5274f57ed4adf9d1c1ef55205493e9a833abc86cb8e1ca2b332cd8c72d28ba`.
- The receipt records one worker, 10,000 candidate rows read, 10,000 eligible
  rows projected, 6,195,562 accounted bytes, and an 11,406-byte maximum unit.
  Corpus v1 remains source-attested, internal-analysis, and non-admitting.

### Evidence

- `packages/slopbrick/src/calibration/corpus-v1/eligible.ts`
- `packages/slopbrick/tests/calibration/corpus-v1-eligible.test.ts`
- `docs/execution/evidence/CORPUS-001-seed-receipt.md`
- No corpus source byte, admission record, remote repository, release, publish,
  deployment, or archive state changed.

## Revision 8 — 2026-07-17

### Changed

- Added the non-admitting Corpus v1 smoke builder and red-first contract test.
- The builder selects exactly 100 unique exact-content eligible units per
  publisher-declared polarity using the versioned hash-ranked policy
  `corpus-v1-smoke-hash-rank-v1`; same-label exact duplicates use the
  lexicographically smallest eligible source record as the counting owner.
- The pinned source produced a deterministic 200-row smoke with 159 train, 17
  validation, and 24 test rows. The manifest SHA-256 is
  `bdbcd43279077fa760ae3c99da05b953c38134022fa34626b69a6b6400be00de`; the
  receipt SHA-256 is
  `ccd74f7b9db49adc802c042df0d7b732d8284d2bbfc4e6ec39e6a1c001c60830`.
- The receipt binds the source-binding receipt, candidate-manifest hash, and
  leakage-plan hash, and explicitly remains `publisher_attested`,
  `internal_analysis`, and `admitted: false`.

### Evidence

- `packages/slopbrick/src/calibration/corpus-v1/smoke.ts`
- `packages/slopbrick/tests/calibration/corpus-v1-smoke.test.ts`
- `docs/execution/evidence/CORPUS-001-seed-receipt.md`
- No corpus source byte, admission record, remote repository, release, publish,
  deployment, or archive state changed.

## Revision 7 — 2026-07-17

### Changed

- Parsed the pinned publisher CSV directly with strict multiline/quote/UTF-8
  handling and reconciled all 10,000 rows one-to-one with the projection.
- Bound each publisher row's ordinal, deterministic record ID, problem, AI or
  Human polarity, language, source claim, byte count, and both content hashes.
- Frozen row-binding SHA-256
  `86b46373ba0cae5149a722777eeff537b27c7a8d43fd8259fa8c197ea1bd300c`
  and receipt SHA-256
  `47bd66907ec2efa67da718e0cfb38458151ca84d3cdedc941488fe4b001475ac`
  were reproduced across independent reads.
- Advanced `CORPUS-001` to the deterministic 100-positive/100-negative smoke.

### Evidence

- `packages/slopbrick/src/calibration/corpus-v1/source-binding.ts`
- `packages/slopbrick/tests/calibration/corpus-v1-source-binding.test.ts`
- `docs/execution/evidence/CORPUS-001-seed-receipt.md`
- No corpus source byte, admission record, remote repository, release, publish,
  deployment, or archive state changed.

## Revision 6 — 2026-07-17

### Changed

- Quarantined exact and normalized cross-label collision groups before split
  assignment and propagated quarantine to every member of an affected family.
- Kept each family and same-label exact/normalized duplicate group inside one
  deterministic, versioned 80/10/10 hash bucket.
- Verified the 10,000-row candidate plan with zero exact and zero normalized
  cross-label collision rows: 7,970 train, 991 validation, 1,039 test, and zero
  quarantine rows. Canonical plan SHA-256:
  `9c4638526e9a4161d3e74f70197f0b25717439e6bd477bef98664a03c9a9219c`.
- Advanced `CORPUS-001` to raw CSV row binding. Publisher label/source columns
  must reconcile to every projection row before the 100/100 smoke.

### Evidence

- `packages/slopbrick/src/calibration/corpus-v1/plan.ts`
- `packages/slopbrick/tests/calibration/corpus-v1-plan.test.ts`
- `docs/execution/evidence/CORPUS-001-seed-receipt.md`
- No corpus source byte, admission record, remote repository, release, publish,
  deployment, or archive state changed.

## Revision 5 — 2026-07-17

### Changed

- Rehashed all 10,000 pinned Mendeley projection units through one-file-at-a-
  time reads and emitted deterministic candidate rows with content and
  normalized hashes, family keys, source authority, license evidence, and
  `internal_analysis` rights disposition.
- Verified 5,000 positive and 5,000 negative candidate rows with zero local
  integrity quarantines; two real-source projections produced manifest
  SHA-256 `c15d3cbc95f251b5a0514da14b3f8a90e26124fbfb7db5ce342a873635b383ac`.
- Kept every row at `split: unassigned` and candidate-only. Cross-label
  collision quarantine, family-safe splits, smoke receipts, admission, raw CSV
  row binding, and calibration remain open.

### Evidence

- `packages/slopbrick/src/calibration/corpus-v1/manifest.ts`
- `packages/slopbrick/tests/calibration/corpus-v1-manifest.test.ts`
- `docs/execution/evidence/CORPUS-001-seed-receipt.md`
- No corpus source byte, remote repository, release, publish, deployment, or
  archive state changed.

## Revision 4 — 2026-07-17

### Changed

- Verified the bounded, read-only Corpus v1 inventory against the pinned local
  Mendeley projection: 10,000 rows and regular files, split 5,000 publisher-
  declared AI positives and 5,000 publisher-declared Human negatives.
- Kept the result at `publisher_attested` / `internal_analysis`: it is not
  witnessed authorship, a quality label, redistribution approval, leakage
  proof, or corpus admission.
- Advanced `CORPUS-001` to the deterministic manifest-projection checkpoint;
  per-unit rehashing, normalized collision checks, family-aware splits, smoke
  receipts, and admission remain open.

### Evidence

- `packages/slopbrick/src/calibration/corpus-v1/inventory.ts`
- `packages/slopbrick/tests/calibration/corpus-v1-inventory.test.ts`
- `docs/execution/evidence/CORPUS-001-seed-receipt.md`
- No source corpus bytes, remote repository, release, publish, deployment, or
  archive state changed.

## Revision 3 — 2026-07-17

### Changed

- Completed the additive documentation control plane and reconciled current
  roadmap, package, generated CLI/MCP, calibration, public-artifact, website,
  and workflow claims without publishing or deploying them.
- Pinned public v0.43 facts to a verified npm release receipt while keeping the
  unreleased v0.45 workspace candidate visibly separate.
- Accepted the Corpus v1 admission decision as an internal-analysis contract:
  publisher-attested origin labels are not witnessed authorship, quality, gold
  labels, or redistribution permission.
- Isolated the exact nineteen-path stale-document inventory in
  `DOC-PRUNE-001`; no listed path was moved or deleted without owner approval.
- Hardened deployment ordering and privileged `workflow_run` handling, and
  hardened plan/archive validation against hollow sections and symlinked or
  non-regular archive targets.

### Status transitions

- `PLAT-001`: `in_progress` -> `done` (canonical authority and current-truth
  reconciliation implemented and reviewed).
- `CORPUS-DEC-001`: `ready` -> `done` (admission ADR accepted).
- `CORPUS-001`: `draft` -> `in_progress` (bounded read-only inventory test is
  now the active corpus action).
- `DOC-PRUNE-001`: added as `waiting_external` (exact path approval only; it
  does not block the active implementation or company lanes).

### Evidence

- `packages/website/src/data/published-release-receipt.json`
- `docs/decisions/corpus-v1-admission.md`
- `scripts/validate-execution-docs.test.mjs`
- `.github/workflows/deploy-website.yml`
- `packages/website/tests/a11y/live-terminal.spec.ts`
- No release, publish, deployment, branch push, corpus deletion, archive
  migration, or other remote mutation occurred.

## Revision 2 — 2026-07-17

### Changed

- Started `SB-045` in the second available implementation slot after claim,
  generated-document, public-artifact, website, and workflow reconciliation
  produced release-relevant work.
- Hardened the planning validator around exact plan indexing, required plan
  sections, status agreement, external-wait metadata, canonical paths, and
  cryptographic archive receipts.
- Recorded the live website drift and the inert `ci --max-new-issues` option as
  explicit work rather than silently treating either surface as correct.

### Status transitions

- `SB-045`: `ready` -> `in_progress` (artifact/claim reconciliation started;
  the typed gate-decision red test remains the next action).
- `PLAT-001`: remains `in_progress` pending final review and the separately
  approval-gated archive decision.

### Evidence

- `scripts/validate-execution-docs.test.mjs`
- `packages/website/src/data/published-release-receipt.json`
- `docs/execution/STATUS.md`
- No release, publish, deployment, corpus deletion, archive migration, or
  remote mutation occurred.

## Revision 1 — 2026-07-17

### Added

- One repository-level roadmap, machine-readable execution index, current
  status snapshot, bounded plan directory, and recoverable archive contract.
- Separate plans for the Corpus v1 admission decision, seed construction, and
  later calibration so corpus work can advance without pretending evidence is
  already admitted.
- A company track for five vibecoder scan-to-rescan pilots.

### Changed

- Positioned vibecoders as the main entry, SlopBrick as the front door,
  MemoryBrick as the substrate, LockBrick as the first paid team product, and
  MendBrick as later deterministic repair.
- Folded PickBrick into `usebrick init` and policy authoring.
- Re-scoped v0.45 as a trust/reliability release with no new rules.
- Added WIP limits of two implementation plans and one company plan.
- Replaced project-wide blocker language with lane-local waiting and a
  preserve/replace/continue rule that never fabricates evidence.

### Status transitions

- `PLAT-001`: `draft` -> `in_progress` (central control-plane implementation
  started; this revision).
- `SB-045`: `draft` -> `ready` (candidate scope and next red test are bounded;
  `docs/execution/plans/SB-045-trust-release.md`).
- `CORPUS-DEC-001`: `draft` -> `ready` (local evidence decision is executable;
  `docs/execution/plans/CORPUS-DEC-001-admission-contract.md`).
- `GTM-001`: `draft` -> `ready` (five-pilot protocol is bounded;
  `docs/execution/plans/GTM-001-vibecoder-pilots.md`).

### Superseded or archived

- Declared the new authority hierarchy. No legacy file was moved or deleted in
  this additive revision; archive actions remain separately approval-gated.

### Evidence

- `docs/superpowers/specs/2026-07-17-roadmap-consolidation-design.md`
- `docs/execution/STATUS.md`
- No release, publish, deployment, corpus deletion, or remote mutation
  occurred.
