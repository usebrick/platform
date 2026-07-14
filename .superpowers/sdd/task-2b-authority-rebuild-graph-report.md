# Task 2B prebuilt byte-backed authority graph validator

Status: **DONE (bounded pure validator; not full Task 2B)**

## Reason for Existence

Give the later filesystem rebuild/recovery path one deterministic, caller-owned
proof boundary. A caller must be able to prove that a prebuilt proposal,
input-generation, static-generation, current-pointer, and source-generation
graph is self-hashed, byte-receipted, canonically encoded, and joined before
any publication, recovery, CLI, corpus, witness, or release operation is
allowed to consume it.

## Implementation and scope

The validator is implemented in
`packages/slopbrick/src/calibration/v103/admission-authority-rebuild.ts`.

- `136ad461a` — added `validatePrebuiltAdmissionAuthorityGraph` and its
  byte-backed fixture/test boundary.
- `383bf4c09` — hardened the wrapper-key, optional-prior, artifact-map, and
  source-wrapper byte contracts.
- `f115bf7e6` — bound input/static/source artifact receipts to the exact raw
  bytes supplied by the caller.

The function is computation-only. It accepts the Core proposal,
input-generation, static-generation, current/prior-current, source-generation,
source-current, source-review, and generation-local artifact bytes as
`Uint8Array` values. It never resolves a path and performs no filesystem,
network, CLI, corpus, schema-publication, or release I/O.

## Byte and relation contract

The top-level wrapper has exactly these required keys:
`proposal`, `proposalBytes`, `inputGeneration`, `inputGenerationBytes`,
`inputGenerationArtifactBytes`, `staticGeneration`, `staticGenerationBytes`,
`staticGenerationArtifactBytes`, `current`, `currentBytes`, and `sources`.
`priorCurrent` and `priorCurrentBytes` are an optional exact pair: one without
the other fails closed, and both are checked as exact canonical bytes when
present. Every top-level object is validated against its Core shape and its
self-hash; top-level bytes are strict canonical UTF-8 with no BOM or extra
newline.

The prebuilt fixture's exact canonical top-level byte receipts are:

| object | bytes | raw-byte SHA-256 |
| --- | ---: | --- |
| proposal | 1,229 | `696080d630cd6fdcdb29f33910a97e716acf96dfd0b60176d7872e31cd76afbe` |
| input generation | 1,454 | `914a56918097240bb207ca68ccd411476907aa41b9a52161ced425c4f18a86ec` |
| static generation | 2,197 | `12478aa0ececca7014018c5ad8127b8532d98cf16ff3e5cd8997bea4405d697a` |
| current pointer | 384 | `bb8784761a830e5b1bd2ae957061aeca16c835aab3d8f718d5ea6a513b419116` |
| prior current | optional; absent in the create fixture | paired presence and exact canonical bytes are tested |

The raw input-generation and static-generation receipt maps are exact (no
missing, extra, duplicate, unsafe, non-`Uint8Array`, size-drift, or hash-drift
entries):

| map/path | bytes | raw-byte SHA-256 |
| --- | ---: | --- |
| input `admission-records.jsonl` | 24 | `28b7ac3eb666397815b5e64119e04a9d5b5df097631e7bdf7ad813916b981715` |
| input `overlap-universe-records.jsonl` | 24 | `28b7ac3eb666397815b5e64119e04a9d5b5df097631e7bdf7ad813916b981715` |
| input `overlap-universe.json` | 17 | `19ffda900f73a6bfe128b8ea1672ffedb7ec29c9023c20ed062fb3f67b8dd039` |
| static `lineage-ledger.json` | 3 | `ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356` |
| static `pre-witness-bundle.json` | 3 | `ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356` |
| static `privacy-ledger.json` | 3 | `ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356` |
| static `quality-ledger.json` | 3 | `ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356` |

Each source entry is exact and ordered with the input-generation source list.
The fixture's `source-a` map is:

| source-a receipt | bytes | raw-byte SHA-256 |
| --- | ---: | --- |
| source generation | 901 | `193f16f60608a99579ebea35908b21731574d5c72e6cded4c83d3bb34acf0542` |
| source current pointer | 359 | `d8d5879dcc5579bdbc5a5f791f9fd90c23154c72909bd05dae224ff5d7666a89` |
| source `decision-ledger.json` | 3 | `ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356` |
| source `source-review.json` | 1,004 | `ae014c676cf37d4d87e073039bce64caf7a2d95a3f015340925d3154579de53b` |

`source-review.json` is canonical JSON plus exactly one final LF; the fixed
`source_review` role, source ID, review hash, size, and bytes must all agree.
Source current/generation IDs, generation hash, hash-derived contained path,
input-generation source reference, proposal reference, artifact set, and
source-review hash are joined before success.
The source proposal is represented only by its ID/hash/path reference in this
pure slice; source-proposal bytes and their filesystem publication remain
outside the validator and are deferred with the rebuild gate.

The validator delegates the proposal → input-generation → static-generation →
current/prior-current relation checks to Core's
`validateCalibrationAdmissionStaticAuthorityGraphV1`. Those joins cover source
IDs and evidence-bundle hash, proposal/input stream and overlap artifact
identity, input-generation self-hash to static generation, the four fixed
static artifact anchors, current-to-static generation/hash/generation, and
create-versus-replace prior-current CAS rules.

## TDD and verification

- RED: the focused Vitest collection failed before `136ad461a` because the
  production module was absent.
- GREEN: `verify: NODE_OPTIONS=--max-old-space-size=2048 corepack pnpm --filter slopbrick exec vitest run tests/calibration/v103-admission-authority-rebuild.test.ts --maxWorkers=1 --minWorkers=1` — **13/13 tests passed**.
- `corepack pnpm --filter slopbrick typecheck` — passed.
- `corepack pnpm --filter slopbrick build` — passed; the existing non-fatal
  Zod declaration warnings remain.
- `git diff --check` — passed at the implementation boundary.

The 13 focused tests cover valid canonical bytes; exact top-level keys;
proposal/input/static/current/prior byte presence and canonicality; BOM,
newline, malformed UTF-8, and source-review serialization; exact input/static
and per-source receipt maps; raw-byte size/hash mutation; source current/hash/
path drift; proposal-to-input-to-static-to-current join drift; fixed-role and
contained-path substitutions; and duplicate/extra source wrappers.

Independent review evidence and verdict **APPROVE** are recorded in
`.superpowers/sdd/task-2b-authority-rebuild-graph-review.md`.

## Boundary and deferred gates

This closes only the prebuilt byte-backed graph validator. Filesystem
publication/recovery, CLI commands (`rebuild:pre-witness`,
`static-authority:recover`, and `census:preview`), real receipt/corpus
materialization, witness/context authority, corpus admission, and release
gates remain explicitly deferred. The canonical ledger remains **98/178**
continuation items and **2/76** admission items; no corpus labels/bytes,
manifests, remote refs, package versions, or release state changed.
