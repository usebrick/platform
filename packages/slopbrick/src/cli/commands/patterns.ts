import { resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { runScan, type CliGlobalOptions } from '../scan.js';
import {
  runPatternsScan,
  formatPatternsReport,
  patternsExitCode,
} from '../patterns';
import { parseCount } from '../options.js';

/**
 * v0.18.x (R-H1): patterns subcommand extracted from cli/program.ts.
 *
 * Pattern Fragmentation (0-100) — count distinct UI/architectural
 * patterns per category. Feeds `slop_suggest`'s `doNotCreate` list.
 */
export function registerPatterns(program: Command): void {
  program
    .command('patterns')
    .description(
      "Pattern Fragmentation (0-100) — count distinct UI/architectural patterns per category. Feeds slop_suggest's doNotCreate list.",
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
}
