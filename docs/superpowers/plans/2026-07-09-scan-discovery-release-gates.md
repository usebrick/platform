# Scan Discovery and Release Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SlopBrick scan the intended package/monorepo source set, reject false-clean empty scans, enforce CI thresholds, complete the Dart rule contracts, and leave the governing plans synchronized with verified evidence.

**Architecture:** A focused CLI discovery helper determines the stable glob base and requested subtree before `runScan` invokes the existing engine discovery function. Scan completion becomes an explicit typed outcome consumed by both `scan` and `ci`; only the outer CLI boundary owns final exit selection. Existing registry guardrails remain the authority for rule metadata.

**Tech Stack:** TypeScript, Commander, globby/minimatch, Node worker threads, Vitest, tsup.

## Global Constraints

- Do not change score formulas, calibration thresholds, canonical core schemas, or rule detection logic.
- Config-file globs are relative to the directory containing the config; invocation `--include` globs are relative to the requested workspace.
- A descendant `--workspace` may never escape that requested subtree.
- Monorepo expansion is limited to declared workspace package roots.
- Empty or partial scans may not emit a clean success outcome.
- Uncalibrated Dart rules remain `defaultOff: true` until corpus evidence meets the repository calibration gate.
- Existing dirty v0.45/calibration changes must remain unstaged unless a task explicitly names and selectively stages its own hunk.
- Every implementation task uses red-green-refactor, a task-only commit, and an independent review before the next task.

---

### Task 0: Restore explicit source/ESM/CommonJS artifact parity — complete (`e8b7a2d4f`, APPROVE)

**Files:**
- Modify: `packages/slopbrick/package.json` (selective staging; version/description are already dirty)
- Modify: `packages/slopbrick/tsup.config.ts`
- Modify: `packages/slopbrick/src/engine/pool.ts`
- Modify: `packages/slopbrick/src/cli/scan.ts` (selective staging)
- Modify: `packages/slopbrick/src/index.ts`
- Modify: `packages/slopbrick/tests/integration/packaged-worker.test.ts`
- Test: `packages/slopbrick/tests/helpers/cli.ts`
- Test: `packages/slopbrick/tests/integration/dist-bundle-paths.test.ts`

**Interfaces:**
- ESM: `dist/index.js`, `dist/engine/worker.js` under `"type": "module"`.
- CommonJS: `dist/index.cjs`, `dist/engine/worker.cjs`.
- Package exports: `import -> ./dist/index.js`, `require -> ./dist/index.cjs`.

- [x] **Step 1: Write/adjust the package contract test before production changes**

Assert `type === 'module'`, the exact ESM/CJS paths above, successful dynamic import and `createRequire`, the presence of both worker formats, and source/built CLI `--help` parity. The source entry must remain importable as a library while invoking `runCli` when executed directly. Add a >3-file source scan so worker resolution is tested outside the bundle.

- [x] **Step 2: Verify red**

```bash
node_modules/.bin/vitest run tests/integration/packaged-worker.test.ts tests/integration/dist-bundle-paths.test.ts
node_modules/.bin/tsx src/index.ts --help
```

Expected: source help fails through `unicorn-magic`, and current metadata/build extensions contradict the target contract.

- [x] **Step 3: Make build extensions explicit**

Restore `"type": "module"`; set `main`/`exports.require` to `./dist/index.cjs` and `module`/`exports.import` to `./dist/index.js`. Configure tsup `outExtension` so CJS emits `.cjs` and ESM emits `.js`. Preserve declaration output and the existing CJS `import.meta.url` banner.

- [x] **Step 4: Make worker construction lazy and source-compatible**

Do not construct `WorkerPool` before the `files.length > INLINE_THRESHOLD` branch. Resolve an executable worker for both bundled output and the source `tsx` process; reject with the existing actionable candidate list when none is available. Make `src/index.ts` invoke `runCli` only when it is the direct entry, without changing its import/export API. Do not weaken the startup/lifecycle guards.

- [x] **Step 5: Verify all three surfaces and commit**

```bash
node_modules/.bin/tsc --noEmit
node_modules/.bin/tsup
node_modules/.bin/tsx src/index.ts --help
node_modules/.bin/vitest run tests/engine/pool.test.ts tests/integration/packaged-worker.test.ts tests/integration/dist-bundle-paths.test.ts tests/cli/diff-flag.test.ts tests/cli/test.test.ts
git add packages/slopbrick/tsup.config.ts packages/slopbrick/src/engine/pool.ts packages/slopbrick/src/index.ts packages/slopbrick/tests/integration/packaged-worker.test.ts packages/slopbrick/tests/helpers/cli.ts packages/slopbrick/tests/integration/dist-bundle-paths.test.ts
git add -p packages/slopbrick/package.json packages/slopbrick/src/cli/scan.ts
git commit -m "fix(slopbrick): restore explicit module artifacts"
```

---

### Task 1: Stable config-relative and monorepo-aware discovery — complete (`83e1d2894`, APPROVE)

**Files:**
- Create: `packages/slopbrick/src/cli/discovery.ts`
- Modify: `packages/slopbrick/src/cli/scan.ts` (selective staging; file is already dirty)
- Create: `packages/slopbrick/tests/cli/scan-discovery.test.ts`

**Interfaces:**
- Consumes: `discoverFiles(cwd, config)`, `resolveConfigPath(cwd)`, `findWorkspacePackages(cwd)`.
- Produces: `discoverScanFiles(options): Promise<string[]>`, where options include `workspace`, `config`, `configPath`, and whether CLI include globs replaced config includes.

- [x] **Step 1: Write failing tests for the two reproduced defects**

Create temporary fixtures proving:

```ts
it('resolves an ancestor config from its own directory and restricts to the requested subtree')
it('discovers TypeScript source in every declared pnpm workspace package')
it('does not include undeclared sibling directories')
it('resolves CLI include overrides from the requested workspace')
```

The first fixture places `slopbrick.config.mjs` at a package root with `include: ['src/**/*.ts']`, requests the package's `src/` directory, and expects its TypeScript files. The monorepo fixture declares `packages/*`, creates two package `src/` trees plus one undeclared `vendor/` tree, and expects only the two declared package files.

- [x] **Step 2: Verify red**

Run from `packages/slopbrick`:

```bash
node_modules/.bin/vitest run tests/cli/scan-discovery.test.ts
```

Expected: ancestor-config fixture returns zero and monorepo root omits nested TypeScript before implementation.

- [x] **Step 3: Implement the discovery helper**

The helper must:

```ts
export interface ScanDiscoveryOptions {
  workspace: string;
  config: ResolvedConfig;
  configPath?: string;
  cliIncludeOverride: boolean;
}

export async function discoverScanFiles(options: ScanDiscoveryOptions): Promise<string[]>;
```

When `cliIncludeOverride` is true, call `discoverFiles(workspace, config)`. When a config path exists, call `discoverFiles(dirname(configPath), config)` and retain only paths inside `workspace` using `relative()` containment, never string-prefix matching. Otherwise, if `workspace` is its own detected monorepo root, prefix each default include with each declared package root relative to the monorepo and discover once with the shared config. De-duplicate and sort.

- [x] **Step 4: Wire `runScan` to the helper**

Capture the config path once, pass `options.include?.length > 0` as the override flag, and replace only the non-explicit-path `discoverFiles(cwd, config)` call. Preserve explicit path behavior.

- [x] **Step 5: Verify green and commit**

```bash
node_modules/.bin/vitest run tests/cli/scan-discovery.test.ts tests/discover.test.ts
node_modules/.bin/tsc --noEmit
git add packages/slopbrick/src/cli/discovery.ts packages/slopbrick/tests/cli/scan-discovery.test.ts
git add -p packages/slopbrick/src/cli/scan.ts
git commit -m "fix(slopbrick): discover configured workspace sources"
```

---

### Task 2: Make empty and partial scan outcomes explicit — complete (`e388b4a0a`, APPROVE)

**Files:**
- Modify: `packages/slopbrick/src/cli/types.ts` (selective staging; already dirty)
- Modify: `packages/slopbrick/src/cli/scan.ts` (selective staging; already dirty)
- Modify: `packages/slopbrick/src/cli/program.ts` (selective staging; already dirty)
- Modify: `packages/slopbrick/tests/cli/scan-onboarding.test.ts`
- Create: `packages/slopbrick/tests/cli/scan-completion.test.ts`

**Interfaces:**
- Produces: `ScanCompletionStatus = 'complete' | 'empty' | 'partial'` and counts for requested, analyzed, and failed files in `ScanStats`.

- [x] **Step 1: Write failing subprocess and `runScan` tests**

Cover a normal complete scan, an empty ordinary workspace, JSON empty scan, and a worker result with `parseError`. Assert empty/partial scans never print a clean verdict or exit zero; JSON stdout remains parseable when emitted and carries status/counts.

- [x] **Step 2: Verify red**

```bash
node_modules/.bin/vitest run tests/cli/scan-onboarding.test.ts tests/cli/scan-completion.test.ts
```

- [x] **Step 3: Add typed completion statistics**

Compute requested count immediately after file selection, failed count from results containing `parseError`, analyzed count from successful results, and status from those counts. Preserve incremental skipped counts separately; do not call an unchanged cached file analyzed.

- [x] **Step 4: Prevent false-clean rendering**

Route `empty` and `partial` through a documented non-zero outcome before the clean headline. Human output names requested/analyzed/failed counts and a corrective hint. Machine output includes the same fields without corrupting JSON stdout.

- [x] **Step 5: Verify and commit only task hunks**

```bash
node_modules/.bin/vitest run tests/cli/scan-onboarding.test.ts tests/cli/scan-completion.test.ts tests/integration/packaged-worker.test.ts
node_modules/.bin/tsc --noEmit
git add packages/slopbrick/tests/cli/scan-onboarding.test.ts packages/slopbrick/tests/cli/scan-completion.test.ts
git add -p packages/slopbrick/src/cli/types.ts packages/slopbrick/src/cli/scan.ts packages/slopbrick/src/cli/program.ts
git commit -m "fix(slopbrick): report incomplete scans honestly"
```

---

### Task 3: Make the CI command consume the current scan outcome — complete (`0da9150f5`, APPROVE)

**Files:**
- Modify: `packages/slopbrick/src/cli/program.ts` (selective staging)
- Modify: `packages/slopbrick/src/cli/commands/ci.ts`
- Create: `packages/slopbrick/tests/cli/ci.test.ts`

**Interfaces:**
- `scanAction` returns the current report/config/completion/threshold exit recommendation to callers instead of exiting when invoked by `ci`.
- `ci` never reloads stale `.slopbrick/health.json` to decide the current run.

- [x] **Step 1: Write failing CI subprocess tests**

Cover pass, `--max-slop 1` failure against repository health below 99, normal scan-threshold failure, empty scan, malformed config, and JSON fields agreeing with the exit status.

- [x] **Step 2: Verify red**

```bash
node_modules/.bin/vitest run tests/cli/ci.test.ts
```

Expected: the reproduced `--max-slop 1` command exits zero before the fix.

- [x] **Step 3: Return an outcome from the shared scan action**

For the `ci` caller, return the current in-memory result before terminal exit. Keep scan/watch behavior unchanged in this task. Include the base scan threshold result and completion status.

- [x] **Step 4: Gate from current data and use shared exit propagation**

Remove `loadHealth(cwd)` from CI decision-making. Evaluate the current report, combine base scan failure with CI-specific thresholds, and use the existing shared Commander exit mechanism rather than calling `process.exit` inside `registerCi`.

- [x] **Step 5: Verify and commit**

```bash
node_modules/.bin/vitest run tests/cli/ci.test.ts tests/cli/shared-exit.test.ts tests/cli/scan-completion.test.ts
node_modules/.bin/tsc --noEmit
git add packages/slopbrick/src/cli/commands/ci.ts packages/slopbrick/tests/cli/ci.test.ts
git add -p packages/slopbrick/src/cli/program.ts
git commit -m "fix(slopbrick): enforce CI gates from current scan"
```

---

### Task 4: Complete the Dart rule contracts without activating uncalibrated rules — complete (`158ee8011`, APPROVE)

**Files:**
- Create: `packages/slopbrick/src/rules/dart/dynamic-call.ts`
- Create: `packages/slopbrick/src/rules/dart/missing-dispose.ts`
- Create: `packages/slopbrick/src/rules/dart/print-debug.ts`
- Create: `packages/slopbrick/src/rules/dart/unwrapped-futures.ts`
- Modify: `packages/slopbrick/src/snippet/data.ts`
- Modify: `packages/slopbrick/src/rules/signal-strength.json`
- Modify only if guardrails expose a registry issue: `packages/slopbrick/src/rules/builtins.ts` (selective staging; already dirty)
- Test: `packages/slopbrick/tests/engine/rule-hints.test.ts`
- Test: `packages/slopbrick/tests/engine/signal-strength-guardrails.test.ts`
- Create: `packages/slopbrick/tests/rules/dart/contracts.test.ts`

- [x] **Step 1: Capture the existing red guardrails**

```bash
node_modules/.bin/vitest run tests/engine/rule-hints.test.ts tests/engine/signal-strength-guardrails.test.ts tests/rules/dart/contracts.test.ts
```

Expected: all four Dart IDs are missing hints and signal entries.

- [x] **Step 2: Add concise actionable hints**

Add one ≤240-character remediation for each of `dart/dynamic-call`, `dart/missing-dispose`, `dart/print-debug`, and `dart/unwrapped-futures`.

- [x] **Step 3: Add conservative signal metadata**

Add all required numeric fields, `verdict: "DORMANT"`, `defaultOff: true`, `aiSpecific: false`, and an explicit note that corpus calibration is pending. Do not invent precision/recall evidence; use zero-valued uncalibrated metrics accepted by the guardrail schema.

- [x] **Step 4: Verify and commit**

```bash
node_modules/.bin/vitest run tests/engine/rule-hints.test.ts tests/engine/signal-strength-guardrails.test.ts tests/rules/dart/contracts.test.ts
node_modules/.bin/tsc --noEmit
git add packages/slopbrick/src/snippet/data.ts packages/slopbrick/src/rules/signal-strength.json
git add -p packages/slopbrick/src/rules/builtins.ts
git commit -m "fix(slopbrick): complete Dart rule metadata"
```

---

### Task 5: Rebuild, self-scan, audit findings, and reconcile all plans

**Files:**
- Modify: `packages/slopbrick/docs/calibration/v0.45.0-continuation-plan.md`
- Modify: `packages/slopbrick/docs/calibration/v0.45.0-handoff.md`
- Modify: `AGENTS.md` only if the verified release command must change
- Modify: `.superpowers/sdd/progress.md`
- Create: `packages/slopbrick/docs/calibration/v0.45.0-execution-evidence.md`

- [x] **Step 1: Run fresh package verification**

```bash
node_modules/.bin/tsc --noEmit
node_modules/.bin/tsup
node_modules/.bin/vitest run tests/engine/pool.test.ts tests/integration/packaged-worker.test.ts tests/cli/scan-discovery.test.ts tests/cli/scan-completion.test.ts tests/cli/ci.test.ts tests/engine/rule-hints.test.ts tests/engine/signal-strength-guardrails.test.ts tests/rules/dart
```

- [x] **Step 2: Run both documented scans from the fresh build**

```bash
node bin/slopbrick.js scan --workspace /Users/cheng/platform/packages/slopbrick/src --threads 1 --json --no-telemetry --no-color
node bin/slopbrick.js scan --workspace /Users/cheng/platform --threads 1 --json --no-telemetry --no-color
```

Record exit status, status/counts, four scores, elapsed time, top offenders, and resource observations. Confirm package scan contains TypeScript and root scan contains source from core, engine, slopbrick, and website.

- [ ] **Step 3: Manually audit a stratified finding sample**

Review every high finding and at least five medium/low findings spanning different rules/languages. Classify each as correct, useful-but-noisy, false positive, or harmful advice. Do not claim the score is release evidence if the sampled output is materially misleading.

- [x] **Step 4: Reconcile governing documentation from evidence**

Update the continuation plan and handoff with exact commit IDs, commands, pass/fail counts, and self-scan results. Check only requirements proven by fresh evidence. Add newly discovered blockers beside their governing gate. Remove stale claims such as prior zero-file “clean” scores. Update the durable ledger in the same bookkeeping pass.

- [ ] **Step 5: Validate docs and commit the evidence/docs only**

```bash
git diff --check
rg -n "self-scan|CLI-00|CLI-05|Dart|Gate 2" packages/slopbrick/docs/calibration/v0.45.0-continuation-plan.md packages/slopbrick/docs/calibration/v0.45.0-handoff.md packages/slopbrick/docs/calibration/v0.45.0-execution-evidence.md
git add packages/slopbrick/docs/calibration/v0.45.0-continuation-plan.md packages/slopbrick/docs/calibration/v0.45.0-handoff.md packages/slopbrick/docs/calibration/v0.45.0-execution-evidence.md
git commit -m "docs(slopbrick): reconcile recovery execution evidence"
```

After Task 5, generate a whole-range review package from `8086c3f1bc47148a47eb2df973118b6c96911570` to `HEAD`, dispatch a final reviewer, fix every Critical/Important finding in one correction wave, re-run the focused gate, and only then update this plan's completion state.
