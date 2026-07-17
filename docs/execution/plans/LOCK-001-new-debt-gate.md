# LOCK-001 — Pilot deterministic new-debt enforcement

- **Status:** `draft`
- **Priority:** 9
- **Track / lane:** implementation / lock
- **Owner:** SlopBrick and usebrick platform
- **Updated:** 2026-07-17

## Outcome

Two pilot teams can prevent one class of verified new critical drift without
cleaning all existing debt and without an unacceptable false-block or waiver
burden.

## Current truth

SlopBrick already has deterministic findings, constitution, diff, threshold,
and baseline primitives. LockBrick is not a standalone package or paid product
yet, and those primitives have not been proven as one team enforcement loop.

## Scope

- One deterministic finding family with stable identity.
- Baseline current debt and fail only on qualifying new debt.
- Clear changed evidence, approved policy source, waiver with reason/expiry,
  incomplete-scan failure semantics, and CI explanation.
- Pilot in the existing CLI and CI surface.
- Measure confirmed preventions, false blocks, waivers, time to resolution, and
  willingness to pay.

## Non-goals

- Extracting a new package, generic PR review, blocking on advisory/model-only
  findings, multi-repo governance, or replacing SAST.
- Making MemoryBrick a hard dependency before its trust gate.

## Dependencies

- `requires`: `SB-UX-001`
- `benefitsFrom`: `MEM-001`, `GTM-001`

## Acceptance criteria

- Existing baseline debt passes; a new deterministic critical finding fails;
  removing it passes.
- Changed evidence and the applicable approved policy are machine-readable and
  human-readable.
- Incomplete scans never pass silently.
- Waivers require owner/reason/expiry and are visible in output.
- Two pilots run the gate on real changes and report false-block and waiver
  burden.
- Package extraction is decided only after the CLI pilot, not assumed.

## Execution steps

1. Write the failing baseline-delta contract for one finding -> verify:
   `corepack pnpm --filter slopbrick exec vitest run tests/cli/new-debt-gate.test.ts --maxWorkers=1 --minWorkers=1`.
2. Implement the smallest CLI gate from existing primitives -> verify: existing
   debt/pass, new debt/fail, resolved debt/pass fixtures.
3. Add waiver and incomplete-scan semantics -> verify: expired waiver and
   partial scan tests fail safely.
4. Pilot on two repositories -> verify: capture change, decision, correction,
   waiver, and timing receipts without raw source.
5. Make the paid-beta/package decision -> verify: compare evidence with the
   roadmap team-monetization gate.

## Verification

Run deterministic CLI integration tests plus pilot shadow mode before enabling
any blocking CI configuration.

## Evidence destination

`docs/execution/evidence/LOCK-001-pilot.md`

## Rollback

Disable the gate or return pilots to shadow mode; preserve baseline and decision
receipts so the failure can be reproduced.

## Next action

After `SB-UX-001`, write the red baseline-delta contract for one deterministic
critical finding in the existing CLI.
