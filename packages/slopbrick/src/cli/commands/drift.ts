import { resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { runScan } from '../scan.js';
import type { CliGlobalOptions } from '../scan.js';
import {
  runDrift,
  formatDrift,
  driftExitCode,
  runDriftOverTime,
  formatDriftOverTime,
  driftOverTimeExitCode,
} from '../drift';
import { loadConfig } from '../../config/load';
import { parseCount } from '../options.js';
import { withExitCode } from './_shared';

/**
 * v0.18.x (R-H1): drift subcommand extracted from cli/program.ts.
 *
 * Detect imports that violate the declared constitution (state,
 * data-fetching, UI, forms, styling, routing) or import forbidden
 * packages. Runs a scan first to load the config, then runs the
 * drift detector against it.
 *
 * Same `--format` collision as `trend`: read from merged opts
 * because the global scan --format shadowed the subcommand's
 * local option in Commander.
 *
 * v0.41.0 (Sprint 2, task 2.0): action callback refactored to use
 * `withExitCode` from `./_shared` — the inline `process.exit(N)`
 * calls are replaced by a `CommanderError` throw that the runCli-
 * level `dispatch` catches. The pure `runDrift` -> `driftExitCode`
 * path is now reachable from integration tests without coupling
 * to `process.exit`. This is the template for the other commands
 * that still embed `process.exit` (architecture review F3).
 *
 * v0.41.0 (Sprint 2, task 2a.5): `--temporal-since <iso-date|'baseline'>`
 * flag routes through `runDriftOverTime` instead of `runDrift` —
 * temporal drift over `.slopbrick/flywheel/scans.jsonl`. The
 * existing syntactic-only path is preserved for any invocation
 * without `--temporal-since`. The two paths share `withExitCode` for
 * exit propagation so neither embeds `process.exit`.
 *
 * Naming note: the §2a.5 plan called this flag `--since <date>`,
 * but `--since` AND `--baseline` are already taken by global
 * scan flags (`program.ts:166` for `--since`, `program.ts:195`
 * for the `--baseline` boolean). Both would be shadowed by the
 * global parser and never reach the drift action callback. The
 * temporal flag is therefore renamed to `--temporal-since` to
 * keep all three surfaces disjoint. The argument is the same:
 * an ISO-8601 date or the literal `baseline`.
 */
export function registerDrift(program: Command): void {
  program
    .command('drift')
    .description(
      'detect imports that violate declared constitution (state, data-fetching, UI, forms, styling, routing) or import forbidden packages',
    )
    .option('--format <pretty|json>', 'output format', 'pretty')
    .option('--max-files <n>', 'cap on files scanned', parseCount, 1000)
    .option(
      '--temporal-since <date>',
      `temporal drift since the given date (ISO-8601, or the literal string \`baseline\` to use the oldest scan in scans.jsonl)`,
    )
    .action(
      async (
        cmdOptions: {
          format?: 'pretty' | 'json';
          maxFiles?: number;
          temporalSince?: string;
        },
        command: Command,
      ) => {
        // No try/catch here any more. The `dispatch` wrapper at the
        // top of `runCli` catches `CommanderError` uniformly (covers
        // both commander-domain errors like "missing required
        // argument" and slopbrick-domain errors like `withExitCode`
        // raising). Anything else (TypeError, file-not-found, etc.)
        // propagates to the outer try/catch in runCli and exits 3
        // as before. This makes the action callback a thin wrapper
        // over the pure `runDrift*` functions — integration tests
        // can exercise them directly without spawning a subprocess.
        const options = command.optsWithGlobals() as CliGlobalOptions & {
          format?: string;
        };
        // Read --format from the merged opts because the global
        // scan --format shadowed the subcommand's local option in
        // Commander. Same trap as `trend` had.
        const rawFormat = options.format ?? cmdOptions.format ?? 'pretty';
        const format: 'pretty' | 'json' =
          rawFormat === 'json' || rawFormat === 'pretty' ? rawFormat : 'pretty';

        const cwd = resolve(options.workspace ?? process.cwd());

        // Temporal mode (--temporal-since): bypass `runScan` to
        // avoid appending a fresh telemetry payload to
        // `scans.jsonl` — that would clobber the historical ledger
        // and confuse `runDriftOverTime` (which sorts by timestamp
        // and reads the latest entry as `current`). We only need
        // the resolved config (for `constitution`-intersection),
        // not a fresh scan.
        if (cmdOptions.temporalSince !== undefined) {
          const temporalSince = cmdOptions.temporalSince.trim();
          if (temporalSince.length === 0) {
            throw new Error('--temporal-since expects a non-empty ISO date or `baseline`');
          }
          const sinceArg = temporalSince === 'baseline' ? 'baseline' : temporalSince;
          const config = await loadConfig(cwd);
          const result = await runDriftOverTime(cwd, config, { since: sinceArg });
          logger.info(formatDriftOverTime(result));
          withExitCode(
            result,
            driftOverTimeExitCode,
            `drift --temporal-since: ${result.introducedUndeclared.length} undeclared patterns introduced`,
          );
          return;
        }

        // Default (syntactic) mode: unchanged from v0.40.x.
        const { config } = await runScan({ ...options, workspace: cwd });
        const result = await runDrift(cwd, config, { maxFiles: cmdOptions.maxFiles });
        logger.info(formatDrift(result, { json: format === 'json' }));
        // Throws a CommanderError when the code is non-zero; the
        // runCli-level `dispatch` catches it and routes through
        // `process.exit(code)`. No `process.exit` is called here.
        withExitCode(result, driftExitCode, `drift: ${result.totalViolations} violations`);
      },
    );
}
