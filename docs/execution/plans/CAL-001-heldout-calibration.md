# CAL-001 — Calibrate candidate signals on leakage-safe holdouts

- **Status:** `ready`
- **Priority:** 5
- **Track / lane:** implementation / calibration
- **Owner:** calibration maintainers
- **Updated:** 2026-07-17

## Outcome

Measure each candidate signal on frozen, repository-family-safe holdouts and
make an explicit default-on, default-off, recalibrate, or retire decision
without conflating origin discrimination with code-quality usefulness.

## Current truth

Corpus v1 now has a verified source-attested eligible projection and
family-aware split plan. `CAL-001-v1` freezes those input hashes, the
train/validation/test tuning boundary, the separate origin/usefulness metrics,
and the admission matrix at
`docs/execution/evidence/CAL-001-protocol.md`. No calibration run has been
performed, and v10.3 still has zero admitted units; the protocol cannot support
a new calibration claim by itself.

## Scope

- Pre-register rule metrics, thresholds, cohorts, confound reports, and
  admission decisions.
- Freeze family-aware holdouts before fitting or threshold changes.
- Report origin-class performance separately from finding usefulness and
  framework/repository confounds.
- Retain unmeasured or failed signals as default-off or retire them.

## Non-goals

- Optimizing on the heldout test set, activating every candidate rule, or
  changing the composite score to manufacture a release.
- Claiming AI authorship for individual files.
- Using ecological unknowns as labeled training data.

## Dependencies

- `requires`: `CORPUS-001`
- `benefitsFrom`: `TEL-001`

## Acceptance criteria

- The protocol and split hashes are frozen before tuning.
- Per-rule reports include sample counts, recall, false-positive burden,
  confidence intervals or uncertainty, framework slices, and family leakage
  checks.
- Quality/usefulness and origin-discrimination results appear in separate
  tables with explicit limitations.
- Every candidate receives a recorded decision and rationale; unproven rules
  remain default-off.
- The result is reproducible from the manifest, config, code commit, and
  command receipt.

## Execution steps

1. Freeze the protocol, metrics, and admission matrix -> complete; verify:
   `test -f docs/execution/evidence/CAL-001-protocol.md` and compare the
   recorded Corpus v1 input hashes.
2. Run a small end-to-end calibration smoke -> verify: reproduce its report
   hash using one worker.
3. Execute the frozen holdout evaluation -> verify: no family or normalized
   cross-label leakage is reported.
4. Review confounds and assign rule decisions -> verify: every candidate row
   has a decision, evidence link, and owner.

## Verification

Re-run from clean generated output using the recorded fixed seed and one-worker
configuration before widening concurrency.

## Evidence destination

`docs/execution/evidence/CAL-001-calibration-report.md`

## Rollback

Revert threshold/default-state changes while preserving the frozen reports and
failed-signal evidence.

## Next action

Run the small end-to-end calibration smoke from the frozen protocol with one
worker before any fitting or threshold selection.
