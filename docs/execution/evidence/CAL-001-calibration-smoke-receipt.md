# CAL-001 v1 calibration smoke receipt

**Recorded:** 2026-07-17

**Status:** diagnostic-only smoke; no heldout calibration decision or rule
activation

**Disposition:** `publisher_attested`; `internal_analysis`; `admitted: false`

## What this proves

The frozen CAL-001 protocol can consume the verified Corpus v1 100/100 smoke,
execute the SlopBrick scanner against the selected source-bound bytes with one
serial worker, and emit deterministic path-free observations and metrics. The
scanner reads and parses source bytes; the dataset programs are not run.

This is an origin-discrimination diagnostic over publisher-declared polarity,
not an authorship proof, quality label, usefulness review, production
calibration result, admission record, threshold change, or rule activation.

## Receipt identity

| Artifact | Identity |
| --- | --- |
| Protocol | `CAL-001-v1` |
| Implementation commit | `f00c5364fc13d6452756d94071c76158cb4a05cd` |
| Package | `slopbrick@0.45.0` (unreleased) |
| Run ID | `cal-001-v1-smoke` |
| Worker count | `1` |
| Config SHA-256 | `a1d72023270a0f85ea5e630c90c04551201cf2a886ab6a29ce38b63e02d595b8` |
| Canonical receipt SHA-256 | `c09657e902aef3dde7cb9d1159934b8c7664db91da40bc10ac6fd138a2c4cc81` |
| Receipt file-bytes SHA-256 | `69ee0265c45ebf9c8e3d40a4dd805ebaabd65487751fb911b0f24fbb4c66e583` |
| Canonical metrics SHA-256 | `b916446543a60d2b36962cd15661a76d37c27c3a171be6e91009f7c29b9f617f` |
| Metrics file-bytes SHA-256 | `4757b26e4b63680dc4c6986b2dddf0a13381c54a4d27b2cd4638b7ade42380a6` |
| Observations SHA-256 | `401136d611653f33a1ae84b9de3fe842c36fb87b80a24d0c7c7f5f2ae2b16280` |

## Frozen input binding

| Input | SHA-256 |
| --- | --- |
| Protocol bytes | `d78ceb22bd2d3a2bc91676d93facd7003af6c1b8351fdf773139a138bd1f1528` |
| Candidate manifest | `c15d3cbc95f251b5a0514da14b3f8a90e26124fbfb7db5ce342a873635b383ac` |
| Leakage-safe plan | `9c4638526e9a4161d3e74f70197f0b25717439e6bd477bef98664a03c9a9219c` |
| Source-binding receipt | `47bd66907ec2efa67da718e0cfb38458151ca84d3cdedc941488fe4b001475ac` |
| Eligible manifest | `286134799c7f75837a7c292f0d18721d8da9263c25c041eef0ac4734801b52d8` |
| Eligible projection receipt | `9f5274f57ed4adf9d1c1ef55205493e9a833abc86cb8e1ca2b332cd8c72d28ba` |
| 100/100 smoke manifest | `bdbcd43279077fa760ae3c99da05b953c38134022fa34626b69a6b6400be00de` |
| 100/100 smoke receipt | `ccd74f7b9db49adc802c042df0d7b732d8284d2bbfc4e6ec39e6a1c001c60830` |

The runner rejects any change to these frozen input hashes before scanning.

## Execution result

| Measure | Result |
| --- | ---: |
| Selected positive / negative / total | 100 / 100 / 200 |
| Successful / excluded / failed | 200 / 0 / 0 |
| Parse failures / timeouts / scanner failures | 0 / 0 / 0 |
| Rule catalog rows | 119 |
| Rules with observed fires | 7 |
| AI rules with zero fire | 65 |
| Non-AI rules excluded from origin metrics | 47 |
| Metrics status | `available` (diagnostic only) |
| Admission | `false` |

The seven observed fires are not a promotion set. In particular,
`ai/compression-profile` remains default-off/opt-in under the current v10.3
zero-admission boundary; its appearance in this diagnostic scan does not
activate it or authorize a calibration claim.

## Exact verification command

```text
corepack pnpm --filter slopbrick cal:corpus:v1-smoke -- \
  --corpus-root /Users/cheng/corpus-expansion/v10.3 \
  --protocol /Users/cheng/platform/docs/execution/evidence/CAL-001-protocol.md \
  --out /private/tmp/cal-001-v1-smoke-receipt-2026-07-17-final.json \
  --metrics-out /private/tmp/cal-001-v1-smoke-metrics-2026-07-17-final.json \
  --implementation-commit-sha f00c5364fc13d6452756d94071c76158cb4a05cd
```

The command was run twice with fresh output paths. `cmp` confirmed byte-
identical receipt and metrics files; both runs returned receipt SHA-256
`c09657e902aef3dde7cb9d1159934b8c7664db91da40bc10ac6fd138a2c4cc81` and
metrics SHA-256
`b916446543a60d2b36962cd15661a76d37c27c3a171be6e91009f7c29b9f617f`.

## Remaining CAL-001 boundary

The one-worker smoke is complete. The full frozen train/validation/test
holdout evaluation, confound review, independent usefulness review, and
per-rule admission matrix remain open. No threshold was tuned, no test set was
used for selection, no rule was activated, and no publish, deployment, or
remote mutation occurred.
