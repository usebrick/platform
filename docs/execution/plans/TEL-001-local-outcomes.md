# TEL-001 — Define privacy-safe local outcome events

- **Status:** `done`
- **Priority:** 8
- **Track / lane:** implementation / telemetry
- **Owner:** SlopBrick maintainers
- **Updated:** 2026-07-22

## Outcome

Define and prove a privacy-safe, local, inspectable outcome-event contract for
scan completion, first useful finding, action or decline, rescan completion,
and return behavior without raw source or proprietary repository identity by
default.

## Current truth

Outbound usage reporting is opt-in, while local scan history is enabled by
default. Those behaviors are currently easy to describe incorrectly as one
telemetry policy. No hosted outcome-learning backend is authorized by this
plan. The required `SB-045` local qualification is complete. Public release
and website deployment remain under `REL-001` and do not block this local
contract. `VAL-001-RUN-001` supplies one real local outcome sequence—useful
finding, immediate repair declined because no safe fix existed, and unchanged
rescan. `SB-UX-001` is now complete and supplies the typed
finding/action/change boundary this plan consumes.

`CAL-002` has completed the separate 119-rule policy and provenance closeout.
This plan completed at implementation checkpoint `be2a784f5` and no longer
consumes implementation WIP. It did not require a rule-state, admission,
release, or deployment change.
Local outcome history and outbound reporting remain separate: outbound stays
off by default and endpoint-gated, and this plan does not authorize hosted
ingestion.

This contract is the local foundation for a possible global slop-intelligence
plane. Any later aggregation remains opt-in and privacy-safe. A global prior
may inform reviewed confidence, but it cannot override explicit repository
policy or silently become a quality label, severity change, calibration
admission, source authority, or authorship claim.

## Scope

- Versioned local outcome-event schema and validation.
- Privacy-safe events for scan completion, first useful finding, action taken
  or declined, rescan completion, return within an observation window, and an
  optional coarse team/workflow signal after separately authorized research.
- Explicit separation from existing opt-in outbound reporting; any future
  outcome transport requires its own consent and authorization contract.
- Inspect, export, and delete commands or equivalent library operations.
- Data minimization: detector/version, framework bucket, size bucket, outcome,
  evidence tier, coarse timing, and optional broad reason.
- Tests proving raw snippets, file contents, absolute paths, repository names,
  remotes, and proprietary IDs are absent by default.

## Non-goals

- Hosted ingestion, user tracking, raw code upload, opaque model training, or
  public rule-quality dashboards.
- Treating a dismissal as proof that a rule is false.
- Changing finding severity from unreviewed local events.
- Using local or aggregated outcomes to override approved repository intent or
  automatically activate, retire, or recalibrate a rule.

The completed v1 contract exposes validation plus explicit read, append,
export, and delete library operations over a caller-selected local path.
Normal scans do not write this ledger, and no outcome-event outbound transport
exists. Final dual review returned 98/100 and 98/100 with no must-fix finding;
focused, packed-consumer, recursive, planning, positioning, and self-scan gates
all passed. The closeout receipt records exact counts and retained boundaries.

## Dependencies

- `requires`: `SB-045`
- `benefitsFrom`: `SB-UX-001`, `VAL-001`

## Acceptance criteria

- The schema is versioned, documented field-by-field, and rejects unknown
  sensitive fields.
- No outcome event leaves the machine; v1 defines no outbound path.
- Users can inspect, export, and delete local events.
- Tests cover separation from the existing endpoint-gated beacon, sensitive
  field rejection, corrupt storage, export, and deletion.
- Documentation distinguishes local history from outbound reporting.
- Outcome events remain product/workflow observations and cannot be promoted
  to calibration labels, source authority, or authorship evidence.
- Repository-local approved policy wins over any future global prior.
- Any future hosted use requires a separate privacy and authorization gate.

## Execution steps

1. Completed the schema/threat-model tests -> verified:
   `corepack pnpm --filter slopbrick exec vitest run tests/telemetry/outcome-event.test.ts --maxWorkers=1 --minWorkers=1`.
2. Modeled useful/action-or-decline/rescan/return outcomes and implemented the
   minimal local event writer/reader over a user-controlled path ->
   verified: focused tests cover corrupt and absent storage.
3. Added inspect/export/delete behavior -> verified: round-trip then deletion
   leaves no records.
4. Reconciled CLI and website privacy wording -> verified: current docs contain
   no contradictory blanket "no telemetry" claim.

## Verification

Focused tests pass 30 tests with one platform-conditional skip. Recursive lint,
typecheck, test, and build gates pass; the packed consumer and rebuilt ESM/CJS
entry points expose the complete public API. See the evidence receipt for exact
counts, final review scores, self-scan output, and non-mutation proof.

## Evidence destination

`docs/execution/evidence/TEL-001-contract.md`

## Rollback

Stop callers from invoking append and remove local generated records through
the supported delete path. Preserve schema/test evidence for review.

## Next action

Preserve the qualified local v1 contract and its separation from normal scans,
the existing opt-in beacon, calibration authority, and public release. Hand the
completed dependency to draft `MEM-001`; reopen TEL only for a demonstrated
regression or a separately approved outbound-transport proposal.
