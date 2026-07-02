import { resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { runScan } from '../scan.js';
import type { CliGlobalOptions } from '../scan.js';
import { runDocsScan, formatDocsReport, docsExitCode } from '../docs';
import { parseCount } from '../options.js';

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
}
