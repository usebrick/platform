import { resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { getGitRoot } from '../git.js';
import { uninstallHook } from '../installer.js';
import type { CliGlobalOptions } from '../scan.js';

/**
 * v0.18.x (R-H1): uninstall subcommand extracted from cli/program.ts.
 * Mirror of `install`: removes the pre-commit hook the `install`
 * subcommand added.
 */
export function registerUninstall(program: Command): void {
  program
    .command('uninstall')
    .description('uninstall the git pre-commit hook')
    .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
      const options = command.optsWithGlobals() as CliGlobalOptions;
      const cwd = resolve(options.workspace ?? process.cwd());
      const root = getGitRoot(cwd);
      if (!root) {
        logger.error('Not a Git repository. Run `git init` first, or remove --staged from your command.');
        process.exit(2);
      }
      const result = uninstallHook(root);
      if (!options.quiet) {
        logger.info(result.message);
      }
      process.exit(result.exitCode);
    });
}
