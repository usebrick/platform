import { Command } from 'commander';
import type { CliGlobalOptions } from '../scan.js';

/**
 * v0.18.x (R-H1): watch subcommand extracted from cli/program.ts.
 *
 * Re-runs scan on every file change. Flags new violations as you write.
 * The LockBrick prevention loop entry.
 *
 * The `scanAction` is passed as a parameter (not imported) because
 * it is a closure defined inside `runCli` that captures the global
 * options in scope. Passing it in keeps the call site simple and
 * avoids moving ~160 lines of scan logic into this file.
 */
export function registerWatch(program: Command, scanAction: (paths: string[], options: CliGlobalOptions, command: Command) => Promise<void>): void {
  program
    .command('watch')
    .description('re-run scan on every file change. Flags new violations as you write. The LockBrick prevention loop entry.')
    .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
      const rawGlobals = command.optsWithGlobals() as CliGlobalOptions & { increase?: boolean };
      const options: CliGlobalOptions = {
        ...rawGlobals,
        noIncrease: rawGlobals.increase === false,
        watch: true,
      };
      // Mark the mode before entering the shared action. scanAction delegates
      // directly to watchProject, whose doScan owns the single initial scan;
      // a normal scanAction would exit before a watcher could be installed.
      await scanAction([], options, command);
    });
}
