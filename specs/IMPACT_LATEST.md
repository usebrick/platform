## Target

Implement the reviewed v10.3 corpus-admission and materialization program: an
immutable HTTPS release asset may supply reviewed files without pretending
they exist in a Git tree, while no file becomes calibration gold without the
separate proof-carrying admission, global-overlap, witness, manifest, and
consumer-authority gates.

The immediate candidate is EvalPlus v0.1.0. The same contract would admit a
future published controlled-generation bundle, but must continue rejecting
unpublished local files and mutable/unhashed downloads.

The completed EvalPlus intake audit narrows that candidate. Its 164 ground-
truth `.py` members already exist byte-for-byte in the pinned Git tree and
should keep using Git-tree provenance. Only the StarCoder members require the
release-archive source kind, and honest materialization does not make them
gold: 81.03% of their Python bytes are shared HumanEval prompt scaffold, one
file is syntactically truncated, 22 target bodies are inert `pass`
completions, one paired implementation is exactly identical, and generator/
license lineage remains incomplete. The archive contract removes a provenance
falsehood; it does not approve a binary authorship label.

Reproducible scaffold-aware duplicate analysis also corrects the preliminary
intake narrative: removing HumanEval prompt docstrings and ground-truth
`# $_CONTRACT_$` benchmark assertions exposes 10 exact same-task
implementation pairs, plus one near-only pair (`HumanEval/80`, Jaccard 0.82).
The raw-target-body sensitivity view retains only the `HumanEval/53` exact
pair. Eligibility must use the union of all exact/near endpoints: 11 unsafe
pairs, not the preliminary single-pair count.

## Affected surfaces

The release-asset tranche has these 17 direct surfaces:

- `packages/core/schemas/v1/calibration-corpus-manifest.schema.json`: source
  metadata and canonical file identity.
- `packages/core/schemas/v1/calibration-checkout-map.schema.json`: local
  materialization binding.
- `packages/core/schemas/v1/index.json`: public schema registry.
- `packages/core/src/corpus-manifest.ts`: cross-record provenance/leakage
  verifier and source-ID derivation.
- `packages/core/src/calibration-run.ts`: checkout-map validation and digest.
- `packages/core/src/generated/calibration-corpus-manifest.ts`: generated public
  manifest types.
- `packages/core/src/generated/calibration-checkout-map.ts`: generated local-map
  types.
- `packages/core/src/index.ts`: public aliases.
- `packages/slopbrick/src/calibration/v103/canonical.ts`: stable file identity
  and manifest hashing.
- `packages/slopbrick/src/calibration/v103/selection.ts`: source metadata copied
  into immutable selection records.
- `packages/slopbrick/src/calibration/v103/resolver.ts`: containment, source
  revision, artifact digest, and per-file hash verification.
- `packages/slopbrick/src/calibration/v103/run-manifest.ts`: frozen checkout-map
  binding.
- `packages/slopbrick/src/calibration/v103/selected-scanner.ts`: resolved-byte
  consumer.
- `packages/slopbrick/src/calibration/v103/run-scan.ts`: scan orchestration.
- `packages/slopbrick/scripts/cal/v103.ts`: CLI validation/scan boundary.
- package build/pack configuration: generated schemas/types and calibration CLI
  must remain in the packed artifact.
- calibration README/continuation plan/external v10.3 source register and
  datasheet: user-visible provenance and materialization rules.

The admission tranche additionally affects:

- new Core schemas, generated types, validators, and schema-index entries for
  policy/tool receipts, evidence/CAS ownership, reviews/blindness, admission
  records, exact-overlap authorities, resource/privacy/quality/lineage
  ledgers, witnesses/search/review receipts, census publication/recovery,
  acquisition, dependency approvals, manifest prerequisites, build receipts,
  generations, current pointers, locks, and transactions;
- SlopBrick admission-context, exact-overlap, census, acquisition, witness,
  manifest-publication, manifest-consumer, and recovery modules plus
  `scripts/cal/v103-admission.ts`;
- `corpus:validate`, `materialize`, and `select`: legacy v10.3.0/v10.3.1 keep
  flat-path-plus-hash input, while v10.3.2 requires a complete self-hashed
  manifest reference and in-process private-authority reconstruction;
- clean packed-consumer and Node 22/24 runtime-matrix coverage for all three
  v10.3.2 consumers;
- `/Users/cheng/corpus-expansion/v10.3` review, evidence CAS, source/input/
  overlap/static/witness/census/manifest generations, bounded acquisition,
  and immutable run artifacts; and
- the combined plan audit, continuation/evidence ledger, package/changelog,
  calibration docs, and root README trust claims.

Indirect consumers include every persisted source review, admission record,
witness, manifest, selection, checkout-map and run hash; future metrics/report
stages; schema delivery at usebrick.dev; and any external manifest producer.

## Affected stories

- Gate 3 — lossless v10.3 pipeline: immutable inputs and resume hashes must bind
  the exact artifact bytes and deterministic materialization.
- Gate 4 — corpus provenance: benchmark archives and generated bundles need an
  honest source identity, license, evidence URL, archive hash, and safe extract.
- Gate 5 — smoke/canary/full calibration: selections produced before the
  contract change cannot be mixed with the new method version.
- Release R1/R2/R3 — schema contracts, packed calibration CLI, security, and
  clean-consumer behavior must include the new source kind.

No `specs/release-plan.yaml` or epic capsule exists in this repository; these
gate sections in `v0.45.0-continuation-plan.md` are the current story authority.

## Test coverage

- `packages/core/tests/corpus-manifest-contract.test.ts`: JSON Schema plus
  semantic source/file identity and leakage rules.
- `packages/core/tests/calibration-run-contract.test.ts`: checkout-map shape,
  uniqueness, and canonical digest.
- `packages/core/tests/schema-contract.test.ts`: registry/codegen drift.
- `packages/slopbrick/tests/calibration/v103-selection.test.ts`: deterministic
  source metadata propagation and selection hashes.
- `packages/slopbrick/tests/calibration/v103-resolver.test.ts`: containment,
  symlink, missing file, and content-hash failure.
- `packages/slopbrick/tests/calibration/v103-run-manifest.test.ts`: portable
  manifest/local-map hash binding.
- `packages/slopbrick/tests/calibration/v103-selected-scanner.test.ts` and
  `v103-run-scan.test.ts`: resolved-byte scanner integration.
- `packages/slopbrick/tests/calibration/v103-cli-e2e.test.ts`: manifest →
  selection → frozen run → scan path.
- `packages/slopbrick/tests/integration/pack-consumer.test.ts`: packed control
  plane availability.

Planned tests that must be red before their implementation slice:

- release-asset URL/hash/size binding and source-ID uniqueness
- deterministic ZIP materialization with zip-slip, absolute path, duplicate
  entry, symlink, case-collision, decompression-bomb, and size/count limits
- offline/resume behavior after the verified artifact is cached
- archive-byte mutation and extracted-file mutation failures
- artifact-backed pair groups and split/leakage invariants
- old Git-tree manifest compatibility and mixed-source manifests
- method-version/hash invalidation after any materialization-policy change
- clean packed-consumer execution from an artifact-backed fixture
- complete 329-register/329-review equality and conservation mutations
- proof-carrying evidence deletion/substitution/no-network/private-brand tests
- real-scale exact-overlap shard/resource/resume/dense-cluster tests
- blind-review and witness-search acyclicity and infeasibility certificates
- create/replace/fsync/lock-only recovery fault injection for every publisher
- v10.3.2 flat-path rejection and full-graph revalidation independently in
  validate, materialize, and select
- clean installed-tarball v10.3.2 execution under Node 22 and 24

## Risk: High

This is a shared schema-backed API and a security-sensitive archive extraction
boundary. A loose optional field would make provenance look stronger while
leaving source bytes mutable; a generic downloader would add path traversal,
resource exhaustion, and resume-poisoning risk.

## Recommended action

Proceed only in the frozen order: release-materialization Tasks 1-6, admission
Tasks 0-9B, release Tasks 7-8, then admission smoke/canary Tasks 10-11. Keep
the existing Git-tree record as the default and write each implementation slice
test-first. For a release asset, require together:

- immutable HTTPS project origin and source revision
- explicit materialization kind
- immutable HTTPS asset URL
- archive SHA-256, byte size, format, and extraction policy version
- canonical path inside the verified extraction root
- source/file identity that includes the artifact digest
- local checkout-map entry bound to that artifact digest
- per-file content SHA-256 and existing family/cluster/pair/split rules

The resolver may consume only an already verified, contained materialization;
download/extraction must be a separate fail-closed intake step. Reject local or
unhashed URLs. Treat GitHub release URLs as locators, not immutable identity:
the recorded SHA-256 is authoritative because maintainers can replace an asset
at the same URL.

Task 3 acquisition is intentionally IPv4-only and POSIX-only for this tranche.
Arbitrary RFC 6052 NAT64 prefixes defeat address-only private-IPv4 detection,
and Windows reparse-safe path handling needs a separate explicit design. A
verified offline cache remains usable, but online IPv6-only and native Windows
acquisition fail closed until trusted-prefix/network-sandbox and reparse-safe
authorities are planned and reviewed. The caller must provide a pre-existing
private canonical cache root under a trusted ancestor chain.

Freeze the admission-backed path as method v10.3.2 before producing a real
selection. A verified archive is still quarantine/sensitivity until the
independent admission witness approves exact records.
Do not bump the unrelated Repository Structure schema version for an additive
calibration-only contract, but regenerate types and invalidate every affected
selection/run hash. Request security and data-provenance reviews before using
EvalPlus or a published controlled bundle.
