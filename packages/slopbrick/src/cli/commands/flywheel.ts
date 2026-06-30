import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { readTelemetry } from '../../engine/telemetry';
import { formatFlywheel, summarizeTelemetry } from '../../report/flywheel';
import type { CliGlobalOptions } from '../scan.js';

/**
 * v0.18.x (R-H1): flywheel subcommand extracted from cli/program.ts.
 *
 * Summarize aggregated scan telemetry (the `.slopbrick/flywheel/`
 * directory written by each scan). Reads the telemetry, summarizes
 * it, prints to stdout in pretty or JSON, or exports the summary
 * to a file via --export.
 */
export function registerFlywheel(program: Command): void {
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
}
