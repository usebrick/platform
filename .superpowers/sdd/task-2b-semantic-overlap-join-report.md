# Task 2B semantic source authority and overlap-join report

**Date:** 2026-07-15

**Scope:** bounded semantic source-generation authority, persisted semantic
bytes, and a strict static-generation overlap/resource join. This report does
not claim corpus admission, a mutating rebuild CLI, or release readiness.

## Implemented boundary

- `PrebuiltAdmissionAuthoritySourceSemanticAuthorityV1` carries a source's
  blind assignment, exactly two reviewer decisions, blind-review receipt, and
  either genesis evidence-bundle or acquired snapshot/materialization-receipt
  authority. Its canonical self-hash and bytes are checked, then Core's
  `validateCalibrationAdmissionSourceGenerationGraphV1` proves the candidate
  source-review, approval, assignment, decision, receipt, and materialization
  joins.
- The semantic bundle is persisted with no-clobber writes beside the immutable
  source generation at
  `review/admission/sources/<sourceId>/generations/<generationSha256>/source-semantic-authority.json`.
  Recovery rechecks the exact bytes. The strict loader reopens the contained
  path; strict source-proposal loading also requires the semantic bundle for
  independent-review generations. Publication rejects an independent-review
  graph that only carries shape-only approval IDs.
- `validatePrebuiltAdmissionAuthorityOverlapJoin` is a separate pure,
  byte-backed gate. It requires static and overlap generation bytes, all three
  canonical envelope pairs (index, resource receipt, ledger), the static ↔
  overlap input/generation joins, and the complete indexed tool-authority
  resolution for successful `admission-static-ledgers-v1` / `authority:overlap`.
  It invokes `verifyOverlapArtifactRelations` only with all envelopes present;
  opaque `primaryOutputSetSha256` metadata is never treated as resource proof.

## Evidence

Focused one-worker gate (2 GiB heap cap):

```text
v103-admission-authority-rebuild.test.ts            16 passed
v103-admission-authority-rebuild-loader.test.ts     10 passed
v103-admission-authority-rebuild-publication.test.ts 15 passed
v103-admission-authority-overlap-join.test.ts        5 passed
46 tests passed
```

Additional gates are green:

- `COREPACK_ENABLE_PROJECT_SPEC=0 corepack pnpm -r typecheck`
- `COREPACK_ENABLE_PROJECT_SPEC=0 corepack pnpm -r build`
- package-wide SlopBrick Vitest: **316 files passed / 5 skipped; 3,616
  passed / 9 skipped** under one worker and a 2 GiB heap cap
- `git diff --check`

The build retains the existing non-fatal Zod declaration warnings. The full
test run retains expected worker-fixture stderr, retry/timeout fixture output,
and temporary `fatal: not a git repository` noise; the affected tests pass.

## Explicit limitations and next boundary

The overlap join is intentionally standalone and read-only. The legacy
prebuilt publisher still accepts metadata-only tool receipts; callers must
invoke the strict join before treating overlap outputs as static authority.
No mutating `rebuild:pre-witness`, `static-authority:recover`, or corpus
admission command is enabled.

The external corpus is unchanged. The read-only census remains **329/329**
registered/reviewed sources, **452,382** quarantined or unrepresented units,
zero candidate units, zero eligible units, and blockers
`static_authority_unavailable` and `witness_authority_unavailable`.

Next: wire the strict overlap join into the byte-backed authority/context
boundary (and later the CLI) with independent review, then replay real static
and witness context against the corpus. Do not promote labels or release until
those joins and the mutating recovery path are separately proven.
