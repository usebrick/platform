# Execution planning changelog

This is an append-only history of roadmap and plan-control changes. Product
release notes remain in package changelogs.

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
