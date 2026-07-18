# SB-UX-001 — Make the first scan evidence-led and actionable

- **Status:** `ready`
- **Priority:** 6
- **Track / lane:** implementation / slopbrick-ux
- **Owner:** SlopBrick product and CLI
- **Updated:** 2026-07-18

## Outcome

A vibecoder can finish a first scan, understand the strongest evidenced
problem, choose one of three useful actions, fix it, and see the rescan change
without reading a giant undifferentiated report.

## Current truth

SlopBrick has broad detector coverage, but the five-part product taxonomy,
evidence certainty, current-versus-new debt, and prioritized scan-to-rescan
journey are not yet one tested UX contract. The required `SB-045` local
qualification is complete. Public release and website deployment remain under
`REL-001` and do not block this local UX plan. `VAL-001-RUN-001` now provides a
real owner baseline: the first recommendation was useful for finding a
1,388-line review target, but it had no safe bounded fix, and the unchanged
rescan required manual comparison. Those are concrete red states for this
plan, not participant evidence. The reviewed implementation contract is now
[`docs/superpowers/plans/2026-07-18-slopbrick-first-scan-experience.md`](../../superpowers/plans/2026-07-18-slopbrick-first-scan-experience.md);
its plan audit is `READY`, its shared-report blast radius is classified `High`,
and product-code execution has not started yet.

## Scope

- Five user-facing areas: Visual Slop, Frontend Implementation, Code and Logic,
  Repository Coherence, and Accessibility and Resilience.
- Evidence labels for deterministic, calibrated, and advisory findings.
- One headline score with transparent dimensions and incompleteness state.
- Three recommended actions based on severity, confidence, reach, and repair
  safety.
- Current baseline versus newly introduced/resolved findings on rescan.
- CLI snapshots and owner-selected local usability walkthroughs.

## Non-goals

- A hosted dashboard, visual-regression service, generic code reviewer, or a
  model-only aesthetic verdict.
- Blocking CI on advisory findings.
- Redesigning the entire website before the CLI loop is proven.

## Dependencies

- `requires`: `SB-045`
- `benefitsFrom`: `VAL-001`

## Acceptance criteria

- Complete and incomplete scans are visually and semantically distinct.
- Every finding shows evidence tier, location/scope, why it matters, and a safe
  next action or explicit absence of one.
- The first screen prioritizes no more than three actions and preserves access
  to the full report.
- Rescan identifies new, resolved, and unchanged findings against a durable
  baseline.
- Snapshot, JSON/SARIF compatibility, narrow-terminal, colorless, and screen-
  reader-oriented output checks pass.
- Owner-run walkthroughs can identify the first recommended action without
  relying on synthetic or participant evidence.

## Execution steps

1. Write report information-architecture snapshots before rendering changes ->
   verify: `corepack pnpm --filter slopbrick exec vitest run tests/report/first-scan.test.ts --maxWorkers=1 --minWorkers=1`.
2. Add evidence-tier and five-area projection without changing detector truth ->
   verify: run report contract tests.
3. Add three-action prioritization and incompleteness handling -> verify:
   snapshot deterministic complete, incomplete, and zero-finding fixtures.
4. Add durable new/resolved/unchanged rescan output -> verify: run baseline
   integration tests with one worker.
5. Walk owner-selected fixtures or repositories and record comprehension ->
   verify: add only real owner-run receipts to `VAL-001`, with no target count.

## Verification

Run report snapshots, format contracts, narrow/no-color output, and a real
package-local scan before broader UI work.

## Evidence destination

`docs/execution/evidence/SB-UX-001-first-scan.md`

## Rollback

Keep the underlying typed report model and revert only the presentation layer
if format compatibility or comprehension regresses.

## Next action

Execute Task 1 of the reviewed detailed plan: move `SB-UX-001` to
`in_progress`, consume the second implementation WIP slot, and then write the
red report snapshots for explicit evidence tier, `no safe action`, and
unchanged-rescan states.
