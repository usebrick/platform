# Recovery Task 3 report

## Red evidence

The pre-fix CI path loaded `.slopbrick/health.json` after the scan. A focused subprocess reproduction with `ci --max-slop 1` returned success when the current scan reported repository health below 99 (stale persisted health could therefore mask the failure).

## Green evidence

After the fix, package-local verification passed:

```text
node_modules/.bin/vitest run tests/cli/ci.test.ts tests/cli/shared-exit.test.ts tests/cli/scan-completion.test.ts
Test Files  3 passed (3)
Tests       25 passed (25)
node_modules/.bin/tsc --noEmit
exit 0
```

The CI subprocess suite covers pass, current `--max-slop 1` failure, empty changed scans, malformed config, and JSON completion output. CI now consumes the current report/config/completion outcome returned by the shared scan action, and uses `withExitCode` for Commander exit propagation. No CI decision reads `loadHealth`.

## Staging proof

The staged file list contains only `ci.ts`, `program.ts`, and the new `ci.test.ts`; unrelated worktree changes remain unstaged. Program changes were interactively staged so the shared action outcome and CI wiring are included without staging other package files.

## Concerns

The existing working tree contains unrelated changes (including pre-existing scan option edits); they remain outside this commit. The report field for constitution drift is optional at runtime and is read defensively.
