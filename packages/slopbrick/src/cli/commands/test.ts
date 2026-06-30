import { resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { runScan, type CliGlobalOptions } from '../scan.js';
import { runTestScan, formatTestReport, testExitCode } from '../test';

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
          const { config } = await runScan({ ...options, workspace: cwd });
          const { result } = await runTestScan(cwd, config, { strict: options.strict });
          logger.info(formatTestReport(result, { json: format === 'json' }));
          process.exit(testExitCode(result));
        } catch (err) {
          logger.error(err instanceof Error ? err.message : String(err));
          process.exit(2);
        }
      },
    );
}
