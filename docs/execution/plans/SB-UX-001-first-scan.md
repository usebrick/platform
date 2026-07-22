# SB-UX-001 — Make the first scan evidence-led and actionable

- **Status:** `done`
- **Priority:** 6
- **Track / lane:** implementation / slopbrick-ux
- **Owner:** SlopBrick product and CLI
- **Updated:** 2026-07-22

## Outcome

A free local-scan user can finish a first scan, understand the strongest
evidenced problem, choose one of three useful actions, fix or explicitly
decline it, see the rescan result, and understand how to protect the repository
without reading a giant undifferentiated report.

## Current truth

SlopBrick's five-part product taxonomy, evidence certainty,
current-versus-new debt, and prioritized scan-to-rescan journey are now one
tested UX contract. The required `SB-045` local
qualification is complete. Public release and website deployment remain under
`REL-001` and do not block this local UX plan. `VAL-001-RUN-001` now provides a
real owner baseline: the first recommendation was useful for finding a
1,388-line review target, but it had no safe bounded fix, and the unchanged
rescan required manual comparison. Those are concrete red states for this
plan, not participant evidence. The reviewed implementation contract is now
[`docs/superpowers/plans/2026-07-18-slopbrick-first-scan-experience.md`](../../superpowers/plans/2026-07-18-slopbrick-first-scan-experience.md);
its plan audit is `READY`, its shared-report blast radius is classified `High`,
and its shared-report blast radius remains classified `High`. No score, rule,
baseline, source, release, or public artifact changed during closeout.

Tasks 1–8 of the reviewed implementation plan are complete. Revision 43
completed Task 8's documentation/evidence reconciliation and
documentation-scope gates. Revision 44 records the fresh 11-file focused
matrix, package and recursive gates, 296/296-file package-local self-scan with
zero failures and no baseline mutation, and the owner's literal confirmation
that the current first screen is good enough. The receipt preserves both the
current closeout and the older partial checkpoint without conflating either
with participant or market evidence.

`CAL-002` is complete at Task 20 checkpoint `bd47dbd7e`. Its locally applied,
non-admitting 119-row policy has 41 default-on quality rows, 32 unmeasured
quality candidates and 32 research-origin rows default-off, plus 4 blocked, 3
superseded, and 7 retired rows. SB-UX consumes that current provenance without
presenting origin association as quality, authorship, or safe-repair proof.

## Scope

- Optimize the free first scan for the **scan -> useful finding -> fix or
  decline -> rescan -> protect** adoption loop, not for rule-count exposure.
- Five user-facing areas: Visual Slop, Frontend Implementation, Code and Logic,
  Repository Coherence, and Accessibility and Resilience.
- Three user-facing evidence tiers: deterministic, calibrated, and advisory,
  with the underlying current/legacy provenance preserved in full output.
- Current policy provenance must consume the CAL-002 v2 projection without
  treating research-origin association as quality, authorship, score, gate, or
  default-on authority.
- One headline score with transparent dimensions and incompleteness state.
- Three recommended actions based on severity, confidence, reach, and repair
  safety.
- Current baseline versus newly introduced/resolved findings on rescan.
- CLI snapshots and owner-selected local usability walkthroughs.
- Preserve the current four-score contract and Repository Health headline.
  The future branded Slop Index is outside this slice.

## Non-goals

- A hosted dashboard, visual-regression service, generic code reviewer, or a
  model-only aesthetic verdict.
- Blocking CI on advisory findings.
- Redesigning the entire website before the CLI loop is proven.
- Adding or renaming a score, shipping a Slop Index formula, or changing score
  compatibility, calibration, thresholds, or gates.

## Dependencies

- `requires`: `SB-045`
- `benefitsFrom`: `VAL-001`, `CAL-002`

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
- Receipts can distinguish scan completion, first useful finding, action or
  decline, rescan completion, and later protection without treating those
  outcomes as market evidence.
- Current policy provenance distinguishes current quality, internal origin,
  legacy, advisory, and insufficient evidence without implying authorship,
  admission, or a safe repair.

## Execution steps

1. Tasks 1–7: complete the typed projection, finding delta, pipeline,
   terminal, JSON/SARIF, and real CLI journey contracts -> complete and
   independently reviewed.
2. Task 8: reconcile all current docs and the evidence receipt with the final
   implementation and CAL-002 provenance -> complete in revision 43; docs
   truth gates pass.
3. Rerun the focused first-scan matrix and recursive quality gates serially ->
   complete; 11/11 files and 267/267 focused tests passed, followed by green
   package and recursive gates.
4. Capture a fresh package-local scan without `--baseline`; prove ordinary
   scans do not create or refresh the durable debt baseline -> complete;
   296/296 files analyzed with zero failures and the baseline missing before
   and after.
5. Present the exact first screen and evidence/repair boundary to the owner;
   record only the literal disposition and close the plan only if accepted ->
   complete; the owner confirmed the UX is good enough for this bounded slice.

## Verification

Run report snapshots, format contracts, narrow/no-color output, and a real
package-local scan before broader UI work.

## Evidence destination

`docs/execution/evidence/SB-UX-001-first-scan.md`

## Rollback

Keep the underlying typed report model and revert only the presentation layer
if format compatibility or comprehension regresses.

## Next action

Preserve the completed first-scan contract and hand its typed
finding/action/change boundary to `TEL-001`. Reopen this plan only if a later
default-output change regresses evidence honesty, repair safety, scan validity,
or baseline non-mutation.
