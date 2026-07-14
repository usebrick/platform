# Task 2B prebuilt authority rebuild graph review

Verdict: **APPROVE (bounded prebuilt byte-backed validator only)**

## Reason for Existence

Record an independent, reproducible gate for the prebuilt authority graph
before any future filesystem publication or recovery code can consume it. This
review preserves the exact byte, receipt-map, relation-join, and fail-closed
boundaries that must remain true while the rest of Task 2B is implemented.

## Review boundary

The reviewed implementation is the three-commit sequence:

- `136ad461a` — `validatePrebuiltAdmissionAuthorityGraph` and its fixture/tests;
- `383bf4c09` — wrapper, prior-pair, artifact-map, and source-wrapper hardening;
- `f115bf7e6` — raw input/static/source artifact-byte binding.

The review covered the production module, fixture, and focused test file only.
The validator is caller-owned and computation-only: no path resolution,
filesystem/network access, CLI wiring, publication/recovery orchestration,
corpus mutation, witness/context materialization, or release operation is in
scope or present.

## Evidence reviewed

The wrapper requires exactly the proposal, input-generation, static-generation,
current-pointer, input/static artifact-map, and ordered-source keys. Optional
`priorCurrent` and `priorCurrentBytes` must appear together. Proposal, input,
static, current, and optional prior bytes are decoded as strict UTF-8, reject a
BOM or extra newline, and must equal the exact canonical JSON of the supplied
object. Core self-hashes are recomputed before relation validation.

The fixture's canonical top-level receipts are proposal **1,229** bytes /
`696080d630cd6fdcdb29f33910a97e716acf96dfd0b60176d7872e31cd76afbe`, input
**1,454** /
`914a56918097240bb207ca68ccd411476907aa41b9a52161ced425c4f18a86ec`, static
**2,197** /
`12478aa0ececca7014018c5ad8127b8532d98cf16ff3e5cd8997bea4405d697a`, and
current **384** /
`bb8784761a830e5b1bd2ae957061aeca16c835aab3d8f718d5ea6a513b419116`.

Exact raw receipt maps are covered by path, count, SHA-256, and complete-set
checks. The input map contains `admission-records.jsonl` (24 /
`28b7ac3eb666397815b5e64119e04a9d5b5df097631e7bdf7ad813916b981715`),
`overlap-universe-records.jsonl` (24 / the same hash), and
`overlap-universe.json` (17 /
`19ffda900f73a6bfe128b8ea1672ffedb7ec29c9023c20ed062fb3f67b8dd039`). The
static map contains `lineage-ledger.json`, `pre-witness-bundle.json`,
`privacy-ledger.json`, and `quality-ledger.json`, each 3 bytes with
`ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356`.
The ordered `source-a` map contains `decision-ledger.json` (3 /
`ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356`) and
`source-review.json` (1,004 /
`ae014c676cf37d4d87e073039bce64caf7a2d95a3f015340925d3154579de53b`); its
source generation is 901 /
`193f16f60608a99579ebea35908b21731574d5c72e6cded4c83d3bb34acf0542`, and
source current is 359 /
`d8d5879dcc5579bdbc5a5f791f9fd90c23154c72909bd05dae224ff5d7666a89`.

Core's `validateCalibrationAdmissionStaticAuthorityGraphV1` verifies proposal
→ input-generation → static-generation → current/prior-current joins for
source IDs, evidence-bundle and stream/overlap artifacts, input/static
self-hashes, fixed privacy/quality/lineage/pre-witness anchors, current
generation/hash, and create/replace CAS. SlopBrick verifies every source's
generation/current hash/path, input and proposal references, fixed
`source-review` role, canonical review plus one LF, and exact artifact bytes.
Source-proposal bytes are not supplied by this pure graph input; only their
ID/hash/path references are joined, so source-proposal materialization and
publication remain deferred.
The validator wraps the entire boundary so malformed values, unsafe paths,
duplicate/extra keys, and throwing accessors return `{ ok: false }` rather
than escaping or performing I/O.

## Commands and results

- `verify: NODE_OPTIONS=--max-old-space-size=2048 corepack pnpm --filter slopbrick exec vitest run tests/calibration/v103-admission-authority-rebuild.test.ts --maxWorkers=1 --minWorkers=1` — **13/13 passed**.
- `corepack pnpm --filter slopbrick typecheck` — passed.
- `corepack pnpm --filter slopbrick build` — passed; existing non-fatal Zod
  declaration warnings are unchanged.
- `git diff --check` — passed.

The focused mutation matrix covers exact wrapper keys, proposal/input/static/
current/prior bytes, BOM/newline/UTF-8 rejection, missing/extra receipt paths,
raw byte mutation after rehash, source current/hash/path drift, proposal/input/
static/current join drift, fixed-role/path substitutions, source-review byte
drift, and duplicate/extra source wrappers.

## Verdict and remaining gates

**APPROVE** for the bounded prebuilt validator. This approval does not mark
full Task 2B complete. Filesystem publication/recovery, CLI commands
(`rebuild:pre-witness`, `static-authority:recover`, `census:preview`), real
receipts/corpus, witness/context authority, corpus admission, and release are
explicitly deferred. The canonical ledger remains **98/178** continuation and
**2/76** admission; the read-only census remains **452,382** quarantined or
unrepresented units, zero candidate/eligible units, with blockers
`static_authority_unavailable` and `witness_authority_unavailable`. No corpus
labels/bytes, manifests, remote refs, package versions, or release state
changed.
