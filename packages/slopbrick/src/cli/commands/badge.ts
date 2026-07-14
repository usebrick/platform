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
import { runScan } from '../scan';
import type { CliGlobalOptions } from '../scan';
import {
  formatGitScopedEmptySelectionNotice,
  formatScanValidityNotice,
  isGitScopedEmptySelection,
  isIncompleteScan,
  isNotApplicableScan,
  isReadOnlyGitSubset,
} from '../../report/scan-validity.js';

function renderInvalidBadge(scan: Parameters<typeof formatScanValidityNotice>[0], options: CliGlobalOptions): boolean {
  if (!isIncompleteScan(scan) && !isNotApplicableScan(scan)) return false;

  const gitScopedNoOp = isNotApplicableScan(scan) && isGitScopedEmptySelection(scan, options);
  logger.info(
    gitScopedNoOp
      ? formatGitScopedEmptySelectionNotice()
      : formatScanValidityNotice(scan) ??
        (isIncompleteScan(scan)
          ? 'INCOMPLETE SCAN — scores are not valid for gating.'
          : 'NO FILES ANALYSED — scores are not applicable for gating.'),
  );
  process.exit(gitScopedNoOp ? 0 : 1);
  return true;
}

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
      // A Git-scoped invocation is observational and must describe the
      // selected subset, never reuse a whole-project badge from memory.
      const health = isReadOnlyGitSubset(options) ? null : loadHealth(cwd);
      if (health) {
        if (renderInvalidBadge(health, options)) return;
        // v0.42.0 (user-review fix): badge was reading
        // `health.repositoryHealth` and inverting it as `slopIndex`.
        // Two bugs in one:
        //   (1) The badge label is "AI Slop" — so the value shown
        //       should be health.aiSlopScore (raw amount of slop),
        //       not the composite repositoryHealth.
        //   (2) `formatBadge()` reads `report.aiSlopScore`, NOT
        //       `slopIndex`. The previous code synthesized a
        //       `{ slopIndex }` object, so formatBadge fell through
        //       to `report.aiSlopScore ?? 0` — which is 0 (no
        //       field set). The badge was rendering as "ai-slop-0"
        //       regardless of the actual score.
        // Fix: synthesize with the right field, and pass the raw
        // aiSlopScore straight through.
        const synthetic = {
          aiSlopScore: health.aiSlopScore ?? 0,
        } as Parameters<typeof formatBadge>[0];
        logger.info(formatBadge(synthetic));
        process.exit(0);
      }
      const { report } = await runScan(options);
      if (renderInvalidBadge(report, options)) return;
      logger.info(formatBadge(report));
      process.exit(0);
    });
}
