# Task 2B indexed tool-authority resolver review

Date: 2026-07-15

## Verdict

**APPROVE for the bounded read-only resolver and CLI diagnostic.**

## Checks

- The resolver cannot accept a receipt that is absent from the requested
  current index or whose indexed bytes/hash changed.
- The profile, invocation intent, action, and receipt are revalidated through
  Core's frozen contracts rather than trusted from CLI strings.
- The snapshot is derived from the exact current index membership and an
  optional supplied snapshot must match canonically.
- The CLI allows no publication/recovery options, uses contained canonical
  snapshot input, emits one machine-readable result, and returns exit 2 on
  invalid selectors or authority bytes.
- No corpus, network, process-spawn, remote, or release side effect is exposed
  by this slice.

## Residual plan-open items

The resolver is intentionally read-only and does not prove source-proposal or
approval bytes, resource receipt completeness, static/witness authority, or
corpus eligibility. Those are required before a mutating
`rebuild:pre-witness`/recovery adapter or real calibration run can be enabled.
