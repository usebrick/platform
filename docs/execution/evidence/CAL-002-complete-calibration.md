# CAL-002 complete calibration control-plane receipt

- **Recorded:** 2026-07-19
- **State:** `in_progress` implementation checkpoint at revision 29
- **Scope:** CAL-002 progressive authority Tasks 1–5; no protected owner
  workflow, runtime policy application, admission, or release is evidenced by
  this receipt.

## Inputs

- Approved design:
  `docs/superpowers/specs/2026-07-18-complete-calibration-program-design.md`
  at `1def91feb`.
- Reviewed detailed plan:
  `docs/superpowers/plans/2026-07-18-complete-calibration-program.md`.
- Approved additive amendment and implementation boundary:
  `docs/superpowers/plans/2026-07-19-cal-002-progressive-quality-authority.md`,
  consuming `e6c9695ea`, `d2fc36676`, `996770a33`, and `ae0a4cab1`.
- Completed predecessor: `CAL-001`, whose existing matrix remains
  `applied: false` and `admitted: false`.

## Control-plane transition

- The v1 implementation is checkpointed through `e6c9695ea`; the old
  three-way origin questionnaire is paused after one historical hold.
- The approved v2 authority projection is exactly 47 starting quality + 26
  transferred quality + 4 blocked quality + 3 superseded + 7 retired + 32
  research-origin = 119. The owner-row transition is exactly `26/4/3/7`.
- `CAL-002` remains the active umbrella for separate quality and origin lanes
  and one proposed non-admitting 119-row application policy. The proposal
  remains `applied: false` and `admitted: false`; blocked rows remain disabled
  and assignment-ineligible.
- Implementation WIP remains exactly `2/2`: `SB-UX-001` and `CAL-002`.
- `VAL-001` returns to `ready` with RUN-001 preserved; `TEL-001` remains
  `ready`; `REL-001` remains unchanged.

## Implementation checkpoint

- Progressive authority Tasks 1–3 remain independently approved through
  `5f5a1c554`. They preserve exact v1 bytes, enforce the additive authority
  taxonomy, and provide a terminal immutable owner-batch path without running
  it against protected owner state.
- Task 4 is checkpointed through `0789f7bf9`; the integrated correction chain
  starts at `8b9c7789b`. It produces the exact 32-row zero-label quality
  disposition, shares the v1 quality reducer for measured outcomes, and can
  plan only an optional readiness-gated private cohort at its pinned private
  destination. Every closeout row remains disabled, score-neutral, gate-
  neutral, non-admitting, and without a claimed safe repair.
- Task 4's final focused matrix passes 92/92 on exact Node 22.22.3 and 24.15.0
  runtimes with package typecheck on both. Two independent final reviews
  approved the corrected slice.
- Task 5 is checkpointed through `67a777c27`; the integrated correction chain
  starts at `379bc946d`. It freezes the three SQL, console, and `any` parity
  case contracts, requires independent future migration commits, and validates
  exact non-admitting supersession-row shapes bound to authority and parity
  receipts. It does not implement the rule migrations; those remain Tasks
  6–8.
- The integrated Task 4 + Task 5 focused matrix passes 101/101 on exact Node
  22.22.3 and 24.15.0 runtimes with package typecheck on both. Two independent
  final reviews approved the corrected Task 5 slice.
- No authority proposal, private cohort, quality receipt, parity receipt,
  supersession receipt, runtime policy, rule activation, score, source,
  baseline, frozen evidence artifact, owner state, admission, release,
  deployment, tag, publish, push, or acquired data changed in revision 29.
  Local application remains separate from those release-boundary decisions.

## Next evidence

The next implementation evidence is the parallel-safe Tasks 6–8 parity wave:
SQL CTE coverage, console five-in-thirty clustering guards, and declaration-
ratio `any` density without the rejected line-based heuristic. Each migration
must pass its fixed Task 5 parity cases, bind its own implementation commit,
remain non-admitting, and avoid generating protected owner artifacts. The
following wave adds the claim-matched transfer oracles before any complete
matrix application can be proposed.
