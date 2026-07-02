import { resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { runScan } from '../scan.js';
import type { CliGlobalOptions } from '../scan.js';
import { runDbScan, formatDbReport, dbExitCode } from '../db';
import { parseCount } from '../options.js';

/**
 * v0.18.x (R-H1): db subcommand extracted from cli/program.ts.
 *
 * Database Health (0-100) — static-only Postgres analysis via
 * pgsql-parser (libpg_query port). 6 rules: missing-fk-index,
 * duplicate-index, missing-not-null, enum-sprawl, naming-inconsistency,
 * sql-concat.
 */
export function registerDb(program: Command): void {
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
}
