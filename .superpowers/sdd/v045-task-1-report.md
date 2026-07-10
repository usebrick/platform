# v0.45 closeout — Task 1 corrective report

## Status

`DONE`

This report supersedes the diagnosis in commit `ca4136060`. Independent review
found direct power-log evidence for the historical failure, so the unsupported
global SlopBrick serialization from that commit is removed in a separate
corrective commit. The independently valid website rAF helper fix and its
regression remain.

## Corrected diagnosis

### The historical three-test failure was external suspension

The failing run cited by the task brief is preserved in
`/tmp/platform-recursive-test.log`:

- SlopBrick started at `20:22:14`.
- The three failures reported durations of `118,674ms`, `118,215ms`, and
  `119,315ms` before surfacing their configured 30-second test timeout.
- The complete Vitest run lasted `161.53s`.

The host power log covers the same interval:

```text
2026-07-10 20:22:42 +0100 Sleep  Entering Sleep state due to 'Clamshell Sleep' ... 120 secs
2026-07-10 20:24:42 +0100 Wake   Wake from Deep Idle ...
```

The timeline is approximately 28 seconds awake, 120 seconds suspended, then
13 seconds awake before Vitest exited. The shared ~118-second plateau is the
suspension interval: on wake, the overdue asynchronous test timers fired and
three tests reported their 30-second timeout. This is the actual mechanism for
the historical failure. It is not evidence that a packaged CLI child or scan
worker was deadlocked.

### Nested fan-out exists, but starvation was not established

The original investigation correctly observed that SlopBrick test files can
launch real CLI processes and that each CLI can create a default half-CPU scan
pool. A four-file-worker diagnostic sample reached 107 threads, 14 descendant
processes, and about 1.29 GiB RSS on this 10-CPU / 16-GiB host.

That observation was incorrectly promoted to a causal diagnosis in
`ca4136060`. At the 107-thread sample:

- only three processes were runnable;
- aggregate CPU was `210.6%` on ten CPUs;
- RSS was about 1.29 GiB of 16 GiB; and
- the same four-worker full SlopBrick run passed all 2,419 tests in 116.62s.

The four historically implicated files also pass awake with four-way file
parallelism. Nested fan-out remains a plausible resource risk worth observing,
but no controlled awake-host failure tied it to the historical timeouts. Thread
count alone does not justify serializing all 253 SlopBrick test files.

The previously observed orphaned historical `npm install` process is likewise
not causal evidence. It existed during a passing run, was absent during other
failures, and no matching orphan remained after the current diagnostics.

### Independent website clock defect

The exact recursive gate also exposed a separate deterministic defect in the
website test helper. Production code captured the real `performance.now()`
epoch, then `flushRAF()` replaced it with a synthetic clock starting at zero.
If test startup had already consumed several seconds, mocked animation-frame
timestamps moved backward relative to the production-observed start. Focused
runs often started early enough for 60 synthetic frames to catch up, while a
recursive run produced incomplete or negative counter values.

The direct regression first failed with:

```text
expected frame time 100 to be greater than animation start 10000
```

Initializing the synthetic clock from the current `performance.now()` epoch
fixes that mechanism without changing production code or timeouts. Independent
review accepted both the helper change and its monotonic-clock regression.

## Final chosen changes

### SlopBrick Vitest configuration

Restore the bounded configuration from `b07225204`:

```ts
const maxTestWorkers = Math.max(
  1,
  Math.min(4, Math.floor(availableParallelism() / 2)),
);

// test config
maxWorkers: maxTestWorkers,
minWorkers: 1,
```

This retains cross-file concurrency coverage while reserving host capacity for
test-owned subprocesses and scan workers. The configuration regression again
asserts the computed cap and minimum worker count. The unsupported
`fileParallelism: false` switch and its literal-only regression are removed.

### Website test helper

Retain the accepted changes from `ca4136060`:

- `flushRAF()` starts from the performance epoch already visible to production
  code;
- `raf-helper.test.ts` proves a frame timestamp remains monotonic after a
  production-observed `10_000` start.

No test timeout is raised. No production source or dependency changes belong
to this task.

## Files owned by this task

- `packages/slopbrick/vitest.config.ts`
- `packages/slopbrick/tests/vitest-config.test.ts`
- `packages/website/tests/unit/_helpers.ts` (retained from `ca4136060`)
- `packages/website/tests/unit/raf-helper.test.ts` (retained from `ca4136060`)
- `.superpowers/sdd/v045-task-1-report.md`

## Verification evidence

### Focused checks after restoring four-worker scheduling

```text
corepack pnpm --filter slopbrick exec vitest run \
  tests/vitest-config.test.ts \
  tests/integration/dist-bundle-paths.test.ts \
  tests/cli/scan-onboarding.test.ts \
  tests/validate-config.test.ts \
  tests/integration/packaged-worker.test.ts

PASS: 5 files, 23 tests; duration 4.00s
```

```text
corepack pnpm --filter @usebrick/website test
PASS: 6 files, 37 tests; duration 2.03s
```

### Uninterrupted exact recursive gates

After all concurrent source/build work was committed and the process tree was
idle, two exact recursive gates ran sequentially under `caffeinate`:

```text
caffeinate -dimsu corepack pnpm -r test
run 1: exit 0; 45s wall time
SlopBrick: 248 files passed, 5 skipped; 2,429 tests passed, 9 skipped
SlopBrick duration: 40.14s
```

```text
caffeinate -dimsu corepack pnpm -r test
run 2: exit 0; 73s wall time
SlopBrick: 248 files passed, 5 skipped; 2,429 tests passed, 9 skipped
SlopBrick duration: 64.03s
```

Run 1 started at `2026-07-10T23:56:39+0100` and ended at `23:57:24`.
Run 2 started at `23:57:34` and ended at `23:58:47`. Caffeinate held the
system/display/idle-sleep assertions for each command; neither run crossed a
sleep/wake event or the historical timeout plateau.

### Recursive typecheck and build

```text
corepack pnpm -r typecheck
exit 0 for core, website, engine, and SlopBrick
```

Astro reported zero errors and four existing hints.

```text
corepack pnpm -r build
exit 0 for core, website, engine, and SlopBrick
```

The build emitted the existing Zod declaration warnings but completed. Its
generated change to `packages/website/src/data/version.json` was restored and
is excluded from the corrective commit.

After all gates, `ps` found no `npm install`, `npm pack`, Vitest,
pack-consumer, recursive-test, or caffeinate child remaining.

## Invalidated runs (not release evidence)

1. The original 20:22 run is invalid normal-condition evidence because macOS
   slept for 120 seconds across the implicated asynchronous tests.
2. The second post-`ca4136060` run is also invalid normal-condition evidence:
   macOS slept for 1,054 seconds during synchronous `npm pack`. It resumed and
   exited zero, but does not prove asynchronous tests tolerate suspension.
3. The first corrective run at 23:30 was protected by `caffeinate` but overlapped
   another agent's in-progress source edits and `dist/` rebuild. That agent
   confirmed the overlap. The run saw its eight not-yet-green scan-completion
   assertions, two incremental assertions against transient behavior, and a
   packaged-worker check while `dist/index.d.ts` was temporarily absent. It is
   invalid shared-state evidence and is excluded from the final gate count.
4. The next uninterrupted run, after `ed67401eb`, found one deterministic
   watch-mode expectation that had not yet been updated for truthful empty-scan
   output. That separate task corrected the contract in follow-up commit
   `dae6909c5`. Because the run was intentionally stopped at one failure, it is
   not counted among the two final green samples.

## Remaining concerns

- The four-worker cap bounds one concurrency layer; nested CLI/scan pools are
  still observable. Current awake evidence does not show resource exhaustion,
  so further mitigation requires a controlled reproducer rather than a thread
  count alone.
- A sleeping developer machine can invalidate wall-clock test evidence.
  Corrective verification uses `caffeinate`; CI runners should already remain
  awake by construction.
- Unrelated planning, source, test, and generated worktree changes belong to
  other tasks and remain untouched and excluded from this task's commit.
