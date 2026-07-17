# PLAT-001 — Centralize roadmap and execution authority

- **Status:** `done`
- **Priority:** 0
- **Track / lane:** implementation / platform
- **Owner:** usebrick platform
- **Updated:** 2026-07-17

## Outcome

One roadmap and one machine-readable index determine strategy, live status,
dependencies, WIP, and the next executable work across the repository.

## Current truth

The additive roadmap, index, status, changelog, bounded plans, and empty archive
contract are implemented and validated. Current product, package, website,
workflow, generated-document, and calibration claims have been reconciled.
Moving or deleting classified legacy bytes remains isolated in
`DOC-PRUNE-001` and subject to explicit path-level approval.

## Scope

- Establish the canonical roadmap and execution hierarchy.
- Validate index structure, dependencies, WIP, plan paths, and authority links.
- Reconcile current README, architecture, package, calibration, version,
  artifact, and privacy statements with verified product truth.
- Hand the classified superseded narratives to the separately approval-gated
  cleanup plan.
- Record the completed consolidation and plan transitions as revision 3.

## Non-goals

- Changing detector, scoring, threshold, corpus-label, or schema behavior.
  Public website copy and CLI documentation-link fixes are in scope when they
  are required to make current product claims truthful.
- Moving, deleting, publishing, deploying, pushing, or mutating remote state
  without its separate authorization.
- Rewriting frozen v10.3 contracts or immutable execution evidence.

## Dependencies

- `requires`: none
- `benefitsFrom`: none
- Archive migration gate: explicit approval of the numbered path list; this
  does not prevent additive documentation or other execution lanes.

## Acceptance criteria

- `ROADMAP.md` is the only strategic roadmap and links to execution authority.
- Every indexed plan exists, has a unique ID and priority, and uses an allowed
  status, track, and dependency.
- WIP is at most two implementation and one company plan.
- `STATUS.md` statuses match `index.json` and distinguish current facts from
  historical evidence.
- Current navigation and product docs agree on the product hierarchy, public
  versus candidate versions, artifact shapes, and privacy behavior.
- The stale-path inventory is isolated in `DOC-PRUNE-001`; unapproved paths
  remain untouched and any future archive must have a hash-verifiable receipt.
- The plan validator, JSON parsing, relevant link checks, and
  `git diff --check` pass.

## Execution steps

1. Add the central roadmap, index, status, changelog, bounded plans, and empty
   archive contract -> verify: `corepack pnpm plans:validate`.
2. Reconcile live documentation and navigation without altering frozen
   evidence -> verify: `rg -n "ROADMAP.md|docs/execution" README.md docs/ARCHITECTURE.md packages/slopbrick/README.md`.
3. Classify archive/delete candidates without changing them and isolate that
   approval gate in `DOC-PRUNE-001` -> verify: compare its numbered list with
   `git status --short`.
4. Run final documentation, website, generated-document, and workflow checks ->
   verify: the bounded commands recorded in revision 3.
5. Record revision 3 and transition the Corpus v1 build into the freed WIP
   slot -> verify: `corepack pnpm plans:validate`.

## Verification

```bash
corepack pnpm plans:validate
node -e "JSON.parse(require('node:fs').readFileSync('docs/execution/index.json','utf8'))"
git diff --check
```

## Evidence destination

`docs/execution/CHANGELOG.md` revision 3 and the reviewed documentation commit.

## Rollback

Revert the documentation tranche. No product, corpus, release, deploy, or
remote state depends on it.

## Next action

Keep future strategy and status changes inside the canonical roadmap and
execution control plane; execute approved stale-path cleanup only through
`DOC-PRUNE-001`.
