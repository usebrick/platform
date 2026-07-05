import { resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { runScan } from '../scan.js';
import type { CliGlobalOptions } from '../scan.js';
import {
  runPrScan,
  runPrScanFromDiffFile,
  formatPrReport,
  prExitCode,
} from '../pr';
import type { PrFormat } from '../pr';
import { parseCount, parseThreshold } from '../options.js';

/**
 * v0.18.x (R-H1): pr subcommand extracted from cli/program.ts.
 *
 * Score the slop cost of the current PR. Compares --base (default
 * main) to --head (default HEAD), scans only changed source files,
 * returns a single weighted score. Exits 1 when score > --threshold
 * (default 20).
 *
 * The global scan --format <pretty|json|sarif|html> shadowed the
 * subcommand's local --format option in Commander: the value ends
 * up in `options.format` (global) and `cmdOptions.format` (local)
 * keeps its default. Mirror the drift subcommand's pattern — read
 * global first, then fall back to the local value.
 */
export function registerPr(program: Command): void {
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
    // v0.42.0 (Sprint 3, §3c.1): accept a unified-diff file as the
    // change list. Used by `slopbrick-review.yml` to score PRs that
    // triggered on `pull_request opened`. Bypasses git refs entirely
    // so the action works on shallow clones and forks. Mutually
    // exclusive with `--base`/`--head`.
    .option('--diff <file>', 'unified-diff file (overrides --base/--head; meant for CI/Action use)')
    .action(
      async (
        cmdOptions: {
          base?: string;
          head?: string;
          format?: string;
          threshold?: number;
          maxFiles?: number;
          diff?: string;
        },
        command: Command,
      ) => {
        try {
          const options = command.optsWithGlobals() as CliGlobalOptions & {
            format?: string;
          };
          const cwd = resolve(options.workspace ?? process.cwd());
          const rawFormat = options.format ?? cmdOptions.format ?? 'text';
          const format: PrFormat =
            rawFormat === 'json' || rawFormat === 'markdown' || rawFormat === 'text'
              ? (rawFormat as PrFormat)
              : 'text';

          const { config } = await runScan({ ...options, workspace: cwd });
          const result = cmdOptions.diff
            ? await runPrScanFromDiffFile(cwd, config, cmdOptions.diff, {
                format,
                threshold: cmdOptions.threshold,
                maxFiles: cmdOptions.maxFiles,
              })
            : await runPrScan(cwd, config, {
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
}
