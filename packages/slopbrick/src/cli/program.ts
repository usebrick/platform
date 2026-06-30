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
import { explainRule, formatExplain } from './explain.js';
import { validateConfig as validateConfigSchema, formatConfigValidationErrors } from '../config/validation.js';
import { getSignalStrength, isReliableSignal, loadSignalStrength } from '../rules/signal-strength.js';
import { readDtcgTokensFile, summarizeTokens, formatSummary } from './tokens.js';
import { formatJson } from '../report/json';
import { formatPretty } from '../report/pretty';
import { formatMarkdown } from '../report/markdown';
import { formatSarif } from '../report/sarif';
import { formatHtml } from '../report/html';
import { formatAdvice } from '../report/advice';
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

    program
      .command('install')
      .description('install the git pre-commit hook')
      .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
        const options = command.optsWithGlobals() as CliGlobalOptions;
        const cwd = resolve(options.workspace ?? process.cwd());
        const root = getGitRoot(cwd);
        if (!root) {
          logger.error('Not a Git repository. Run `git init` first, or remove --staged from your command.');
          process.exit(2);
        }
        const result = installHook(root);
        if (!options.quiet) {
          logger.info(result.message);
        }
        process.exit(result.exitCode);
      });

    program
      .command('uninstall')
      .description('uninstall the git pre-commit hook')
      .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
        const options = command.optsWithGlobals() as CliGlobalOptions;
        const cwd = resolve(options.workspace ?? process.cwd());
        const root = getGitRoot(cwd);
        if (!root) {
          logger.error('Not a Git repository. Run `git init` first, or remove --staged from your command.');
          process.exit(2);
        }
        const result = uninstallHook(root);
        if (!options.quiet) {
          logger.info(result.message);
        }
        process.exit(result.exitCode);
      });

    program
      .command('badge')
      .description('print a shields.io slop-index badge. Reads .slopbrick/health.json if present (no re-scan); falls back to a fresh scan.')
      .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
        // v0.14.5d: badge reads from the persisted health snapshot when
        // available so the organic-growth loop is fast enough for CI
        // badges to refresh on every push. Falls back to a fresh scan.
        const options = command.optsWithGlobals() as CliGlobalOptions;
        const cwd = resolve(options.workspace ?? process.cwd());
        const { loadHealth } = await import('@usebrick/core') as typeof import('@usebrick/core');
        const health = loadHealth(cwd);
        if (health) {
          // v0.15.0 U.4: badge now shows the composite repositoryHealth
          // (the v3 replacement for the headline slopIndex). The shape
          // passed to formatBadge is a ProjectReport-like — it still
          // reads `slopIndex`, so we invert the value (lower = better
          // for the legacy badge, higher = better for repositoryHealth)
          // before passing it in. TODO(U.5): add a --format that
          // shows all 4 scores.
          const synthetic = {
            slopIndex: 100 - health.repositoryHealth,
          } as Parameters<typeof formatBadge>[0];
          logger.info(formatBadge(synthetic));
          process.exit(0);
        }
        const { report } = await runScan(options);
        logger.info(formatBadge(report));
        process.exit(0);
      });

    program
      .command('suggest')
      .description('print remediation advice')
      .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
        const options = command.optsWithGlobals() as CliGlobalOptions;
        const { report } = await runScan(options);
        const cwd = resolve(options.workspace ?? process.cwd());
        logger.info(formatAdvice(report));
        const diff = formatUnifiedDiff(report, cwd);
        if (diff) logger.info(diff);
        process.exit(0);
      });

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

    const research = program
      .command('research')
      .description('research commands for the AI UI learning loop');

    research
      .command('generate')
      .description('generate synthetic UI samples')
      .requiredOption('--count <n>', 'number of samples', parseCount)
      .requiredOption('--framework <name>', 'target framework')
      .requiredOption('--component-type <type>', 'component type')
      .requiredOption('--provider <name>', 'AI provider (openai)')
      .option('--api-key <key>', 'API key for provider')
      .option('--model <name>', 'model name')
      .option('--temperature <n>', 'sampling temperature', parseFloat, 0.7)
      .option('--output-dir <path>', 'output directory', '.slopbrick/corpus/generated')
      .action(async (cmdOptions) => {
        const apiKey = cmdOptions.apiKey ?? process.env.OPENAI_API_KEY;
        if (!apiKey) {
          logger.error('Missing --api-key or OPENAI_API_KEY');
          process.exit(2);
        }
        const provider = createProvider({ name: cmdOptions.provider, apiKey, model: cmdOptions.model });
        const samples = await generateSamples({
          count: cmdOptions.count,
          framework: cmdOptions.framework,
          componentType: cmdOptions.componentType,
          provider,
          outputDir: resolve(cmdOptions.outputDir),
          temperature: cmdOptions.temperature,
        });
        logger.info(`Generated ${samples.length} samples in ${cmdOptions.outputDir}`);
      });

    research
      .command('analyze')
      .description('analyze generated samples and report coverage')
      .requiredOption('--input-dir <path>', 'directory with generated samples containing metadata.json')
      .option('--output <path>', 'analysis output path', '.slopbrick/flywheel/analysis.json')
      .option('--config <path>', 'slopbrick config path')
      .option('--framework <name>', 'framework multiplier to apply', 'react')
      .action(async (cmdOptions) => {
        try {
          const metadataPath = resolve(cmdOptions.inputDir, 'metadata.json');
          if (!existsSync(metadataPath)) {
            logger.error(`No metadata.json found in ${cmdOptions.inputDir}`);
            process.exit(2);
          }
          const samples = JSON.parse(readFileSync(metadataPath, 'utf8')) as GeneratedSample[];
          const config = cmdOptions.config
            ? await loadConfig(cmdOptions.config)
            : { ...DEFAULT_CONFIG, framework: cmdOptions.framework };
          const analysis = await analyzeSamples(samples, config);
          const outputPath = resolve(cmdOptions.output);
          mkdirSync(dirname(outputPath), { recursive: true });
          writeFileSync(outputPath, JSON.stringify(analysis, null, 2), 'utf8');
          logger.info(`Analyzed ${analysis.summary.total} samples; coverage: ${analysis.summary.coverage}%`);
          logger.info(`Wrote analysis to ${outputPath}`);
        } catch (error) {
          logger.error(error instanceof Error ? error.message : String(error));
          process.exit(2);
        }
      });

    research
      .command('candidates')
      .description('extract patterns from generated samples and emit candidate rules')
      .requiredOption('--input-dir <path>', 'directory with generated samples containing metadata.json')
      .option('--output <path>', 'output path', '.slopbrick/flywheel/rule-candidates.json')
      .option('--config <path>', 'slopbrick config path')
      .option('--framework <name>', 'framework multiplier to apply', 'react')
      .option('--min-frequency <n>', 'minimum cluster frequency', parseCount, 2)
      .option('--include-covered', 'include samples already covered by AI-specific rules')
      .action(async (cmdOptions) => {
        try {
          const metadataPath = resolve(cmdOptions.inputDir, 'metadata.json');
          if (!existsSync(metadataPath)) {
            logger.error(`No metadata.json found in ${cmdOptions.inputDir}`);
            process.exit(2);
          }
          const samples = JSON.parse(readFileSync(metadataPath, 'utf8')) as GeneratedSample[];
          const config = cmdOptions.config
            ? await loadConfig(cmdOptions.config)
            : { ...DEFAULT_CONFIG, framework: cmdOptions.framework };
          const analysis = await analyzeSamples(samples, config);
          const extraction = extractAndCluster(analysis.samples, {
            includeCovered: Boolean(cmdOptions.includeCovered),
            minCount: cmdOptions.minFrequency,
          });
          const candidates = clustersToCandidates(extraction.clusters, {
            minFrequency: cmdOptions.minFrequency,
          });
          const outputPath = resolve(cmdOptions.output);
          mkdirSync(dirname(outputPath), { recursive: true });
          const payload = {
            generatedAt: new Date().toISOString(),
            sampleCount: analysis.summary.total,
            coveredCount: analysis.summary.covered,
            fingerprintCount: extraction.total,
            candidates,
          };
          writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
          logger.info(`Extracted ${extraction.total} fingerprints across ${analysis.summary.total} samples`);
          logger.info(`Wrote ${candidates.length} candidate rule(s) to ${outputPath}`);
        } catch (error) {
          logger.error(error instanceof Error ? error.message : String(error));
          process.exit(2);
        }
      });

    research
      .command('calibrate')
      .description('empirical precision/recall/F1 calibration from held-out positive and negative corpora')
      .option('--positive-dir <path>', 'path to positive (AI-generated) corpus', '/Users/cheng/ai-slop-baseline/extracted/positive')
      .option('--negative-dir <path>', 'path to negative (real human) corpus', '/Users/cheng/ai-slop-baseline/extracted/negative')
      .option('--positive-limit <n>', 'limit positive files scanned', parseCount)
      .option('--negative-limit <n>', 'limit negative files scanned', parseCount)
      .option('--output <path>', 'markdown output path', 'corpus/calibration-empirical.md')
      .action(async (cmdOptions) => {
        try {
          const cwd = process.cwd();
          const report = await calibrate(cwd, {
            positiveDir: cmdOptions.positiveDir,
            negativeDir: cmdOptions.negativeDir,
            positiveLimit: cmdOptions.positiveLimit,
            negativeLimit: cmdOptions.negativeLimit,
          });
          const outputPath = cmdOptions.output
            ? resolve(cwd, cmdOptions.output)
            : resolve(cwd, 'corpus', 'calibration-empirical.md');
          mkdirSync(dirname(outputPath), { recursive: true });
          writeFileSync(outputPath, reportToMarkdown(report), 'utf8');
          logger.info(
            'Calibrated ' +
              report.rules.length +
              ' rules across ' +
              report.positiveFileCount +
              ' positive + ' +
              report.negativeFileCount +
              ' negative files.',
          );
          const strong = report.rules.filter((r) => r.signal === 'strong').length;
          const weak = report.rules.filter((r) => r.signal === 'weak').length;
          const inverted = report.rules.filter((r) => r.signal === 'inverted').length;
          const dormant = report.rules.filter((r) => r.signal === 'dormant').length;
          logger.info('  strong: ' + strong + ', weak: ' + weak + ', inverted: ' + inverted + ', dormant: ' + dormant);
          logger.info('Wrote ' + outputPath);
        } catch (error) {
          logger.error(error instanceof Error ? error.message : String(error));
          process.exit(2);
        }
      });

    program
      .command('trend')
      .description('Slop Index over time, from .slopbrick/flywheel/scans.jsonl')
      .option('--max-points <n>', 'how many recent scans to plot', parseCount, 30)
      // Renamed from --format to --render: a global --format option
      // collides with this subcommand's option and Commander silently
      // drops the value, so the local flag was never honored.
      .option('--render <kind>', 'output rendering: text | markdown', 'text')
      .action((cmdOptions) => {
        try {
          const cwd = process.cwd();
          const report = buildTrend(cwd, cmdOptions.maxPoints);
          const out = cmdOptions.render === 'markdown' ? trendToMarkdown(report) : trendToText(report);
          logger.info(out);
          if (report.delta > 1) {
            logger.info('');
            logger.info('Warning: Slop Index increased by ' + report.delta.toFixed(1) + ' points over this period.');
          }
        } catch (error) {
          logger.error(error instanceof Error ? error.message : String(error));
          process.exit(2);
        }
      });

    program
      .command('drift')
      .description(
        'detect imports that violate declared constitution (state, data-fetching, UI, forms, styling, routing) or import forbidden packages',
      )
      .option('--format <pretty|json>', 'output format', 'pretty')
      .option('--max-files <n>', 'cap on files scanned', parseCount, 1000)
      .action(
        async (cmdOptions: { format?: 'pretty' | 'json'; maxFiles?: number }, command: Command) => {
          try {
            const options = command.optsWithGlobals() as CliGlobalOptions & {
              format?: string;
            };
            // Read --format from the merged opts because the global
            // scan --format shadowed the subcommand's local option in
            // Commander. Same trap as `trend` had.
            const rawFormat = options.format ?? cmdOptions.format ?? 'pretty';
            const format: 'pretty' | 'json' =
              rawFormat === 'json' || rawFormat === 'pretty' ? rawFormat : 'pretty';

            const cwd = resolve(options.workspace ?? process.cwd());
            const { config } = await runScan({ ...options, workspace: cwd });
            const result = await runDrift(cwd, config, { maxFiles: cmdOptions.maxFiles });
            logger.info(formatDrift(result, { json: format === 'json' }));
            process.exit(driftExitCode(result));
          } catch (err) {
            logger.error(err instanceof Error ? err.message : String(err));
            process.exit(2);
          }
        },
      );

    program
      .command('pr')
      .description(
        'Score the slop cost of the current PR. Compares --base (default: main) to --head (default: HEAD), ' +
          'scans only changed source files, returns a single weighted score. ' +
          'Exits 1 when score > --threshold (default 20).',
      )
      .option('--base <ref>', 'base git ref to diff from', 'main')
      .option('--head <ref>', 'head git ref to diff to', 'HEAD')
      .option('--format <text|json|markdown>', 'output format', 'text')
      .option('--threshold <n>', 'score threshold (overrides config.prScoreThreshold)', parseThreshold)
      .option('--max-files <n>', 'cap on files scanned', parseCount, 500)
      .action(
        async (
          cmdOptions: {
            base?: string;
            head?: string;
            format?: string;
            threshold?: number;
            maxFiles?: number;
          },
          command: Command,
        ) => {
          try {
            const options = command.optsWithGlobals() as CliGlobalOptions & {
              format?: string;
            };
            const cwd = resolve(options.workspace ?? process.cwd());

            // The global scan --format <pretty|json|sarif|html> shadowed
            // the subcommand's local --format option in Commander: the
            // value ends up in `options.format` (global) and
            // `cmdOptions.format` (local) keeps its default. Mirror the
            // drift subcommand's pattern — read global first, then fall
            // back to the local value.
            const rawFormat = options.format ?? cmdOptions.format ?? 'text';
            const format: PrFormat =
              rawFormat === 'json' || rawFormat === 'markdown' || rawFormat === 'text'
                ? (rawFormat as PrFormat)
                : 'text';

            const { config } = await runScan({ ...options, workspace: cwd });
            const result = await runPrScan(cwd, config, {
              base: cmdOptions.base,
              head: cmdOptions.head,
              format,
              threshold: cmdOptions.threshold,
              maxFiles: cmdOptions.maxFiles,
            });
            logger.info(formatPrReport(result, { format }));
            process.exit(prExitCode(result));
          } catch (err) {
            logger.error(err instanceof Error ? err.message : String(err));
            process.exit(2);
          }
        },
      );

    program
      .command('security')
      .description(
        'AI Security Risk — categorical severity for security findings disproportionately introduced by AI-generated code',
      )
      .option('--format <pretty|json>', 'output format', 'pretty')
      .option('--strict', 'exit 1 on any high or critical finding (CI gate)', false)
      .action(
        async (cmdOptions: { format?: 'pretty' | 'json'; strict?: boolean }, command: Command) => {
          try {
            const options = command.optsWithGlobals() as CliGlobalOptions & {
              format?: string;
            };
            const rawFormat = options.format ?? cmdOptions.format ?? 'pretty';
            const format: 'pretty' | 'json' =
              rawFormat === 'json' || rawFormat === 'pretty' ? rawFormat : 'pretty';

            const cwd = resolve(options.workspace ?? process.cwd());
            const { report } = await runScan({ ...options, workspace: cwd });
            const securityIssues = report.issues.filter((i) => i.category === 'security');
            const { risk, findings } = computeAiSecurityRisk(securityIssues);

            if (format === 'json') {
              logger.info(
                JSON.stringify(
                  {
                    aiSecurityRisk: risk,
                    findings,
                    totalFindings: securityIssues.length,
                    issues: securityIssues,
                  },
                  null,
                  2,
                ),
              );
            } else {
              logger.info(formatAiSecurityRiskLine(risk, findings));
              if (securityIssues.length > 0) {
                logger.info('');
                logger.info('  Findings:');
                for (const issue of securityIssues.slice(0, 20)) {
                  logger.info(
                    `    [${issue.severity.padEnd(7)}] ${issue.filePath ?? ''}:${issue.line}  ${issue.ruleId}`,
                  );
                  logger.info(`        ${issue.message}`);
                }
                if (securityIssues.length > 20) {
                  logger.info(`    …and ${securityIssues.length - 20} more`);
                }
              }
            }

            if (cmdOptions.strict && (risk === 'high' || risk === 'critical')) {
              process.exit(1);
            }
            process.exit(0);
          } catch (err) {
            logger.error(err instanceof Error ? err.message : String(err));
            process.exit(2);
          }
        },
      );

    program
      .command('test')
      .description(
        'Test Quality score (0-100, lower = more issues). Runs the four `test/*` rules across test files. Use --strict to exit 1 on any test issue (CI gate).',
      )
      .option('--format <pretty|json>', 'output format', 'pretty')
      .option('--strict', 'exit 1 on any test issue (CI gate)', false)
      .action(
        async (cmdOptions: { format?: 'pretty' | 'json'; strict?: boolean }, command: Command) => {
          try {
            const options = command.optsWithGlobals() as CliGlobalOptions & {
              format?: string;
            };
            const rawFormat = options.format ?? cmdOptions.format ?? 'pretty';
            const format: 'pretty' | 'json' =
              rawFormat === 'json' || rawFormat === 'pretty' ? rawFormat : 'pretty';

            const cwd = resolve(options.workspace ?? process.cwd());
            const { config } = await runScan({ ...options, workspace: cwd });
            const { result } = await runTestScan(cwd, config, { strict: options.strict });
            logger.info(formatTestReport(result, { json: format === 'json' }));
            process.exit(testExitCode(result));
          } catch (err) {
            logger.error(err instanceof Error ? err.message : String(err));
            process.exit(2);
          }
        },
      );

    program
      .command('architecture')
      .description(
        'compute the Architecture Consistency Score (0-100) — one number for cross-file pattern duplication',
      )
      .option('--format <pretty|json>', 'output format', 'pretty')
      .option('--max-files <n>', 'cap on files scanned', parseCount, 500)
      .action(
        async (cmdOptions: { format?: 'pretty' | 'json'; maxFiles?: number }, command: Command) => {
          try {
            const options = command.optsWithGlobals() as CliGlobalOptions & {
              format?: string;
            };
            const rawFormat = options.format ?? cmdOptions.format ?? 'pretty';
            const format: 'pretty' | 'json' =
              rawFormat === 'json' || rawFormat === 'pretty' ? rawFormat : 'pretty';

            const cwd = resolve(options.workspace ?? process.cwd());
            const { config } = await runScan({ ...options, workspace: cwd });
            const score = await buildArchitectureScore(cwd, config, cmdOptions.maxFiles);
            const out =
              format === 'json' ? JSON.stringify(score, null, 2) : formatArchitectureScore(score);
            logger.info(out);
            process.exit(0);
          } catch (err) {
            logger.error(err instanceof Error ? err.message : String(err));
            process.exit(2);
          }
        },
      );

    program
      .command('business-logic')
      .description(
        'Business Logic Coherence (0-100) — flag pricing/validation/formatting anti-patterns AI generates disproportionately',
      )
      .option('--format <text|json|markdown>', 'output format', 'text')
      .option('--max-files <n>', 'cap on files scanned', parseCount, 500)
      .action(
        async (cmdOptions: { format?: string; maxFiles?: number }, command: Command) => {
          try {
            const options = command.optsWithGlobals() as CliGlobalOptions & {
              format?: string;
            };
            // Subcommand-local --format collides with the global scan
            // --format in Commander. Mirror `drift` / `pr` precedence:
            // global wins if the user typed the global flag explicitly.
            const rawFormat = options.format ?? cmdOptions.format ?? 'text';
            const format: BusinessLogicFormat =
              rawFormat === 'json' || rawFormat === 'markdown' || rawFormat === 'text'
                ? (rawFormat as BusinessLogicFormat)
                : 'text';

            const cwd = resolve(options.workspace ?? process.cwd());
            const { config } = await runScan({ ...options, workspace: cwd });
            const result = await runBusinessLogicScan(cwd, config, {
              maxFiles: cmdOptions.maxFiles,
            });
            logger.info(formatBusinessLogicScan(result, { format }));
            process.exit(businessLogicExitCode(result));
          } catch (err) {
            logger.error(err instanceof Error ? err.message : String(err));
            process.exit(2);
          }
        },
      );

    program
      .command('maintenance-cost')
      .description(
        'AI Maintenance Cost — categorical (low | medium | high | critical) meta-score derived from existing slopbrick signals. Anchored to Sonar $306K/yr/MLoC + CodeClimate grade→minutes + AI multiplier (1.5–2.5×).',
      )
      .option('--format <text|json>', 'output format', 'text')
      .option('--strict', 'exit 1 on high/critical bucket (CI gate)', false)
      .option('--max-files <n>', 'cap on files scanned (drift re-run)', parseCount, 500)
      .action(
        async (
          cmdOptions: { format?: string; strict?: boolean; maxFiles?: number },
          command: Command,
        ) => {
          try {
            const options = command.optsWithGlobals() as CliGlobalOptions & {
              format?: string;
            };
            const rawFormat = options.format ?? cmdOptions.format ?? 'text';
            const format: 'text' | 'json' =
              rawFormat === 'json' || rawFormat === 'text' ? rawFormat : 'text';
            const strict = options.strict ?? cmdOptions.strict ?? false;

            const cwd = resolve(options.workspace ?? process.cwd());
            const { config } = await runScan({ ...options, workspace: cwd });
            const result = await runMaintenanceCostScan(cwd, config, {
              maxFiles: cmdOptions.maxFiles,
              strict,
            });
            logger.info(formatMaintenanceCostReport(result, { json: format === 'json' }));
            process.exit(maintenanceCostExitCode(result, { strict }));
          } catch (err) {
            logger.error(err instanceof Error ? err.message : String(err));
            process.exit(2);
          }
        },
      );

    program
      .command('docs')
      .description(
        'Documentation Freshness (0-100) — detect stale package / function / code-example references and broken links in markdown. Anchored to arXiv 2606.04769 F1=96.73% (June 2026) as the calibration floor.',
      )
      .option('--format <text|json|markdown>', 'output format', 'text')
      .option('--strict', 'exit 1 on high/critical drift (CI gate)', false)
      .option('--max-files <n>', 'cap on doc files scanned', parseCount, 500)
      .action(
        async (
          cmdOptions: { format?: string; strict?: boolean; maxFiles?: number },
          command: Command,
        ) => {
          try {
            const options = command.optsWithGlobals() as CliGlobalOptions & {
              format?: string;
            };
            const rawFormat = options.format ?? cmdOptions.format ?? 'text';
            const format: 'text' | 'json' | 'markdown' =
              rawFormat === 'json' || rawFormat === 'markdown' || rawFormat === 'text'
                ? (rawFormat as 'text' | 'json' | 'markdown')
                : 'text';
            const strict = options.strict ?? cmdOptions.strict ?? false;

            const cwd = resolve(options.workspace ?? process.cwd());
            const { config } = await runScan({ ...options, workspace: cwd });
            const result = await runDocsScan(cwd, config, {
              maxDocFiles: cmdOptions.maxFiles,
              strict,
            });
            logger.info(
              formatDocsReport(result, {
                json: format === 'json',
                markdown: format === 'markdown',
              }),
            );
            process.exit(docsExitCode(result, { strict }));
          } catch (err) {
            logger.error(err instanceof Error ? err.message : String(err));
            process.exit(2);
          }
        },
      );

    program
      .command('db')
      .description(
        'Database Health (0-100) — static-only Postgres analysis via pgsql-parser (libpg_query port). 6 rules: missing-fk-index, duplicate-index, missing-not-null, enum-sprawl, naming-inconsistency, sql-concat.',
      )
      .option('--format <text|json|markdown>', 'output format', 'text')
      .option('--strict', 'exit 1 on high/critical drift (CI gate)', false)
      .option('--max-files <n>', 'cap on files scanned', parseCount, 500)
      .action(
        async (
          cmdOptions: { format?: string; strict?: boolean; maxFiles?: number },
          command: Command,
        ) => {
          try {
            const options = command.optsWithGlobals() as CliGlobalOptions & {
              format?: string;
            };
            const rawFormat = options.format ?? cmdOptions.format ?? 'text';
            const format: 'text' | 'json' | 'markdown' =
              rawFormat === 'json' || rawFormat === 'markdown' || rawFormat === 'text'
                ? (rawFormat as 'text' | 'json' | 'markdown')
                : 'text';
            const strict = options.strict ?? cmdOptions.strict ?? false;

            const cwd = resolve(options.workspace ?? process.cwd());
            const { config } = await runScan({ ...options, workspace: cwd });
            const result = await runDbScan(cwd, config, {
              maxFiles: cmdOptions.maxFiles,
              strict,
            });
            logger.info(
              formatDbReport(result, {
                json: format === 'json',
                markdown: format === 'markdown',
              }),
            );
            process.exit(dbExitCode(result, { strict }));
          } catch (err) {
            logger.error(err instanceof Error ? err.message : String(err));
            process.exit(2);
          }
        },
      );

    program
      .command('patterns')
      .description(
        'Pattern Fragmentation (0-100) — count distinct UI/architectural patterns per category. Feeds slop_suggest\'s doNotCreate list.',
      )
      .option('--format <text|json|markdown>', 'output format', 'text')
      .option('--max-files <n>', 'cap on files scanned', parseCount, 500)
      .action(
        async (cmdOptions: { format?: string; maxFiles?: number }, command: Command) => {
          try {
            const options = command.optsWithGlobals() as CliGlobalOptions & {
              format?: string;
            };
            const rawFormat = options.format ?? cmdOptions.format ?? 'text';
            const format: 'text' | 'json' | 'markdown' =
              rawFormat === 'json' || rawFormat === 'markdown' || rawFormat === 'text'
                ? (rawFormat as 'text' | 'json' | 'markdown')
                : 'text';

            const cwd = resolve(options.workspace ?? process.cwd());
            const { config } = await runScan({ ...options, workspace: cwd });
            const result = await runPatternsScan(cwd, config, {
              maxFiles: cmdOptions.maxFiles,
              format: format as 'text' | 'json' | 'markdown',
            });
            // PatternScanResult bundles its own format selection;
            // the CLI --format flag is forwarded via runPatternsScan options.
            logger.info(formatPatternsReport(result));
            process.exit(patternsExitCode(result));
          } catch (err) {
            logger.error(err instanceof Error ? err.message : String(err));
            process.exit(2);
          }
        },
      );

    program
      .command('mcp')
      .description('MCP server for AI agents (JSON-RPC 2.0 over stdio)')
      .action(() => {
        runMcpServer(process.stdin, process.stdout, process.cwd()).catch((err) => {
          logger.error(err instanceof Error ? err.message : String(err));
          process.exit(2);
        });
      });

    program
      .command('doctor')
      .description('check your setup, config, and environment for common problems')
      .action(async () => {
        const exitCode = await runDoctor(process.cwd());
        if (exitCode !== 0) process.exit(exitCode);
      });

    program
    program
      .command('watch')
      .description('re-run scan on every file change. Flags new violations as you write. The LockBrick prevention loop entry.')
      .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
        const rawGlobals = command.optsWithGlobals() as CliGlobalOptions & { increase?: boolean };
        const options: CliGlobalOptions = {
          ...rawGlobals,
          noIncrease: rawGlobals.increase === false,
        };
        const cwd = resolve(options.workspace ?? process.cwd());
        const { watchProject } = await import('./scan.js') as typeof import('./scan.js');
        // Run an initial scan to populate the report + write the .slopbrick/
        // artifacts, then `watchProject` keeps the report in sync as files
        // change. The first scan is mandatory — without it the watcher
        // would diff against an empty baseline and report every file as new.
        await scanAction([], options, command);
        await watchProject(options, cwd, []);
      });

    program
      .command('lock')
      .description('install a Git pre-commit hook that runs `slopbrick scan --staged` on every commit. The LockBrick prevention loop: block AI-introduced slop from ever reaching the repo.')
      .option('--uninstall', 'remove the pre-commit hook instead of installing it')
      .option('--husky', 'force-install under .husky/pre-commit (Husky v9). Default auto-detects via .husky/ dir.')
      .option('--workspace <path>', 'workspace directory', process.cwd())
      .action(
        (cmdOptions: { uninstall?: boolean; husky?: boolean; workspace?: string }) => {
          const cwd = resolve(cmdOptions.workspace ?? process.cwd());
          const { installHook, uninstallHook } =
            require('./installer.js') as typeof import('./installer.js');
          if (cmdOptions.uninstall) {
            const result = uninstallHook(cwd);
            logger.info(result.message);
            if (!result.ok) process.exit(1);
            return;
          }
          const result = installHook(cwd);
          if (result.ok) {
            logger.info(result.message);
            logger.info('Every commit will now run `slopbrick scan --staged` before the commit is created.');
            logger.info('Bypass with `git commit --no-verify` (not recommended).');
          } else {
            logger.warn(result.message);
            process.exit(1);
          }
        },
      );

    program
      .command('ci')
      .description('CI gate: run a scan and exit 1 on constitution violations, threshold breach, or new issues since the last run. Use this in GitHub Actions / GitLab CI.')
      .option('--max-slop <n>', 'exit 1 if slopIndex exceeds this number', parseCount)
      .option('--max-new-issues <n>', 'exit 1 if new issues (vs .slop-audit-cache.json) exceed this number', parseCount)
      .option('--strict-constitution', 'exit 1 on any constitution violation')
      .option('--format <pretty|json>', 'output format', 'json')
      .action(
        async (
          cmdOptions: {
            maxSlop?: number;
            maxNewIssues?: number;
            strictConstitution?: boolean;
            format?: string;
          },
          command: Command,
        ) => {
          const globals = command.optsWithGlobals() as CliGlobalOptions & { increase?: boolean };
          const options: CliGlobalOptions = {
            ...globals,
            noIncrease: true,                  // force fail on increase
            changed: true,                     // scan only changed files
            format: (cmdOptions.format ?? 'json') as 'pretty' | 'json' | 'sarif' | 'html',
          };
          const cwd = resolve(options.workspace ?? process.cwd());
          await scanAction([], options, command);
          // After the scan, read .slopbrick/health.json to gate.
          const { loadHealth } = await import('@usebrick/core') as typeof import('@usebrick/core');
          const health = loadHealth(cwd);
          if (!health) {
            logger.warn('No .slopbrick/health.json — `slopbrick ci` requires a prior `slopbrick scan`.');
            process.exit(1);
          }
          let exitCode = 0;
          // v0.15.0 U.4: --max-slop now gates on the composite
          // repositoryHealth (the v3 replacement for slopIndex).
          // Because repositoryHealth is "higher = better" while
          // --max-slop is "fail if higher than N" (legacy semantics
          // were "fail if slopIndex > N" where lower is better), we
          // invert the comparison so users see the same behavior.
          // TODO(U.5): replace --max-slop with --min-repository-health.
          if (cmdOptions.maxSlop !== undefined) {
            const maxInverse = 100 - cmdOptions.maxSlop;
            if (health.repositoryHealth < maxInverse) {
              logger.warn(`repositoryHealth ${health.repositoryHealth} < ${cmdOptions.maxSlop} (max-slop)`);
              exitCode = 1;
            }
          }
          if (cmdOptions.strictConstitution && (health.constitutionDrift ?? 0) > 0) {
            logger.warn(`${health.constitutionDrift} constitution violation(s) detected`);
            exitCode = 1;
          }
          if (exitCode === 0) {
            logger.info(`CI gate passed: repositoryHealth=${health.repositoryHealth}, constitutionDrift=${health.constitutionDrift ?? 0}`);
          }
          process.exit(exitCode);
        },
      );

    program
      .command('memory')
      .description('show or regenerate .slopbrick/structure.md (the agent-readable repository summary) without re-scanning')
      .option('--show', 'print the current .slopbrick/structure.md to stdout (default if no flag is passed)')
      .option('--regenerate', 're-render structure.md from the existing inventory.json + constitution.json (no scan)')
      .option('--workspace <path>', 'workspace directory', process.cwd())
      .action(
        async (cmdOptions: { show?: boolean; regenerate?: boolean; workspace?: string }) => {
          const cwd = resolve(cmdOptions.workspace ?? process.cwd());
          // Dynamic import — survives esbuild's CJS bundling. The migrate
          // command uses `require('./migrate.js')` because that's a relative
          // path esbuild bundles. We need the same here.
          const { renderStructureMarkdown, readStructureMarkdown, writeStructureMarkdown } =
            await import('../engine/structure-md.js') as typeof import('../engine/structure-md.js');
          const { loadInventory, loadConstitution, inventoryPath: invPath, constitutionPath: conPath } =
            await import('@usebrick/core') as typeof import('@usebrick/core');

          if (cmdOptions.regenerate) {
            // Re-render from existing artifacts — no AST re-parse.
            const inv = loadInventory(cwd);
            const con = loadConstitution(cwd);
            if (!inv) {
              logger.warn(`No .slopbrick/inventory.json at ${invPath(cwd)}. Run \`slopbrick scan\` first.`);
              process.exit(1);
            }
            if (!con) {
              logger.warn(`No .slopbrick/constitution.json at ${conPath(cwd)}. Run \`slopbrick scan\` first.`);
              process.exit(1);
            }
            const md = renderStructureMarkdown(inv, con);
            await writeStructureMarkdown(cwd, md);
            logger.info(`Regenerated .slopbrick/structure.md (${md.length} bytes from inventory + constitution).`);
            return;
          }

          // Default: --show
          const md = await readStructureMarkdown(cwd);
          if (md === null) {
            logger.warn(`No .slopbrick/structure.md at ${cwd}/.slopbrick/structure.md. Run \`slopbrick scan\` to generate it, or pass --regenerate after a prior scan.`);
            process.exit(1);
          }
          process.stdout.write(md + '\n');
        },
      );

    program
      .command('migrate')
      .description(
        'Migrate from slop-audit v0.10.x (.slop-audit/) to slopbrick v0.11.0+ (.slopbrick/). Renames artifact dir + cache + config file + bumps schema to v2 + updates .gitignore. Idempotent. Pass --dry-run to preview.',
      )
      .option('--dry-run', 'print the planned changes without touching the filesystem')
      .option('--force', 'overwrite .slopbrick/ if both old and new artifacts exist')
      .option('--workspace <path>', 'workspace directory', process.cwd())
      .option('--format <pretty|json>', 'output format', 'pretty')
      .action(
        (
          cmdOptions: { dryRun?: boolean; force?: boolean; workspace?: string; format?: string },
          command: Command,
        ) => {
          const globals = command.optsWithGlobals() as { format?: string };
          const format: 'pretty' | 'json' =
            (cmdOptions.format ?? globals.format) === 'json' ? 'json' : 'pretty';
          const cwd = resolve(cmdOptions.workspace ?? process.cwd());
          const { runMigrate, formatMigrate } = require('./migrate.js') as typeof import('./migrate.js');
          const result = runMigrate({
            workspace: cwd,
            dryRun: cmdOptions.dryRun,
            force: cmdOptions.force,
          });
          if (format === 'json') {
            logger.info(JSON.stringify(result, null, 2));
          } else {
            logger.info(formatMigrate(result));
          }
          process.exit(result.ok ? 0 : 1);
        },
      );

    program
      .command('rules')
      .description('list all built-in rules with their categories, severities, and descriptions')
      .option('--category <name>', 'filter to a single category (visual, typo, layout, etc.)')
      .option('--ai-only', 'only show AI-specific rules')
      .option('--json', 'emit JSON instead of a pretty table')
      // category-grouped listing. Sorted by ratio descending (worst signal
      // first) so noisy rules surface to the top.
      .option('--show-signal-strength', 'print per-rule precision/recall table')
      .action((
        cmdOptions: { category?: string; aiOnly?: boolean; json?: boolean; showSignalStrength?: boolean },
        command: Command,
      ) => {
        // The global `--json [path]` flag shadows the local `--json` here
        // (commander limitation when both exist). Use optsWithGlobals() so
        // we honor either source.
        const globals = command.optsWithGlobals() as { json?: string | boolean };
        const wantJson = Boolean(cmdOptions.json || globals.json);
        let rules = [...builtinRules];
        if (cmdOptions.category) {
          rules = rules.filter((r) => r.category === cmdOptions.category);
        }
        if (cmdOptions.aiOnly) {
          rules = rules.filter((r) => r.aiSpecific);
        }
        if (cmdOptions.showSignalStrength) {
          const strengths = loadSignalStrength();
          const rows = rules
            .map((r) => ({
              id: r.id,
              category: r.category,
              severity: r.severity,
              aiSpecific: r.aiSpecific,
              strength: strengths[r.id],
            }))
            .sort((a, b) => {
              // Sort by ratio descending (nulls last). Worst signals first.
              const ra = a.strength?.ratio ?? -1;
              const rb = b.strength?.ratio ?? -1;
              return rb - ra;
            });
          if (wantJson) {
            logger.info(JSON.stringify(rows, null, 2));
            return;
          }
          const lines: string[] = [];
          lines.push(`slopbrick signal-strength — ${rows.length} rules (worst signal first)\n`);
          lines.push('  rule id                                  precision  recall  fpRate  ratio   notes');
          lines.push('  ---------------------------------------  ---------  ------  ------  ------  -----');
          for (const row of rows) {
            const s = row.strength;
            const precision = s ? (s.precision * 100).toFixed(0).padStart(7) + '%' : '    n/a ';
            const recall = s ? s.recall.toFixed(2).padStart(6) : '   n/a';
            const fpRate = s ? s.fpRate.toFixed(2).padStart(6) : '   n/a';
            const ratio = s ? (s.ratio >= 99 ? '   ∞×  ' : s.ratio.toFixed(2).padStart(5) + '×') : '  n/a ';
            const tag = !s ? 'no calibration data' : !isReliableSignal(s) ? '⚠ low signal' : 'ok';
            lines.push(`  ${row.id.padEnd(39)} ${precision}  ${recall}  ${fpRate}  ${ratio}  ${tag}`);
          }
          logger.info(lines.join('\n'));
          return;
        }
        if (wantJson) {
          logger.info(
            JSON.stringify(
              rules.map((r) => ({
                id: r.id,
                category: r.category,
                severity: r.severity,
                aiSpecific: r.aiSpecific,
                description: r.description ?? '(no description)',
              })),
              null,
              2,
            ),
          );
          return;
        }
        // Pretty table grouped by category.
        const byCategory = new Map<string, typeof rules>();
        for (const r of rules) {
          if (!byCategory.has(r.category)) byCategory.set(r.category, []);
          byCategory.get(r.category)!.push(r);
        }
        const lines: string[] = [];
        lines.push(`slopbrick rules — ${rules.length} of ${builtinRules.length} shown\n`);
        for (const [cat, list] of [...byCategory.entries()].sort()) {
          lines.push(`\n## ${cat} (${list.length})`);
          for (const r of list.sort((a, b) => a.id.localeCompare(b.id))) {
            const sev = r.severity.padEnd(8);
            const tag = r.aiSpecific ? '[AI]' : '     ';
            lines.push(`  ${sev} ${tag} ${r.id}`);
            if (r.description) lines.push(`           ${r.description}`);
          }
        }
        logger.info(lines.join('\n'));
      });

    program
      .command('explain <ruleId>')
      .description('Print rationale, pattern, and remediation for a single rule')
      .action((ruleId: string) => {
        const result = explainRule(ruleId, builtinRules, RULE_HINTS);
        logger.info(formatExplain(result));
        if ('error' in result) process.exit(2);
      });

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
    program
      .command('validate-config [path]')
      .description('Statically validate a slopbrick.config.mjs without scanning')
      .action(async (configPath: string | undefined) => {
        const path = configPath
          ? resolve(configPath)
          : resolve(process.cwd(), 'slopbrick.config.mjs');
        if (!existsSync(path)) {
          logger.error(`Error: config file not found: ${path}`);
          process.exit(2);
        }
        try {
          // The same loader used by `scan` — preserves all .mjs/.cjs/.js
          // semantics from src/config.ts.
          const mod = extname(path) === '.cjs'
            ? require(path)
            : (await import(path));
          const userConfig = (mod as { default?: unknown }).default ?? mod;
          const result = validateConfigSchema(userConfig);
          if (result.errors.length === 0) {
            logger.info(`✓ ${path}`);
            if (result.warnings.length === 0) {
              logger.info('  No issues found.');
            } else {
              logger.info(`  ${result.warnings.length} warning(s):`);
              for (const w of result.warnings) {
                logger.info(`  ! ${w}`);
              }
            }
            process.exit(0);
          }
          logger.info(formatConfigValidationErrors(path, result.errors, result.warnings));
          process.exit(1);
        } catch (err) {
          if (err instanceof ConfigValidationError) {
            logger.info(err.message);
            process.exit(1);
          }
          logger.error(`Error: failed to load ${path}: ${(err as Error).message}`);
          process.exit(2);
        }
      });

    program
      .command('tokens <path>')
      .description('Ingest a W3C DTCG tokens.json file and summarize it by category')
      .action((tokenPath: string) => {
        const result = readDtcgTokensFile(tokenPath);
        if (!result.ok) {
          logger.error(`Error: ${result.error}`);
          process.exit(2);
        }
        const summary = summarizeTokens(result.tree);
        logger.info(formatSummary(summary));
      });

    program
      .command('report <path>')
      .description('Re-render a saved JSON report (from --json path.json)')
      .option('--output-format <kind>', 'output format: pretty | json | markdown', 'pretty')
      .action((reportPath: string, cmdOptions: { outputFormat?: string }) => {
        const result = readReportFile(reportPath);
        if (!result.ok) {
          logger.error(`Error: ${result.error}`);
          process.exit(2);
        }
        const fmt = cmdOptions.outputFormat ?? 'pretty';
        if (fmt === 'json') {
          logger.info(formatJson(result.report));
        } else if (fmt === 'markdown') {
          logger.info(`Re-rendered from ${reportPath}\n\n${formatMarkdown(result.report)}`);
        } else {
          logger.info(formatReportFromFile(result.report, reportPath));
        }
      });

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