# Task 2B indexed tool-authority resolver report

Date: 2026-07-15

## Scope

This slice closes only the read-only boundary between a caller and the
immutable tool-authority index used by the fixture-scale authority publisher.
It does not publish a static generation, materialize source proposals, admit
corpus units, or implement a mutating rebuild command.

## Implementation

- `resolveAdmissionToolAuthorityReceipt` reopens the fixed authority root and
  validates the current index, immutable parent chain, all profile/intent/
  receipt references, canonical bytes, and reference hashes.
- Receipt ID, receipt-byte hash, invocation intent, profile, action, and
  output-set selectors are checked against the resolved Core objects.
- The resolver derives the current `CalibrationAdmissionToolAuthoritySnapshotV1`
  membership projection and rejects an optional caller snapshot that differs.
- `tool-authority:resolve` is a strict, read-only CLI adapter. It accepts the
  required selectors plus an optional contained canonical snapshot path and
  emits one JSON proof; publication/recovery flags and unsafe/stale/forged
  inputs fail closed with exit 2.

## Evidence

- Resolver tests: 4/4. Covered complete chain resolution, selector mismatch,
  forged snapshot rejection, and changed indexed receipt bytes.
- CLI tests: 2/2. Covered one-result read-only proof, exact snapshot-file
  acceptance, and forged snapshot rejection.
- Existing acquisition publication, authority publication/recovery, loader,
  graph-validator, and planner suites remained green in the combined focus.
- After rebuilding the package-local CLI, the full bounded SlopBrick gate
  passes **315 files / 3,602 tests** (5 skipped files / 9 skipped tests) with
  one worker and a 2 GiB heap cap.
- Recursive typecheck and build pass; the build retains only the existing
  non-fatal Zod declaration warnings. `git diff --check` passes.

## Boundary retained

Source-generation proposal/approval bytes, resource receipts, static/witness
context, the mutating `rebuild:pre-witness`/`static-authority:recover` CLI, and
the real v10.3 corpus remain plan-open. The resolver does not change the
read-only census: 329/329 sources reviewed, 452,382 units quarantined or
unrepresented, zero candidate/eligible units, and blockers
`static_authority_unavailable` and `witness_authority_unavailable`.
