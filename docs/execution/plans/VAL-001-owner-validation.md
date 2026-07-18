# VAL-001 — Validate the scan-to-rescan loop with the repository owner

- **Status:** `ready`
- **Priority:** 13
- **Track / lane:** implementation / validation
- **Owner:** repository owner
- **Updated:** 2026-07-18

## Outcome

Record deterministic owner-run scan-to-finding-to-fix-to-rescan walkthroughs and explicit usefulness decisions without participant or market-demand claims.

## Current truth

The repository owner is the only current product tester. CAL-001 measured origin association but did not evaluate usefulness or apply rule changes. No owner walkthrough is recorded yet.

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

1. Select one owner-controlled repository or deterministic fixture.
2. Run the documented local scan and record its receipt.
3. Record the first finding considered useful or explicitly record that none was useful.
4. Apply or decline one bounded fix and record the reason.
5. Rescan and record the outcome.
6. Repeat only when the owner chooses another fixture; do not invent a target count.

## Verification

Check every ledger row for a real scan receipt, explicit owner decision, optional fix receipt, and rescan receipt. Reject synthetic or participant-derived rows.

## Evidence destination

`docs/execution/evidence/VAL-001-owner-validation.md`

## Rollback

Remove an invalid ledger row while retaining the underlying scan receipts; do not reinterpret it as participant or demand evidence.

## Next action

Run the first real owner-controlled scan walkthrough and record it only after the owner performs it.
