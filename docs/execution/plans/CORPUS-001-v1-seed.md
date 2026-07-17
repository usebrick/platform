# CORPUS-001 — Build a reproducible source-attested Corpus v1 seed

- **Status:** `in_progress`
- **Priority:** 4
- **Track / lane:** implementation / corpus
- **Owner:** calibration maintainers
- **Updated:** 2026-07-17

## Outcome

Build and verify the smallest useful Corpus v1 seed from locally available,
rights-audited, source-attested material, then emit a deterministic 100-positive
/100-negative smoke receipt before any larger ecological acquisition.

## Current truth

The read-only source inventory reconciles the pinned local projection at
10,000 rows and files: 5,000 publisher-declared AI positives and 5,000
publisher-declared Human negatives. The deterministic candidate projector now
rehashes every unit, emits versioned lexical normalized hashes, binds source,
family, authority, license, and rights fields, and reports zero local integrity
quarantines. Two real-source projections produced candidate-manifest SHA-256
`c15d3cbc95f251b5a0514da14b3f8a90e26124fbfb7db5ce342a873635b383ac`.
This does not parse the raw CSV, quarantine cross-row collisions, freeze
splits, admit rows, or run calibration. v10.3 remains unchanged and
quarantine-only.

## Scope

- Read-only inventory of candidate inputs and publisher metadata.
- Per-unit hashes, source/label/license records, family keys, and deterministic
  splits under the approved ADR.
- Exact and normalized collision quarantine.
- 100/100 smoke followed by the eligible publisher-labeled projection if it
  remains within the rights and evidence contract.
- Bounded memory and worker usage with resumable outputs.

## Non-goals

- Deleting v10.3, pulling half a million files, or using ordinary recent repos
  as human negatives.
- Treating source-attested origin as independently witnessed authorship or as a
  quality score.
- Changing SlopBrick thresholds in this build plan.

## Dependencies

- `requires`: `CORPUS-DEC-001`
- `benefitsFrom`: none

## Acceptance criteria

- The source inventory reconciles expected rows, byte accessibility, label
  mapping, license evidence, duplicates, and malformed entries.
- Every materialized unit has immutable source and content hashes, authority
  tier, license decision, family key, and split.
- Related units never cross train/validation/test family boundaries.
- Exact and normalized cross-label collisions are absent or quarantined with a
  reason.
- Re-running the 100/100 smoke produces the same manifest and receipt hashes.
- Peak resource use is bounded and recorded; no unbounded recursive scan is
  required.
- v10.3 remains unchanged until a separately authorized archival decision.

## Execution steps

1. **Verified 2026-07-17:** add a failing read-only inventory test for the
   approved local projection -> verify: `corepack pnpm --filter slopbrick exec vitest run tests/calibration/corpus-v1-inventory.test.ts --maxWorkers=1 --minWorkers=1`.
2. **Verified 2026-07-17:** implement deterministic candidate-manifest
   projection with per-unit content and normalized hashes, family keys, rights
   disposition, and local integrity quarantine reasons -> verify:
   `corepack pnpm --filter slopbrick exec vitest run tests/calibration/corpus-v1-manifest.test.ts --maxWorkers=1 --minWorkers=1`.
3. Freeze family-aware splits and exact/normalized cross-label collision
   quarantine -> verify: run the dedicated split/leakage tests with one worker.
4. Build the 100/100 smoke twice -> verify: compare manifest and receipt
   SHA-256 values.
5. Expand only to eligible local rows and record resource use -> verify: audit
   counts against the source inventory and zero unresolved cross-label leaks.

## Verification

Use deterministic fixtures first, one worker, fixed seeds, and hash comparison.
Do not interpret raw input count as admitted count.

## Evidence destination

`docs/execution/evidence/CORPUS-001-seed-receipt.md`

## Rollback

Remove generated v1 outputs and retain the read-only inventory/evidence. Do not
alter or delete the v10.3 source tree.

## Next action

Write the red Corpus v1 planning test for exact/normalized cross-label
collision quarantine and deterministic family-level split assignment.
