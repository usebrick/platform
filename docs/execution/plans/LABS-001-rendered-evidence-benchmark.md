# LABS-001 — Benchmark rendered evidence against source-only analysis

- **Status:** `draft`
- **Priority:** 17
- **Track / lane:** implementation / labs
- **Owner:** UseBrick Labs
- **Updated:** 2026-07-19

## Outcome

Determine whether screenshots and browser/runtime evidence add material defect
detection value beyond source inspection for a fixed set of frontend tasks,
without turning the experiment into a product or customer claim.

## Current truth

Source inspection is insufficient for some visual and runtime failures, but
UseBrick has no measured proof that rendered evidence improves agent outcomes.
RenderBrick Labs is a benchmark-only capability name. No browser product,
standalone package, Chromium fork, runtime integration, or incremental-value
claim exists.

## Scope

Run the same predeclared defects through three experiment arms:

- **A — source-only agent:** repository source and the normal task context;
- **B — source plus rendered evidence:** the same source plus
  Playwright/Chrome screenshots and bounded runtime evidence; and
- **C — existing visual-testing baseline:** the repository's existing visual
  regression or screenshot workflow where one is already available.

Use fixed defects, blind scoring, the same model and time budget for A and B,
and deterministic capture inputs. Measure incremental true defect detection,
false positives, time/cost, unsupported claims, and successful verification.

## Non-goals

- Building or forking Chromium, creating a standalone browser, shipping a
  RenderBrick package, or adding browser control to the current CLI.
- Marketing rendered evidence, claiming customer value, or using one demo as a
  product decision.
- Replacing accessibility, visual-regression, unit, or end-to-end tests.
- Changing runtime code, scanner policy, package versions, or release state.

## Dependencies

- `requires`: none
- `benefitsFrom`: `SB-UX-001`, `VAL-001`

## Acceptance criteria

- The defect set, expected observations, scorer, material-value threshold, and
  stop rule are frozen before any arm runs.
- Arms A and B use the same model, prompt/task contract, time budget, and
  repository revision; only rendered/runtime evidence differs.
- Scorers are blind to experiment arm and score detection, correctness,
  false-positive burden, and verification against the fixed answer key.
- Arm C is included only where an existing visual-testing baseline is
  available; no baseline is invented to complete the table.
- Results report incremental detection and false-positive differences with raw
  receipts and limitations, not only a headline.
- If rendered evidence adds no material value, the decision is `stop` and no
  product, package, browser, or customer claim follows.

## Execution steps

1. Select and freeze representative defects plus an answer key before running
   any arm.
2. Define blind scoring, equal model/time budgets, material-value threshold,
   and stop criteria.
3. Run arm A with source-only context and retain the bounded receipt.
4. Run arm B at the same revision and budget with screenshots and runtime
   evidence added.
5. Run arm C only where an existing visual-testing baseline can evaluate the
   same fixed defects.
6. Compare incremental detection, false positives, time/cost, and verified
   outcomes; record `continue`, `redesign`, or `stop` without a customer claim.

## Verification

Recompute the score table from immutable arm receipts, confirm the scorer was
blind to arm labels, compare budgets, and verify every claimed detection
against the frozen defect answer key.

## Evidence destination

`docs/execution/evidence/LABS-001-rendered-evidence-benchmark.md`

## Rollback

Delete disposable screenshots, browser profiles, and local experiment outputs.
Preserve only reviewed bounded receipts and the stop/continue decision; no
runtime or package state should require rollback.

## Next action

Draft the fixed defect set, blind rubric, equal-budget protocol, material-value
threshold, and stop decision for review before running a browser or agent.
