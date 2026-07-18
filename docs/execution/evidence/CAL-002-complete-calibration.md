# CAL-002 complete calibration control-plane receipt

- **Recorded:** 2026-07-18
- **State:** `in_progress` control-plane entry at revision 26
- **Scope:** documentation-only transition; no calibration implementation or
  policy application is evidenced by this receipt.

## Inputs

- Approved design:
  `docs/superpowers/specs/2026-07-18-complete-calibration-program-design.md`
  at `1def91feb`.
- Reviewed detailed plan:
  `docs/superpowers/plans/2026-07-18-complete-calibration-program.md`.
- Completed predecessor: `CAL-001`, whose existing matrix remains
  `applied: false` and `admitted: false`.

## Control-plane transition

- `CAL-002` is the active umbrella for the separate quality and origin lanes
  and one reviewed non-admitting 119-row application policy.
- Implementation WIP remains exactly `2/2`: `SB-UX-001` and `CAL-002`.
- `VAL-001` returns to `ready` with RUN-001 preserved; `TEL-001` remains
  `ready`; `REL-001` remains unchanged.
- No rule, score, source, baseline, admission, release, deployment, tag,
  publish, push, or acquired data changed in revision 26.

## Next evidence

The first implementation evidence must be the red CAL-002 catalog and
local-schema contract tests recorded by the active plan. It must preserve the
non-admission boundary and distinguish current policy provenance from legacy
calibration metadata.
