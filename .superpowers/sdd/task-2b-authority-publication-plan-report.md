# Task 2B authority-publication planner report

**Date:** 2026-07-15  
**Commits:** `3fadffe56`, `b27ab684f`, `5feb27aff`  
**Scope:** pure fixture-scale planning only

## Contract

`planPrebuiltAdmissionAuthorityPublication` accepts explicit proposal, input-
generation, static-generation, source-generation, expected-current, and
optional prior-input metadata. It returns either a bounded error list or a
Core-valid self-hashed rebuild lock, transaction, and fixed
`review/admission` path set. It does not inspect a directory, read bytes, or
mutate a filesystem.

Create requires generation zero and an absent expected current pointer. Replace
requires an explicit prior input-generation descriptor, an exact input parent
SHA, a static parent matching the expected current static SHA, and nonzero
generation numbers. Source IDs and hashes are validated, sorted, deduplicated,
and mapped to transaction-owned staging paths. New/prior input and static
aliases are rejected.

The default recovery nonce is deterministic for repeatable planning. If a
caller supplies a nonce, it is included in the full SHA-256 transaction
identity, so lock bytes and staging paths cannot collide across recovery
attempts. Core lock, transaction, and graph validators gate every success.

## Verification

```text
NODE_OPTIONS=--max-old-space-size=2048 COREPACK_ENABLE_PROJECT_SPEC=0 corepack pnpm --filter slopbrick exec vitest run tests/calibration/v103-authority-publication-plan.test.ts --maxWorkers=1 --minWorkers=1
```

Result: **6/6** focused tests passed. The tests cover deterministic create,
explicit replace ancestry, duplicate/unsafe source handling, malformed input,
Core validator acceptance, and nonce/path separation. Recursive typecheck
passed. The package-wide SlopBrick run passed **312 files / 5 skipped; 3,584
tests / 9 skipped** in 284.26 seconds with one worker and a 2 GiB heap cap;
build also passed with the existing non-fatal Zod declaration warnings.

This report does not claim filesystem publication, recovery, CLI readiness,
static/witness/resource authority, corpus eligibility, or release readiness.
