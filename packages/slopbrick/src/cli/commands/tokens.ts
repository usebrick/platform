import { Command } from 'commander';
import { logger } from '../../engine/logger';
import {
  readDtcgTokensFile,
  summarizeTokens,
  formatSummary,
} from '../tokens.js';

/**
 * v0.18.x (R-H1): tokens subcommand extracted from cli/program.ts.
 * Ingest a W3C DTCG `tokens.json` file and summarize it by category.
 * Used by the scan pipeline's `--tokens` flag to ground severity
 * scoring in design tokens.
 */
export function registerTokens(program: Command): void {
  program
    .command('tokens <path>')
    .description('Ingest a W3C DTCG tokens.json file and summarize it by category')
    .action((tokenPath: string) => {
      const result = readDtcgTokensFile(tokenPath);
      if (!result.ok) {
        logger.error(`Error: ${result.error}`);
        process.exit(2);
      }
      const summary = summarizeTokens(result.tree);
      logger.info(formatSummary(summary));
    });
}
