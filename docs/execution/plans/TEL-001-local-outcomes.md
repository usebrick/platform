# TEL-001 — Define privacy-safe local outcome events

- **Status:** `draft`
- **Priority:** 7
- **Track / lane:** implementation / telemetry
- **Owner:** SlopBrick maintainers
- **Updated:** 2026-07-18

## Outcome

Define and prove a local, inspectable outcome-event contract that can record
fix, dismiss, suppress, intentional, and repair-acceptance outcomes without
raw source or proprietary repository identity by default.

## Current truth

Outbound usage reporting is opt-in, while local scan history is enabled by
default. Those behaviors are currently easy to describe incorrectly as one
telemetry policy. No hosted outcome-learning backend is authorized by this
plan.

## Scope

- Versioned local outcome-event schema and validation.
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

## Dependencies

- `requires`: `SB-045`
- `benefitsFrom`: `VAL-001`

## Acceptance criteria

- The schema is versioned, documented field-by-field, and rejects unknown
  sensitive fields.
- No event leaves the machine unless the user explicitly enables the defined
  outbound path.
- Users can inspect, export, and delete local events.
- Tests cover opt-out, consent transition, redaction, corrupt storage, and
  deletion.
- Documentation distinguishes local history from outbound reporting.
- Any future hosted use requires a separate privacy and authorization gate.

## Execution steps

1. Write the schema/threat-model tests -> verify:
   `corepack pnpm --filter slopbrick exec vitest run tests/telemetry/outcome-event.test.ts --maxWorkers=1 --minWorkers=1`.
2. Implement the minimal local event writer/reader over a user-controlled path ->
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

Specify and test the smallest opt-in local outcome event with no raw source or
proprietary repository identifier.
