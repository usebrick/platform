import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { calibrate, reportToMarkdown } from '../../research';
import { POSITIVE_DIR, NEGATIVE_DIR } from '../../corpus-paths';
import { parseCount } from '../options.js';

/**
 * v0.18.x (R-H1): calibrate subcommand extracted from cli/program.ts.
 *
 * Empirical precision/recall/F1 calibration from held-out positive
 * (AI-generated) and negative (real human) corpora. Writes the
 * markdown report to a configurable output path.
 */
export function registerCalibrate(program: Command): void {
  program
    .command('calibrate')
    .description('empirical precision/recall/F1 calibration from held-out positive and negative corpora')
    .option('--positive-dir <path>', 'path to positive (AI-generated) corpus', POSITIVE_DIR)
    .option('--negative-dir <path>', 'path to negative (real human) corpus', NEGATIVE_DIR)
    .option('--positive-limit <n>', 'limit positive files scanned', parseCount)
    .option('--negative-limit <n>', 'limit negative files scanned', parseCount)
    .option('--output <path>', 'markdown output path', 'corpus/calibration-empirical.md')
    .action(async (cmdOptions) => {
      try {
        const cwd = process.cwd();
        const report = await calibrate(cwd, {
          positiveDir: cmdOptions.positiveDir,
          negativeDir: cmdOptions.negativeDir,
          positiveLimit: cmdOptions.positiveLimit,
          negativeLimit: cmdOptions.negativeLimit,
        });
        const outputPath = cmdOptions.output
          ? resolve(cwd, cmdOptions.output)
          : resolve(cwd, 'corpus', 'calibration-empirical.md');
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, reportToMarkdown(report), 'utf8');
        logger.info(
          'Calibrated ' +
            report.rules.length +
            ' rules across ' +
            report.positiveFileCount +
            ' positive + ' +
            report.negativeFileCount +
            ' negative files.',
        );
        const strong = report.rules.filter((r) => r.signal === 'strong').length;
        const weak = report.rules.filter((r) => r.signal === 'weak').length;
        const inverted = report.rules.filter((r) => r.signal === 'inverted').length;
        const dormant = report.rules.filter((r) => r.signal === 'dormant').length;
        logger.info('  strong: ' + strong + ', weak: ' + weak + ', inverted: ' + inverted + ', dormant: ' + dormant);
        logger.info('Wrote ' + outputPath);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(2);
      }
    });
}
