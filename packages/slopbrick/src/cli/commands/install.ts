import { resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { getGitRoot } from '../git.js';
import { installHook } from '../installer.js';
import type { CliGlobalOptions } from '../scan.js';

/**
 * v0.18.x (R-H1): install subcommand extracted from cli/program.ts.
 * Installs the git pre-commit hook at the repo root (not the cwd —
 * `--workspace` may point at a subdir of a Git repo).
 */
export function registerInstall(program: Command): void {
  program
    .command('install')
    .description('install the git pre-commit hook')
    .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
      const options = command.optsWithGlobals() as CliGlobalOptions;
      const cwd = resolve(options.workspace ?? process.cwd());
      const root = getGitRoot(cwd);
      if (!root) {
        logger.error('Not a Git repository. Run `git init` first, or remove --staged from your command.');
        process.exit(2);
      }
      const result = installHook(root);
      if (!options.quiet) {
        logger.info(result.message);
      }
      process.exit(result.exitCode);
    });
}
