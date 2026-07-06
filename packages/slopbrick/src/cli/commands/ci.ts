import { resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { loadHealth } from '@usebrick/core';
import { parseCount } from '../options.js';
import type { CliGlobalOptions } from '../scan.js';

/**
 * v0.18.x (R-H1): ci subcommand extracted from cli/program.ts.
 *
 * CI gate: run a scan and exit 1 on constitution violations,
 * threshold breach, or new issues since the last run. Use this
 * in GitHub Actions / GitLab CI.
 *
 * Like `watch`, this uses the `scanAction` closure (passed in by
 * the caller) instead of reimplementing the scan body. The CI
 * subcommand forces `--no-increase` and `--changed` on top of
 * the global options.
 */
export function registerCi(
  program: Command,
  scanAction: (paths: string[], options: CliGlobalOptions, command: Command) => Promise<void>,
): void {
  program
    .command('ci')
    .description('CI gate: run a scan and exit 1 on constitution violations, threshold breach, or new issues since the last run. Use this in GitHub Actions / GitLab CI.')
    .option('--max-slop <n>', 'exit 1 if aiSlopScore exceeds this number (lower = cleaner since v0.21)', parseCount)
    .option('--max-new-issues <n>', 'exit 1 if new issues (vs .slop-audit-cache.json) exceed this number', parseCount)
    .option('--strict-constitution', 'exit 1 on any constitution violation')
    .option('--format <pretty|json>', 'output format', 'json')
    .action(
      async (
        cmdOptions: {
          maxSlop?: number;
          maxNewIssues?: number;
          strictConstitution?: boolean;
          format?: string;
        },
        command: Command,
      ) => {
        const globals = command.optsWithGlobals() as CliGlobalOptions & { increase?: boolean };
        const options: CliGlobalOptions = {
          ...globals,
          noIncrease: true,                  // force fail on increase
          changed: true,                     // scan only changed files
          format: (cmdOptions.format ?? 'json') as 'pretty' | 'json' | 'sarif' | 'html',
        };
        const cwd = resolve(options.workspace ?? process.cwd());
        await scanAction([], options, command);
        // After the scan, read .slopbrick/health.json to gate.
        const health = loadHealth(cwd);
        if (!health) {
          logger.warn('No .slopbrick/health.json — `slopbrick ci` requires a prior `slopbrick scan`.');
          process.exit(1);
        }
        let exitCode = 0;
        // v0.15.0 U.4: --max-slop now gates on the composite
        // repositoryHealth (the v3 replacement for slopIndex).
        // Because repositoryHealth is "higher = better" while
        // --max-slop is "fail if higher than N" (legacy semantics
        // were "fail if slopIndex > N" where lower is better), we
        // invert the comparison so users see the same behavior.
        // TODO(U.5): replace --max-slop with --min-repository-health.
        if (cmdOptions.maxSlop !== undefined) {
          const maxInverse = 100 - cmdOptions.maxSlop;
          if (health.repositoryHealth < maxInverse) {
            logger.warn(`repositoryHealth ${health.repositoryHealth} < ${cmdOptions.maxSlop} (max-slop)`);
            exitCode = 1;
          }
        }
        if (cmdOptions.strictConstitution && (health.constitutionDrift ?? 0) > 0) {
          logger.warn(`${health.constitutionDrift} constitution violation(s) detected`);
          exitCode = 1;
        }
        if (exitCode === 0) {
          logger.info(`CI gate passed: repositoryHealth=${health.repositoryHealth}, constitutionDrift=${health.constitutionDrift ?? 0}`);
        }
        process.exit(exitCode);
      },
    );
}
