## Target

Extend the v10.3 calibration corpus/materialization contract so an immutable
HTTPS release asset can supply reviewed files without pretending those files
exist in the release's Git tree.

The immediate candidate is EvalPlus v0.1.0. The same contract would admit a
future published controlled-generation bundle, but must continue rejecting
unpublished local files and mutable/unhashed downloads.

## Dependents (17 direct surfaces)

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

Indirect consumers include every persisted selection/run hash, future metrics
and report stages, schema delivery at usebrick.dev, and any external manifest
producer.

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

Gaps that must be added before implementation:

- release-asset URL/hash/size binding and source-ID uniqueness
- deterministic ZIP materialization with zip-slip, absolute path, duplicate
  entry, symlink, case-collision, decompression-bomb, and size/count limits
- offline/resume behavior after the verified artifact is cached
- archive-byte mutation and extracted-file mutation failures
- artifact-backed pair groups and split/leakage invariants
- old Git-tree manifest compatibility and mixed-source manifests
- method-version/hash invalidation after any materialization-policy change
- clean packed-consumer execution from an artifact-backed fixture

## Risk: High

This is a shared schema-backed API and a security-sensitive archive extraction
boundary. A loose optional field would make provenance look stronger while
leaving source bytes mutable; a generic downloader would add path traversal,
resource exhaustion, and resume-poisoning risk.

## Recommended action

Proceed only with tests first and an explicit materialization variant. Keep the
existing Git-tree record as the default. For a release asset, require together:

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

Freeze this as a new v10.3 method revision before producing a real selection.
Do not bump the unrelated Repository Structure schema version for an additive
calibration-only contract, but regenerate types and invalidate every affected
selection/run hash. Request security and data-provenance reviews before using
EvalPlus or a published controlled bundle.
