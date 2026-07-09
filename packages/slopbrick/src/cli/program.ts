// Commander wiring for slopbrick's CLI.
//
// This file is intentionally thin: it owns the `Command` instance, the
// global flag declarations, and the per-command `.action()` callbacks.
// The actual work for each command is delegated to focused modules:
//
//   - scan.ts   — runScan / scanProject / watch / render output
//   - init.ts   — runInitWizard / runDoctor
//
// The bin script (bin/slopbrick.js) imports { runCli } from here. The
// public-API facade (src/index.ts) re-exports runCli, scanProject, and
// runInitWizard from this module — those re-exports live at the bottom
// of the file.

import { resolve } from 'node:path';

import { Command } from 'commander';

import { parseThreads, collectGlob, parseTrend } from './options';
import { renderTrend } from './render';
import {
  thresholdExceeded,
  failedThresholdCount,
  failedThresholds,
  baselineStatusMessage,
  stagedGating,
} from './threshold';
import { runScan } from './scan';
import type { CliGlobalOptions } from './scan';
import {
  buildBaselineCache,
  printFixSummary,
  renderOutput,
  watchProject,
} from './scan';
import { runInitWizard, runDoctor } from './init';
// v0.17.5 (R-H1): per-command wiring lives in `cli/commands/<name>.ts`.
// `program.ts` is the single source of truth for which commands exist;
// the action callbacks (and their inline option lists) are now in
// focused modules. This commit moves badge / suggest / explain — the
// three smallest, simplest commands — as the template. The other 14
// commands will follow in subsequent PRs.
import { registerBadge } from './commands/badge.js';
import { registerSuggest } from './commands/suggest.js';
import { registerComposite } from './commands/composite.js';
import { registerExplain } from './commands/explain.js';
import { registerCalibration } from './commands/calibration.js';
import { registerInstall } from './commands/install.js';
import { registerUninstall } from './commands/uninstall.js';
import { registerMcp } from './commands/mcp.js';
import { registerDoctor } from './commands/doctor.js';
import { registerWatch } from './commands/watch.js';
import { registerLock } from './commands/lock.js';
import { registerCi } from './commands/ci.js';
import { registerMemory } from './commands/memory.js';
import { registerMigrate } from './commands/migrate.js';
import { registerRules } from './commands/rules.js';
import { registerValidateConfig } from './commands/validate-config.js';
import { registerTokens } from './commands/tokens.js';
import { registerReport } from './commands/report.js';
import { registerCalibrate } from './commands/calibrate.js';
import { registerTrend } from './commands/trend.js';
import { registerDrift } from './commands/drift.js';
import { registerPr } from './commands/pr.js';
import { registerSecurity } from './commands/security.js';
import { registerTest } from './commands/test.js';
import { registerArchitecture } from './commands/architecture.js';
import { registerBusinessLogic } from './commands/business-logic.js';
import { registerMaintenanceCost } from './commands/maintenance-cost.js';
import { registerDocs } from './commands/docs.js';
import { registerDb } from './commands/db.js';
import { registerPatterns } from './commands/patterns.js';
import { registerResearch } from './commands/research.js';
import { registerInit } from './commands/init.js';
import { registerFlywheel } from './commands/flywheel.js';
import { registerScan } from './commands/scan.js';

// v0.41.0 (Sprint 2, task 2.0): wire the exitOverride dispatcher
// from `./commands/_shared`. `setExitOverride(program)` installs
// Commander's `exitOverride()` so `program.error()` and Commander's
// own argument-parser errors come back as `CommanderError` throws
// instead of `process.exit()` calls. `dispatch(program, runFn)` is
// the single place that catches those throws and turns them into a
// logged message + `process.exit(exitCode)`. This is the template
// for the other 32 commands that still embed `process.exit`
// (architecture review F3).
import { setExitOverride, dispatch } from './commands/_shared.js';

import { detectMonorepoRoot, ConfigValidationError } from '../config';
import type { ResolvedConfig } from '../config';
import { getGitHead } from './git.js';

import { logger } from '../engine/logger';


import type { GeneratedSample } from '../research';





import { formatUnifiedDiff } from '../report/unified-diff';
import { buildHeatmap, formatHeatmap } from '../report/heatmap';

import { readRuns } from '@usebrick/engine';
import { fsMemoryIO } from './memory-io.js';
import { applyFixes } from '../fix';
import { saveBaseline, baselinePath, hashConfig } from '../engine/cache';
import { VERSION } from '../types';
import type { FileScanResult } from '../types';
// v0.18.4: --help clusters. See help.ts for category mapping.
import { formatGroupedHelp } from './help';
// v0.24.0 (Workstream C): opt-in network beacon. Fire-and-forget
// from the scan action; `runScan` itself stays network-free so
// `scanProject` (library API) and `ci`/`watch` are unaffected.
import { BeaconEmitter } from '../beacon';

//   0 = pass (slopIndex below threshold)
//   1 = threshold breach (blocks git hooks)
//   2 = tool/usage error (config validation, parse errors that prevent scanning)
//   3 = unexpected internal error
process.on('uncaughtException', (err) => {
  logger.error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(3);
});

export async function runCli({ start }: { start: number }): Promise<void> {
  try {
    const program = new Command()
      .name('slopbrick')
      .description('Repository Coherence Scanner — surface AI-induced pattern drift, secret leaks, and design-token violations')
      .version(VERSION)
      .option('--framework <name>', 'framework multiplier to apply')
      .option('--include <glob>', 'include pattern (repeatable)', collectGlob, [])
      .option('--exclude <glob>', 'exclude pattern (repeatable)', collectGlob, [])
      .option('--ai-only', 'only report AI-specific issues')
      .option('--human-only', 'only report human-facing issues')
      .option('--ignore-wcag22', 'ignore WCAG 2.2 related issues')
      .option('--format <pretty|json|sarif|html>', 'output format', 'pretty')
      .option('--threads <n>', 'number of worker threads', parseThreads)
      .option('--since <ref>', 'only scan files changed since git ref')
      // v0.10.1: --diff <ref> is the VibeDrift-compatible alias for
      // --since <ref>. Same behavior; output adds the PR Slop Score
      // (aggregate weighted issue count for the diff) to the report.
      .option('--diff <ref>', 'alias for --since <ref>; also adds PR Slop Score to the report')
      .option('--workspace <path>', 'workspace/project path', process.cwd())
      .option('--tighten', 'tighten baseline allowances')
      .option('--fix', 'apply auto-fixes')
      .option('--dry-run', 'with --fix: print what would change without writing')
      // v0.10.1: renamed from --diff (boolean) to free --diff <ref>
      // (string) for the VibeDrift-compatible git-ref alias of --since.
      .option('--show-fixes-diff', 'print unified diff of proposed auto-fixes')
      .option('--doctor', 'run diagnostics')
      .option('--watch', 'watch files and re-run')
      .option('--suggest', 'print remediation advice')
      // v0.14.5i (P3): quick triage view — top 5 rules dragging the
      // score down, without the full report.
      .option('--why-failing', 'print the top 5 rules dragging the score down')
      // v0.14.5j (P10): terse output for CI / scripts. Just the
      // headline + verdict + threshold + delta.
      .option('--brief', 'terse output (verdict + headline + threshold + delta only)')
      .option('--heatmap', 'print migration ROI heatmap')
      .option('--quiet', 'suppress non-error output')
      .option('--verbose', 'enable debug logging (file paths, timings, rule-fire counts)')
      .option('--strict', 'exit 2 if any high-severity issue remains')
      .option('--no-increase', 'exit 2 if AI Slop Score increased since last run (lower = cleaner since v0.21)')
      // v0.42.0 (§3a.4): opt-in flag for the AGENTS.md auto-refresh
      // hook. Without this flag (or
      // `slopbrick.config.mjs#autoRefreshSnippets: true`), scans are
      // read-only against AGENTS.md/CLAUDE.md.
      .option('--refresh-snippets', 'rewrite the managed slopbrick block in AGENTS.md and CLAUDE.md after a scan')
      // v0.9.3: rules marked `defaultOff: true` in signal-strength.json
      // (INVERTED + NOISY) are off by default. No flag needed — opt back
      // in via `rules: { 'rule/id': 'medium' }` in slopbrick.config.mjs.
      .option('--baseline', 'save a baseline after this scan')
      .option('--trend [n]', 'print a sparkline of the last n runs', parseTrend)
      .option('--json [path]', 'write JSON report to path or stdout')
      .option('--html [path]', 'write HTML report to path or stdout')
      .option('--staged', 'scan only changed files (staged and unstaged)')
      .option('--changed', 'scan working-tree changes (staged + unstaged + untracked)')
      // subsequent runs can skip unchanged files. Cache invalidates on
      // VERSION mismatch. Works outside git repos (cache is content-based).
      .option('--incremental', 'skip unchanged files using the persisted hash cache')
      .option('--cache-path <path>', 'path to the incremental-scan cache (default: .slopbrick-cache.json)')
      .option('--tokens <path>', 'merge tokens.json layout values into the arbitrary-value allowlist')
      .option('--cache', 'cache parsed AST results locally')
      // v0.17.1: --no-color per https://no-color.org. Also respects
      // the NO_COLOR env var automatically (via colorEnabled() in
      // render.ts). FORCE_COLOR=1 overrides both.
      .option('--no-color', 'suppress ANSI color codes in output')
      // v0.17.1: --security-only runs only the security/* rules.
      // Useful for CI gates that only care about security posture,
      // not AI drift / engineering hygiene.
      .option('--security-only', 'run only the security/* rules')
      // v0.17.1: --full shows the complete report (all issues, all
      // categories, all components) instead of the curated brief
      // view. The brief is the default; --full is for when the user
      // wants to see everything.
      .option('--full', 'show the complete report (all issues, all categories)')
      // v0.24.0 (Workstream C): opt-in network beacon. Distinct
      // from `--no-telemetry` (which gates the local flywheel at
      // `.slopbrick/flywheel/scans.jsonl`). Both must be true for a
      // POST to fire: this flag AND `SLOPBRICK_TELEMETRY_ENDPOINT`.
      // Default OFF. Fires from `slopbrick scan` only; `watch`/`ci`
      // /programmatic `scanProject` are unaffected.
      .option('--report-usage', 'opt in to a one-shot usage ping to SLOPBRICK_TELEMETRY_ENDPOINT (no PII)');

    // v0.18.4 (--help clusters): override the default help
    // formatter. Default `--help` renders the grouped view
    // (File selection, Filter, Output, Performance, etc.). The
    // `--help-flat` opt-out is handled below in the runCli
    // dispatch (it's a manual argv check, not an Option, so it
    // doesn't get treated as a regular scan flag).
    program.helpInformation = () => formatGroupedHelp(program);

    // v0.41.0 (Sprint 2, task 2.0): install Commander's
    // `exitOverride()` BEFORE any subcommand registration so that
    // errors thrown by `program.error()` (e.g. inside future
    // `withExitCode` callers) and by Commander's own argument-parsing
    // surface as `CommanderError` exceptions instead of hard
    // `process.exit()` calls. The outer `dispatch(program, ...)` call
    // at the bottom of runCli is the single place that catches those
    // errors and routes them through `process.exit(exitCode)`.
    setExitOverride(program);

    // v0.18.x (R-H1): init action moved to ./commands/init.ts
    // (the largest single command in the CLI, ~150 lines inline)
    registerInit(program);

    // v0.18.x (R-H1): install action moved to ./commands/install.ts
    registerInstall(program);

    // v0.18.x (R-H1): uninstall action moved to ./commands/uninstall.ts
    registerUninstall(program);

    // v0.17.5 (R-H1): badge/suggest/explain actions moved to ./commands/*.ts
    registerBadge(program);
    registerSuggest(program);
    registerExplain(program);
    registerComposite(program);
    registerCalibration(program);
    // explain registration above is the one in effect (line ~1500 was the old
    // duplicate that triggered "cannot add command 'explain' as already have
    // command 'explain'"). Removed the inline pre-creation; registerExplain
    // now owns the full command shape.

    // v0.18.x (R-H1): flywheel action moved to ./commands/flywheel.ts
    registerFlywheel(program);

    const scanAction = async (
      paths: string[],
      _options: CliGlobalOptions,
      command: Command,
    ): Promise<void> => {
      const rawGlobals = command.optsWithGlobals() as CliGlobalOptions & { increase?: boolean };
      const options: CliGlobalOptions = {
        ...rawGlobals,
        noIncrease: rawGlobals.increase === false,
      };

      if (command.getOptionValueSource('workspace') === 'default') {
        const autoRoot = detectMonorepoRoot(process.cwd());
        if (autoRoot) {
          options.workspace = autoRoot;
        }
      }

      if (options.heatmap && options.suggest) {
        logger.error("--heatmap and --suggest can't be used together. Pick one: a heatmap of severity, or text advice.");
        process.exit(2);
      }

      const cwd = resolve(options.workspace ?? process.cwd());

      if (options.trend !== undefined) {
        const runs = await readRuns(cwd, fsMemoryIO);
        if (runs.length === 0) {
          logger.info('No trend data available.');
        } else {
          logger.info(renderTrend(runs, options.trend));
        }
        process.exit(0);
      }

      if (options.doctor) {
        const doctorExit = await runDoctor(cwd);
        if (!options.watch) {
          process.exit(doctorExit);
        }
      }

      if (options.watch) {
        await watchProject(options, cwd, paths);
        return;
      }

      const scanStart = performance.now();
      const {
        report,
        scores,
        results,
        config,
        noIncreaseFailure,
        baseline,
        machineReadableStdout,
        scanStats,
      } = await runScan(options, paths);
      const scanElapsed = Math.round(performance.now() - scanStart);
      const totalElapsed = Math.round(performance.now() - start);

      // v0.24.0 (Workstream C): opt-in network beacon. Fires ONLY
      // when all three are true: the user passed --report-usage,
      // SLOPBRICK_TELEMETRY_ENDPOINT is set in the environment, AND
      // this invocation is the `scan` subcommand (not `watch`/`ci` —
      // those share the scanAction closure via parameter and would
      // otherwise leak the global flag through `optsWithGlobals`).
      // `void` deliberately — we don't await, so the beacon cannot
      // delay `process.exit` below. The emitter is silent on every
      // failure mode (errors caught, errors swallowed).
      const beaconEnv = process.env.SLOPBRICK_TELEMETRY_ENDPOINT;
      if (options.reportUsage && beaconEnv && command.name() === 'scan') {
        const beacon = new BeaconEmitter({
          flag: true,
          envEndpoint: beaconEnv,
          version: VERSION,
        });
        void beacon.emit({
          scanId: scanStats.scanId,
          fileCount: scanStats.fileCount,
          ruleCount: scanStats.ruleCount,
          durationMs: scanStats.durationMs,
        });
      }

      if (options.baseline) {
        const cwd = resolve(options.workspace ?? process.cwd());
        const configHash = hashConfig(config);
        const gitHead = (await getGitHead(cwd)) ?? 'unknown';
        const cache = buildBaselineCache(report, configHash, gitHead, cwd);
        saveBaseline(cwd, cache);
        if (!options.quiet && !machineReadableStdout) {
          logger.info(`Saved baseline to ${baselinePath(cwd)}`);
        }
      }

      if (options.tighten && baseline) {
        saveBaseline(cwd, baseline);
        if (!options.quiet && !machineReadableStdout) {
          logger.info(`Tightened baseline saved (revision ${baseline.baseline_revision}).`);
        }
      }

      if (options.doctor && !options.quiet && !machineReadableStdout) {
        logger.info(`Doctor: bootstrap ${totalElapsed - scanElapsed}ms, scan ${scanElapsed}ms`);
      }

      if (report.baseline && !options.quiet && !machineReadableStdout) {
        logger.info(baselineStatusMessage(report.baseline));
      }

      if (options.fix) {
        // v0.10.1: --show-fixes-diff prints what would change (renamed from
        // --diff to free --diff <ref> for the VibeDrift-compatible git-ref
        // alias of --since). With --dry-run, we skip the apply step entirely.
        if (options.showFixesDiff) {
          const diff = formatUnifiedDiff(report, cwd);
          if (diff) logger.info(diff);
        }
        if (options.dryRun) {
          logger.info('--dry-run: skipping apply step. Run without --dry-run to apply.');
          process.exit(0);
        }
        // Round 20: pass the actual scanned file paths (not the input
        // CLI globs) so visual codemods run on every .tsx file scanned.
        const scannedFiles = results.map((r: FileScanResult) => r.filePath);
        const fixResults = await applyFixes(report, config, scannedFiles);
        const { hasErrors } = printFixSummary(fixResults, options.quiet ?? false);

        if (!options.showFixesDiff && !options.quiet) {
          logger.info('Tip: pass --show-fixes-diff to see the unified diff of proposed changes.');
        }

        if (!options.quiet && !machineReadableStdout) {
          logger.info(`(scan took ${scanElapsed}ms, total ${totalElapsed}ms)`);
        }

        process.exit(hasErrors ? 1 : 0);
      }

      // --show-fixes-diff without --fix: just show the diff (no apply).
      if (options.showFixesDiff) {
        const diff = formatUnifiedDiff(report, cwd);
        if (diff) logger.info(diff);
      }

      if (options.heatmap) {
        const entries = await buildHeatmap(report, cwd);
        logger.info(formatHeatmap(entries, { json: options.format === 'json' }));
        if (!options.quiet && !machineReadableStdout) {
          logger.info(`(scan took ${scanElapsed}ms, total ${totalElapsed}ms)`);
        }
        process.exit(0);
      }

      let exitCode: 0 | 1 | 2 = thresholdExceeded(report, config) ? 1 : 0;
      if (scanStats.status !== 'complete') {
        exitCode = 1;
        const summary = `Scan ${scanStats.status}: requested ${scanStats.requested}, analyzed ${scanStats.analyzed}, failed ${scanStats.failed}.`;
        if (machineReadableStdout) {
          // JSON/SARIF consumers still receive a parseable report carrying
          // the completion fields, but never a clean human verdict.
          renderOutput(report, options, cwd);
        } else if (!options.quiet) {
          logger.error(`${summary} Check workspace/include patterns and retry.`);
        }
      } else {
        renderOutput(report, options, cwd);
      }
      const stagedGatingResult = options.staged ? stagedGating(scores, config, baseline, cwd) : { failed: false };
      if (options.staged && stagedGatingResult.failed) {
        exitCode = 1;
      }
      if (options.strict && report.issues.some((issue) => issue.severity === 'high')) {
        exitCode = 2;
        if (!options.quiet) {
          // v0.43.0: the previous message was "High-severity issues
          // found with --strict." — accurate but unhelpful. Users
          // staring at exit code 2 want to know WHICH rules tripped
          // the gate, not just that something did. Show the top 5
          // (by fire count) so they can `slopbrick explain <ruleId>`
          // or `slopbrick rules` to drill in.
          const topHigh = report.issues
            .filter((i) => i.severity === 'high')
            .reduce<Record<string, number>>((acc, i) => {
              acc[i.ruleId] = (acc[i.ruleId] ?? 0) + 1;
              return acc;
            }, {});
          const topList = Object.entries(topHigh)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([rule, n]) => `  ${rule} (${n})`)
            .join('\n');
          logger.error(`High-severity issues found with --strict. Top rules:\n${topList}`);
        }
      }
      if (noIncreaseFailure) {
        exitCode = 2;
      }

      if (exitCode === 1) {
        if (options.staged && stagedGatingResult.reason) {
          logger.error(`Gating failure: ${stagedGatingResult.reason}`);
        } else {
          const failedNames = failedThresholds(report, config);
          // v0.42.0 (user-review fix): previously the message was
          // "1 threshold failed. See details above." with no
          // indication of which threshold. In --brief the gate line
          // ("AI Slop Score <= 15 -> fail") appears, but in --json or
          // piped output the user has no idea which threshold tripped.
          // Now we name the failed threshold(s) directly:
          //   1 threshold failed: meanSlop (score 25 > limit 15)
          //   2 thresholds failed: meanSlop, category:security
          const detail = failedNames
            .map((name) => {
              if (name === 'meanSlop') return `meanSlop (score ${report.aiSlopScore} > ${config.thresholds.meanSlop})`;
              if (name === 'p90Slop') return `p90Slop (score ${report.p90Score} > ${config.thresholds.p90Slop})`;
              if (name === 'individualSlopThreshold') return `individualSlopThreshold (peak ${report.peakScore} > ${config.thresholds.individualSlopThreshold})`;
              const cat = name.replace(/^category:/, '') as keyof typeof report.categoryScores;
              const limit = config.thresholds.categoryThresholds?.[cat];
              const score = report.categoryScores[cat];
              return `${name} (score ${score} > ${limit})`;
            })
            .join(', ');
          const failed = failedNames.length;
          logger.error(`${failed} threshold${failed === 1 ? '' : 's'} failed: ${detail}`);
        }
      }
      if (!options.quiet && !machineReadableStdout) {
        logger.info(`(scan took ${scanElapsed}ms, total ${totalElapsed}ms)`);
      }
      process.exit(exitCode);
    };

    // v0.18.x (R-H1): research sub-CLI (research/generate/analyze/
    // candidates) moved to ./commands/research.ts. The 4 sub-commands
    // are now created inside `registerResearch`; the call site stays
    // a one-liner.
    registerResearch(program);

    // v0.18.x (R-H1): calibrate action moved to ./commands/calibrate.ts
    // (was previously nested under the `research` sub-command chain
    //  by accident — the indent was wrong. Top-level now.)
    registerCalibrate(program);

    // v0.18.x (R-H1): trend and drift actions moved to ./commands/{trend,drift}.ts
    registerTrend(program);
    registerDrift(program);

    // v0.18.x (R-H1): pr action moved to ./commands/pr.ts
    registerPr(program);

    // v0.18.x (R-H1): security/test/architecture/business-logic/maintenance-cost
    // actions moved to ./commands/{security,test,architecture,business-logic,maintenance-cost}.ts
    registerSecurity(program);
    registerTest(program);
    registerArchitecture(program);
    registerBusinessLogic(program);
    registerMaintenanceCost(program);

    // v0.18.x (R-H1): docs/db/patterns actions moved to ./commands/{docs,db,patterns}.ts
    registerDocs(program);
    registerDb(program);
    registerPatterns(program);

    // v0.18.x (R-H1): mcp action moved to ./commands/mcp.ts
    registerMcp(program);

    // v0.18.x (R-H1): doctor action moved to ./commands/doctor.ts
    registerDoctor(program);

    program
    // v0.18.x (R-H1): watch action moved to ./commands/watch.ts
    // scanAction is the closure defined above; passed in to avoid
    // moving the ~160-line scan body into the watch module.
    registerWatch(program, scanAction);

    // v0.18.x (R-H1): lock action moved to ./commands/lock.ts
    registerLock(program);

    // v0.18.x (R-H1): ci action moved to ./commands/ci.ts
    // scanAction is the closure defined above; passed in to avoid
    // moving the ~160-line scan body into the ci module.
    registerCi(program, scanAction);

    // v0.18.x (R-H1): memory action moved to ./commands/memory.ts
    registerMemory(program);

    // v0.18.x (R-H1): migrate action moved to ./commands/migrate.ts
    registerMigrate(program);

    // v0.18.x (R-H1): rules action moved to ./commands/rules.ts
    registerRules(program);

    // v0.17.5 (R-H1): explain action moved to ./commands/explain.ts (declared above near badge/suggest)

    //
    // Runs the same schema check that `slopbrick scan` performs at the
    // start of every run, but as a no-side-effect subcommand. Useful in
    // pre-commit hooks, CI config PRs, and editor integrations that want
    // to surface config typos without launching a full scan.
    //
    // Exit codes:
    //   0 = config is valid (warnings OK)
    //   1 = config has errors
    //   2 = config file not found / failed to load
    // v0.18.x (R-H1): validate-config action moved to ./commands/validate-config.ts
    registerValidateConfig(program);

    // v0.18.x (R-H1): tokens action moved to ./commands/tokens.ts
    registerTokens(program);

    // v0.18.x (R-H1): report action moved to ./commands/report.ts
    registerReport(program);

    // v0.18.x (R-H1): scan (default) action moved to ./commands/scan.ts
    // scanAction is the closure defined above; passed in to keep
    // the ~160-line scan body inline (shared with watch and ci).
    registerScan(program, scanAction);

    // v0.18.4 (--help clusters): if the user passed --help-flat,
    // restore Commander's default helpInformation (the standard
    // flat alphabetical list). Done BEFORE parseAsync so the
    // dispatch sees the correct help text. We can't register
    // --help-flat as a regular option because Commander would
    // treat it as a scan flag and try to run a scan.
    if (process.argv.includes('--help-flat')) {
      // Save our grouped formatter, then restore the default.
      // Commander's helpInformation is on the prototype; deleting
      // the instance property falls back to the prototype method.
      delete (program as unknown as { helpInformation?: () => string })
        .helpInformation;
      // Print the standard flat help and exit.
      program.outputHelp();
      process.exit(0);
    }

    // v0.41.0 (Sprint 2, task 2.0): wrap parseAsync in
    // `dispatch(program, ...)` so that any `CommanderError` thrown
    // by `withExitCode` (see `./commands/_shared.ts`) or by
    // Commander's own argument-parsing gets logged and routed
    // through `process.exit(exitCode)` from one place. The outer
    // try/catch below only handles non-Commander errors
    // (`ConfigValidationError` → exit 2, anything else → exit 3).
    await dispatch(program, async () => {
      await program.parseAsync(process.argv);
    });
  } catch (err) {
    if (err instanceof ConfigValidationError) {
      logger.error(err.message);
      process.exit(2);
    }
    logger.error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(3);
  }
}

// Public-API re-exports. `src/index.ts` imports these from `./cli/program`
// to keep its import surface narrow; the actual implementations now live
// in `./scan.ts` and `./init.ts`.
export { scanProject, type ScanProjectOptions } from './scan';
export { runInitWizard } from './init';