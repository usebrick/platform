/**
 * v0.17.5 (R-H1): `slopbrick badge` — print a shields.io slop-index badge.
 *
 * Reads the persisted `.slopbrick/health.json` if present (no re-scan);
 * falls back to a fresh scan. v0.15.0 U.4: badge shows the composite
 * repositoryHealth (the v3 replacement for the headline slopIndex).
 *
 * Module pattern: each `cli/commands/<name>.ts` exports a single
 * `register<X>(program)` function that wires the Command + its
 * options + the action callback. `cli/program.ts` calls all of them.
 */

import { resolve } from 'node:path';
import { Command } from 'commander';

import { formatBadge } from '../render';
import { logger } from '../../engine/logger';
import { runScan, type CliGlobalOptions } from '../scan';

export function registerBadge(program: Command): void {
  program
    .command('badge')
    .description(
      'print a shields.io slop-index badge. Reads .slopbrick/health.json if present (no re-scan); falls back to a fresh scan.',
    )
    .action(async (_cmdOptions: Record<string, unknown>, command: Command) => {
      // v0.14.5d: badge reads from the persisted health snapshot when
      // available so the organic-growth loop is fast enough for CI
      // badges to refresh on every push. Falls back to a fresh scan.
      const options = command.optsWithGlobals() as CliGlobalOptions;
      const cwd = resolve(options.workspace ?? process.cwd());
      const { loadHealth } = await import('@usebrick/core') as typeof import('@usebrick/core');
      const health = loadHealth(cwd);
      if (health) {
        // v0.15.0 U.4: badge now shows the composite repositoryHealth
        // (the v3 replacement for the headline slopIndex). The shape
        // passed to formatBadge is a ProjectReport-like — it still
        // reads `slopIndex`, so we invert the value (lower = better
        // for the legacy badge, higher = better for repositoryHealth)
        // before passing it in. TODO(U.5): add a --format that
        // shows all 4 scores.
        const synthetic = {
          slopIndex: 100 - health.repositoryHealth,
        } as Parameters<typeof formatBadge>[0];
        logger.info(formatBadge(synthetic));
        process.exit(0);
      }
      const { report } = await runScan(options);
      logger.info(formatBadge(report));
      process.exit(0);
    });
}
