# v0.45 closeout — Task 1 report

## Status

`DONE_WITH_CONCERNS`

The exact recursive test gate is green in two consecutive runs. The robust
change serializes SlopBrick test files so Vitest file workers cannot multiply
the CLI subprocess and scan-worker pools owned by those files. A second exact
gate failure discovered during diagnosis was fixed in the website's mocked
`requestAnimationFrame` helper: it now preserves the `performance.now()` epoch
already observed by production code.

No production code, timeout, release artifact, or unrelated dirty file was
changed for this task.

## Systematic debugging

### Phase 1 — reproduce and gather evidence

Starting point: `b072252043fd5a368f9cf73097c2470ef5bef017` on a host with
10 CPUs and 16 GiB RAM.

1. A pre-edit exact `corepack pnpm -r test` run failed before SlopBrick began.
   Core and website ran concurrently; website's counter suite finished one
   animation frame short (values `49`, `996,225 ms`, and `24`) in one run and
   produced negative values in a second diagnostic run. The focused website
   suite passed.
2. That workspace phase reached 25 descendant processes and about 1.75 GiB
   RSS. The uncapped core and website Vitest pools accounted for this initial
   burst.
3. `corepack pnpm -r --no-bail test` allowed all packages to run under the
   same recursive scheduling despite the website failure. SlopBrick passed
   248 files / 2,419 tests in 116.62s, confirming the original packaged-CLI
   failure is intermittent rather than a deterministic product failure.
4. During that four-file-worker SlopBrick run, live process snapshots showed
   the Vitest parent, four file workers, and overlapping real CLI/tsx/npm
   children. Samples peaked at 14 descendant processes, 107 threads, and
   about 1.29 GiB RSS.
5. SlopBrick's `WorkerPool` defaults to `floor(cpus / 2)`, which is five scan
   worker threads on this host. Therefore `maxWorkers: 4` capped only one
   layer: up to four test files could each launch a CLI that owned a separate
   five-thread scan pool, in addition to Vitest/Node runtime threads and npm
   children. The live 107-thread sample demonstrated this multiplicative
   fan-out.
6. No historical orphan was present before the diagnostic runs, and no
   `npm install`, `npm pack`, Vitest, or pack-consumer process remained after
   them. The previously observed three-hour orphan cannot be the sole cause:
   it was reported during both failing and passing runs, and the current
   failures reproduced without it.

The three historical packaged-CLI failures did not reproduce in the captured
diagnostic runs, so this report does not attribute them to one specific hung
child. The demonstrated mechanism is resource starvation from nested fan-out;
the exact gate also exposed an independent clock-mocking defect whose outcome
changed with recursive startup delay.

### Phase 2 — compare working and failing patterns

- The four packaged/pool tests passed together quickly, while failures only
  appeared in the full concurrent suite.
- A prior serial SlopBrick full-suite run recorded in commit `ef2aa4ebb` had
  passed.
- The current four-worker diagnostic SlopBrick run also passed, but with the
  measured 107-thread peak. This explains why a fixed cap of four reduced the
  probability of failure without removing the mechanism.
- `flushRAF()` started its synthetic clock at zero even though
  `counter.ts` captured `performance.now()` before `flushRAF()` installed its
  spy. When recursive startup took several seconds, synthetic frame timestamps
  moved backwards relative to the production start time. Focused execution
  started soon enough that the helper's 60 synthetic frames usually caught up.

### Phase 3 — hypotheses and minimal tests

Hypothesis A: serializing SlopBrick test files removes the multiplicative
Vitest-file × CLI × scan-pool layer while preserving real worker behavior
inside each test.

Regression first:

```text
corepack pnpm --filter slopbrick exec vitest run tests/vitest-config.test.ts
FAIL: expected test.fileParallelism=false; received undefined
```

Hypothesis B: starting the synthetic rAF clock from the already-visible
performance epoch prevents recursive-startup delay from sending time backward.

Regression first:

```text
corepack pnpm --filter @usebrick/website exec vitest run tests/unit/raf-helper.test.ts
FAIL: expected frame time 100 to be greater than animation start 10000
```

### Phase 4 — smallest robust changes

- Replaced SlopBrick's dynamic four-worker cap with
  `test.fileParallelism: false`. This is a mechanism fix, not a larger timeout:
  real CLI and scan-worker tests still run, but only one test file can own a
  nested process/worker tree at a time.
- Changed `flushRAF()` to initialize its synthetic clock from the current
  `performance.now()` value rather than zero.
- Added a direct monotonic-clock regression and updated the Vitest resource
  regression to assert serial file scheduling.

Post-change SlopBrick samples during exact run 1 stayed around 4–7 descendant
processes and 39–61 threads in the serial phase, versus the captured 107-thread
four-worker peak. The workspace's initial core/website burst still reached 23
processes / 211 threads, but the corrected rAF helper remained deterministic
under it.

## Files owned by this task

- `packages/slopbrick/vitest.config.ts`
- `packages/slopbrick/tests/vitest-config.test.ts`
- `packages/website/tests/unit/_helpers.ts`
- `packages/website/tests/unit/raf-helper.test.ts`
- `.superpowers/sdd/v045-task-1-report.md`

## Verification

### Focused red/green checks

```text
corepack pnpm --filter slopbrick exec vitest run tests/vitest-config.test.ts
PASS: 1 file, 1 test

corepack pnpm --filter @usebrick/website test
PASS: 6 files, 37 tests
```

### Required exact recursive tests

Run 1:

```text
corepack pnpm -r test
exit 0, elapsed 268s
SlopBrick: 248 files passed, 5 skipped; 2,419 tests passed, 9 skipped
SlopBrick duration: 241.78s
```

Run 2 (immediately consecutive):

```text
corepack pnpm -r test
exit 0
SlopBrick: 248 files passed, 5 skipped; 2,419 tests passed, 9 skipped
```

Run 2 crossed an external system suspension. `pmset -g log` records:

```text
2026-07-10 22:53:50 +0100 Sleep  Entering Sleep state due to 'Clamshell Sleep' ... 1054 secs
2026-07-10 23:11:24 +0100 Wake   Wake from Deep Idle ...
```

That matches the apparent `npm pack` test duration of 1,058,165ms. The test
resumed after wake, the pack-consumer file passed, the exact recursive command
exited 0, and no child was orphaned. This is evidence that the 17.5-minute
pause was macOS suspension, not a code-level stall.

### Recursive compile/build gates

```text
corepack pnpm -r typecheck
exit 0 for core, website, engine, and SlopBrick

corepack pnpm -r build
exit 0 for core, website, engine, and SlopBrick
```

Astro reported four existing hints and tsup emitted existing Zod declaration
warnings; neither command reported an error. The build-generated change to
`packages/website/src/data/version.json` was restored and was not included in
the task commit.

## Concerns and trade-offs

1. Reliability intentionally costs wall time: SlopBrick's uninterrupted exact
   run increased from the observed four-worker 116.62s to 241.78s when test
   files were serialized. This keeps the gate below five minutes locally and
   removes the multiplicative nested-worker layer.
2. A sleeping laptop can still make any wall-clock test command appear stalled.
   The second run proves this specific suspension resumes cleanly, but CI or
   local release verification should run on an awake host.
3. Unrelated pre-existing and concurrent worktree changes were preserved and
   excluded from the commit.
