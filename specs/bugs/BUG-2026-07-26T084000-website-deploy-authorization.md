# BUG-2026-07-26T084000: Website workflow bypasses the owner/SHA boundary

## Problem

Every successful push CI run on `main` can enter the production website deploy
job even though repository policy says website deployment requires separate
owner authorization for an exact SHA. With Cloudflare credentials configured,
a source-only approval could therefore become a production-site mutation.

The first observed run did not deploy because the repository has no Cloudflare
credentials. Instead, run `30192639625` built the website and then failed when
the pinned v3 action inferred pnpm and tried to add Wrangler at the workspace
root. No credential value or site mutation was observed.

Security impact: HIGH release-boundary risk. The current missing credentials
prevented a deployment, but missing infrastructure configuration is not a valid
authorization control.

## Root Cause Analysis

### Reproduce

Complete a successful `ci` workflow for a push to `main` without separately
authorizing a website SHA. The `workflow_run` condition admits the deploy job.
GitHub Actions run `30192639625` shows checkout, build, and dist verification
all executing before the Cloudflare action fails.

### Isolate

- The job condition checks CI success, push event, branch, and current-main
  freshness, but no owner-controlled exact-SHA value.
- Manual dispatch has no required SHA input.
- Cloudflare credentials are consumed without a fail-fast presence check.
- The v3 Wrangler action infers pnpm from the monorepo lockfile; its fallback
  installation then trips pnpm's workspace-root guard.
- The operator guide still describes an obsolete push/path-filter trigger.

### Verify

The workflow contract test reproduces the missing controls and turns green only
when automatic admission requires `WEBSITE_DEPLOY_SHA` to match the completed
CI SHA, manual dispatch requires `commit_sha`, the checkout and current-main
commit are verified twice, credentials are checked before setup, and the
immutable v4 action uses pinned Wrangler through its isolated npm installer.

Risk level: High until the guarded workflow is on `main`; low afterward.

## TDD Fix Plan

1. **RED**: Require exact-SHA automatic and manual authorization, credential
   preflight, an immutable Node-24 action, and operator-document agreement.
2. **GREEN**: Add the fail-closed gate, SHA/current-main checks, pinned Wrangler
   runtime, and corrected Path B instructions.
3. **REFACTOR**: Keep source CI and website release authority separate; do not
   infer deployment permission from a branch push.

## Acceptance Criteria

- [x] The focused workflow regression passes.
- [x] The workflow parses and all execution-document validators pass.
- [x] Recursive typecheck, test, build, and security gates remain green.
- [x] Hosted Node 22/24 CI passes for the correction commit.
- [x] The downstream website workflow skips without exact-SHA authorization.
- [x] No website deployment occurs.

## Resolution

Resolved in source commit
`2664235978d7e654ce59079046b4031db5c41f6b`. Automatic admission now requires
the owner-controlled `WEBSITE_DEPLOY_SHA` repository variable to equal the
successful CI head SHA. Manual dispatch requires an exact `commit_sha`. Both
paths validate a lowercase 40-hex SHA, verify that it is current
`origin/main`, check Cloudflare configuration before setup, and recheck the
commit immediately before deployment. The immutable Wrangler action v4 commit
uses npm with pinned Wrangler `4.114.0`, avoiding monorepo package-manager
inference.

The RED workflow contract failed before the correction and passed 7/7 after
it. `actionlint`, execution-plan validation, the protected seven-stage
pre-push gate, recursive typecheck/test/build, the production security audit,
and packed-consumer checks passed. Hosted CI run
[`30193626877`](https://github.com/usebrick/platform/actions/runs/30193626877)
passed Node 22, Node 24, security, and both packed-consumer jobs; it recorded
Core 289, Website 54, Engine 150, and SlopBrick 4,648 passed tests with 18
intentional SlopBrick skips. Its downstream website run
[`30194092698`](https://github.com/usebrick/platform/actions/runs/30194092698)
was skipped because no exact SHA was authorized. No deploy job step ran and no
website deployment occurred.

The earlier failed runs `30192639625` and `30193387636` remain reproduction
evidence only: each stopped before Cloudflare authentication or deployment.
This resolution hardens the release boundary; it does not authorize a website
deployment, tag, GitHub Release, or npm publication.
