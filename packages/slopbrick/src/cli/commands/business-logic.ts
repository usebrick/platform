import { resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { runScan } from '../scan.js';
import type { CliGlobalOptions } from '../scan.js';
import {
  runBusinessLogicScan,
  formatBusinessLogicScan,
  businessLogicExitCode,
  type BusinessLogicFormat,
} from '../business-logic';
import { parseCount } from '../options.js';

/**
 * v0.18.x (R-H1): business-logic subcommand extracted from cli/program.ts.
 *
 * Business Logic Coherence (0-100) — flag pricing/validation/
 * formatting anti-patterns AI generates disproportionately.
 */
export function registerBusinessLogic(program: Command): void {
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
}
