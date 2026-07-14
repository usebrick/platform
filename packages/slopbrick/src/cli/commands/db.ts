import { resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { runScan } from '../scan.js';
import type { CliGlobalOptions } from '../scan.js';
import { runDbScan, formatDbReport, formatDbNotApplicable, dbExitCode } from '../db';
import { parseCount } from '../options.js';
import { renderInvalidScan } from './_shared.js';
import { isGitScopedEmptySelection, isIncompleteScan } from '../../report/scan-validity.js';

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
          const bootstrap = await runScan({ ...options, workspace: cwd });
          const result = await runDbScan(cwd, bootstrap.config, {
            maxFiles: cmdOptions.maxFiles,
            strict,
          });
          // A partial canonical scan is never a valid basis for a domain
          // score. An ordinary empty canonical scan, however, can still be
          // useful to a domain command when that domain has its own files
          // (for example docs-only workspaces). The domain denominator below
          // is therefore authoritative for the empty case.
          if (isGitScopedEmptySelection(bootstrap.report, options) || isIncompleteScan(bootstrap.report)) {
            const invalidExitCode = renderInvalidScan(
              bootstrap.report,
              { ...options, format: format === 'json' ? 'json' : 'pretty' },
              cwd,
              format === 'json' ? 'json' : undefined,
              ['dbHealth', 'dbDrift', 'dbFindings'],
            );
            if (invalidExitCode !== undefined) {
              process.exit(invalidExitCode);
              return;
            }
          }
          if (result.result.scannedSqlFiles + result.result.scannedTsFiles === 0) {
            logger.info(formatDbNotApplicable(result, {
              json: format === 'json',
              markdown: format === 'markdown',
            }));
            process.exit(1);
            return;
          }
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
