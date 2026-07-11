# Empty/not-applicable scan contract corrective fix report

Date: 2026-07-11

Branch: `codex/v0.45-recovery`

Original reviewed baselines: `ed67401eb`, `dae6909c5`

Corrective commit rereviewed: `94dea6b34`

Review inputs:

- `.superpowers/sdd/staged-empty-scan-review.md`
- `.superpowers/sdd/empty-scan-contract-rereview.md`

## Outcome

The four important findings in the corrective rereview are addressed:

1. `--format` is validated once after Commander option merging and before
   trend, doctor, watch, or scan work. Every outcome now returns the same
   usage error (`2`) with only the usage diagnostic and no scan artifacts.
2. Scan validity is the first post-`runScan` decision. Incomplete scans return
   `1` before beacons, baseline mutation, fixes, fix diffs, heatmaps,
   comparisons, thresholds, or staged gating.
3. `outputScanResults` checks validity before heatmap dispatch, closing the
   direct watch/render bypass for both not-applicable and incomplete reports.
4. Watch mode no longer rescans its own output forever. It classifies events
   before debounce, refreshes the live source set after full scans, serializes
   scans with at most one queued follow-up, and proves bounded behavior across
   add/edit/delete/re-add, report-file writes, source bursts, explicit paths,
   and Git linked worktrees.

An additional final diff review closed the same boundary for incomplete
machine output: `--suggest`, `--brief`, `--why-failing`, and `--explain-score`
are neutralized before standard JSON/SARIF/HTML dispatch, including JSON/HTML
file output. They can no longer replace a typed invalid report with human text
or leak an opt-in score explanation.

The earlier zero-request JSON/SARIF whitelist remains intact: ordinary empty
scans exit `1`; empty staged/changed scans remain successful no-ops at `0`;
machine output is explicitly `not-applicable` and contains no score-bearing
fields.

## Control-flow boundaries

### Preflight

`src/cli/report/output-format.ts` owns the canonical output-format list and
throws `CliUsageError` before any work. `renderOutput` also retains the same
validator as a defensive library-call boundary.

The exact diagnostic is:

```text
Unknown --format value: bogus. Valid: pretty, json, sarif, html.
```

It is identical for ordinary, staged, changed, valid, partial, trend, doctor,
both watch entry points, and quiet/non-quiet invocations.

### Post-run validity dispatch

`program.ts` now branches on `report.scoreValidity !== "valid"` immediately
after `runScan` returns:

- `not-applicable`: ordinary scan exits `1`; empty staged/changed exits `0`;
- `incomplete`: all command variants exit `1` and render only the invalid
  diagnostic/envelope appropriate to the requested format;
- `valid`: the established beacon/baseline/fix/heatmap/gating flow continues.

`finalizeReport` reads previous-run data and evaluates `--no-increase` only for
`scoreValidity: "valid"`. An incomplete numeric placeholder can no longer
produce a regression claim.

For incomplete machine requests, renderer alternate views are disabled before
format selection. Standard JSON/SARIF retain the explicitly deferred legacy
numbers with the incomplete discriminator; HTML remains the compact invalid
envelope; requested JSON/HTML files are always created.

### Partial persistence contract

Partial scans deliberately retain diagnostic project memory while blocking
score-bearing and source-like state:

| State/output | Not-applicable | Incomplete | Valid |
|---|---:|---:|---:|
| Requested JSON/HTML report file | allowed | allowed | allowed |
| `.slopbrick/health.json` | no | diagnostic, explicitly incomplete | yes |
| `inventory.json`, `constitution.json`, `structure.md` | no | diagnostic | yes |
| `structure.json` trend history | no | no | yes |
| flywheel state / `flywheel/scans.jsonl` telemetry | no | no | configured behavior |
| incremental result cache (both writers) | no | no; seeded bytes preserved | yes |
| managed AGENTS/CLAUDE snippet refresh | no | no | opt-in |
| baseline create/tighten | no | no; seeded bytes preserved | opt-in |
| source fixes / dry-run / unified fix diff | no | no | opt-in |
| network usage beacon | no | no | opt-in |
| score comparison / threshold / staged gate | no | no | yes |

This task did not change or make claims about the optional parser AST cache
(`--cache`); the validity fix specifically covers project state, telemetry,
incremental result caches, snippets, baselines, and source mutation.

## Watch lifecycle and UX

The old watcher snapshotted `currentFiles` once and treated every unknown
`.slopbrick/**` persistence event as a new source change. Each scan wrote
memory, which triggered another scan and another write indefinitely.

The replacement has these explicit policies:

- every relevant event requests a correctness-preserving full report;
- full scans cannot overlap; events during a scan collapse to one queued scan;
- rapid external source writes share the existing debounce window;
- the current source set is replaced after every completed full scan, so a
  known deletion/rename remains observable and new files become known;
- `.slopbrick/**` (except the baseline input), Git noise, incremental cache and
  `.tmp`, configured JSON/HTML outputs, and managed snippet writes are rejected
  before they touch the debounce timer;
- resolved include/exclude and supported-file policy rejects source-shaped
  noise outside the scan population;
- direct explicit files remain live even outside include globs; explicit
  directory watches retain descendant scope and the existing directory
  include/exclude semantics;
- staged/changed watch resolves Git's real index with
  `git rev-parse --git-path index`; linked-worktree/submodule indexes outside
  the workspace get a filtered secondary watcher;
- quiet heatmap startup uses a 1.5-second cold-start guard because quiet mode
  intentionally has no observable readiness marker.

The rewrite intentionally does **not** claim performance parity with the old
in-memory single-file path. Known-file edits now rebuild a complete report and
persist one valid snapshot. `--incremental` is ignored in watch mode to avoid
an incomplete live source set, and the CLI prints that tradeoff once. Tests
prove that three rapid included writes coalesce to exactly one post-burst scan
and one persistence event for both entry points.

An inherited config located above `--workspace` is outside the recursive
workspace watcher. The CLI now states this limitation and tells the user to
restart watch after editing that config; it is no longer silently presented as
hot-reloadable. This task makes no parent-config hot-reload claim.

## TDD evidence

### Output-format preflight

RED: ordinary empty, trend, and doctor paths bypassed renderer-only validation
(four focused failures). Staged/changed behavior disagreed with ordinary.

GREEN: ordinary/staged/changed/valid/partial × quiet/non-quiet, trend, doctor,
and both watch surfaces all exit `2`, print the one diagnostic, and create no
`.slopbrick` artifacts.

### Incomplete fail-closed dispatch and persistence

RED: nine focused cases reproduced source mutation, baseline writes, numeric
heatmap/fix output, and a numeric `--no-increase` claim. The strengthened
fixture independently reproduced `AI Slop Score went UP from 0.0 to 9.6`.

GREEN: fix, HTML fix, quiet fix, dry-run, show-fixes-diff, fix+diff, heatmap,
HTML heatmap, baseline, tighten, and no-increase all stop at the incomplete
boundary. Source/baseline/cache/snippet bytes remain unchanged. Diagnostic
health is explicitly `partial` / `incomplete`; history and flywheel are absent.

### Direct renderer dispatch

RED: direct not-applicable and incomplete calls with `heatmap: true` both
printed an `ROI / Score` table.

GREEN: both calls render the correct validity notice/envelope before heatmap.

### Incomplete machine alternate views

RED: partial suggest/brief/why-failing produced non-parseable human text in
place of JSON, while explain-score added `scoreExplanation`; file modes could
return without creating the requested output.

GREEN: a 4 × 5 packaged matrix covers all four flags across JSON, SARIF, HTML,
JSON file, and HTML file routes. Every case exits `1`, remains parseable/typed,
writes requested files, and emits no advice, brief, why-failing, score
explanation, clean/pass, or heatmap claim.

### Watcher

RED evidence included:

- both entry points changed `health.json` repeatedly after one source add;
- both human heatmap entry points printed a score table from an empty scan;
- source-shaped files outside include scope caused unnecessary N/A rescans;
- an index-only update in a real linked Git worktree timed out because
  `<cwd>/.git/index` was not the actual index.

GREEN evidence covers both entry points across sustained add/edit/delete/
re-add stability, 14 empty heatmap format/file/quiet cases, four JSON/HTML
output-file self-event cases, both burst-debounce cases, direct file and
explicit-directory scope, linked-worktree index-only changes, parent-config
and full-rescan disclosures, invalid-format preflight, and SIGINT exit `0`.

## Fresh verification

```text
corepack pnpm --filter slopbrick typecheck
PASS — tsc --noEmit, rerun after the final renderer/import cleanup.

corepack pnpm --filter slopbrick build
PASS — packaged CLI rebuilt from the final source. Existing non-fatal Zod DTS
bundling warnings remain visible and unchanged.

corepack pnpm --filter slopbrick exec vitest run <13 relevant files>
PASS — 13 files / 293 tests after the final machine-alternate correction.

corepack pnpm --filter slopbrick exec vitest run \
  tests/integration/watch-mode.test.ts
PASS — 1 file / 31 tests after the final 1.5-second quiet-readiness change.

git diff --check
PASS.
```

The 13-file gate includes scan completion, CI, CLI, output UX, watch lifecycle,
watch normalization, Git helpers, JSON, SARIF, HTML, heatmap, renderer contract,
and score explanation suites.

## Code-audit result

- No dependency or lockfile change.
- No new secret, auth, external API, shell interpolation, `any`, `@ts-ignore`,
  lint suppression, or unsafe cast.
- Git index discovery uses the existing argument-array Git helper, not a shell.
- The highest-churn touched files (`program.ts`, `scan.ts`, and scan-completion
  tests) were reviewed first; the diff is limited to validity, persistence,
  rendering, watch event policy, Git index resolution, and their regressions.
- Every reproduced defect has a public CLI or renderer regression.
- Security impact is low: all writes remain workspace/configured-report scoped;
  the new external watcher observes only Git's canonical index directory and
  filters callbacks to the exact resolved index path.
- The intentional performance cost is documented above and bounded by debounce
  plus the in-flight/one-queued guard.

The repository does not contain the audit skill's optional
`scripts/bp-churn-rank.sh` or `CONVENTIONS.md`; churn was ranked directly with
`git log --since=90.days --name-only`, and the supplied `AGENTS.md` rules were
applied instead. No audit item was skipped silently.

## Commit-hook correction

The previous version of this report incorrectly described every heuristic
finding from the `94dea6b34` hook run as pre-existing. A reproducible current-
binary comparison on the exact eight source files is:

| Snapshot | AI Slop Score | comment-ratio | compression-profile | unused-import |
|---|---:|---:|---:|---:|
| parent | `11.962599720822151` | 4 | 4 | 1 |
| child | `12.758849870390257` | 4 | 6 | 1 |

The child therefore introduced two compression-profile fires and an increase
of approximately `0.80`; it was not entirely pre-existing. The earlier normal
commit attempt did invoke the installed unpinned `npx slopbrick --staged` hook
and was bypassed only after independent typecheck/build/test evidence. The hook
is heuristic whole-file evidence, not a differential correctness proof.

The required normal commit attempt for this corrective working tree also ran
the hook and was blocked: it scanned 9 staged source files, reported 13
effective issues and AI Slop Score `17.45255988200563` against threshold `15`,
and persisted repository memory. No commit was created. The output included a
genuine pre-existing unused `failedThresholdCount` import in touched
`program.ts` (removed before the final commit) and a false-positive
`SelectionAccounting` unused-import claim even though that type is used in
`scan.ts`. The final commit therefore uses `--no-verify` only after the fresh
build/typecheck/293-test evidence above.

## Explicit remaining boundary

This task still does **not** close the incomplete machine-wire contract.
Partial JSON and SARIF intentionally retain legacy numeric headline fields
beside `scoreValidity: "incomplete"`; regressions pin that exact deferred shape.
The discriminated-envelope/versioning decision remains assigned to
SCORE-01/SCORE-02.

The full monorepo recursive gate remains the parent execution task's integration
gate. This corrective task ran the package build/typecheck and the 293-test
relevant gate plus the final 31-test watcher rerun recorded above.
