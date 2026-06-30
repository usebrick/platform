import { Command } from 'commander';
import type { CliGlobalOptions } from '../scan.js';

/**
 * v0.18.x (R-H1): scan default command extracted from cli/program.ts.
 *
 * The actual scan body is the `scanAction` closure defined in
 * program.ts (and re-used by `watch` and `ci` via parameter). This
 * file just owns the Commander registration — the small wrapper
 * around scanAction.
 *
 * `isDefault: true` makes scan the fallback command when no
 * subcommand is given (e.g. `slopbrick` with no args runs a scan).
 */
export function registerScan(
  program: Command,
  scanAction: (paths: string[], options: CliGlobalOptions, command: Command) => Promise<void>,
): void {
  program
    .command('scan [paths...]', { isDefault: true })
    .description('scan files for slop')
    .option('--no-telemetry', 'disable telemetry collection for this run')
    .option(
      '--rule <ruleId>',
      'run only a single rule by id (e.g. visual/math-default-font). All others are skipped.',
    )
    .action(scanAction);
}
