# SlopBrick release-boundary split and local-roadmap sequencing design

- **Status:** approved by the repository owner on 2026-07-18
- **Date:** 2026-07-18
- **Repository:** `usebrick/platform`
- **Planning revision:** 22
- **Supersedes for current scheduling:** treating the public-release decision
  inside `SB-045` as a prerequisite for local SlopBrick product work
- **Preserves:** all frozen qualification evidence, public-release authority,
  owner-only validation boundaries, and historical planning records

## Reason for existence

The execution graph currently contradicts itself. `SB-045` says its local
qualification work is complete and that local non-publishing work may continue,
but its `waiting_external` status leaves `SB-UX-001` and `TEL-001` blocked by a
`requires` edge. This design separates completed local qualification from the
still-unresolved public release and website deployment decision.

## Goal

Make the local roadmap schedulable without inferring release authority. Close
`SB-045` as a completed qualification plan, move every public mutation into a
new `REL-001` external-wait plan, and make the first-scan UX the next local
implementation slice.

## Current truth

- The v0.45 candidate qualification packet is complete and records a local
  go/no-go decision of `GO for local v0.45 qualification; NO PUBLISH`.
- Recursive lint, typecheck, test, and build gates pass in the merged checkout.
- The approved recovery branch was merged and pushed to `main` at
  `11769b3a6d88faa94b16e8a3de96536a8bbc5ca6` after the installed pre-push gate
  passed.
- That branch push did not create a tag, GitHub Release, npm publication, or
  website deployment.
- The public package remains `slopbrick@0.43.0`; the workspace candidate remains
  unreleased `0.45.0`.
- The live website remains a separate public artifact whose deployment requires
  an exact owner-approved SHA.
- The repository owner is the only current product tester. `VAL-001` is ready,
  while participant research remains parked under `GTM-001`.

## Decision

Adopt a two-plan release boundary:

1. `SB-045` owns local candidate qualification and becomes `done`.
2. `REL-001` owns every public release and deployment disposition and starts as
   `waiting_external`.

`SB-UX-001` and `TEL-001` continue to require `SB-045`; that dependency is now
satisfied. Both become `ready`, with `SB-UX-001` first by priority. `VAL-001`
remains ready for real owner-selected walkthroughs but does not block local
design or implementation. `GTM-001` remains parked with no participant action.

`REL-001` uses priority 15 because an external wait does not participate in the
local ready-plan scheduler. Its urgency remains visible in the release-gate and
waiting-external sections of the status document.

## Authority boundaries

| Authority | Owns | Never implies |
| --- | --- | --- |
| `SB-045` | Completed local gate, remediation, baseline, self-scan, and qualification evidence | Tag, GitHub Release, npm publish, or website deploy |
| `REL-001` | Written owner dispositions for npm release and website deployment, including exact SHA/tag when authorized | Authorization from a green gate, merge, branch push, or roadmap status |
| `SB-UX-001` | First-scan information architecture and scan-to-rescan product loop | Public release or participant evidence |
| `TEL-001` | Local privacy-safe outcome-event contract | Hosted ingestion or outbound consent |
| `VAL-001` | Real owner-run usefulness decisions and scan/rescan receipts | Participant, team, conversion, or demand evidence |
| `GTM-001` | Dormant future participant protocol | Current recruitment or scheduling |

## Plan transitions

| Plan | Before | After | Scheduling effect |
| --- | --- | --- | --- |
| `SB-045` | `waiting_external` | `done` | Its completed local contract satisfies downstream `requires` edges. |
| `REL-001` | absent | `waiting_external` | Public decisions remain explicit and consume no WIP. |
| `SB-UX-001` | `draft` | `ready` | Becomes the next local implementation plan. |
| `TEL-001` | `draft` | `ready` | Becomes the second local ready plan, ordered after the UX contract. |
| `VAL-001` | `ready` | `ready` | Runs only when the owner chooses a real walkthrough. |
| `GTM-001` | `parked` | `parked` | No participant work enters the active roadmap. |

Implementation WIP remains `0/2` in this documentation checkpoint. A ready plan
does not become `in_progress` until its written implementation plan is reviewed
and execution begins.

## REL-001 decision contract

The owner must record two independent dispositions:

| Surface | Hold disposition | Authorized disposition |
| --- | --- | --- |
| npm package | Keep `slopbrick@0.45.0` unpublished. | Authorize the exact reviewed commit and tag for the GitHub Release plus OIDC publish workflow. |
| Website | Keep the current live site unchanged. | Authorize deployment of an exact reviewed commit/SHA. |

Blank or ambiguous fields remain `not authorized`; they do not count as an
explicit `hold` and cannot close `REL-001`. A branch push, green CI run, package
version, roadmap transition, or local qualification receipt never fills either
field.

If release is authorized later, the npm path must follow `AGENTS.md`: no local
`pnpm publish` or `npm publish`. If website deployment is authorized later, the
deployed artifact must be checked against the approved SHA and public claims.

## Local execution sequence

1. Commit this design and synchronized planning revision.
2. Obtain repository-owner review of the written design.
3. Write the detailed `SB-UX-001` implementation plan.
4. Start `SB-UX-001` with report-information-architecture snapshots before
   rendering changes.
5. Keep `TEL-001` ready and begin it only after the first UX contract defines
   the finding/outcome boundary it consumes.
6. Add `VAL-001` receipts only when the owner performs a real scan, usefulness
   decision, fix or decline decision, and rescan.
7. Leave `REL-001` waiting until the owner supplies the explicit public
   dispositions. Local roadmap work continues meanwhile.

## Failure and rollback behavior

- If `SB-045` evidence is found incomplete, move `SB-045` back to
  `in_progress`, move dependent plans back to `draft`, and preserve `REL-001`.
- If a public disposition is incomplete or names no exact SHA/tag, keep
  `REL-001` at `waiting_external` and perform no public mutation.
- If the public artifact later differs from an authorized disposition, record
  the mismatch in `REL-001` evidence before any corrective action.
- If the dependency split causes validator or status drift, revert the entire
  planning revision as one unit; do not partially retain inconsistent statuses.
- Historical qualification receipts and changelog entries remain unchanged.

## Documentation convergence

Update only current authority and active-plan surfaces:

- `ROADMAP.md`
- `docs/execution/index.json`
- `docs/execution/STATUS.md`
- `docs/execution/CHANGELOG.md`
- `docs/execution/plans/SB-045-trust-release.md`
- `docs/execution/plans/REL-001-public-release-boundary.md`
- `docs/execution/plans/SB-UX-001-first-scan.md`
- `docs/execution/plans/TEL-001-local-outcomes.md`
- current parallel-work wording in
  `docs/execution/plans/DOC-PRUNE-001-approved-cleanup.md`
- `docs/execution/evidence/REL-001-public-claim-disposition.md`
- the current unreleased entry in `packages/slopbrick/CHANGELOG.md`

Do not rewrite `SB-045` qualification receipts, earlier design specs, package
release notes, or historical planning revisions. Their dated statements remain
true for their snapshots.

## Verification

The documentation checkpoint must pass:

```bash
node -e "JSON.parse(require('node:fs').readFileSync('docs/execution/index.json', 'utf8'))"
corepack pnpm plans:validate
corepack pnpm exec node --test scripts/validate-execution-docs.test.mjs
git diff --check
```

Search-based closure must also confirm that current `SB-045`, `REL-001`,
`SB-UX-001`, `TEL-001`, and release-authorization references agree. Dated
evidence and append-only changelog history are excluded from rewriting but must
remain identifiable as historical.

## Non-goals

- No product-code, schema, scoring, detector, rule-state, or package-version
  change.
- No owner walkthrough invented for `VAL-001`.
- No participant recruitment, scheduling, or synthetic research record.
- No tag, GitHub Release, npm publish, website deployment, or public claim
  change.
- No implication that merging or pushing `main` authorizes a release.
- No detailed `SB-UX-001` implementation plan before written-spec review.

## Acceptance criteria

- `SB-045` is `done` everywhere current status is represented.
- `REL-001` contains the complete external-wait contract and is
  `waiting_external` everywhere current status is represented.
- `SB-UX-001` and `TEL-001` are `ready`; their `SB-045` requirement is shown as
  satisfied.
- `SB-UX-001` is the next local implementation slice.
- `VAL-001` remains owner-only and optional; `GTM-001` remains parked.
- WIP remains within the two-implementation/one-company limits.
- Public package and website actions remain unauthorized.
- The execution index, status, changelog, plans, and roadmap agree.
- Frozen evidence and historical revisions are unchanged.
- Every verification command above passes with no tracked generated-file drift.
