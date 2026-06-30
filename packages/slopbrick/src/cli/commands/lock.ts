import { resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { installHook, uninstallHook } from '../installer.js';

/**
 * v0.18.x (R-H1): lock subcommand extracted from cli/program.ts.
 *
 * Installs a Git pre-commit hook that runs `slopbrick scan --staged`
 * on every commit. The LockBrick prevention loop: block AI-introduced
 * slop from ever reaching the repo.
 *
 * Distinct from `install`/`uninstall` (the legacy hook install) and
 * `LockBrick` (the platform concept). The `--husky` flag forces
 * installation under `.husky/pre-commit` (Husky v9); without it
 * the hook goes in `.git/hooks/pre-commit`.
 */
export function registerLock(program: Command): void {
  program
    .command('lock')
    .description('install a Git pre-commit hook that runs `slopbrick scan --staged` on every commit. The LockBrick prevention loop: block AI-introduced slop from ever reaching the repo.')
    .option('--uninstall', 'remove the pre-commit hook instead of installing it')
    .option('--husky', 'force-install under .husky/pre-commit (Husky v9). Default auto-detects via .husky/ dir.')
    .option('--workspace <path>', 'workspace directory', process.cwd())
    .action(
      (cmdOptions: { uninstall?: boolean; husky?: boolean; workspace?: string }) => {
        const cwd = resolve(cmdOptions.workspace ?? process.cwd());
        if (cmdOptions.uninstall) {
          const result = uninstallHook(cwd);
          logger.info(result.message);
          if (!result.ok) process.exit(1);
          return;
        }
        const result = installHook(cwd);
        if (result.ok) {
          logger.info(result.message);
          logger.info('Every commit will now run `slopbrick scan --staged` before the commit is created.');
          logger.info('Bypass with `git commit --no-verify` (not recommended).');
        } else {
          logger.warn(result.message);
          process.exit(1);
        }
      },
    );
}
