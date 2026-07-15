# Task 2B runtime overlap-authority context report

**Date:** 2026-07-15
**Status:** bounded implementation complete; review findings addressed; recursive gates green

## Scope

`buildVerifiedAdmissionContext` now routes the runtime admission context
through the strict static/overlap authority join. It reads the current static
generation's selected input and overlap generations, their canonical bytes,
the overlap current pointer, every declared artifact in each selected tree,
and the canonical bytes for `index.json`, `overlap-resource-receipt.json`,
and `overlap-ledger.json`.
It resolves the exact `admission-static-ledgers-v1` / `authority:overlap`
receipt from the contained indexed tool-authority tree, compares all three
envelopes to the rich pre-witness bundle, and invokes
`validatePrebuiltAdmissionAuthorityOverlapJoin`.

The branded context carries an immutable `overlapAuthority` identity including
input/source proof hashes and includes the aggregate byte-backed proof hash in
`contextSha256`. A missing envelope, orphan/tampered artifact, stale overlap
current pointer, resource tamper, or missing tool-authority index fails closed.

Static artifact receipts are raw-byte hashes as documented by the Core graph;
the static generation's ledger/bundle fields remain semantic hashes and are
joined separately to the verified rich bundle. The runtime reads the selected
static files and checks both contracts.

The runtime context is deliberately quarantine-only at this boundary. Any
source generation whose approval is `independent_review` fails closed until a
persisted `source-semantic-authority.json` bundle is loaded by the mutating
adapter. This prevents candidate records from being treated as admitted on
source-review shape alone.

The fixture is no longer hash-only: it publishes real core-contract and
overlap invocation/receipt objects into the authority index, updates the
bundle's frozen profile/policy/witness projections to those published
profiles, materialises source authorities plus an input generation, and
materialises a hash-named overlap generation/current pointer with all three
canonical envelopes.

## Evidence

- Focused runtime context: **13/13 tests passed**.
- Focused disposition compatibility: **2/2 tests passed**.
- Core static-authority contract: **8/8 tests passed**; SlopBrick rebuild and
  loader regression suites: **26/26 tests passed**.
- Recursive gates: Core **226/226**, website **38/38**, engine **59/59**, and
  SlopBrick **3,620 passed / 9 skipped** across **316 passed / 5 skipped test
  files**; recursive typecheck and build passed.
- SlopBrick typecheck: passed; `git diff --check`: passed.
- Coverage includes positive proof metadata, missing/orphan input and overlap
  artifacts, stale overlap current pointer, resource receipt tamper, missing
  indexed authority, raw-vs-semantic static receipt separation, root-path
  binding, and the existing static/source/record rejection matrix.

## Explicit limits

- The context reads every artifact declared by the selected input, static, and
  overlap generation trees. It does not yet provide a cross-object atomic
  snapshot under concurrent writers; each file is protected by canonical
  containment checks plus `O_NOFOLLOW` and a post-read path consistency check.
- The legacy prebuilt overlap publisher remains metadata-tolerant; strict
  runtime admission does not make that publisher strict.
- Candidate/independent-review source generations remain intentionally
  blocked until the mutating adapter loads and verifies their semantic
  authority sibling.
- No mutating rebuild/recovery CLI, corpus labels, manifests, repository
  acquisition, package version, release, publish, remote, or deployment state
  changed.

## Next gate

After this gate, implement the mutating rebuild/recovery adapter. It must reuse the raw static receipt contract,
persist/verify input-generation and source semantic-authority bytes, and
publish a coherent snapshot before candidate admission. Only after that
adapter has its own byte-backed receipts may the real corpus static/witness
context be replayed or any corpus deficit be measured.
