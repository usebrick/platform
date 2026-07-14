import { resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { runScan } from '../scan.js';
import type { CliGlobalOptions } from '../scan.js';
import { runTestScan, formatTestReport, testExitCode } from '../test';
import { renderInvalidScan } from './_shared.js';

/**
 * v0.18.x (R-H1): test subcommand extracted from cli/program.ts.
 *
 * Test Quality score (0-100, lower = more issues). Runs the four
 * `test/*` rules across test files. --strict exits 1 on any test
 * issue (CI gate).
 */
export function registerTest(program: Command): void {
  program
    .command('test')
    .description(
      'Test Quality score (0-100, lower = more issues). Runs the four `test/*` rules across test files. Use --strict to exit 1 on any test issue (CI gate).',
    )
    .option('--format <pretty|json>', 'output format', 'pretty')
    .option('--strict', 'exit 1 on any test issue (CI gate)', false)
    .action(
      async (cmdOptions: { format?: 'pretty' | 'json'; strict?: boolean }, command: Command) => {
        try {
          const options = command.optsWithGlobals() as CliGlobalOptions & {
            format?: string;
          };
          const rawFormat = options.format ?? cmdOptions.format ?? 'pretty';
          const format: 'pretty' | 'json' =
            rawFormat === 'json' || rawFormat === 'pretty' ? rawFormat : 'pretty';

          const cwd = resolve(options.workspace ?? process.cwd());
          const { config, report: bootstrapReport } = await runScan({ ...options, workspace: cwd });
          const bootstrapInvalidExitCode = renderInvalidScan(
            bootstrapReport,
            options,
            cwd,
            format === 'json' ? 'json' : undefined,
          );
          if (bootstrapInvalidExitCode !== undefined) {
            process.exit(bootstrapInvalidExitCode);
            return;
          }
          const { result, scan } = await runTestScan(cwd, config, { strict: options.strict });
          // The test command intentionally narrows discovery to test files;
          // a project may have valid production code but no test population.
          // Apply the same boundary to that narrowed scan rather than
          // publishing a synthetic Test Quality 100/100 result.
          const testInvalidExitCode = renderInvalidScan(
            scan.report,
            options,
            cwd,
            format === 'json' ? 'json' : undefined,
          );
          if (testInvalidExitCode !== undefined) {
            process.exit(testInvalidExitCode);
            return;
          }
          logger.info(formatTestReport(result, { json: format === 'json' }));
          process.exit(testExitCode(result));
        } catch (err) {
          logger.error(err instanceof Error ? err.message : String(err));
          process.exit(2);
        }
      },
    );
}
