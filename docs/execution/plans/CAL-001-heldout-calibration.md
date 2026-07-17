# CAL-001 — Calibrate candidate signals on leakage-safe holdouts

- **Status:** `draft`
- **Priority:** 5
- **Track / lane:** implementation / calibration
- **Owner:** calibration maintainers
- **Updated:** 2026-07-17

## Outcome

Measure each candidate signal on frozen, repository-family-safe holdouts and
make an explicit default-on, default-off, recalibrate, or retire decision
without conflating origin discrimination with code-quality usefulness.

## Current truth

The workspace contains candidate rules/signals, but Corpus v1 and its heldout
splits do not yet exist. v10.3 has zero admitted units and cannot support a new
calibration claim.

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

1. Freeze the protocol, metrics, and admission matrix -> verify: hash the
   protocol and Corpus v1 split manifest.
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

After Corpus v1 is verified, freeze repository-family splits and the rule-by-
rule admission matrix before fitting.
