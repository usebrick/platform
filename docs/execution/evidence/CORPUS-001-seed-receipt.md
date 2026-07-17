# CORPUS-001 source-inventory checkpoint

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

## Explicitly still open

- The raw CSV is hash-bound but is not parsed in this inventory slice.
- Materialized unit contents are size/path checked but are not rehashed here;
  the result exposes `unitContentVerification: path_and_size_only`, and current
  exact-content counts are named `manifestExactContent` because they come from
  the pinned projection manifest.
- No normalized hashes, family-aware split, collision quarantine, 100/100
  smoke receipt, admission output, threshold change, or calibration run exists.
- No v10.3 source byte was moved, deleted, rewritten, or admitted.

The next slice must construct a deterministic candidate manifest with per-unit
content and normalized hashes, family keys, rights disposition, and explicit
quarantine reasons before any split or smoke calibration is attempted.
