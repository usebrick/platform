# ENT-001 — Validate repeated enterprise governance demand

- **Status:** `parked`
- **Priority:** 11
- **Track / lane:** company / enterprise
- **Owner:** usebrick company
- **Updated:** 2026-07-18

## Outcome

Decide whether enterprise governance deserves implementation based on repeated
paid-team demand for the same multi-repository controls, not on a speculative
feature checklist.

## Current truth

Usebrick has no proven paid LockBrick cohort requiring organisation-wide SSO,
audit, policy inheritance, private runners, self-hosting, or cross-repository
governance. Building those now would precede the scanner and team trust gates.

## Scope

- After paid LockBrick pilots, collect structured governance requirements,
  buyer/approver role, frequency, current workaround, risk, and willingness to
  pay.
- Cluster repeated needs and distinguish product requirements from procurement
  table stakes.
- Produce a proceed/defer decision and the smallest evidence-backed enterprise
  slice if warranted.

## Non-goals

- Implementing SSO, RBAC, billing, audit infrastructure, multi-repo memory,
  self-hosting, private runners, or compliance certifications in this plan.
- Counting hypothetical interest as paid demand.

## Dependencies

- `requires`: `LOCK-001`
- `benefitsFrom`: `MEM-001`
- External gate: `future-external-demand-evidence` from several independent
  teams that have used the paid/team enforcement workflow long enough to
  report recurring organisation-level needs. Owner testing cannot satisfy it.

## Acceptance criteria

- Several independent paying/team pilots identify the same top need and its
  cost/risk, not merely a generic enterprise wishlist.
- The evidence names the buyer, user, frequency, current workaround, and
  willingness-to-pay signal without exposing private repository data.
- A proceed decision selects one bounded slice with success and stop criteria.
- A defer decision explicitly keeps enterprise infrastructure out of the active
  roadmap and schedules no speculative implementation.

## Execution steps

1. After the resume gate, add a structured demand interview to team pilots ->
   verify: every record contains the same buyer/problem/workaround/value fields.
2. Cluster repeated requirements -> verify: each proposed capability cites
   multiple independent teams.
3. Write the proceed/defer decision -> verify: compare against the roadmap
   enterprise gate and paid-use evidence.

## Verification

Review for repeated paid-team evidence, clear counter-evidence, and absence of
unapproved private identifiers.

## Evidence destination

`docs/execution/evidence/ENT-001-demand.md`

## Rollback

No product code is changed. Retract/anonymize customer evidence on request and
keep the plan parked.

## Next action

Remain parked until `future-external-demand-evidence` shows repeated
multi-repository governance demand from independent teams. Do not infer that
demand from owner testing.
