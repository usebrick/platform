# VAL-001 — Validate the scan-to-rescan loop with the repository owner

- **Status:** `in_progress`
- **Priority:** 13
- **Track / lane:** implementation / validation
- **Owner:** repository owner
- **Updated:** 2026-07-18

## Outcome

Record deterministic owner-run scan-to-finding-to-fix-to-rescan walkthroughs and explicit usefulness decisions without participant or market-demand claims.

## Current truth

The repository owner is the only current product tester. CAL-001 measured
origin association but did not evaluate usefulness or apply rule changes.
`VAL-001-RUN-001` now records the first real owner walkthrough: a complete
package-local self-scan, a useful review signal, an owner-approved no-fix
disposition, and an unchanged complete rescan. No participant evidence,
rule-state change, or owner-review-required CAL-001 row follows from it.

## Scope

- Owner-controlled repositories or deterministic fixtures only.
- First useful finding, comprehension, chosen action, fix, and rescan receipts.
- Explicit owner disposition for CAL-001 rows marked `owner-review-required`.

## Non-goals

- Participant recruitment, consent, scheduling, identity collection, or synthetic sessions.
- Claims about market demand, team usability, conversion, or willingness to pay.
- Automatic threshold, default-state, score, admission, publish, or release changes.

## Dependencies

- `requires`: `CAL-001`
- `benefitsFrom`: `CORPUS-002`

## Acceptance criteria

- Every recorded run is performed by the repository owner against an identified local repository or fixture.
- Every row binds scan and rescan receipts plus an explicit usefulness decision.
- Missing evidence remains blank rather than inferred.
- Product decisions remain separate from source labels and origin metrics.

## Execution steps

1. Select one owner-controlled repository or deterministic fixture -> RUN-001
   complete against the SlopBrick package itself.
2. Run the documented local scan and record its receipt -> RUN-001 complete at
   270/270 analyzed files with zero runtime failures.
3. Record the first finding considered useful or explicitly record that none
   was useful -> owner marked the first two file-level hygiene findings useful.
4. Apply or decline one bounded fix and record the reason -> owner approved a
   decline because the evidence identified no concrete defect or safe bounded
   repair.
5. Rescan and record the outcome -> unchanged normalized result reproduced.
6. Repeat only when the owner chooses another repository or fixture; do not
   invent a target count.

## Verification

Check every ledger row for a real scan receipt, explicit owner decision, optional fix receipt, and rescan receipt. Reject synthetic or participant-derived rows.

## Evidence destination

`docs/execution/evidence/VAL-001-owner-validation.md`

## Rollback

Remove an invalid ledger row while retaining the underlying scan receipts; do not reinterpret it as participant or demand evidence.

## Next action

Carry RUN-001's useful/no-safe-fix/unchanged states into `SB-UX-001`. Repeat
the walkthrough only when the owner selects another repository or fixture.
