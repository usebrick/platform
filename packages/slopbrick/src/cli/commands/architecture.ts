import { resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { runScan, type CliGlobalOptions } from '../scan.js';
import { buildArchitectureScore, formatArchitectureScore } from '../../engine/architecture-score';
import { parseCount } from '../options.js';

/**
 * v0.18.x (R-H1): architecture subcommand extracted from cli/program.ts.
 *
 * Compute the Architecture Consistency Score (0-100) — one number
 * for cross-file pattern duplication.
 */
export function registerArchitecture(program: Command): void {
  program
    .command('architecture')
    .description(
      'compute the Architecture Consistency Score (0-100) — one number for cross-file pattern duplication',
    )
    .option('--format <pretty|json>', 'output format', 'pretty')
    .option('--max-files <n>', 'cap on files scanned', parseCount, 500)
    .action(
      async (cmdOptions: { format?: 'pretty' | 'json'; maxFiles?: number }, command: Command) => {
        try {
          const options = command.optsWithGlobals() as CliGlobalOptions & {
            format?: string;
          };
          const rawFormat = options.format ?? cmdOptions.format ?? 'pretty';
          const format: 'pretty' | 'json' =
            rawFormat === 'json' || rawFormat === 'pretty' ? rawFormat : 'pretty';

          const cwd = resolve(options.workspace ?? process.cwd());
          const { config } = await runScan({ ...options, workspace: cwd });
          const score = await buildArchitectureScore(cwd, config, cmdOptions.maxFiles);
          const out =
            format === 'json' ? JSON.stringify(score, null, 2) : formatArchitectureScore(score);
          logger.info(out);
          process.exit(0);
        } catch (err) {
          logger.error(err instanceof Error ? err.message : String(err));
          process.exit(2);
        }
      },
    );
}
