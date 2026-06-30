import { resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { runScan, type CliGlobalOptions } from '../scan.js';
import {
  runMaintenanceCostScan,
  formatMaintenanceCostReport,
  maintenanceCostExitCode,
} from '../maintenance-cost';
import { parseCount } from '../options.js';

/**
 * v0.18.x (R-H1): maintenance-cost subcommand extracted from
 * cli/program.ts.
 *
 * AI Maintenance Cost — categorical (low | medium | high | critical)
 * meta-score derived from existing slopbrick signals. Anchored to
 * Sonar $306K/yr/MLoC + CodeClimate grade→minutes + AI multiplier
 * (1.5–2.5×).
 */
export function registerMaintenanceCost(program: Command): void {
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
}
