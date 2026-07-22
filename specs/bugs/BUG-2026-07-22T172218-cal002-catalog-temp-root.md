# BUG-2026-07-22T172218: CAL-002 catalog fallback uses a noncanonical temp path

## Problem

When the historical CAL-001 matrix is absent from `/private/tmp`, the CAL-002
catalog CLI regression test creates a replacement fixture under the operating
system temp directory. On macOS that directory is exposed through `/var`, so
the production external-artifact guard rejects the fixture's symlinked
ancestor and the full SlopBrick suite fails.

Expected behavior: the fallback fixture should exercise the same canonical,
regular-file boundary as the historical `/private/tmp` artifact and allow the
catalog command to complete.

Reproduction:

```text
SLOPBRICK_VITEST_WORKERS=1 corepack pnpm --filter slopbrick exec vitest run \
  tests/calibration/cal-002-cli.test.ts \
  -t "builds the locked catalog from a real /private/tmp CAL-001 matrix" \
  --maxWorkers=1 --minWorkers=1
```

Environment: macOS, Node v24.15.0, pnpm 9.15.0, with the recorded CAL-001
matrix absent.

Security impact: **NONE**. The production path guard is correctly rejecting a
symlink ancestor; only the fallback test fixture is malformed. No security
exploit path was identified.

## Root Cause Analysis

### Reproduce

The recursive baseline suite reproduced one failure among 4,595 tests. The
failure occurs only in the catalog CLI fallback exercised when the historical
matrix is unavailable.

### Isolate

The failing path is limited to the catalog test's temporary-fixture helper and
the external canonical-artifact boundary. Other CAL-002 catalog and validation
tests pass, which isolates the failure from matrix content and catalog
projection logic.

### Hypothesize

1. **Canonical-path mismatch:** macOS exposes the temp directory through the
   `/var` symlink, while the external-artifact guard rejects every symlink
   ancestor.
2. **Matrix-content drift:** the generated fallback no longer matches the
   locked 119-rule catalog.
3. **Missing historical artifact only:** the fallback is not intended to run
   without the recorded file.

Hypothesis 2 is falsified by the passing pure catalog contract tests.
Hypothesis 3 is falsified by the test's explicit fallback branch.

### Verify

Runtime inspection reports the operating-system temp directory under `/var`,
its canonical location under `/private/var`, and `/var` as a symbolic link.
That exactly matches the production rejection condition. The verified root
cause is a missing real-path normalization in the fallback fixture helper.

Risk level: **Low**. The repair changes only test-fixture path construction and
does not weaken the production symlink policy.

## TDD Fix Plan

1. **RED**: Retain the existing catalog CLI regression test with the recorded
   matrix absent; it must fail when the fallback path contains a symlink
   ancestor.
   **GREEN**: Canonicalize the newly created temporary directory before handing
   its absolute path to the external-artifact boundary.
   **verify**: `corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-cli.test.ts -t "builds the locked catalog from a real /private/tmp CAL-001 matrix" --maxWorkers=1 --minWorkers=1`

**REFACTOR**: None. Keep production path validation unchanged.

## Acceptance Criteria

- [ ] The fallback catalog regression passes without the historical matrix.
- [ ] The production external-artifact guard still rejects symlink ancestors.
- [ ] The SlopBrick baseline suite has no unexplained failure.

## Resolution

<!-- filled in after validation -->
