# CAL-001 v1 frozen holdout receipt

**Recorded:** 2026-07-17

**Status:** diagnostic-only holdout evaluation; no threshold selection, rule
decision, or activation

**Disposition:** `publisher_attested`; `internal_analysis`; `admitted: false`

## Reason for existence

Record the one-worker evaluation of the frozen Corpus v1 train/validation/test
population while keeping origin discrimination, code usefulness, and admission
as separate unresolved boundaries.

## What this proves

The evaluator rebuilt the frozen source-attested Corpus v1 artifacts, verified
their hashes, read the selected source-bound bytes, and executed the SlopBrick
scanner against all 10,000 eligible rows. The dataset programs were not run.
The resulting observations and split metrics are path-free and deterministic;
they are not an authorship, quality, production-calibration, or admission
claim.

The scanner's existing binary finding output was measured as-is. No rule
parameters were fitted, no validation threshold was selected, and the test
split was observed once without tuning. Independent usefulness review remains
`not-evaluated`.

## Receipt identity

| Artifact | Identity |
| --- | --- |
| Protocol | `CAL-001-v1` |
| Implementation commit | `45d2dd038107d3d1d7731192126bf0d48dd6f84b` |
| Package | `slopbrick@0.45.0` (unreleased) |
| Run ID | `cal-001-v1-holdout` |
| Worker count | `1` |
| Config SHA-256 | `a1d72023270a0f85ea5e630c90c04551201cf2a886ab6a29ce38b63e02d595b8` |
| Rows SHA-256 | `069d9f1646bb7c927f28c77a06136dfd9aab39d3d22973da2907753b86de7d45` |
| Observations SHA-256 | `f2254f5a2e3ec61657d4f2e003b225bc62131246d8cfd8912d1690d8bc6e7274` |
| Canonical receipt SHA-256 | `db9551ec4540282bf35fbc896d0e33dc31434019de52da0f2972ade2d5dc4cfe` |
| Receipt file-bytes SHA-256 | `67ab45f23f6faed2315f7ad32a428f305d5a844952dc07892fafaa420c3c8523` |
| Canonical metrics SHA-256 | `9d4e57ef42dfad1d65becf750690ef9991ba29c03f0181531fb4321853f1bea5` |
| Metrics file-bytes SHA-256 | `8286f80ba96322aee1ccdff8dd9561126279ca72ca4fede33799fb724a94eded` |

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

## Population and execution result

| Split | Total | Positive | Negative | Families |
| --- | ---: | ---: | ---: | ---: |
| Train | 7,970 | 3,958 | 4,012 | 5,462 |
| Validation | 991 | 493 | 498 | 667 |
| Test | 1,039 | 549 | 490 | 720 |
| **Total** | **10,000** | **5,000** | **5,000** | — |

Coverage was **10,000/10,000 successful**, with zero exclusions, parse
failures, timeouts, or scanner failures. All three split metric bundles were
available for the 119-rule catalog, including the seeded 128-replicate
repository-cluster bootstrap diagnostic.

## Leakage and confound result

The frozen eligible population reported:

- zero cross-label exact-content collision groups or rows;
- zero cross-label normalized-content collision groups or rows; and
- zero repository-family groups or rows spanning multiple splits.

The receipt records one source ID and one source version. The available
language slices are C, C++, Java, and Python. Framework, generated/fixture/
schema/documentation, and source-era buckets are explicitly
`not-available` because those fields are not declared by the frozen manifest;
they are not inferred from paths or filenames. Per-split and per-polarity
file-size statistics are recorded in the metrics artifact for confound review.

## Exact verification command

```text
corepack pnpm --filter slopbrick cal:corpus:v1-holdout -- \
  --corpus-root /Users/cheng/corpus-expansion/v10.3 \
  --protocol /Users/cheng/platform/docs/execution/evidence/CAL-001-protocol.md \
  --out /private/tmp/cal-001-v1-holdout-receipt-2026-07-17.json \
  --metrics-out /private/tmp/cal-001-v1-holdout-metrics-2026-07-17.json \
  --implementation-commit-sha 45d2dd038107d3d1d7731192126bf0d48dd6f84b
```

The runner writes both outputs with exclusive file creation. The recorded
file-byte hashes above were checked with `sha256sum`; a path scan found no
`/Users/`, `checkoutPath`, `generatedAt`, timestamp, or `/private/tmp` values
inside either JSON output.

## Remaining CAL-001 boundary

This receipt completes the frozen holdout execution and leakage check. The
per-rule confound review, owner-assigned admission matrix, independent
usefulness review, and any future default-state decision remain open. The
current v10.3 admission count remains zero. No threshold, default state,
admission, publish, deployment, or remote mutation occurred.
