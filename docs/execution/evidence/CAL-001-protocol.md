# CAL-001 — Leakage-safe holdout calibration protocol

**Protocol:** `CAL-001-v1`
**Status:** frozen protocol proposal; no calibration run performed
**Owner:** calibration maintainers
**Updated:** 2026-07-17

## Reason for existence

Freeze the inputs, split identity, metrics, confound review, and rule-decision
contract before any candidate signal is tuned or activated. This document is a
pre-registration and evidence boundary, not a calibration result.

## Current disposition

- Corpus v1 is source-attested, `publisher_attested`, and
  `internal_analysis`; it is not an admitted production corpus.
- The current v10.3 admission set is zero. This protocol does not change that
  state, create an admission record, or activate a rule.
- No heldout metrics, precision/recall claims, authorship claims, or quality
  claims are recorded here.
- A future run must use the exact inputs and hashes below. Any changed input
  creates a new protocol revision and invalidates prior results.

## Frozen inputs

The evaluator must consume the source-bound eligible projection and its
family-safe plan. The 100/100 smoke is a determinism gate, not the calibration
population.

| Input | Frozen identity |
| --- | --- |
| Candidate manifest | `c15d3cbc95f251b5a0514da14b3f8a90e26124fbfb7db5ce342a873635b383ac` |
| Leakage-safe split plan | `9c4638526e9a4161d3e74f70197f0b25717439e6bd477bef98664a03c9a9219c` |
| Source-binding receipt | `47bd66907ec2efa67da718e0cfb38458151ca84d3cdedc941488fe4b001475ac` |
| Eligible manifest | `286134799c7f75837a7c292f0d18721d8da9263c25c041eef0ac4734801b52d8` |
| Eligible projection receipt | `9f5274f57ed4adf9d1c1ef55205493e9a833abc86cb8e1ca2b332cd8c72d28ba` |
| Smoke manifest (determinism only) | `bdbcd43279077fa760ae3c99da05b953c38134022fa34626b69a6b6400be00de` |
| Smoke receipt (determinism only) | `ccd74f7b9db49adc802c042df0d7b732d8284d2bbfc4e6ec39e6a1c001c60830` |

The frozen population currently contains 10,000 eligible rows: 5,000
publisher-declared positive and 5,000 publisher-declared negative rows, with
7,970 train, 991 validation, and 1,039 test rows. These are origin claims from
the publisher, not independently witnessed authorship labels.

## Split and tuning contract

1. Keep every publisher problem family, same-label exact duplicate group, and
   same-label normalized duplicate group in one split.
2. Keep all exact and normalized cross-label collision rows quarantined; do not
   use them for fitting, threshold selection, or testing.
3. Fit rule parameters only on `train`.
4. Select a threshold only on `validation` using the pre-registered metric and
   tie-breaker. Do not inspect `test` during tuning.
5. Evaluate the frozen choice exactly once on `test`. A rerun after a test
   observation requires a new protocol revision and a new split identity.
6. Run with one worker, fixed configuration, package commit, and immutable
   input receipts. Record command, runtime, resource bounds, and output hashes.

## Required metrics

Every candidate rule row must report, separately for train, validation, and
test:

- support by declared polarity, fired count, and non-firing count;
- recall, false-positive rate, precision, and false-negative rate where
  denominators exist;
- a stated uncertainty interval and sample-count warning for sparse cells;
- threshold, severity, default state, and effective configuration hash;
- framework/language slices and repository-family leakage checks; and
- parse, timeout, crash, and incomplete-input accounting.

The report must include both raw counts and derived rates. Zero denominators
are `not-applicable`, never zero performance.

## Two separate result tables

The evaluator must emit two non-interchangeable sections.

### Origin-discrimination table

Measures separation of the publisher-declared positive and negative cohorts.
It must be labeled origin discrimination, not authorship detection, and must
include the source/label limitations and family/confound report.

### Code-quality/usefulness table

Measures whether a finding is a reproducible engineering defect or useful
repository signal under an independent review protocol. It must not inherit
origin-discrimination precision/recall as a quality claim. A rule without an
independent usefulness review remains unproven for quality use.

## Confound and leakage report

The report must state counts and examples by category without exposing source:

- repository family and publisher problem family;
- language and framework bucket;
- generated/fixture/schema/documentation bucket;
- duplicate and normalized-content groups;
- source era or publisher/source bucket where available; and
- parseability, file-size, and selection differences between polarities.

Any test-family overlap, normalized cross-label collision, post-split tuning,
or unexplained selection imbalance is a failed run. A failed run cannot
activate a rule; preserve its receipt and mark the affected candidate
`recalibrate` or `default-off`.

## Admission matrix

The future calibration report must contain one row for every candidate rule
under evaluation. Each row must include:

| Field | Required meaning |
| --- | --- |
| `ruleId` | Stable rule identity from the candidate registry |
| `decision` | `default-on`, `default-off`, `recalibrate`, `retire`, or `quality-only` |
| `evidence` | Report section and immutable receipt/hash supporting the decision |
| `originResult` | Separate origin-discrimination result or `not-evaluated` |
| `usefulnessResult` | Separate quality/usefulness result or `not-evaluated` |
| `confounds` | Leakage, family, framework, and source limitations |
| `owner` | Reviewer responsible for the decision |
| `rationale` | Bounded reason; no authorship inference |

The default disposition before an admitted, leakage-checked current-v10.3
result is `default-off` or the existing deterministic quality state. No
historical v8/v10.1 statistic can override this precondition. The current
`ai/compression-profile` disposition is therefore `default-off`/opt-in and
must remain so until a later report proves otherwise.

## Verification and next step

The protocol is frozen only when the required inputs and explicit non-result
boundary are present:

```sh
test -f docs/execution/evidence/CAL-001-protocol.md
rg -n '^(\*\*Protocol|## (Reason for existence|Frozen inputs|Split and tuning contract|Required metrics|Admission matrix|Verification and next step))' docs/execution/evidence/CAL-001-protocol.md
rg -n 'c15d3cbc|9c463852|286134799|zero|default-off' docs/execution/evidence/CAL-001-protocol.md
```

Next step: run a small end-to-end calibration smoke from these exact inputs,
one worker, and a new immutable report receipt. Do not tune, activate, or
publish a calibration claim until that receipt and the admission matrix are
reviewed.
