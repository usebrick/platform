# SB-UX-001 first-scan evidence receipt

**Status:** owner checkpoint in progress; first action identified, evidence/repair boundary `PENDING`
**Execution index:** revision 25; `SB-UX-001` remains `in_progress`
**Candidate HEAD:** `8e81ef252ce384e889891ca64c487f742e4d3cd1`
**Package:** unreleased `slopbrick@0.45.0` candidate

This receipt records Task 8 Steps 1–5 and prepares the literal first screen for
the repository-owner checkpoint. It does not record owner acceptance,
usefulness, a fix, a `VAL-001` row, revision 26, completion, release, or
deployment.

## Implementation identity

The inclusive product implementation range is
`013d484e42787f2fd21c99a128d45e174b92501e^..8e81ef252ce384e889891ca64c487f742e4d3cd1`.
The preceding execution-entry commit is
`a5241c75a0a31020cf023e1e37bc7e582b6709e4`.

Observed with:

```text
git log --reverse --format='%H %s' \
  013d484e42787f2fd21c99a128d45e174b92501e^..8e81ef252ce384e889891ca64c487f742e4d3cd1
```

```text
013d484e42787f2fd21c99a128d45e174b92501e feat(slopbrick): project first-scan actions
6b7b9d5008de94370184b647976d09a32ec18035 feat(slopbrick): explain finding deltas
84d24dcde864bd287d265b70ab6171815e0ed341 fix(slopbrick): harden debt snapshot boundaries
44df4b1cdbd7d57a2cd2ea8a54c04435e707ec68 feat(slopbrick): attach first-scan report
cec6df69702dc1752d63413981ddff0290be2da5 feat(slopbrick): render actionable first scan
5e72045976010492eb016295f7b53eebc464467b fix(slopbrick): harden first-scan reporting
664768d66980c37d337bbca82eac64d2bf9e420a feat(slopbrick): expose first-scan contract
f13bc026d55072a6d2680a95a93f4652fffe51f6 fix(slopbrick): fail closed on stale first-scan reports
249ccbf0ad3ca6659a332eab2ea2b086d645a990 fix(slopbrick): keep first scan first
c094f8b0489191129a950f704ea7fb94df755733 test(slopbrick): prove first-scan journey
8e81ef252ce384e889891ca64c487f742e4d3cd1 fix(slopbrick): harden first-scan journey
```

## Type and five-area contract

`ProjectReport.firstScan` is optional and, when present, is a
`FirstScanExperience` with kind `slopbrick-first-scan-v1`. The typed projection
contains validity-aware status, one nullable Repository Health headline, five
area summaries, finding evidence/action/change projections, at most three
recommended actions, and a config-bound finding delta. JSON and SARIF expose
that projection additively.

The exhaustive `Record<Category, FirstScanAreaId>` mapping observed in
`packages/slopbrick/src/report/first-scan.ts` is:

| Area | Categories |
| --- | --- |
| Visual Slop | `visual`, `typo`, `layout` |
| Frontend Implementation | `component`, `context`, `perf` |
| Code and Logic | `logic`, `test`, `db`, `docs`, `i18n` |
| Repository Coherence | `arch`, `ai`, `product` |
| Accessibility and Resilience | `wcag`, `security` |

## Owner red-state snapshot disposition

The owner-derived contract fixture remains encoded in
`tests/report/first-scan.test.ts`: calibrated Zipf and Heaps findings, an
explicit no-safe-bounded-repair action, unchanged/resolved comparison state,
one Repository Health headline, five areas, and a four-group input capped at
three rendered actions. The focused run passed all 19 tests in that file,
including its inline semantic-order snapshot. This fixture remains test
evidence only. It is not the Step 6 owner comprehension disposition.

## Focused and release-equivalent gates

All commands ran serially from the repository root. Every gate exited `0`.

| Gate | Observed result |
| --- | --- |
| Focused 11-file Task 8 matrix | 11/11 files passed; 247/247 tests passed; stderr empty |
| `corepack pnpm --filter slopbrick typecheck` | passed; stderr empty |
| SlopBrick package test | 356 files passed, 5 skipped; 3,915 tests passed, 15 skipped |
| Recursive lint | passed; SlopBrick `tsc --noEmit` completed; stderr empty |
| Recursive typecheck | Core, Website, Engine, and SlopBrick passed; Astro checked 47 files with 0 errors, 0 warnings, and 0 hints |
| Recursive test | Core 35 files/285 tests; Website 11/47; Engine 5/60; SlopBrick 356 passed files plus 5 skipped and 3,915 passed tests plus 15 skipped |
| Recursive build | passed; Core codegen reported fresh, Website built 4 pages, and SlopBrick generated 119 rules and completed ESM/CJS/declaration builds |

The exact focused command was:

```text
corepack pnpm --filter slopbrick exec vitest run \
  tests/report/first-scan.test.ts \
  tests/report/json.test.ts \
  tests/report/sarif.test.ts \
  tests/report/renderer-contract.test.ts \
  tests/report/renderer-lanes.test.ts \
  tests/report/whole-project-parity.test.ts \
  tests/cli/first-scan-pipeline.test.ts \
  tests/cli/output-ux.test.ts \
  tests/cli/scan-completion.test.ts \
  tests/cli/gate-decision-contract.test.ts \
  tests/cli/new-debt-gate.test.ts \
  --maxWorkers=1 --minWorkers=1
```

Its authoritative rerun summary was:

```text
Test Files  11 passed (11)
Tests       247 passed (247)
Duration    45.83s
exit        0
```

The unchanged test command was rerun because the first receipt wrapper used
zsh's read-only `status` variable after Vitest had already reported the same
11/11 and 247/247 pass result. The rerun used a non-reserved receipt variable
and captured exit `0`; no product or test file was changed between runs.

The remaining serial commands and observed exits were:

```text
corepack pnpm --filter slopbrick typecheck
exit 0

SLOPBRICK_VITEST_WORKERS=1 corepack pnpm --filter slopbrick test
exit 0

corepack pnpm -r lint
exit 0

corepack pnpm -r typecheck
exit 0

SLOPBRICK_VITEST_WORKERS=1 corepack pnpm -r test
exit 0

corepack pnpm -r build
exit 0
```

The package test and build emitted the existing non-fatal Zod declaration-
bundling warnings. The package test also emitted intentional fixture stderr
for empty projects, unreadable tokens, worker retries/timeouts, missing
temporary Git repositories, shared-exit failures, and a skipped local
`shellcheck`; the process still exited `0`. In the recursive test, pnpm
prefixed those diagnostics into combined stdout and the command-level stderr
file was empty.

## Package-local self-scan

The mandated command ran from the repository root without `--baseline` and
without a policy change:

```text
corepack pnpm --filter slopbrick exec -- node ./bin/slopbrick.js scan --workspace . --threads 1 --no-telemetry --no-color
```

Observed receipt:

| Field | Result |
| --- | --- |
| Completion / score validity | `complete` / `valid` |
| Selected / analyzed | 275 / 275 |
| Runtime failures | parse 0, timeout 0, crash 0, internal 0 |
| Active findings | 11 medium; 0 high; 0 low |
| Default-off suppressed findings | 704 from 37 rules |
| Recommendations | 2 |
| Durable debt-baseline state | missing; comparison unavailable |
| Existing score-baseline state | rejected for `config_hash` mismatch; not refreshed |
| Repository Health | 99.84 / 100 |
| Policy gate | passed — `Gate decision: pass` |
| ANSI in stdout | absent |
| stdout / stderr | 2,599 bytes / 358 bytes |
| Exit | 0 |

The package-relative durable baseline receipt was identical before and after:

```text
path=packages/slopbrick/.slopbrick/cache/debt-baseline.json
state=missing
```

Because the file was absent at both checkpoints, SHA-256, byte count, and
mtime are not applicable. The ordinary scan did not create the file, which is
the required no-auto-refresh proof for this checkout.

### Exact ANSI-free owner-facing first screen

```text
Repository Health
  99.84 / 100 — higher is better

Scan status
  complete

Policy gate
  passed — Gate decision: pass

Dimensions
  AI Slop cleanliness: 100 / 100; 40% weight
  Engineering hygiene: 99.47 / 100; 30% weight
  Security: 100 / 100; 20% weight
  Test quality: 100 / 100; 10% weight

Areas
  Visual Slop: 0 findings (high 0, medium 0, low 0)
  Frontend Implementation: 0 findings (high 0, medium 0, low 0)
  Code and Logic: 11 findings (high 0, medium 11, low 0)
  Repository Coherence: 0 findings (high 0, medium 0, low 0)
  Accessibility and Resilience: 0 findings (high 0, medium 0, low 0)

Recommended actions
  1. Code and Logic — logic/zipf-slope-anomaly [medium]
    Evidence tier: calibrated; verdict USEFUL; precision 63.69%; last calibrated 2026-07-04.
    Measured rule behavior; not proof of authorship. Not a quality verdict.
    Reach: multi-file; 6 findings across 6 files.
    Change: current.
    Why: Zipf exponent s=1.213 is steeper than corpus baseline (0.72 ± 0.20, z=2.47σ, R²=0.96). This
    identifier-frequency statistic can reflect domain vocabulary, generated output, or boilerplate;
    it is not an authorship verdict.
    Action: manual review — Review identifier vocabulary and repeated structure in context: this
    file's usage is more peaked (one dominant token) than the calibrated baseline. Rename only when
    it improves domain clarity, not to alter a detector statistic. No safe bounded repair is
    available.
  2. Code and Logic — logic/heaps-deviation [medium]
    Evidence tier: calibrated; verdict OK; precision 45.36%; last calibrated 2026-07-04. Measured
    rule behavior; not proof of authorship. Not a quality verdict.
    Reach: multi-file; 5 findings across 5 files.
    Change: current.
    Why: Heaps exponent λ=0.392 is lower than corpus baseline (0.74 ± 0.17, z=-2.07σ). Per Christ et
    al. (EMNLP Findings 2025), this vocabulary-growth statistic provides peer-reviewed source-code
    hygiene context; it is not an authorship verdict or proof of authorship.
    Action: manual review — Review identifier vocabulary and source-code structure: this file's
    vocabulary grows slower than the calibrated baseline. Check domain naming, generated output,
    schemas, fixtures, or boilerplate; this hygiene signal is not an authorship verdict or proof of
    authorship. No safe bounded repair is available.

Rescan comparison
  Finding delta unavailable: durable debt baseline is missing.

Run again after a change to compare findings. Use --full for every score and finding.
(scan took 39679ms, total 39759ms)
```

Captured stderr was:

```text
Baseline invalid: config_hash mismatch; ignoring. Review the current score before running `slopbrick scan --baseline` to create a new baseline.
[v0.45.0] auto-suppressed 704 INVERTED/NOISY issue(s) from 37 default-off rule(s). See the main output for the trust-signal summary. Re-enable per-rule via `rules: { 'rule/id': 'medium' }` in slopbrick.config.mjs.
```

## Owner comprehension checkpoint

Disposition: `PARTIAL`.

After receiving the exact ANSI-free first screen, the owner responded
literally: `start recommended`. This identifies recommended action 1 and
authorized its manual contextual review. It does not explicitly answer whether
the calibrated-evidence, non-authorship, and no-safe-repair boundary was
understandable. That second owner-comprehension question remains open. No new
`VAL-001` row, fix, or usefulness claim is inferred from this response.

### Manual review started from recommendation 1

The package-local JSON scan repeated the same boundary with this command:

```text
corepack pnpm --filter slopbrick exec -- node ./bin/slopbrick.js scan \
  --workspace . --threads 1 --no-telemetry --no-color --format json
```

It analyzed 275/275 files with zero failures, six
`logic/zipf-slope-anomaly` findings, Repository Health 99.84, a passing gate,
and exit 0. The durable debt baseline remained missing before and after. The
review inspected source context only; it made no source edit or baseline
change.

| Flagged file | Zipf exponent | Contextual disposition |
| --- | ---: | --- |
| `admission-authority-rebuild-publication.ts` | 1.213 | Focused crash-safe authority publisher; repeated `context`, `source`, and transaction vocabulary is domain-bound. No rename identified. |
| `admission-evidence-cas.ts` | 1.167 | Focused CAS write/recovery module; repeated transaction and hash vocabulary is contract-bound. No rename identified. |
| `admission-evidence-context.ts` | 1.122 | Focused evidence-bundle verifier; repeated payload, bundle, receipt, and error vocabulary follows the validated graph. No rename identified. |
| `admission-overlap-publication.ts` | 1.179 | Focused overlap publisher/verifier; repetition follows its crash-safe state machine. No rename identified. |
| `admission-publication.ts` | 1.331 | Broadest module: acquisition publication and tool-authority publication share one 3,252-line file. This is an architectural follow-up candidate, not a naming repair. |
| `admission-register-publication.ts` | 1.166 | Focused register publication/recovery state machine. No rename identified. |

The most frequent raw token in each file represented only 3.13% to 6.38% of
its extracted token stream; examples include `const`, `string`, `error`, and
`context`. The recommendation was therefore useful as a structural-review
prompt, not as evidence that one identifier should be renamed.

One concrete maintenance candidate exists in `admission-publication.ts`: the
unreferenced `createLegacyLocalToolAuthorityPublisher` implementation at lines
2972-3147 is explicitly retained as historical reference while the live
locked-generation path is exercised. Git history ties it to commit
`8de6cfb712`. Removing it, or splitting acquisition publication from tool-
authority publication, requires a separate impact-and-test slice. Neither is
a safe automatic repair, so this owner action ended without a source change.

## Unchanged boundaries

The implementation-range path check was empty for rule implementations,
Repository Health scoring, threshold logic, package version, package config,
CAL-001 evidence, calibration/corpus artifacts, Website, and GitHub workflow
paths. Full tests and the real self-scan exercised the existing detector and
gate while the Task 8 tracked diff remained documentation-only.

Observed repository boundaries:

- package version remains the unreleased `0.45.0` candidate;
- execution-index revision remains `25`;
- no tag points at candidate HEAD `8e81ef252ce384e889891ca64c487f742e4d3cd1`;
- the durable repository debt baseline remained missing before and after;
- no score, threshold, rule, CAL-001 row, corpus admission, source-acquisition,
  tag, GitHub Release, npm publication, website deployment, or push command was
  executed; and
- the owner's literal action choice was recorded, but no acceptance,
  usefulness decision, fix, or `VAL-001` row was inferred.

Until the owner explicitly confirms the evidence/repair boundary,
`SB-UX-001` remains `in_progress`; revision 26 and all status-closeout edits
remain blocked.
