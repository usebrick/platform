# CAL-001 v1 non-admitting decision matrix

**Recorded:** 2026-07-17

**Status:** diagnostic decision matrix; no rule-state mutation or admission

**Disposition:** `admitted: false`; `applied: false`

## Reason for existence

Give every candidate registry row a bounded decision, evidence binding, owner,
and rationale after the frozen holdout and confound checks, without turning
publisher-declared polarity into an authorship or quality claim.

## What this records

The matrix contains one row for each of the 119 registry rules. It binds the
decision reducer to the full holdout receipt and metrics, preserves the
scanner and reducer commit identities, and records `usefulnessResult:
not-evaluated` for every row. It is not an admission record and it does not
change shipped defaults.

## Input and output identity

| Artifact | Identity |
| --- | --- |
| Protocol | `CAL-001-v1` |
| Holdout scanner commit | `45d2dd038107d3d1d7731192126bf0d48dd6f84b` |
| Decision reducer commit | `215647e22d8b289f944cc44e047efeedb553a04d` |
| Holdout receipt SHA-256 | `db9551ec4540282bf35fbc896d0e33dc31434019de52da0f2972ade2d5dc4cfe` |
| Holdout metrics SHA-256 | `9d4e57ef42dfad1d65becf750690ef9991ba29c03f0181531fb4321853f1bea5` |
| Canonical decision matrix SHA-256 | `3c170e308f8ec0be1c1c31b4a5716810388f2692f6e7f0a179b4fd48665eca1c` |
| Decision matrix file-bytes SHA-256 | `10852ce7b47a48946c64703f629e60dcf6fdf60ff21cfff65eac503fc271b051` |

## Decision counts

| Decision | Rows | Meaning |
| --- | ---: | --- |
| `default-off` | 72 | AI-specific origin signals remain non-admitting under zero current v10.3 admission. |
| `quality-only` | 47 | Non-AI rules remain deterministic quality signals and are excluded from origin denominators. |
| `recalibrate` | 0 | The frozen leakage and metric-availability preconditions were clear. |

Of the 72 AI-specific rows, 32 already have an effective default-off policy;
40 are marked `owner-review-required` because the matrix does not silently
change their current policy. The 47 quality-only rows preserve their existing
quality role. No row is applied by this artifact.

## Confound and evidence contract

Every row binds the holdout receipt and metrics hashes, names
`calibration-maintainers` as owner, and records the same limitations:

- labels are publisher-attested polarity, not authorship;
- exact, normalized, and family-split leakage checks were clear;
- framework and generated/fixture/schema/documentation buckets are not
  available in the frozen manifest; and
- independent code-quality/usefulness review is not evaluated.

The origin result remains a diagnostic projection of the frozen scanner output.
No threshold was selected, no rule was activated, no admission record was
created, and the current v10.3 admitted count remains zero.

## Exact verification command

```text
corepack pnpm --filter slopbrick cal:corpus:v1-decisions -- \
  --holdout-receipt /private/tmp/cal-001-v1-holdout-receipt-2026-07-17.json \
  --metrics /private/tmp/cal-001-v1-holdout-metrics-2026-07-17.json \
  --out /private/tmp/cal-001-v1-decision-matrix-2026-07-17.json \
  --holdout-implementation-commit-sha 45d2dd038107d3d1d7731192126bf0d48dd6f84b \
  --decision-implementation-commit-sha 215647e22d8b289f944cc44e047efeedb553a04d
```

The output was canonical JSON written with exclusive file creation. `sha256sum`
matched the file-byte hash above, and a path scan found no `/Users/`,
`checkoutPath`, `generatedAt`, timestamp, or `/private/tmp` values in the
matrix JSON.

## Boundary after CAL-001

The bounded CAL-001 protocol, smoke, full holdout, leakage/confound summary,
and per-rule non-admitting matrix are complete. Any usefulness study,
default-state change, new threshold, corpus admission, or release claim must
start from an owner-reviewed follow-up protocol revision; this matrix is not
permission to perform any of those actions.
