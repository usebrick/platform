import { resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { runMigrate, formatMigrate } from '../migrate.js';

/**
 * v0.18.x (R-H1): migrate subcommand extracted from cli/program.ts.
 *
 * Migrate from `slop-audit` v0.10.x (`.slop-audit/`) to `slopbrick`
 * v0.11.0+ (`.slopbrick/`). Renames artifact dir + cache + config
 * file + bumps schema to v2 + updates `.gitignore`. Idempotent.
 * `--dry-run` previews the changes without touching the filesystem.
 */
export function registerMigrate(program: Command): void {
  program
    .command('migrate')
    .description(
      'Migrate from slop-audit v0.10.x (.slop-audit/) to slopbrick v0.11.0+ (.slopbrick/). Renames artifact dir + cache + config file + bumps schema to v2 + updates .gitignore. Idempotent. Pass --dry-run to preview.',
    )
    .option('--dry-run', 'print the planned changes without touching the filesystem')
    .option('--force', 'overwrite .slopbrick/ if both old and new artifacts exist')
    .option('--workspace <path>', 'workspace directory', process.cwd())
    .option('--format <pretty|json>', 'output format', 'pretty')
    .action(
      (
        cmdOptions: { dryRun?: boolean; force?: boolean; workspace?: string; format?: string },
        command: Command,
      ) => {
        const globals = command.optsWithGlobals() as { format?: string };
        const format: 'pretty' | 'json' =
          (cmdOptions.format ?? globals.format) === 'json' ? 'json' : 'pretty';
        const cwd = resolve(cmdOptions.workspace ?? process.cwd());
        const result = runMigrate({
          workspace: cwd,
          dryRun: cmdOptions.dryRun,
          force: cmdOptions.force,
        });
        if (format === 'json') {
          logger.info(JSON.stringify(result, null, 2));
        } else {
          logger.info(formatMigrate(result));
        }
        process.exit(result.ok ? 0 : 1);
      },
    );
}
