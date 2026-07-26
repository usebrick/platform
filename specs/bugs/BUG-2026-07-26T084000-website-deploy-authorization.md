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
- [ ] The workflow parses and all execution-document validators pass.
- [ ] Recursive typecheck, test, build, and security gates remain green.
- [ ] Hosted Node 22/24 CI passes for the correction commit.
- [ ] The downstream website workflow skips without exact-SHA authorization.
- [ ] No website deployment occurs.

## Resolution

Implementation is locally in progress. Final resolution requires the hosted CI
and downstream skip receipts above; source qualification alone is not a site
release claim.
