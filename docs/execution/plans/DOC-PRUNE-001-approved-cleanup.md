# DOC-PRUNE-001 — Archive or delete the approved stale-document inventory

- **Status:** `waiting_external`
- **Priority:** 12
- **Track / lane:** implementation / platform
- **Owner:** usebrick platform
- **Updated:** 2026-07-17

## Outcome

Reduce duplicate and stale planning surfaces without losing historical bytes,
breaking known inbound links, or removing any file the repository owner did not
approve by exact path.

## Current truth

The central roadmap and execution control plane now own current direction and
status. Nineteen legacy paths have been classified for possible archive or
deletion, but none has been moved or deleted because the required exact
path-level owner approval has not yet been recorded.

## Scope

Archive the exact original bytes of these duplicate current-authority surfaces
and leave concise redirects where inbound navigation still needs the old path:

1. `packages/slopbrick/ROADMAP.md`
2. `packages/slopbrick/docs/architecture.md`
3. `docs/rules.md`
4. `packages/website/docs/blog/lifecycle-narrative.md`

Archive these already-bannered historical plans and analyses without rewriting
their contents:

5. `packages/slopbrick/docs/calibration/master-plan-v0.45.md`
6. `packages/slopbrick/docs/calibration/plan-validation-2026-07-09.md`
7. `packages/slopbrick/docs/calibration/v10.2-plan.md`
8. `packages/slopbrick/docs/calibration/ml-integration-analysis.md`
9. `packages/slopbrick/docs/research/v0.18.8-plan.md`
10. `packages/slopbrick/docs/research/v0.18.9-plan.md`
11. `packages/slopbrick/docs/research/v9-plan.md`
12. `packages/slopbrick/docs/research/v9-plan-2026-07-02-update.md`
13. `docs/superpowers/plans/2026-07-09-scan-discovery-release-gates.md`
14. `docs/superpowers/specs/2026-07-09-scan-discovery-and-release-gates-design.md`

Archive the exact original bytes of these consumed Changesets first, then
delete their original paths only if the owner explicitly approves removal:

15. `.changeset/v0.39.0-log-saturation-and-fixes.md`
16. `.changeset/v0.40.0-self-calibration-loop.md`
17. `.changeset/v0.41.0-temporal-drift-composite-reporters.md`
18. `.changeset/v0.42.0-sprint-3-empirical-composites.md`
19. `.changeset/v0.43.0-post-v0.42-user-review-fixes.md`

## Non-goals

- Do not move or edit frozen v10.3 admission contracts, v0.45 continuation and
  handoff evidence, release-materialization evidence, `specs/IMPACT_LATEST.md`,
  `specs/PLAN-AUDIT_LATEST.md`, referenced SDD receipts, package changelogs, or
  the beacon design without a new dependency/hash audit and approval.
- Do not treat this cleanup as a release, publish, deploy, push, corpus
  deletion, or authorization for any remote mutation.
- Do not wait on this lane before continuing SlopBrick or Corpus v1 work.

## Dependencies

- `requires`: `PLAT-001`
- External gate: `OWNER-PATH-APPROVAL`, covering exact numbered entries and
  whether entries 15–19 are removed from their original paths after archival.
- `benefitsFrom`: none

## Acceptance criteria

- Only explicitly approved numbered paths are changed.
- Before any redirect or deletion, every approved original is stored beneath
  `docs/archive/` and recorded with
  its source path, destination, reason, date, SHA-256, and Git blob hash.
- Every retained redirect names the canonical replacement and contains no
  competing strategy or mutable status.
- Approved deletions appear in the planning changelog with their rationale.
- Frozen evidence and every unapproved path remain byte-for-byte untouched.
- The execution validator, relevant links, and `git diff --check` pass.

## Execution steps

1. Record the owner's exact numbered approval and removal disposition for
   entries 15–19 in the evidence destination.
2. Recheck inbound references and divide approved paths into archive,
   archive-plus-redirect, and delete sets.
3. Copy original bytes into dated archive paths, calculate SHA-256 and Git blob
   hashes, and update `docs/archive/MANIFEST.json` before changing originals.
4. Verify every archive receipt, then replace approved inbound paths with
   redirects and remove only approved consumed Changeset originals.
5. Run the validator, link checks, diff checks, and a path-by-path status audit.

## Verification

```bash
corepack pnpm plans:validate
git diff --check
git status --short
```

Compare the final changed-path set against the recorded numbered approval and
verify every archive receipt against the bytes on disk.

## Evidence destination

`docs/execution/evidence/DOC-PRUNE-001-approval.md` records the owner's exact
approval; the completed byte receipts belong in `docs/archive/MANIFEST.json`.

## Rollback

Restore redirected or deleted paths from their hash-verified archive copies,
remove the corresponding manifest entries, and rerun the planning validator.
No product behavior or remote state should change in this plan.

## Next action

Present the numbered inventory to the repository owner and wait for exact
approval while `SB-UX-001`, `TEL-001`, and owner-only validation may continue.

## Waiting external

- **Exact input:** Explicit approval or rejection for each numbered path above,
  including removal-after-archive disposition for entries 15–19.
- **Owner:** Repository owner.
- **Last verified:** 2026-07-17; no listed path has been moved or deleted.
- **Evidence:** `docs/execution/evidence/DOC-PRUNE-001-approval.md`.
- **Resume condition:** The evidence file records an unambiguous disposition
  for every approved numbered entry.
- **Recheck:** `git status --short` plus a byte/hash comparison before acting.
- **Parallel safe:** `SB-UX-001`, `TEL-001`, and `VAL-001` can advance without
  this cleanup. `REL-001` remains a separate public-authority wait, and no
  participant recruitment is authorized.
