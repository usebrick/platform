# MEM-001 — Build MemoryBrick M0 as a read-only repository projection

- **Status:** `draft`
- **Priority:** 8
- **Track / lane:** implementation / memory
- **Owner:** usebrick platform
- **Updated:** 2026-07-17

## Outcome

Prove that a small repository-owned projection of observed facts, declared
policy, provenance, and freshness improves the same task across multiple coding
agents without becoming stale, bloated, or vendor-owned.

## Current truth

The repository already has deterministic structure schemas and agent
instruction files, but no approved MemoryBrick storage contract, provenance
model, freshness state machine, adapter compiler, or cross-agent benchmark.
MemoryBrick is not a shipped standalone product.

## Scope

- ADR for storage location, compatibility with existing core artifacts, trust
  states, and migration boundary.
- Threat/privacy model and authority distinction: observed, declared, proposed,
  approved, historical, temporary, conflicted.
- Read-only projection from current code/config/docs; no silent authoritative
  agent writes.
- Deterministic freshness/citation status for each projected fact.
- Small boot context, path-scoped context, and on-demand references.
- Bounded native adapters for at least Codex, Claude, and Copilot.
- Cross-agent benchmark on the same repository tasks.

## Non-goals

- A vector database, transcript archive, task tracker, hosted memory service, or
  full `.usebrick/` migration before the ADR.
- Replacing existing README, ADR, CODEOWNERS, build, or CI sources.
- Treating generated adapter files as the canonical store.

## Dependencies

- `requires`: `SB-UX-001`, `TEL-001`
- `benefitsFrom`: `CORPUS-001`

## Acceptance criteria

- The ADR preserves current core schema compatibility or identifies an
  explicit optional-version migration.
- Every projected fact records source, scope, authority type, verification
  time/input hash, and freshness state.
- Agents can propose but cannot silently promote authoritative memory.
- Generated boot context stays within a stated budget and adapters are
  deterministic/disposable.
- The benchmark compares no guidance, manual instruction, generated adapters,
  and on-demand memory across at least three agents.
- M0 improves at least one predeclared architecture/build/test outcome without
  increasing stale-instruction failures.

## Execution steps

1. Approve the ADR and threat model -> verify: `test -f docs/decisions/memorybrick-m0.md`.
2. Add contract tests for observed/declared/provenance/freshness projection ->
   verify: `corepack pnpm --filter @usebrick/core test:contract`.
3. Implement read-only projection over existing artifacts -> verify: schema
   validation and deterministic snapshot tests.
4. Generate bounded adapters -> verify: identical inputs produce byte-identical
   outputs and budgets pass.
5. Run the cross-agent benchmark -> verify: publish raw task/result receipts
   with limitations, not only a headline.

## Verification

Use contract tests, schema validation, deterministic snapshots, stale-source
mutation tests, and predeclared benchmark metrics.

## Evidence destination

`docs/execution/evidence/MEM-001-m0-benchmark.md`

## Rollback

Delete generated projections/adapters and revert optional additions. Existing
repository docs and core artifacts remain canonical and unchanged.

## Next action

Approve the storage, provenance, freshness, and threat-model ADR before adding
a new canonical memory format.
