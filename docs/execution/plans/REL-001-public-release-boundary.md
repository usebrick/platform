# REL-001 — Resolve the SlopBrick v0.45 public release boundary

- **Status:** `waiting_external`
- **Priority:** 15
- **Track / lane:** implementation / release
- **Owner:** repository owner / release maintainer
- **Updated:** 2026-07-18

## Outcome

Record explicit, independent owner dispositions for the SlopBrick npm release
and website deployment without inferring authority from local qualification,
merging, pushing, CI, or roadmap progress.

## Current truth

`SB-045` completed the local v0.45 qualification contract. The approved
recovery line was merged and pushed to `main` at
`11769b3a6d88faa94b16e8a3de96536a8bbc5ca6`, but no tag, GitHub Release, npm
publish, or website deployment followed. The verified public package remains
`slopbrick@0.43.0`, and the live site remains a separately controlled artifact.

## Scope

- One written npm disposition: hold the unpublished candidate or authorize an
  exact reviewed commit and tag for the GitHub Release plus OIDC workflow.
- One written website disposition: keep the live artifact unchanged or
  authorize deployment of an exact reviewed commit/SHA.
- Read-only verification of the selected disposition after any separately
  authorized public action.
- A durable receipt that distinguishes package, website, and branch state.

## Non-goals

- Inferring release authority from a green gate, package version, branch merge,
  branch push, roadmap transition, or local qualification receipt.
- Local `pnpm publish` or `npm publish`.
- Combining package publication and website deployment into one implicit
  permission.
- Changing product code, detector state, calibration, or public claims before
  an exact owner decision.

## Dependencies

- `requires`: `SB-045`
- `externalGates`: `owner-public-release-disposition`
- `benefitsFrom`: none

## Acceptance criteria

- The owner records npm and website dispositions independently.
- Every authorized action names the exact reviewed commit/SHA and, for npm,
  the exact tag.
- Blank, ambiguous, or partial input remains `not authorized`.
- The npm path uses GitHub Release plus OIDC; no local publish occurs.
- The website path deploys only the named reviewed SHA.
- Read-only post-action checks agree with the written disposition.
- Local roadmap work remains schedulable while this plan waits.

## Execution steps

1. Record `hold` or `authorize` for the npm package in the disposition receipt.
2. Record `hold` or `authorize` for the website in the same receipt.
3. For each authorized surface, bind the exact reviewed SHA and required tag.
4. Execute only the separately authorized release or deployment workflow.
5. Verify public package metadata, live-site claims, and deployed provenance
   against the receipt.
6. Mark the plan done only when both dispositions and their required checks are
   recorded; a two-surface hold may close the plan without public mutation.

## Verification

Before any public action, validate that the receipt contains explicit decisions
and exact identifiers. After an authorized action, use read-only registry,
GitHub workflow, and live-site checks. Always run:

```bash
corepack pnpm plans:validate
git diff --check
```

## Evidence destination

`docs/execution/evidence/REL-001-public-claim-disposition.md`

## Waiting external

- **Exact input:** one written owner disposition covering npm (`hold`, or
  `authorize` with exact commit and tag) and website (`hold`, or `authorize`
  with exact commit/SHA).
- **Owner:** repository owner / release maintainer.
- **Last verified:** 2026-07-18; `main` and `origin/main` converged at
  `11769b3a6d88faa94b16e8a3de96536a8bbc5ca6` after the pre-push gate, while no
  tag, GitHub Release, npm publish, or website deployment occurred.
- **Evidence:** `docs/execution/evidence/SB-045-release-qualification.md` proves
  local qualification; `docs/execution/evidence/REL-001-public-claim-disposition.md`
  records the still-unresolved public decisions.
- **Resume condition:** both public surfaces have explicit `hold` or
  `authorize` decisions; each authorization names its exact reviewed
  identifiers.
- **Recheck:** compare npm registry metadata, GitHub release/workflow state,
  live-site claims, and deployment provenance with the recorded decisions.
- **Parallel safe:** `SB-UX-001`, `TEL-001`, and owner-selected `VAL-001` work
  may continue. This wait consumes no WIP and authorizes no participant action.

## Rollback

Before execution, replace an invalid disposition with an explicit corrected
owner decision. After npm publication, preserve the immutable release record
and issue a separately authorized corrective release. Roll back a website only
to an exact reviewed deployment and record that action in the receipt.

## Next action

Await the two explicit owner dispositions. Until then, keep npm publication and
website deployment unauthorized while local roadmap work continues.
