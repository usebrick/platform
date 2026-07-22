# TEL-001 — Define privacy-safe local outcome events

- **Status:** `ready`
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
finding, immediate repair declined because no safe fix existed, unchanged
rescan—but it does not authorize event implementation before `SB-UX-001`
defines the typed finding/outcome boundary.

`CAL-002` has completed the separate 119-rule policy and provenance closeout.
This plan remains `ready`; it neither consumes WIP nor waits for a rule-state,
admission, release, or deployment change.
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
- Explicit consent and configuration semantics for any outbound reporting.
- Inspect, export, and delete commands or equivalent library operations.
- Data minimization: detector/version, framework bucket, size bucket, outcome,
  confidence, coarse timing, and optional broad reason.
- Tests proving raw snippets, file contents, absolute paths, repository names,
  remotes, and proprietary IDs are absent by default.

## Non-goals

- Hosted ingestion, user tracking, raw code upload, opaque model training, or
  public rule-quality dashboards.
- Treating a dismissal as proof that a rule is false.
- Changing finding severity from unreviewed local events.
- Using local or aggregated outcomes to override approved repository intent or
  automatically activate, retire, or recalibrate a rule.

## Dependencies

- `requires`: `SB-045`
- `benefitsFrom`: `SB-UX-001`, `VAL-001`

## Acceptance criteria

- The schema is versioned, documented field-by-field, and rejects unknown
  sensitive fields.
- No event leaves the machine unless the user explicitly enables the defined
  outbound path.
- Users can inspect, export, and delete local events.
- Tests cover opt-out, consent transition, redaction, corrupt storage, and
  deletion.
- Documentation distinguishes local history from outbound reporting.
- Outcome events remain product/workflow observations and cannot be promoted
  to calibration labels, source authority, or authorship evidence.
- Repository-local approved policy wins over any future global prior.
- Any future hosted use requires a separate privacy and authorization gate.

## Execution steps

1. Write the schema/threat-model tests -> verify:
   `corepack pnpm --filter slopbrick exec vitest run tests/telemetry/outcome-event.test.ts --maxWorkers=1 --minWorkers=1`.
2. Model useful/action-or-decline/rescan/return outcomes, then implement the
   minimal local event writer/reader over a user-controlled path ->
   verify: focused tests cover corrupt and absent storage.
3. Add inspect/export/delete behavior -> verify: round-trip then deletion leaves
   no records.
4. Reconcile CLI and website privacy wording -> verify: search current docs for
   contradictory "no telemetry" claims.

## Verification

Inspect serialized fixtures directly and run a negative grep for source text,
absolute paths, repository names, and remotes.

## Evidence destination

`docs/execution/evidence/TEL-001-contract.md`

## Rollback

Disable event writing and remove local generated records through the supported
delete path. Preserve schema/test evidence for review.

## Next action

After `SB-UX-001` closes Task 8, specify and test the smallest local event
capable of representing RUN-001's useful,
declined-no-safe-fix, unchanged-rescan, and bounded return states with no raw
source or proprietary repository identifier. Keep outbound reporting opt-in.
