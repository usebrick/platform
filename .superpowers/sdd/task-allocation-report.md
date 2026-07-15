# Task 4 bounded allocation/provenance preview

## Scope

Implemented the authorized read-only preview only. It validates the Core
register/review set before consuming explicit positive/negative inventory
JSONL streams, maps baseline rows to `legacy-ai-slop-baseline`, maps repository
rows to their explicit material source, preserves `legacy-v5-inventory` as a
non-additive aggregate, and emits canonical diagnostic rows. It never writes
corpus artifacts, runs candidates, promotes labels, or claims eligibility.

The stream accepts the existing v10.3 inventory shape, including non-canonical
source key order, slash/Unicode-bearing source identities, local baseline
origins, and `not_available_local_extract` commits. Those unpinned baseline
rows remain quarantine evidence and emit `pinnedCommitSha: null`.

## TDD evidence

RED was run before the implementation module existed:

```text
pnpm --filter slopbrick exec vitest run tests/calibration/v103-admission-allocation-preview.test.ts --pool=forks --poolOptions.forks.maxForks=1 --poolOptions.forks.minForks=1
Error: Cannot find module '../../src/calibration/v103/admission-allocation-preview'
```

GREEN focused verification:

```text
pnpm --filter slopbrick exec vitest run tests/calibration/v103-admission-allocation-preview.test.ts --pool=threads --poolOptions.threads.singleThread=true --reporter=dot
Test Files  1 passed (1)
Tests  21 passed (21)

pnpm --filter slopbrick exec tsc --noEmit
PASS — exit 0
```

`git diff --check` also passed for the task files.

## Actual v10.3 read-only preflight

The current positive and negative inventory files were consumed once with a
bounded line reader. The preview summary is:

| measure | result |
| --- | ---: |
| positive / negative / total | 224,903 / 227,479 / 452,382 |
| baseline / repository | 58,089 / 394,293 |
| allocated / quarantine / unrepresented | 0 / 452,382 / 0 |
| duplicate rows | 0 |
| errors | 0 |

The output is diagnostic-only (`ready=false`, `authorityEligible=false`).
The canonical allocation stream SHA-256 is
`7dfec0cebf6a169cbfa10ba8955f038cb5b6dc74010245a52e1a5cd9b8669097`; the
source-register SHA-256 is
`ce40134968cd9f490b29e695b27fb724ce8d4b8ba9a4abf26eb789cc4c4d78de`.
Inventory file SHA-256 values match the genesis summary: positive
`4511193d10cd39ac7589047e945c531d20752b3344b1d22e96a9d348bc7d34f0` and
negative `85ef9452e96977ec21578a8f87026d374ac510daad20fd34af8d6d363b38c215`.

The all-quarantine reasons are source-level truth, not label promotion:
`source_review_quarantined`, `review_incomplete`, and
`source_wide_quarantine` cover all 452,382 rows; `authorship_unproven` covers
452,382; `evidence_unresolved` and `family_unknown` cover 394,293; and
`license_scope_ambiguous` plus `source_bytes_unbound` cover 58,089.

## Files and commits

Task files:

- `packages/slopbrick/src/calibration/v103/admission-allocation-preview.ts`
- `packages/slopbrick/tests/calibration/v103-admission-allocation-preview.test.ts`
- `.superpowers/sdd/task-allocation-report.md`

Implementation commits are `8d8b23d22` (preview), `9a5976aa5` (review
hardening), and `d1bf476d3` (empty-stream handling). Existing unrelated dirty
and untracked files were not staged or modified.

## Concerns / boundary

The preview does not create the external register generation, per-source
immutable generations, materialization receipts, static ledgers, witnesses,
manifest, eligible census, or authority pointer. Those artifacts remain
required before any candidate/eligible claim. Current external admission
state still has an empty evidence/materialization receipt stream and lacks
`source-register-v1.json`, `register-generations/`, `sources/`,
`authority/current.json`, `global/`, `witnesses/`, `normalizer-registry.json`,
admission records, and eligible census files. The next authorized slice should
no-clobber persist the canonical register/review/materialization inputs and
then publish/verify the allocation ledger while retaining all rows in
quarantine until independent provenance, rights, authorship, and overlap
authority exist.

## Source-level authority triage — 2026-07-15

The live admission pair was checked independently of the row replay: the
register and review ID sets are equal (**329/329**), all 329 reviews carry an
origin and inventory hash, and **325/329** carry a Git materialization commit.
However, every decision is still `source_quarantine` and all
`reviewerDecisionIds` arrays are empty. The recurring blockers are
`review_incomplete` (329 sources / 452,382 units), `authorship_unproven`
(323 / 452,382), `evidence_unresolved` (327 / 394,293), and
`family_unknown` (318 / 394,293). This confirms that origin/commit accounting
is complete enough for deterministic ownership allocation, but it is not
authorship or label authority. Pulling more repositories would not resolve
this deficit; the next useful work is source-level evidence and blinded
decision receipts for existing sources, followed by the bounded smoke/canary
review.

## Offline v8 materialization cross-check — 2026-07-15

The centralized v8 corpus was checked as a possible existing source of
materialization evidence; no explicit acquisition or source promotion was
performed. A preliminary default-mode probe was discarded after Git attempted
to lazy-fetch from one promisor clone. In the final pass, with
`GIT_NO_LAZY_FETCH=1`, six exact-commit positive checkouts matched **2,995 / 2,995**
selected inventory rows by normalized path, byte size, and content SHA-256,
with zero mismatches:
`positive-go-ai--langchaingo`, `positive-roo-code`,
`positive-vibe-coded--browser-use`, `positive-vibe-coded--claude-task-master`,
`positive-vibe-coded--fragments`, and `positive-vibe-coded--get-shit-done`.

A bounded negative slice checked **11,372** rows offline: **11,145** matched
exactly and **227** paths were absent from the old checkout trees; there were
zero size or content-hash mismatches. Two partial/promisor trees
(`negative-celery`, 386 rows, and `negative-python--fastapi`, 526 rows) were
left unavailable rather than fetched. The absent/unavailable rows remain
quarantine evidence. These matches establish local byte/materialization
provenance only; they do not prove authorship, rights, family independence, or
AI/human label authority, so no disposition or census count changed.
