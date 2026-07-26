# REL-001 — Resolve the SlopBrick v0.45 public release boundary

- **Status:** `waiting_external`
- **Priority:** 16
- **Track / lane:** implementation / release
- **Owner:** repository owner / release maintainer
- **Updated:** 2026-07-26

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
Local positioning, documentation, and website-source changes do not alter
either public artifact and are not publication or deployment authority.

A 2026-07-22 read-only live check found the public copy aligned on the
published/candidate version boundary, 103/119 rule counts, four scores, local-
first network wording, and capability ladder. That resolves the older copy-
drift observation only. The deployed commit identity remains unverified, and
no future deployment or npm authority is inferred.

Revision 82 separately source-integrates qualified checkpoint
`3170a90d592b9a2a471744a9523ced5e02eb6107` into `main`. This is a branch/source
action, not an npm release or website deployment. The current high-severity
dependency audit is green: 377 production packages were checked with zero
advisories at the high threshold. That clears the recorded technical audit
blocker but does not supply either owner disposition or authorize a public
release or deployment action.

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
- Treating a local docs commit, website test, or website build as permission to
  push, tag, publish, deploy, or announce a release.

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
- Local documentation and website-source updates leave both public surfaces
  unauthorized until their independent owner dispositions name exact SHAs.
- The high-severity dependency audit passes before npm release execution; a
  green Task 19 behavior gate cannot substitute for this release precondition.

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
corepack pnpm security:audit
git diff --check
```

`security:audit` currently exits zero for the reviewed local checkout. Re-run
it against the exact release candidate; do not infer publication authority
from the result.

## Evidence destination

`docs/execution/evidence/REL-001-public-claim-disposition.md`

## Waiting external

- **Exact input:** one written owner disposition covering npm (`hold`, or
  `authorize` with exact commit and tag) and website (`hold`, or `authorize`
  with exact commit/SHA).
- **Owner:** repository owner / release maintainer.
- **Last verified:** 2026-07-26; qualified source checkpoint
  `3170a90d592b9a2a471744a9523ced5e02eb6107` passed the full local gate and is
  integrated under Revision 82. The 2026-07-22 live copy check remains the
  latest website evidence; deployed SHA remains unknown. No tag, GitHub
  Release, npm publish, or separately authorized website deployment is
  inferred from source integration.
- **Evidence:** `docs/execution/evidence/SB-045-release-qualification.md` proves
  local qualification; `docs/execution/evidence/REL-001-public-claim-disposition.md`
  records the still-unresolved public decisions.
- **Resume condition:** both public surfaces have explicit `hold` or
  `authorize` decisions; each authorization names its exact reviewed
  identifiers. The dependency audit is currently green but must be rerun on
  any exact npm release candidate.
- **Recheck:** compare npm registry metadata, GitHub release/workflow state,
  live-site claims, and deployment provenance with the recorded decisions.
- **Parallel safe:** `TEL-001` and owner-selected `VAL-001` work
  may continue. This wait consumes no WIP and authorizes no participant action.

## Rollback

Before execution, replace an invalid disposition with an explicit corrected
owner decision. After npm publication, preserve the immutable release record
and issue a separately authorized corrective release. Roll back a website only
to an exact reviewed deployment and record that action in the receipt.

## Next action

Preserve the source integration and await the two explicit owner dispositions.
Keep npm publication and website deployment unauthorized while roadmap work
continues, and rerun the currently green dependency audit against any exact
authorized npm candidate.
