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
    // v0.10.2 (Phase 3): pre-built filelists. Use instead of (or with)
    // --positive-dir / --negative-dir for faster calibration against
    // corpora with many nested projects. Each line is one absolute file
    // path. Comments (lines starting with #) are stripped.
    .option('--positive-list <path>', 'path to a pre-built positive filelist (one path per line)')
    .option('--negative-list <path>', 'path to a pre-built negative filelist (one path per line)')
    // v0.10.2 (Phase 4): per-chunk scan timeout in milliseconds.
    .option('--chunk-timeout <ms>', 'per-chunk scan timeout in milliseconds', (v: string) => parseInt(v, 10), 90_000)
    .option('--output <path>', 'markdown output path', 'corpus/calibration-empirical.md')
    // v0.10.2 (Phase 10): per-chunk rule-set filter passthrough.
    .option('--include-rule <ruleId>', 'include only this rule (repeatable)', (v: string, prev: string[]) => (prev ?? []).concat(v), [] as string[])
    .option('--exclude-rule <ruleId>', 'exclude this rule (repeatable)', (v: string, prev: string[]) => (prev ?? []).concat(v), [] as string[])
     .action(async (cmdOptions) => {
      try {
        const cwd = process.cwd();
        const report = await calibrate(cwd, {
          positiveDir: cmdOptions.positiveDir,
          negativeDir: cmdOptions.negativeDir,
          positiveList: cmdOptions.positiveList,
          negativeList: cmdOptions.negativeList,
          positiveLimit: cmdOptions.positiveLimit,
          negativeLimit: cmdOptions.negativeLimit,
          chunkTimeoutMs: cmdOptions.chunkTimeout,
          includeRules: cmdOptions.includeRule,
          excludeRules: cmdOptions.excludeRule,
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
        if (report.skippedChunks.length > 0) {
          const timeouts = report.skippedChunks.filter((s) => s.reason === 'timeout').length;
          const errors = report.skippedChunks.filter((s) => s.reason === 'error').length;
          logger.warn('  skipped: ' + report.skippedChunks.length + ' chunks (' + timeouts + ' timeouts, ' + errors + ' errors). Raise --chunk-timeout to reduce timeouts; the first 5 are listed in ' + outputPath);
          for (const s of report.skippedChunks.slice(0, 5)) {
            logger.warn('    ' + s.polarity + ' chunk#' + s.index + ' [' + s.reason + '] ' + s.firstFile);
          }
        }
        logger.info('Wrote ' + outputPath);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(2);
      }
    });
}
