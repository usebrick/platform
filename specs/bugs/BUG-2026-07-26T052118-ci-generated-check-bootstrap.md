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

2. **RED**: Require all four generated surfaces, the release workflow, and
   pre-push-before-mutation ordering after blind review exposes the remaining
   false-green paths.
   **GREEN**: Delegate release checks to the shared command and move pre-push
   freshness verification ahead of recursive test/build generation.
   **verify**: `node --test scripts/validate-generated-check-bootstrap.test.mjs`

**REFACTOR**: Keep generation ownership in SlopBrick and build ownership in
Core; only the workspace orchestration belongs at the repository root.

## Acceptance Criteria

- [x] The regression contract passes.
- [x] The root generated check passes with no pre-existing Core `dist`.
- [x] Node 22 and Node 24 CI complete from a clean checkout.
- [x] Recursive typecheck, test, build, and security gates remain green.

## Resolution

The clean-checkout bootstrap and every later hosted-runner failure are closed.
The root `generated:check` command now owns one fail-fast contract: validate its
own orchestration, build private Core and Engine, then check the rule registry,
rule catalog, language-support matrix, and MCP documentation before any normal
package build can regenerate committed bytes. Push CI, release CI, and the
main-branch pre-push hook all delegate to that command.

The first clean hosted reruns exposed four independent portability assumptions,
which were corrected without weakening the product gate:

- CI, publish, and pre-push use a one-worker SlopBrick Vitest budget; hosted
  CI and publish also serialize workspace package tests.
- the worker pool prefers existing bundled workers from both source and bundle
  entry points and removes inherited `tsx` loader flags only when starting a
  built JavaScript worker;
- package-wrapper JSON parsing tolerates a trailing GitHub `::endgroup::`
  marker, and the large-JSON fixture remains above 128 KiB on Linux as well as
  macOS; and
- watch health publication has bounded hosted-runner headroom and failure
  diagnostics, while policy-sensitive fixtures opt into or assert the exact
  current-policy rule they are intended to test.

The incident chain is checkpointed by `faa788137`, `5b3857561`, `88d8700a7`,
`c8fbf7059`, `496374655`, `2358c19b0`, `3d17a5fcc`, and final correction
`ffb196d00fbb6d467a078374eb7583a6a3f3186`.

Final verification:

- the local recursive typecheck, test, and build gate passed;
- the protected pre-push hook passed all seven release-equivalent stages;
- GitHub Actions run
  [`30192189009`](https://github.com/usebrick/platform/actions/runs/30192189009)
  passed build/test/schema jobs on Node 24 and Node 22, the production
  dependency security audit, and packed-consumer jobs on both Node versions;
- hosted test totals were Core 289, Website 54, Engine 150, and SlopBrick 4,647
  passed with 18 intentional SlopBrick skips; and
- the high-threshold audit checked 377 production packages with zero
  advisories.

GitHub emitted a non-blocking warning that the currently pinned checkout,
setup-node, and pnpm setup actions declare a deprecated Node 20 action runtime
and are being forced onto Node 24. That maintenance warning did not affect the
green run and requires a separately reviewed action-SHA update; it is not part
of this bug's release authority.
