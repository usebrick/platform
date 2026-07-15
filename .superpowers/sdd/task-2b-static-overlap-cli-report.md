# Task 2B strict static-overlap join and read-only CLI report

**Date:** 2026-07-15
**Status:** bounded implementation complete; independent review and runtime-context integration remain open

## Scope

This slice integrates the existing pure
`validatePrebuiltAdmissionAuthorityOverlapJoin` contract into the read-only
`authority:overlap:verify` boundary. It deliberately does not make the legacy
prebuilt publisher strict, add a mutating rebuild/recovery command, or admit
corpus files.

## Implementation

- `verifyAdmissionOverlap` accepts an optional static-authority join request.
- The strict path reopens canonical bytes for the static current pointer,
  selected static generation, selected overlap generation, and the index,
  resource, and ledger envelope files.
- It resolves the indexed `admission-static-ledgers-v1` /
  `authority:overlap` tool receipt with exact intent, receipt, index, and
  snapshot selectors, then invokes the pure overlap join validator.
- Join failures are prefixed `overlap_static_authority_join:` and are returned
  without mutation.
- The CLI exposes `--join-static-authority` only for
`authority:overlap:verify`; the flag requires all indexed selectors, and
selectors without the flag or unrelated action/receipt-output options are
rejected. The verifier accepts either the project root or its `review/admission`
alias.

## Evidence

Focused command:

```text
NODE_OPTIONS=--max-old-space-size=2048 \
COREPACK_ENABLE_PROJECT_SPEC=0 corepack pnpm --filter slopbrick exec \
vitest run --pool=threads --maxWorkers=1 --minWorkers=1 \
tests/calibration/v103-admission-overlap-cli.test.ts \
tests/calibration/v103-admission-authority-overlap-join.test.ts
```

Result: **2 files / 13 tests passed**. Coverage includes missing-selector
rejection, default-path compatibility, successful strict verification, stale
receipt rejection, static-generation/current-pointer tamper rejection, and
the nested-root alias.

Package verification:

- SlopBrick typecheck: pass.
- SlopBrick build: pass; existing non-fatal Zod declaration warnings remain.
- One-worker package test gate: **316 files passed / 5 skipped; 3,619 tests
  passed / 9 skipped** with a 2 GiB heap cap.
- `git diff --check`: pass.

The expected worker-fixture stderr and `shellcheck not installed` skip are
non-fatal existing test behavior. The package self-scan remains below its
configured threshold; audit-only compression/Zipf diagnostics remain
default-off.

## Boundary and next step

The census is unchanged at **329/329** reviewed sources, **452,382**
quarantined/unrepresented units, zero candidate/eligible units, and blockers
`static_authority_unavailable` and `witness_authority_unavailable`. No corpus,
labels, manifest, remote refs, package version, release, publish, or deployment
state changed. The strict proof is value/edge-level: declared static artifact
receipts are not opened, hashed, or existence-checked yet. The current read
helper rejects symlink path components, but its check-then-open race and a
cross-object atomic snapshot under concurrent writers remain hardening work.

Runtime admission-context fixtures currently do not materialize a complete
overlap-generation and indexed tool-authority tree, so always-on context
verification is intentionally deferred. The next bounded slice should create
that complete fixture and route the context adapter through this same strict
proof, then obtain independent review before enabling a mutating
rebuild/recovery adapter. Real corpus replay and any additional repository
acquisition remain downstream of those gates and a measured census deficit.
