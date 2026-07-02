import { resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { runScan } from '../scan.js';
import type { CliGlobalOptions } from '../scan.js';
import { runDrift, formatDrift, driftExitCode } from '../drift';
import { parseCount } from '../options.js';

/**
 * v0.18.x (R-H1): drift subcommand extracted from cli/program.ts.
 *
 * Detect imports that violate the declared constitution (state,
 * data-fetching, UI, forms, styling, routing) or import forbidden
 * packages. Runs a scan first to load the config, then runs the
 * drift detector against it.
 *
 * Same `--format` collision as `trend`: read from merged opts
 * because the global scan --format shadowed the subcommand's
 * local option in Commander.
 */
export function registerDrift(program: Command): void {
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
}
