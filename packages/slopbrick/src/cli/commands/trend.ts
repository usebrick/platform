import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { buildTrend, trendToText, trendToMarkdown } from '../../engine/trend';
import { parseCount } from '../options.js';

/**
 * v0.18.x (R-H1): trend subcommand extracted from cli/program.ts.
 *
 * AI Slop Score over time, from `.slopbrick/flywheel/scans.jsonl`.
 *
 * Since v0.21.0, AI Slop Score is raw amount of slop (lower = cleaner).
 * The "delta" semantics in this command's output flip accordingly:
 * a NEGATIVE delta (score went down) means cleaner, POSITIVE means worse.
 *
 * Renamed from `--format` to `--render` here (same as the original
 * inline action): a global `--format` option collides with this
 * subcommand's option and Commander silently drops the value.
 */
export function registerTrend(program: Command): void {
  program
    .command('trend')
    .description('AI Slop Score over time, from .slopbrick/flywheel/scans.jsonl (lower = cleaner since v0.21)')
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
          logger.info(// v0.42.0: the legacy 'Slop Index increased' message implied higher
          // = worse, which is the v0.15-v0.20.1 inverted reading. Since v0.21,
          // AI Slop Score is lower-is-better; an INCREASE is worse, but
          // the warning should say "AI Slop Score got worse" or just
          // "delta went up" so users don't have to remember the direction.
          `Warning: AI Slop Score got worse by ${report.delta.toFixed(1)} points over this period (lower = cleaner since v0.21).`);
        }
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(2);
      }
    });
}
