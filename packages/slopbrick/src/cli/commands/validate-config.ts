import { existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import {
  validateConfig as validateConfigSchema,
  formatConfigValidationErrors,
  ConfigValidationError,
} from '../../config/validation.js';

/**
 * v0.18.x (R-H1): validate-config subcommand extracted from
 * cli/program.ts. Runs the same schema check that `slopbrick scan`
 * performs at the start of every run, but as a no-side-effect
 * subcommand. Useful in pre-commit hooks, CI config PRs, and
 * editor integrations that want to surface config typos without
 * launching a full scan.
 *
 * Exit codes:
 *   0 = config is valid (warnings OK)
 *   1 = config has errors
 *   2 = config file not found / failed to load
 */
export function registerValidateConfig(program: Command): void {
  program
    .command('validate-config [path]')
    .description('Statically validate a slopbrick.config.mjs without scanning')
    .action(async (configPath: string | undefined) => {
      const path = configPath
        ? resolve(configPath)
        : resolve(process.cwd(), 'slopbrick.config.mjs');
      if (!existsSync(path)) {
        logger.error(`Error: config file not found: ${path}`);
        process.exit(2);
      }
      try {
        // The same loader used by `scan` — preserves all .mjs/.cjs/.js
        // semantics from src/config.ts.
        const mod = extname(path) === '.cjs'
          ? require(path)
          : (await import(path));
        const userConfig = (mod as { default?: unknown }).default ?? mod;
        const result = validateConfigSchema(userConfig);
        if (result.errors.length === 0) {
          logger.info(`✓ ${path}`);
          if (result.warnings.length === 0) {
            logger.info('  No issues found.');
          } else {
            logger.info(`  ${result.warnings.length} warning(s):`);
            for (const w of result.warnings) {
              logger.info(`  ! ${w}`);
            }
          }
          process.exit(0);
        }
        logger.info(formatConfigValidationErrors(path, result.errors, result.warnings));
        process.exit(1);
      } catch (err) {
        if (err instanceof ConfigValidationError) {
          logger.info(err.message);
          process.exit(1);
        }
        logger.error(`Error: failed to load ${path}: ${(err as Error).message}`);
        process.exit(2);
      }
    });
}
