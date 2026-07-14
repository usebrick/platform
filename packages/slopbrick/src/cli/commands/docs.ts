import { resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { runScan } from '../scan.js';
import type { CliGlobalOptions } from '../scan.js';
import { runDocsScan, formatDocsReport, formatDocsNotApplicable, docsExitCode } from '../docs';
import { parseCount } from '../options.js';
import { renderInvalidScan } from './_shared.js';
import { isGitScopedEmptySelection, isIncompleteScan } from '../../report/scan-validity.js';

/**
 * v0.18.x (R-H1): docs subcommand extracted from cli/program.ts.
 *
 * Documentation Freshness (0-100) — detect stale package / function
 * / code-example references and broken links in markdown. Anchored
 * to arXiv 2606.04769 F1=96.73% (June 2026) as the calibration
 * floor.
 */
export function registerDocs(program: Command): void {
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
          const bootstrap = await runScan({ ...options, workspace: cwd });
          const result = await runDocsScan(cwd, bootstrap.config, {
            maxDocFiles: cmdOptions.maxFiles,
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
              ['docFreshness', 'docDrift', 'docFindings'],
            );
            if (invalidExitCode !== undefined) {
              process.exit(invalidExitCode);
              return;
            }
          }
          if (result.result.scannedDocFiles === 0) {
            logger.info(formatDocsNotApplicable(result, {
              json: format === 'json',
              markdown: format === 'markdown',
            }));
            process.exit(1);
            return;
          }
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
}
