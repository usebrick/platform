# Task 2B source-proposal/approval byte-bound report

**Date:** 2026-07-15
**Scope:** bounded source-generation proposal/approval materialization and
recovery binding. This report is not an independent-review approval and does
not claim semantic source admission.

## Implemented boundary

- `PrebuiltAdmissionAuthoritySourceInput` accepts optional exact source
  proposal and approval objects plus canonical bytes.
- The pure prebuilt graph validator checks object/byte pair completeness,
  canonical JSON, Core self-hashes, source/generation/proposal joins,
  artifact equality, create/replace CAS semantics, and the fixed approval
  path/hash join for an `independent_review` branch. Genesis quarantine rejects
  approval bytes.
- The symlink-safe loader has an explicit
  `requireSourceProposalBytes: true` mode. It reopens only the declared fixed
  proposal path and the fixed `<proposalId>-approval.json` sibling when the
  generation is independent-review; missing, noncanonical, tampered, or
  redirected bytes fail closed.
- The prebuilt publisher/recovery path requires source proposal bytes for every
  published source and approval bytes for independent-review branches. It
  materializes the fixed sibling paths before source-generation staging and
  rechecks them on every recovery phase. Omitting the pair during recovery is
  rejected before mutation.

## Evidence

Focused one-worker gate (2 GiB heap cap):

```text
tests/calibration/v103-admission-authority-rebuild.test.ts          14 passed
tests/calibration/v103-admission-authority-rebuild-loader.test.ts    9 passed
tests/calibration/v103-admission-authority-rebuild-publication.test.ts 13 passed
36 tests passed
```

Additional gates are green:

- `COREPACK_ENABLE_PROJECT_SPEC=0 corepack pnpm -r typecheck`
- `COREPACK_ENABLE_PROJECT_SPEC=0 corepack pnpm -r build`
- package-wide SlopBrick Vitest: **315 files passed / 5 skipped; 3,606
  passed / 9 skipped** under one worker and a 2 GiB heap cap
- `git diff --check`

Build output retains the existing non-fatal Zod declaration warnings. The
package test run also retains expected worker-fixture stderr and temporary
test-process `fatal: not a git repository` noise; the affected tests pass.

## Explicit limitations

The independent-review fixture is deliberately shape/canonical-byte-only. It
does not provide the blind assignment, two reviewer decisions, blind-review
receipt, candidate source-review disposition, or acquired materialization
authority required by the full Core source-generation graph. The loader does
not read those semantic objects. Static-generation overlap/resource receipt
relations and indexed tool-receipt membership remain open; no mutating
`rebuild:pre-witness` or `static-authority:recover` CLI is enabled.

The external corpus is unchanged. The read-only census remains 329/329
registered/reviewed sources, 452,382 quarantined or unrepresented units, zero
candidate units, zero eligible units, and blockers
`static_authority_unavailable` and `witness_authority_unavailable`.
