import { Command } from 'commander';
import { runDoctor } from '../init.js';

/**
 * v0.18.x (R-H1): doctor subcommand extracted from cli/program.ts.
 * Checks the user's setup, config, and environment for common problems.
 * Exits 0 on a clean check, non-zero if issues are found.
 */
export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('check your setup, config, and environment for common problems')
    .action(async () => {
      const exitCode = await runDoctor(process.cwd());
      if (exitCode !== 0) process.exit(exitCode);
    });
}
