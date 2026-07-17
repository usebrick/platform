# Execution planning changelog

This is an append-only history of roadmap and plan-control changes. Product
release notes remain in package changelogs.

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
