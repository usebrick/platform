# CORPUS-DEC-001 — Approve the Corpus v1 evidence and admission contract

- **Status:** `done`
- **Priority:** 2
- **Track / lane:** implementation / corpus
- **Owner:** calibration maintainers
- **Updated:** 2026-07-18

## Outcome

Approve a small, reproducible Corpus v1 contract that can be built locally
without inventing external authority and that separates origin evidence,
quality evaluation, redistribution rights, and release claims.

## Current truth

The accepted ADR preserves the v10.3 tree as historical local quarantine with
zero admitted units. The local publisher-labeled 5,000 AI / 5,000 Human
projection is verified for publisher-attested internal origin measurement and
calibration evaluation. That permitted use is not witnessed authorship, a
quality label, v10.3 gold admission, redistribution approval, usefulness
review, or rule application.

## Scope

- Define required per-source and per-unit provenance, immutable hashes,
  licenses, label mappings, family grouping, collision checks, and build
  receipts.
- Define label-authority tiers for publisher-attested and owner-self-attested
  origins, and separate non-label proxy cohorts for pre-LLM snapshots,
  AI-exposed unknowns, and recent unknowns.
- Decide materialization versus reference-only handling by redistribution
  rights.
- Define seed smoke size and release semantics.
- Preserve v10.3 until the replacement seed has verified evidence.

## Non-goals

- Assigning human/AI labels from repository age, topics, agent files, commit
  velocity, style, or perceived quality.
- Pulling a huge corpus before the contract is approved.
- Weakening or rewriting the frozen v10.3 historical protocol.

## Dependencies

- `requires`: none
- `benefitsFrom`: none

## Acceptance criteria

- An approved ADR states the corpus purposes and explicitly separates origin
  discrimination from SlopBrick rule-utility evaluation.
- Every admissible unit requires an immutable source, label authority, license
  decision, content hash, family key, and split assignment.
- Unknown recent repositories cannot become negative ground truth.
- Reference-only records cannot silently enter a redistributed byte corpus.
- Exact and normalized cross-label collisions are quarantined.
- The first build is bounded to an inventory plus deterministic 100/100 smoke.
- Failure of one source results in quarantine or replacement, not fabricated
  admission or a project-wide stop.

## Execution steps

1. Inventory the local projection and source metadata read-only -> verify:
   `test -d /Users/cheng/corpus-expansion`.
2. Write the decision record with label, rights, family, split, collision, and
   receipt contracts -> verify: `test -f docs/decisions/corpus-v1-admission.md`.
3. Review the ADR against frozen v10.3 lessons without inheriting unnecessary
   authority machinery -> verify: link each retained requirement to its threat.
4. Approve the build boundary and transition `CORPUS-001` to `ready` -> verify:
   update and parse `docs/execution/index.json`.

## Verification

The ADR must contain explicit examples for each evidence tier, an exclusion
example for an ordinary recent repository, and the exact smallest seed gate.

## Evidence destination

`docs/decisions/corpus-v1-admission.md`

## Rollback

Revert the ADR and leave `CORPUS-001` in `draft`. No source bytes are changed by
this decision plan.

## Next action

Preserve the completed ADR and CORPUS-001 receipts. Route current and future
source uses through `CORPUS-002` without widening the accepted claim ceiling.
