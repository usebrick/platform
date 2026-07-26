# BUG-2026-07-26T052118: Generated checks require an untracked Core build

## Problem

The push CI workflow fails on both supported Node versions before the package
build step. SlopBrick's generated catalog check imports a runtime function from
the private Core workspace package, but a clean checkout has no Core `dist`
output yet. The same check passes in a long-lived checkout after Core has been
built, so the local pre-push result can mask the clean-runner failure.

Expected behavior: the committed generated-artifact check must be runnable
after a frozen workspace install in a clean checkout.

Security impact: NONE. No security exploit path was identified; this is a
build-order and reproducibility defect.

## Root Cause Analysis

### Reproduce

On Node 24.15.0 with pnpm 9.15.0, temporarily remove Core's ignored `dist`
directory and invoke SlopBrick's catalog freshness check. It exits with
`ERR_MODULE_NOT_FOUND` for the Core package's `dist/index.js`. GitHub CI run
30187549983 reproduces the same failure on Node 22.23.1 and Node 24.18.0.

### Isolate

Dependency installation creates the private workspace link but does not build
the linked package. The CI workflow invokes downstream generators before its
recursive build, while the local pre-push hook invokes them after a recursive
build. The two paths therefore do not share the same clean-checkout contract.

### Hypothesize

1. The generated catalog is stale. Falsification: its check passes immediately
   when the exact same Core source is built.
2. Node-version behavior differs. Falsification: both supported CI versions and
   local Node 24 fail with the same missing file.
3. The generated check lacks an explicit workspace bootstrap. Falsification:
   build Core first, then run the unchanged downstream checks from the same
   clean state.

### Verify

Hypothesis 3 is confirmed. The Core facade refactor made the downstream
generator load a runtime Core export, but the generated-check workflow retained
its earlier source-only ordering assumption. A previously built, ignored Core
artifact is the only difference between the green local path and the red clean
path.

Risk level: Low.

## TDD Fix Plan

1. **RED**: Require CI and pre-push to delegate to one root generated-artifact
   check whose command builds Core before invoking SlopBrick generators.
   **GREEN**: Add that root command and replace the duplicated workflow and hook
   command lists with it.
   **verify**: `node --test scripts/validate-generated-check-bootstrap.test.mjs`

**REFACTOR**: Keep generation ownership in SlopBrick and build ownership in
Core; only the workspace orchestration belongs at the repository root.

## Acceptance Criteria

- [ ] The regression contract passes.
- [ ] The root generated check passes with no pre-existing Core `dist`.
- [ ] Node 22 and Node 24 CI complete from a clean checkout.
- [ ] Recursive typecheck, test, build, and security gates remain green.

## Resolution

<!-- filled in after validation -->
