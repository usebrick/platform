# Execution planning changelog

This is an append-only history of roadmap and plan-control changes. Product
release notes remain in package changelogs.

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
