# MEND-001 — Prove the first deterministic reversible repair

- **Status:** `parked`
- **Priority:** 10
- **Track / lane:** implementation / mend
- **Owner:** usebrick platform
- **Updated:** 2026-07-18

## Outcome

Prove one narrow repair can transform an already trusted deterministic finding,
rescan cleanly, pass repository checks, remain idempotent, and roll back
without collateral edits.

## Current truth

MendBrick is not shipped and arbitrary AI refactoring is outside the product
boundary. The plan remains parked until owner-side LockBrick validation
demonstrates sufficient finding precision and repair trust. Team demand remains
separate and unproven.

## Scope

- Select one high-confidence, mechanically expressible LockBrick finding.
- Define preconditions, exact edit boundary, dry-run diff, idempotence, rescan,
  repository gate, and rollback contracts.
- Run on fixtures, then owner-controlled repositories selected explicitly for
  local validation.

## Non-goals

- General autonomous refactoring, multi-file architectural migrations,
  model-only fixes, or repairs without repository test verification.
- Starting before the LockBrick trust gate.

## Dependencies

- `requires`: `LOCK-001`
- `benefitsFrom`: `CAL-001`
- Resume gate: LockBrick owner-validation precision is accepted and at least
  one enforced finding has a deterministic transformation the owner wants to
  evaluate.

## Acceptance criteria

- Preconditions reject ambiguous, stale, already-fixed, or unsupported code.
- Dry-run shows the exact bounded edit and never mutates.
- Apply is deterministic and a second apply is a no-op.
- Rescan removes only the intended finding and repository checks pass.
- Rollback restores byte-identical original files.
- The repository owner explicitly accepts or rejects the repair; rejected
  repairs remain evidence without becoming participant or demand claims.

## Execution steps

1. Select the repair only after the resume gate -> verify: cite the trusted
   LockBrick finding and explicit owner usefulness decision.
2. Red-test preconditions, dry-run, apply, idempotence, and rollback -> verify:
   run the focused repair test with one worker.
3. Implement the deterministic transformer -> verify: byte-for-byte fixture
   comparison and second-run no-op.
4. Owner-controlled opt-in -> verify: rescan, repository tests, rollback, and
   owner acceptance receipts.

## Verification

The repair proof requires fixture hashes, dry-run/apply parity, idempotence,
rescan, repository tests, and byte-identical rollback.

## Evidence destination

`docs/execution/evidence/MEND-001-repair-proof.md`

## Rollback

Use the stored pre-edit bytes to restore affected files, then rerun the same
repository checks and scan.

## Next action

Remain parked until `LOCK-001` proves a trusted enforced finding and the owner
chooses its deterministic repair for evaluation.
