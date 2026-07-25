# BUG-2026-07-25T211301: Package prepack changes builder status identity

## Problem

The packed-consumer integration rejects the package because repository status
identity changes while `npm pack` runs. The differing fields are
`statusSha256` and `statusEntryCount`.

Environment: macOS, Node v24.15.0, pnpm 9.15.0, branch
`codex/lock-001-new-debt` at `9a4bafe24`.

## Root Cause Analysis

### Reproduce

`corepack pnpm -r test` fails
`tests/integration/pack-consumer.test.ts` with `builder identity changed during
packing: statusSha256, statusEntryCount`.

### Isolate

The packed-consumer integration passes 9/9 when run alone and leaves the
builder worktree status unchanged. It also passes while running concurrently
with the exact eight early suites present around the original failure: that
reproduction passes 747/747 tests. The next complete recursive suite includes
the same packed-consumer integration and passes it without a status-identity
change.

### Hypothesize

1. The generated rule catalog is stale before packing and prepack rewrites it.
2. Prepack creates or removes an unignored package artifact.
3. The identity helper includes transient test output that should be excluded.

None of the three hypotheses reproduced. The generated catalog was already a
tracked modification before and after each run; prepack did not rewrite it.
No unignored package artifact appeared, and the same identity helper passed
without an exclusion change.

### Verify

The focused 9/9 pack run, 747/747 concurrent reproduction, and complete
recursive run all pass. The complete SlopBrick run records 4,616 passing tests
and 18 intentional skips. `git status --short` is identical before and after
the reproductions.

## Resolution

Classified as a non-reproduced verification incident. No product code,
packaging assertion, scheduler setting, or ignore rule changed. The builder
identity guard remains strict, so any future recurrence will still fail and
must capture the before/after porcelain entries before a repair is proposed.
