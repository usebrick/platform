# MEM-001 — Benchmark the read-only Memory capability

- **Status:** `draft`
- **Priority:** 9
- **Track / lane:** implementation / memory
- **Owner:** UseBrick platform
- **Updated:** 2026-07-22

## Outcome

Prove that a small repository-owned projection of observed facts, approved
intent, provenance, and freshness improves the same task versus each coding
agent's native context without becoming stale, bloated, or vendor-owned.

## Current truth

The repository already has deterministic structure schemas and agent
instruction files, but no approved Memory-capability storage contract,
provenance model, freshness state machine, adapter compiler, or cross-agent
benchmark.
The Memory name is a planned capability boundary, not a shipped product or
package.

`SB-UX-001` and `TEL-001` are complete, so this plan has no unmet repository
dependency. It remains `draft`: no Memory ADR, canonical format, implementation
WIP, package, or benchmark run is authorized by the TEL closeout.

Memory is the repository-intelligence plane of the coherence graph. Its job is
not to copy a vendor's chat memory: it must reconcile observed facts with
approved patterns, design-system primitives, architecture, exceptions,
rationale, provenance, and freshness, then compile bounded disposable context
for multiple agents and CI.

## Scope

- ADR for storage location, compatibility with existing core artifacts, trust
  states, and migration boundary.
- Threat/privacy model and authority distinction: observed, declared, proposed,
  approved, historical, temporary, conflicted.
- Read-only projection from current code/config/docs; no silent authoritative
  agent writes.
- Repository baselines for dominant components, tokens, abstractions, and
  approved exceptions when they can be cited to current evidence.
- Deterministic freshness/citation status for each projected fact.
- Small boot context, path-scoped context, and on-demand references.
- Bounded native adapters for at least Codex, Claude, and Copilot.
- Cross-agent benchmark on the same repository tasks comparing native agent
  context, repository-owned boot/scoped context, and on-demand references for
  at least Codex, Claude, and Copilot.

## Non-goals

- A vector database, transcript archive, task tracker, hosted memory service, or
  full `.usebrick/` migration before the ADR.
- Replacing existing README, ADR, CODEOWNERS, build, or CI sources.
- Treating generated adapter files as the canonical store.
- Building a generic memory database or competing on Markdown storage alone.

## Dependencies

- `requires`: `SB-UX-001`, `TEL-001`
- `benefitsFrom`: `CORPUS-001`

## Acceptance criteria

- The ADR preserves current core schema compatibility or identifies an
  explicit optional-version migration.
- Every projected fact records source, scope, authority type, verification
  time/input hash, and freshness state.
- Agents can propose but cannot silently promote authoritative memory.
- SlopBrick and future Lock consumers can resolve a finding against approved
  local intent without a global prior overriding that intent.
- Generated boot context stays within a stated budget and adapters are
  deterministic/disposable.
- The benchmark compares each agent's native context with repository-owned
  boot/scoped adapters and on-demand context across at least three agents.
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
5. Run the same tasks and budgets with native and repository-owned context
   across agents -> verify: publish raw task/result receipts with limitations,
   not only a headline.

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
