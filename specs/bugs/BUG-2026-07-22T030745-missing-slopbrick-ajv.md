# BUG-2026-07-22T030745: Missing SlopBrick AJV test dependency

## Problem

A fresh frozen workspace install cannot run ten SlopBrick schema suites because
their direct `ajv/dist/2020.js` import is unavailable. The same suites appear to
work in the long-lived primary checkout because that checkout contains a stale
root-level AJV link that a fresh pnpm install does not create.

Reproduce on Node 24.15.0 with pnpm 9.15.0 by installing from the frozen
lockfile and running the recursive test gate. The expected behavior is that
every package can resolve every dependency it imports after a clean install.

Security impact: NONE. No security exploit path was identified; this affects
development and CI test reproducibility only.

## Root Cause Analysis

### Reproduce

After a clean offline frozen install, a direct AJV import from the SlopBrick
package fails with `ERR_MODULE_NOT_FOUND`, and the recursive suite reports the
same import error for ten schema test files.

### Isolate

The import succeeds from the Core package, which declares AJV directly, but
fails from SlopBrick, which imports AJV in tests without declaring it. The
failure is independent of Task 16 code because the feature worktree has no
source changes.

### Hypothesize

1. Missing SlopBrick dependency declaration. Falsification: compare direct
   import resolution and package dependency ownership in Core and SlopBrick.
2. Corrupt pnpm store. Falsification: confirm AJV 8.20.0 exists and imports
   successfully through Core in the same installation.
3. Node 24 incompatibility. Falsification: the same installed AJV bytes import
   successfully through Core on Node 24.15.0.

### Verify

Hypothesis 1 is confirmed. AJV 8.20.0 is present and usable, but pnpm links it
only for the package that declares it. SlopBrick's undeclared direct import was
masked by stale root-level installation state in the primary checkout.

Risk level: Low.

## TDD Fix Plan

1. **RED**: Run the existing SlopBrick schema suite after a fresh frozen install
   and observe that its public test command cannot resolve AJV.
   **GREEN**: Declare AJV as a SlopBrick development dependency and refresh the
   frozen lockfile importer.
   **verify**: `corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-contracts-v2.test.ts --maxWorkers=1 --minWorkers=1`

**REFACTOR**: None. Dependency ownership is the complete fix.

## Acceptance Criteria

- [x] A fresh frozen install links AJV for SlopBrick.
- [x] The previously failing schema suites pass.
- [x] The recursive test gate passes.
- [x] No runtime dependency or published API changes.

## Resolution

Declared `ajv@^8.20.0` as a SlopBrick development dependency and refreshed the
workspace lockfile importer. A direct package-local import now resolves, the ten
previously failing schema files pass 123/123 tests, and the canonical recursive
gate passes (Core 285, Engine 60, Website 54, SlopBrick 4,489 with 15 intentional
skips). One first-pass crash-recovery test timed out under suite contention; it
passed 24/24 in isolation and the unchanged canonical retry passed in full.
