# LOCK-001 — Validate deterministic new-debt enforcement

- **Status:** `draft`
- **Priority:** 9
- **Track / lane:** implementation / lock
- **Owner:** SlopBrick and usebrick platform
- **Updated:** 2026-07-18

## Outcome

The repository owner can prove that one class of verified new critical drift
is blocked without cleaning all existing debt. This owner-only proof does not
establish team adoption, willingness to pay, or package demand.

## Current truth

SlopBrick already has deterministic findings, constitution, diff, threshold,
and baseline primitives. LockBrick is not a standalone package or paid product
yet, and those primitives have not been proven as one team enforcement loop.

## Scope

- One deterministic finding family with stable identity.
- Baseline current debt and fail only on qualifying new debt.
- Clear changed evidence, approved policy source, waiver with reason/expiry,
  incomplete-scan failure semantics, and CI explanation.
- Validate in the existing CLI and CI surface on owner-controlled repositories
  or deterministic fixtures.
- Measure confirmed preventions, false blocks, waivers, and time to resolution;
  leave team and willingness-to-pay evidence explicitly open.

## Non-goals

- Extracting a new package, generic PR review, blocking on advisory/model-only
  findings, multi-repo governance, or replacing SAST.
- Making MemoryBrick a hard dependency before its trust gate.

## Dependencies

- `requires`: `SB-UX-001`
- `benefitsFrom`: `MEM-001`, `VAL-001`

## Acceptance criteria

- Existing baseline debt passes; a new deterministic critical finding fails;
  removing it passes.
- Changed evidence and the applicable approved policy are machine-readable and
  human-readable.
- Incomplete scans never pass silently.
- Waivers require owner/reason/expiry and are visible in output.
- Owner-run receipts exercise the gate on real or deterministic changes and
  report false-block and waiver burden without participant claims.
- Package extraction is decided only after the owner-side CLI validation and
  later external demand evidence; it is not assumed.

## Execution steps

1. Write the failing baseline-delta contract for one finding -> verify:
   `corepack pnpm --filter slopbrick exec vitest run tests/cli/new-debt-gate.test.ts --maxWorkers=1 --minWorkers=1`.
2. Implement the smallest CLI gate from existing primitives -> verify: existing
   debt/pass, new debt/fail, resolved debt/pass fixtures.
3. Add waiver and incomplete-scan semantics -> verify: expired waiver and
   partial scan tests fail safely.
4. Validate on repositories or fixtures selected by the owner -> verify:
   capture change, decision, correction, waiver, and timing receipts without
   raw source or an invented target count.
5. Keep the paid-beta/package decision open -> verify: owner evidence is not
   presented as team adoption or market demand.

## Verification

Run deterministic CLI integration tests plus owner-controlled shadow mode
before enabling any blocking CI configuration.

## Evidence destination

`docs/execution/evidence/LOCK-001-pilot.md`

## Rollback

Disable the gate or return owner validation to shadow mode; preserve baseline
and decision receipts so the failure can be reproduced.

## Next action

After `SB-UX-001`, write the red baseline-delta contract for one deterministic
critical finding in the existing CLI.
