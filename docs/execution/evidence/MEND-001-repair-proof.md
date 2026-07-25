# MEND-001 repair proof — exact import rewrite

- **Date started:** 2026-07-26
- **Branch:** `codex/lock-001-new-debt`
- **Workspace candidate:** unreleased `slopbrick@0.45.0`
- **Disposition:** owner-approved local implementation in progress

## Owner decision

The owner selected option 1 after reviewing the completed `LOCK-001` receipt:
accept the bounded local import-policy gate as useful and evaluate one exact,
repository-owned import rewrite. This authorizes local implementation and
verification only.

## Frozen repair boundary

- Authority comes from an exact `mend.importRewrites` source-to-target entry in
  repository config.
- The source must be the exact module specifier in an exact
  `context/import-path-mismatch` finding.
- The target must already satisfy repository `allowedImports` policy.
- The edit may replace only that parser-evidenced module-specifier span.
- Preview and apply must share one planner; dry-run never writes.
- A rescan must remove the intended finding, a second run must be a no-op, and
  rollback must restore the original bytes exactly.

No prefix inference, package discovery, dependency installation, import-binding
change, file move, arbitrary refactor, team claim, release, or public action is
authorized.

## Implementation evidence

Pending red/green commits and focused verification.

## Owner-controlled scenario

Pending fixture and local CLI proof.

## Remaining boundary

Push, merge, tag, npm publication, website deployment, broader Mend repairs,
team usefulness, demand, and pricing remain unapproved and unproven.
