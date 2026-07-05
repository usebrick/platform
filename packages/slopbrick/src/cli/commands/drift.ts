import { resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { runScan } from '../scan.js';
import type { CliGlobalOptions } from '../scan.js';
import { runDrift, formatDrift, driftExitCode } from '../drift';
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
 */
export function registerDrift(program: Command): void {
  program
    .command('drift')
    .description(
      'detect imports that violate declared constitution (state, data-fetching, UI, forms, styling, routing) or import forbidden packages',
    )
    .option('--format <pretty|json>', 'output format', 'pretty')
    .option('--max-files <n>', 'cap on files scanned', parseCount, 1000)
    .action(
      async (cmdOptions: { format?: 'pretty' | 'json'; maxFiles?: number }, command: Command) => {
        // No try/catch here any more. The `dispatch` wrapper at the
        // top of `runCli` catches `CommanderError` uniformly (covers
        // both commander-domain errors like "missing required
        // argument" and slopbrick-domain errors like `withExitCode`
        // raising). Anything else (TypeError, file-not-found, etc.)
        // propagates to the outer try/catch in runCli and exits 3
        // as before. This makes the action callback a thin wrapper
        // over the pure `runDrift` function — integration tests can
        // exercise `runDrift` directly without spawning a subprocess.
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
