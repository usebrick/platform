import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { buildTrend, trendToText, trendToMarkdown } from '../../engine/trend';
import { parseCount } from '../options.js';

/**
 * v0.18.x (R-H1): trend subcommand extracted from cli/program.ts.
 *
 * Slop Index over time, from `.slopbrick/flywheel/scans.jsonl`.
 *
 * Renamed from `--format` to `--render` here (same as the original
 * inline action): a global `--format` option collides with this
 * subcommand's option and Commander silently drops the value.
 */
export function registerTrend(program: Command): void {
  program
    .command('trend')
    .description('Slop Index over time, from .slopbrick/flywheel/scans.jsonl')
    .option('--max-points <n>', 'how many recent scans to plot', parseCount, 30)
    .option('--render <kind>', 'output rendering: text | markdown', 'text')
    .action((cmdOptions) => {
      try {
        const cwd = process.cwd();
        const report = buildTrend(cwd, cmdOptions.maxPoints);
        const out = cmdOptions.render === 'markdown' ? trendToMarkdown(report) : trendToText(report);
        logger.info(out);
        if (report.delta > 1) {
          logger.info('');
          logger.info('Warning: Slop Index increased by ' + report.delta.toFixed(1) + ' points over this period.');
        }
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(2);
      }
    });
}
