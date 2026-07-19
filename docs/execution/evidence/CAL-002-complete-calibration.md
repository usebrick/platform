# CAL-002 complete calibration control-plane receipt

- **Recorded:** 2026-07-19
- **State:** `in_progress` control-plane entry at revision 27
- **Scope:** documentation-only transition; no calibration implementation or
  policy application is evidenced by this receipt.

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
- No runtime policy, rule, score, source, baseline, frozen evidence artifact,
  owner state, admission, release, deployment, tag, publish, push, or acquired
  data changed in revision 27. Local application remains separate from those
  release-boundary decisions.

## Next evidence

The first implementation evidence must be the red additive CAL-002 v2
authority taxonomy and exact 119-row projection contract tests recorded by the
active plan. It must preserve the non-admission boundary, keep the v1 evidence
and owner state historical, and distinguish current policy provenance from
legacy calibration metadata.
