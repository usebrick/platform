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
    .option(
      '--no-telemetry',
      'disable local flywheel telemetry; project-memory artifacts still write unless projectMemory: false',
    )
    // v0.10.2 (Phase 10): multi-value rule filters. `--rule` (single)
    // remains for backwards compat; the calibrator uses these new
    // flags to scan a chunk twice with different rule sets.
    .option(
      '--include-rule <ruleId>',
      'include only this rule (repeatable; may be specified multiple times). Mutually exclusive with --rule.',
      (value: string, prev: string[]) => (prev ?? []).concat(value),
      [] as string[],
    )
    .option(
      '--exclude-rule <ruleId>',
      'exclude this rule (repeatable; may be specified multiple times).',
      (value: string, prev: string[]) => (prev ?? []).concat(value),
      [] as string[],
    )
    .option(
      '--rule <ruleId>',
      'run only a single rule by id (e.g. visual/math-default-font). All others are skipped.',
    )
    .action(scanAction);
}
