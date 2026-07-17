# CORPUS-001 source-attested seed receipt

**Recorded:** 2026-07-17

**Scope:** bounded read-only inventory only

**Disposition:** candidate; `publisher_attested`; `internal_analysis`

## What this proves

The inventory reconciles the pinned local Mendeley source bundle, projection
receipt, publisher metadata, and 10,000 materialized regular files without
executing source code. Only the publisher's `declaredPolarity` is mapped:

- `AI` -> calibration positive
- `Human` -> calibration negative

Historical `authoritativeLabel` values are ignored. These mappings attest the
dataset publisher's origin claim only; they do not independently witness
authorship or measure code quality.

## Pinned source evidence

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Code_Dataset.zip` | 2,251,807 | `c6cb156a8fa627c9228b7798ea7d25be9327a4d1f72f40b16ddae3e6d807e0c4` |
| `HumanVsAI_CodeDataset.csv` | 6,559,996 | `7f38972cbbd3f7f26988e77e3b9e8fce2fa92fb8bbc30911a51dc93cded4b192` |
| `projection-manifest.jsonl` | 4,306,320 | `588afb3fe94fdde5958ee4aeac9a5ce3b0680cff61d329ec91998819206c6eab` |
| DataCite metadata | — | `21226e033404641d2f55bbf711d7d3458129ba5125ff603bb554e61a71d99613` |
| Mendeley file metadata | — | `0d14259a7cfdf15be8d44bda481e119839f36db39310d47202e8bbccd31cfcbc` |

The archive is bound to the Mendeley file metadata. The audit, projection
receipt, and DataCite record are bound to the expected source ID, v1 DOI, and
origin URL, and the DataCite metadata contains the pinned CC-BY-4.0
declaration. The product disposition remains `internal_analysis`; this
checkpoint does not grant redistribution rights.

## Reconciled inventory

| Measure | Result |
| --- | ---: |
| Manifest rows / regular files | 10,000 / 10,000 |
| Positive / negative | 5,000 / 5,000 |
| Projected unit bytes | 6,195,562 |
| Orphan files / malformed rows | 0 / 0 |
| Exact unique hashes / duplicate rows | 10,000 / 0 |
| Manifest-declared cross-label exact collisions | 0 |
| Positive / negative families | 3,660 / 3,192 |
| Families shared across labels | 3 |

Source claims reconcile to ChatGPT-3.5: 1,492; ChatGPT-4: 3,508; CodeNet:
5,000. Languages reconcile to C: 1,737; C++: 2,640; Java: 2,945; Python:
2,678.

## Verification

```text
corepack pnpm --filter slopbrick exec vitest run \
  tests/calibration/corpus-v1-inventory.test.ts \
  --maxWorkers=1 --minWorkers=1

Result: 1 file passed; 4 tests passed; 1 explicit real-source test skipped.

SLOPBRICK_CORPUS_V1_ROOT=/Users/cheng/corpus-expansion/v10.3 \
corepack pnpm --filter slopbrick exec vitest run \
  tests/calibration/corpus-v1-inventory.test.ts \
  --maxWorkers=1 --minWorkers=1

Result: 1 file passed; 5 tests passed; latest serial real-source inventory
about 0.4 seconds (recorded runs varied with concurrent system load).

corepack pnpm --filter slopbrick typecheck
Result: passed.
```

The real-source test compares archive, CSV, and manifest size/mtime before and
after. The implementation uses read-only filesystem APIs. The JSONL manifest
is streamed, and unit paths are checked one at a time with one test worker.

## Candidate-manifest checkpoint

The next bounded slice rehashed every materialized unit and emitted canonical
candidate JSONL with:

- actual and source-declared/materialized content SHA-256 values;
- `corpus-v1-lexical-tokens-v1` normalized SHA-256 values;
- publisher-attested source, label, language, and problem-family bindings;
- portable authority and license evidence references;
- `internal_analysis` rights disposition;
- `split: unassigned`; and
- stable local integrity quarantine reasons.

The real source produced 10,000 candidate rows, zero local integrity
quarantines, 5,000 positives, and 5,000 negatives. Two independent projections
produced the same candidate-manifest SHA-256:

```text
c15d3cbc95f251b5a0514da14b3f8a90e26124fbfb7db5ce342a873635b383ac
```

Focused verification used one Vitest worker. The portable suite passed four
tests with the real-source test skipped; the real-source suite passed all five
tests, with the 10,000-unit rehash taking about six seconds. SlopBrick
typecheck passed. Candidate source code was never executed.

## Leakage-safe plan checkpoint

The pure Corpus v1 planner processes canonical candidate rows without writing
or admitting them. It quarantines both sides of exact or normalized
cross-label collisions, propagates quarantine to problem-family siblings, and
assigns one split to each union of:

- the publisher problem family;
- same-label exact duplicates; and
- same-label normalized duplicates.

The versioned family-group hash policy assigns buckets 0-79 to train, 80-89 to
validation, and 90-99 to test. Frozen fixture families cover all three bucket
ranges. Shuffled input produces identical canonical JSONL and plan hashes.

The pinned 10,000-row candidate source produced:

| Measure | Result |
| --- | ---: |
| Eligible / quarantined | 10,000 / 0 |
| Positive / negative | 5,000 / 5,000 |
| Exact / normalized cross-label collision rows | 0 / 0 |
| Train / validation / test | 7,970 / 991 / 1,039 |
| Plan SHA-256 | `9c4638526e9a4161d3e74f70197f0b25717439e6bd477bef98664a03c9a9219c` |

Focused verification used one Vitest worker. The portable suite passed seven
tests with the real-source test skipped; after adding the frozen bucket
contract, the real-source suite passed all eight tests. Candidate code was not
executed, and no source or output path was mutated.

## Raw publisher row-binding checkpoint

The source-binding adapter parses the pinned five-column publisher CSV itself
instead of inheriting label and source claims from the projection manifest. It
binds every raw row in ordinal order to the projection's:

- deterministic source record ID and publisher problem ID;
- `AI` or `Human` polarity;
- language and source claim;
- exact UTF-8 sample-code byte count; and
- declared and materialized content SHA-256 values.

Both artifacts are opened as regular non-symlink files with read-only and
no-follow flags, limited to 16 MiB each, read through size-bound handles with
an EOF probe, and rehashed against the pinned inventory. The strict CSV parser
supports quoted commas, multiline fields, doubled quotes, and LF/CRLF while
rejecting invalid UTF-8, wrong headers/counts, stray or unterminated quotes,
bare carriage returns, and partial final records.

The pinned source produced:

| Measure | Result |
| --- | ---: |
| Matched / positive / negative | 10,000 / 5,000 / 5,000 |
| Row-binding SHA-256 | `86b46373ba0cae5149a722777eeff537b27c7a8d43fd8259fa8c197ea1bd300c` |
| Receipt SHA-256 | `47bd66907ec2efa67da718e0cfb38458151ca84d3cdedc941488fe4b001475ac` |

Two independent direct adapter runs produced the same hashes before they were
frozen in the opt-in real-source test. The final one-worker focused suite
passed 17/17, including before/after size and modification-time checks for the
CSV and projection manifest. SlopBrick typecheck passed.

## Deterministic 100/100 smoke checkpoint

The smoke builder consumes only the verified source-binding result, candidate
manifest, and leakage plan. It does not read, copy, import, execute, or admit
candidate code. It selects `eligible` planned rows only, collapses same-label
exact-content duplicates to the lexicographically smallest eligible
`sourceRecordId`, then ranks the remaining units by the versioned
`corpus-v1-smoke-hash-rank-v1` SHA-256 key. The output carries the source,
source-binding, candidate-manifest, and plan hashes in its canonical manifest
header and receipt; its rights disposition remains `internal_analysis`.

The pinned source produced:

| Measure | Result |
| --- | ---: |
| Eligible records / unique exact-content units | 10,000 / 10,000 |
| Selected positive / negative / total | 100 / 100 / 200 |
| Selected train / validation / test | 159 / 17 / 24 |
| Candidate manifest SHA-256 | `c15d3cbc95f251b5a0514da14b3f8a90e26124fbfb7db5ce342a873635b383ac` |
| Leakage plan SHA-256 | `9c4638526e9a4161d3e74f70197f0b25717439e6bd477bef98664a03c9a9219c` |
| Source-binding receipt SHA-256 | `47bd66907ec2efa67da718e0cfb38458151ca84d3cdedc941488fe4b001475ac` |
| Smoke manifest SHA-256 | `bdbcd43279077fa760ae3c99da05b953c38134022fa34626b69a6b6400be00de` |
| Smoke receipt SHA-256 | `ccd74f7b9db49adc802c042df0d7b732d8284d2bbfc4e6ec39e6a1c001c60830` |

Two builds from the same verified in-memory artifacts were byte-identical.
The deterministic test also reverses candidate-row order and produces the
same manifest and receipt. A 99-unique-positive fixture fails closed rather
than treating a duplicate record as a second smoke unit. The real-source test
compares CSV and projection-manifest size/mtime before and after the run.

Verification:

```text
corepack pnpm --filter slopbrick exec vitest run \
  tests/calibration/corpus-v1-smoke.test.ts \
  --maxWorkers=1 --minWorkers=1
Result: 1 file passed; 3 tests passed; 1 real-source test skipped.

SLOPBRICK_CORPUS_V1_ROOT=/Users/cheng/corpus-expansion/v10.3 \
corepack pnpm --filter slopbrick exec vitest run \
  tests/calibration/corpus-v1-smoke.test.ts \
  --maxWorkers=1 --minWorkers=1
Result: 1 file passed; 4 tests passed, including the pinned real-source run.

corepack pnpm --filter slopbrick typecheck
Result: passed.
```

This is a reproducible smoke artifact, not an admission decision, quality
label, authorship proof, redistribution grant, threshold change, or
calibration result. No v10.3 source byte was moved, deleted, rewritten, or
admitted.

## Eligible local projection checkpoint

After the smoke gate, the eligible projection retained only plan rows with
`status: eligible`. It independently checked the eligible rows for unresolved
exact and normalized cross-label collisions before emitting canonical metadata
JSONL. It is still read-only and non-admitting; no candidate bytes are copied
or executed.

The pinned source produced:

| Measure | Result |
| --- | ---: |
| Eligible positive / negative / total | 5,000 / 5,000 / 10,000 |
| Quarantined positive / negative / total | 0 / 0 / 0 |
| Eligible train / validation / test | 7,970 / 991 / 1,039 |
| Unresolved exact / normalized cross-label collisions | 0 / 0 |
| Eligible manifest SHA-256 | `286134799c7f75837a7c292f0d18721d8da9263c25c041eef0ac4734801b52d8` |
| Eligible projection receipt SHA-256 | `9f5274f57ed4adf9d1c1ef55205493e9a833abc86cb8e1ca2b332cd8c72d28ba` |

The deterministic resource receipt records one worker, 10,000 candidate rows
read, 10,000 eligible rows projected, 6,195,562 candidate and eligible bytes
accounted, and an 11,406-byte maximum unit. An external `/usr/bin/time -l`
diagnostic for the real-source focused run observed approximately 4.51 seconds
wall, 3.24 seconds user, and 1.56 seconds system time; the sandbox denied the
kernel query needed for a max-resident-set measurement, so that unavailable
host diagnostic is not represented as a canonical claim.

Verification:

```text
SLOPBRICK_CORPUS_V1_ROOT=/Users/cheng/corpus-expansion/v10.3 \
corepack pnpm --filter slopbrick exec vitest run \
  tests/calibration/corpus-v1-eligible.test.ts \
  --maxWorkers=1 --minWorkers=1
Result: 1 file passed; 2 tests passed, including the pinned real-source run.
```

## Explicitly still open

- The inventory result remains intentionally path/size-only, but the candidate
  projector independently rehashes unit bytes and the source-binding stage
  independently reconciles raw publisher rows.
- The source-attested seed remains unsuitable for claims of witnessed
  authorship, quality labels, redistribution approval, or production use.
- `CAL-001` must freeze its rule-by-rule admission matrix and holdout protocol
  before any fitting, threshold change, or activation decision.

The verified seed is handed off to `CAL-001`; admission and calibration remain
separate later decisions.
