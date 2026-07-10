## Target

`calibration-corpus-manifest` v10.3 file contract: add an optional
`pairGroupId` for paired human/AI benchmark records.

## Dependents

- `packages/core/src/corpus-manifest.ts`: semantic manifest verifier.
- `packages/core/src/generated/calibration-corpus-manifest.ts`: generated
  cross-package file type.
- `packages/core/src/index.ts`: exports that file type as
  `CalibrationCorpusFile`.
- `packages/slopbrick/src/calibration/v103/selection.ts`: derives deterministic
  selection records from the core file type.
- Core schema contract and corpus-manifest contract tests, plus SlopBrick v10.3
  selection tests.

## Affected stories

- Gate 4 — rebuild corpus provenance: verified paired human/AI tasks are the
  primary gold-corpus target and every pair group must be split-locked.
- Gate 3 — manifest-derived selection: pair metadata must not change existing
  file identity, selection, or run hashes except as a manifest field.

## Test coverage

- `packages/core/tests/corpus-manifest-contract.test.ts` exercises schema and
  semantic validation.
- `packages/core/tests/schema-contract.test.ts` exercises registry/codegen
  expectations.
- `packages/slopbrick/tests/calibration/v103-selection.test.ts` exercises
  manifest consumption and canonical selection.

Gap: the current contract has no way to express a cross-polarity pair while
requiring it to stay in one split. A test must prove a pair can span labels but
cannot span splits; family and content-cluster cross-polarity prohibitions must
remain unchanged.

## Risk: High

This is a shared, schema-backed cross-package API consumed by selection and
future external manifests. It is safe only as an optional backward-compatible
field with schema, generated type, semantic validation, and consumer tests
updated together.

## Recommended action

Add tests first. Add optional `pairGroupId` with no structure schema version
bump, update generated types, and enforce split-only consistency for the pair
group. Do not replace existing family/cluster leakage rules.
