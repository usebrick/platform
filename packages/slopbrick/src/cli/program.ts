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

import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname, extname } from 'node:path';
import { performance } from 'node:perf_hooks';

import { Command } from 'commander';

import { parseThreads, collectGlob, parseTrend, parseCount, parseThreshold } from './options';
import {
  colorForSlop,
  formatBadge,
  formatSparkline,
  renderTrend,
} from './render';
import {
  thresholdExceeded,
  failedThresholdCount,
  baselineStatusMessage,
  stagedGating,
  serializeConfig,
  appendGitignore,
  readReportFile,
  formatReportFromFile,
} from './threshold';
import { runScan, type CliGlobalOptions } from './scan';
import { runDrift, formatDrift, driftExitCode } from './drift';
import { runTestScan, formatTestReport, testExitCode } from './test';
import { runPrScan, formatPrReport, prExitCode, type PrFormat } from './pr';
import {
  runMaintenanceCostScan,
  formatMaintenanceCostReport,
  maintenanceCostExitCode,
} from './maintenance-cost';
import { runDocsScan, formatDocsReport, docsExitCode } from './docs';
import { runDbScan, formatDbReport, dbExitCode } from './db';
import {
  runBusinessLogicScan,
  formatBusinessLogicScan,
  businessLogicExitCode,
  type BusinessLogicFormat,
} from './business-logic';
import {
  runPatternsScan,
  formatPatternsReport,
  patternsExitCode,
} from './patterns';
import {
  buildArchitectureScore,
  formatArchitectureScore,
} from '../engine/architecture-score';
import {
  computeAiSecurityRisk,
  formatAiSecurityRiskLine,
  type AiSecurityRisk as AiSecurityRiskLevel,
} from '../engine/ai-security-risk';
import {
  buildBaselineCache,
  printFixSummary,
  renderOutput,
  watchProject,
} from './scan';
import { runInitWizard, runDoctor, isInteractive } from './init';
// v0.17.5 (R-H1): per-command wiring lives in `cli/commands/<name>.ts`.
// `program.ts` is the single source of truth for which commands exist;
// the action callbacks (and their inline option lists) are now in
// focused modules. This commit moves badge / suggest / explain — the
// three smallest, simplest commands — as the template. The other 14
// commands will follow in subsequent PRs.
import { registerBadge } from './commands/badge.js';
import { registerSuggest } from './commands/suggest.js';
import { registerExplain } from './commands/explain.js';
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

import {
  loadConfig,
  DEFAULT_CONFIG,
  detectStack,
  detectMonorepoRoot,
  detectStylingSolution,
  buildInitConfig,
  resolveConfigPath as findConfigPath,
  ConfigValidationError,
  type ResolvedConfig,
} from '../config';
import { getGitHead, getGitRoot } from './git.js';
import { installHook, uninstallHook } from './installer.js';
import { logger } from '../engine/logger';
import { builtinRules } from '../rules/builtins';
import {
  refreshRegistrySnapshot,
  copyBundledSnapshotToCache,
} from '../rules/registry-loader';
import {
  createProvider,
  generateSamples,
  analyzeSamples,
  extractAndCluster,
  clustersToCandidates,
  calibrate,
  reportToMarkdown,
  type GeneratedSample,
} from '../research';
import { buildTrend, trendToText, trendToMarkdown } from '../engine/trend';
import { runMcpServer } from '../mcp/server.js';
import {
  generateCursorSnippet,
  generateAgentsMdSnippet,
  generateClaudeMdSnippet,
  generateAiderSnippet,
  generateWindsurfSnippet,
  generateClineRules,
  generateCursorrulesLegacySnippet,
  generateGeminiSnippet,
  generateCopilotSnippet,
} from '../snippet/generators.js';
import { RULE_HINTS } from '../snippet/data.js';
import {
  SNIPPET_TARGETS,
  resolveTargetPath,
  renderMatrix,
} from '../snippet/targets.js';
import { validateConfig as validateConfigSchema, formatConfigValidationErrors } from '../config/validation.js';
import { getSignalStrength, isReliableSignal, loadSignalStrength } from '../rules/signal-strength.js';
import { readDtcgTokensFile, summarizeTokens, formatSummary } from './tokens.js';
import { formatJson } from '../report/json';
import { formatPretty } from '../report/pretty';
import { formatMarkdown } from '../report/markdown';
import { formatSarif } from '../report/sarif';
import { formatHtml } from '../report/html';
import { formatUnifiedDiff } from '../report/unified-diff';
import { buildHeatmap, formatHeatmap } from '../report/heatmap';
import { formatFlywheel, summarizeTelemetry } from '../report/flywheel';
import { readTelemetry } from '../engine/telemetry';
import { readRuns } from '@usebrick/engine';
import { fsMemoryIO } from './memory-io.js';
import { applyFixes } from '../fix';
import { saveBaseline, baselinePath, hashConfig } from '../engine/cache';
import {
  VERSION,
  type FileScanResult,
} from '../types';

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
      .option('--no-increase', 'exit 2 if slop index increased since last run')
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

    program
      .command('init')
      .description('create a slopbrick config file')
      .option('--yes', 'overwrite existing config')
      .option('--all', 'write snippets for every supported agent')
      .option('--matrix', 'print the agent x file matrix and exit')
      .option('--cursor', 'also generate .cursor/rules/slopbrick.mdc for Cursor AI')
      .option('--cursorrules', 'legacy Cursor .cursorrules format')
      .option('--agents-md', 'also generate AGENTS.md for Codex / opencode / Pi / Cline')
      .option('--claude-md', 'also generate CLAUDE.md for Claude Code (takes precedence over AGENTS.md)')
      .option('--aider', 'also generate CONVENTIONS.md for Aider')
      .option('--windsurf', 'also generate .windsurfrules for Windsurf')
      .option('--cline', 'also generate .clinerules/AGENTS.md for Cline')
      .option('--gemini', 'also generate .gemini/GEMINI.md for Gemini CLI')
      .option('--copilot', 'also generate .github/copilot-instructions.md for GitHub Copilot')
      .action(async (
        cmdOptions: {
          yes?: boolean;
          all?: boolean;
          matrix?: boolean;
          cursor?: boolean;
          cursorrules?: boolean;
          agentsMd?: boolean;
          claudeMd?: boolean;
          aider?: boolean;
          windsurf?: boolean;
          cline?: boolean;
          gemini?: boolean;
          copilot?: boolean;
        },
        command: Command,
      ) => {
        const options = command.optsWithGlobals() as CliGlobalOptions;

        // --matrix: print the agent x file table and exit without writing.
        if (cmdOptions.matrix) {
          logger.info(renderMatrix());
          process.exit(0);
        }

        const cwd = resolve(options.workspace ?? process.cwd());
        const configPath = join(cwd, 'slopbrick.config.mjs');
        const detected = detectStack(cwd);
        const fallbackConfig = { ...DEFAULT_CONFIG, ...detected } as ResolvedConfig;
        const proposed = serializeConfig(fallbackConfig);
        if (existsSync(configPath) && !cmdOptions.yes) {
          const current = readFileSync(configPath, 'utf8');
          logger.error(`A config file already exists at ${configPath}.`);
          logger.error('To overwrite it with defaults, run `slopbrick init --yes`.');
          logger.error('');
          logger.error('--- current');
          logger.error(current);
          logger.error('+++ proposed');
          logger.error(proposed);
          logger.error('');
          logger.error('Use --yes to overwrite');
          process.exit(2);
        }

        let config: ResolvedConfig;
        let usedWizard = false;
        if (cmdOptions.yes || !isInteractive()) {
          config = fallbackConfig;
        } else {
          const answers = await runInitWizard(cwd, detected);
          config = buildInitConfig(detected, answers);
          usedWizard = true;
        }

        writeFileSync(configPath, serializeConfig(config));
        appendGitignore(cwd);
        const refresh = await refreshRegistrySnapshot(cwd);
        if (!refresh.ok) {
          copyBundledSnapshotToCache(cwd);
        }
        if (!options.quiet) {
          // Round 25: explain to the user what just happened. If we
          // skipped the wizard (CI / --yes / no TTY), make that clear
          // and tell them how to re-run with the wizard.
          if (!usedWizard) {
            logger.info(`Created ${configPath}`);
            logger.info('');
            logger.info(
              'Skipped the setup wizard (no interactive terminal). Used defaults from detected stack.',
            );
            logger.info(
              `Detected: framework=${detected.framework ?? 'react'}, styling=${detectStylingSolution(cwd)}, ui=${
                (detected.uiLibraries ?? []).length > 0 ? (detected.uiLibraries ?? []).join(',') : 'none'
              }.`,
            );
            logger.info(
              'Re-run `slopbrick init` from a terminal (no `--yes`) to customize thresholds, severity, and rules.',
            );
          } else {
            logger.info(`Created ${configPath}`);
          }
          logger.info(refresh.message);
        }

        // Round 18+19: AI agent rule snippets. Generated from the live
        // rule registry so they always match what slopbrick checks for.
        // Each target knows its file path + content generator.
        const targetsToWrite = SNIPPET_TARGETS.filter((t) => {
          if (cmdOptions.all) return true;
          // Map flag name → option value
          const opts = cmdOptions as Record<string, unknown>;
          return Boolean(opts[t.flag]);
        });
        for (const target of targetsToWrite) {
          const snippetPath = join(cwd, resolveTargetPath(target));
          mkdirSync(dirname(snippetPath), { recursive: true });
          const generated = target.generator(builtinRules);
          // For AGENTS.md-style flat files, merge into existing markers if
          // present (preserves other content the user wrote).
          if (!target.isFolder && existsSync(snippetPath)) {
            const existing = readFileSync(snippetPath, 'utf8');
            if (existing.includes('<!-- slopbrick:begin -->')) {
              const updated = existing.replace(
                /<!-- slopbrick:begin -->[\s\S]*?<!-- slopbrick:end -->/,
                '<!-- slopbrick:begin -->\n' + generated + '<!-- slopbrick:end -->',
              );
              writeFileSync(snippetPath, updated, 'utf8');
              if (!options.quiet) logger.info(`Updated ${snippetPath}`);
              continue;
            }
            writeFileSync(
              snippetPath,
              existing + (existing.endsWith('\n') ? '\n' : '\n\n') + generated,
              'utf8',
            );
            if (!options.quiet) logger.info(`Wrote ${snippetPath}`);
            continue;
          }
          writeFileSync(snippetPath, generated, 'utf8');
          if (!options.quiet) logger.info(`Wrote ${snippetPath}`);
        }

        if (options.baseline) {
          const { report, config } = await runScan({ ...options, workspace: cwd });
          const configHash = hashConfig(config);
          const gitHead = (await getGitHead(cwd)) ?? 'unknown';
          const cache = buildBaselineCache(report, configHash, gitHead, cwd);
          saveBaseline(cwd, cache);
          if (!options.quiet) {
            logger.info(`Saved baseline to ${baselinePath(cwd)}`);
          }
        }
        process.exit(0);
      });

    // v0.18.x (R-H1): install action moved to ./commands/install.ts
    registerInstall(program);

    // v0.18.x (R-H1): uninstall action moved to ./commands/uninstall.ts
    registerUninstall(program);

    // v0.17.5 (R-H1): badge/suggest/explain actions moved to ./commands/*.ts
    registerBadge(program);
    registerSuggest(program);
    registerExplain(program);
    // explain registration above is the one in effect (line ~1500 was the old
    // duplicate that triggered "cannot add command 'explain' as already have
    // command 'explain'"). Removed the inline pre-creation; registerExplain
    // now owns the full command shape.

    program
      .command('flywheel')
      .description('summarize aggregated scan telemetry')
      .option('--format <pretty|json>', 'output format', 'pretty')
      // across machines or piping into external analysis tools.
      .option('--export <path>', 'write summary as JSON to <path>')
      .action(async (cmdOptions: { format?: 'pretty' | 'json'; export?: string }, command: Command) => {
        const options = command.optsWithGlobals() as CliGlobalOptions;
        const cwd = resolve(options.workspace ?? process.cwd());
        const payloads = readTelemetry(cwd);
        if (payloads.length === 0) {
          logger.info('No flywheel telemetry found. Run a scan first.');
          process.exit(0);
        }
        const summary = summarizeTelemetry(payloads);
        if (cmdOptions.export) {
          const exportPath = resolve(cmdOptions.export);
          mkdirSync(dirname(exportPath), { recursive: true });
          writeFileSync(exportPath, JSON.stringify(summary, null, 2), 'utf-8');
          logger.info(`Wrote flywheel summary to ${exportPath}`);
          process.exit(0);
        }
        logger.info(formatFlywheel(summary, { json: cmdOptions.format === 'json' }));
        process.exit(0);
      });

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
      } = await runScan(options, paths);
      const scanElapsed = Math.round(performance.now() - scanStart);
      const totalElapsed = Math.round(performance.now() - start);

      if (options.baseline) {
        const cwd = resolve(options.workspace ?? process.cwd());
        const configHash = hashConfig(config);
        const gitHead = (await getGitHead(cwd)) ?? 'unknown';
        const cache = buildBaselineCache(report, configHash, gitHead, cwd);
        saveBaseline(cwd, cache);
        if (!options.quiet) {
          logger.info(`Saved baseline to ${baselinePath(cwd)}`);
        }
      }

      if (options.tighten && baseline) {
        saveBaseline(cwd, baseline);
        if (!options.quiet) {
          logger.info(`Tightened baseline saved (revision ${baseline.baseline_revision}).`);
        }
      }

      if (options.doctor && !options.quiet) {
        logger.info(`Doctor: bootstrap ${totalElapsed - scanElapsed}ms, scan ${scanElapsed}ms`);
      }

      if (report.baseline && !options.quiet) {
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
        const { totalApplied, totalSkipped, hasErrors } = printFixSummary(fixResults, options.quiet ?? false);

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

      renderOutput(report, options, cwd);

      let exitCode: 0 | 1 | 2 = thresholdExceeded(report, config) ? 1 : 0;
      const stagedGatingResult = options.staged ? stagedGating(scores, config, baseline, cwd) : { failed: false };
      if (options.staged && stagedGatingResult.failed) {
        exitCode = 1;
      }
      if (options.strict && report.issues.some((issue) => issue.severity === 'high')) {
        exitCode = 2;
        if (!options.quiet) {
          logger.error('High-severity issues found with --strict.');
        }
      }
      if (noIncreaseFailure) {
        exitCode = 2;
      }

      if (exitCode === 1) {
        if (options.staged && stagedGatingResult.reason) {
          logger.error(`Gating failure: ${stagedGatingResult.reason}`);
        } else {
          const failed = failedThresholdCount(report, config);
          logger.error(`${failed} threshold${failed === 1 ? '' : 's'} failed. See details above.`);
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

    program
      .command('scan [paths...]', { isDefault: true })
      .description('scan files for slop')
      .option('--no-telemetry', 'disable telemetry collection for this run')
      .option(
        '--rule <ruleId>',
        'run only a single rule by id (e.g. visual/math-default-font). All others are skipped.',
      )
      .action(scanAction);

    await program.parseAsync(process.argv);
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