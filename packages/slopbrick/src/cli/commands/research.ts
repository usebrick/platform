import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { loadConfig, DEFAULT_CONFIG } from '../../config';
import {
  createProvider,
  generateSamples,
  analyzeSamples,
  extractAndCluster,
  clustersToCandidates,
  type GeneratedSample,
} from '../../research';
import { parseCount } from '../options.js';

/**
 * v0.18.x (R-H1): research sub-CLI extracted from cli/program.ts.
 *
 * 4 sub-commands for the AI UI learning loop:
 *   - `slopbrick research generate`     — generate synthetic UI samples
 *   - `slopbrick research analyze`      — analyze generated samples + report coverage
 *   - `slopbrick research candidates`   — extract patterns + emit candidate rules
 *
 * (The `slopbrick research` parent was previously declared inline
 *  as `const research = program.command('research')...` and the
 *  children chained off it. Here the parent is created inside
 *  `registerResearch` so the call site stays a one-liner.)
 */
export function registerResearch(program: Command): void {
  const research = program
    .command('research')
    .description('research commands for the AI UI learning loop');

  research
    .command('generate')
    .description('generate synthetic UI samples')
    .requiredOption('--count <n>', 'number of samples', parseCount)
    .requiredOption('--framework <name>', 'target framework')
    .requiredOption('--component-type <type>', 'component type')
    .requiredOption('--provider <name>', 'AI provider (openai)')
    .option('--api-key <key>', 'API key for provider')
    .option('--model <name>', 'model name')
    .option('--temperature <n>', 'sampling temperature', parseFloat, 0.7)
    .option('--output-dir <path>', 'output directory', '.slopbrick/corpus/generated')
    .action(async (cmdOptions) => {
      const apiKey = cmdOptions.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) {
        logger.error('Missing --api-key or OPENAI_API_KEY');
        process.exit(2);
      }
      const provider = createProvider({ name: cmdOptions.provider, apiKey, model: cmdOptions.model });
      const samples = await generateSamples({
        count: cmdOptions.count,
        framework: cmdOptions.framework,
        componentType: cmdOptions.componentType,
        provider,
        outputDir: resolve(cmdOptions.outputDir),
        temperature: cmdOptions.temperature,
      });
      logger.info(`Generated ${samples.length} samples in ${cmdOptions.outputDir}`);
    });

  research
    .command('analyze')
    .description('analyze generated samples and report coverage')
    .requiredOption('--input-dir <path>', 'directory with generated samples containing metadata.json')
    .option('--output <path>', 'analysis output path', '.slopbrick/flywheel/analysis.json')
    .option('--config <path>', 'slopbrick config path')
    .option('--framework <name>', 'framework multiplier to apply', 'react')
    .action(async (cmdOptions) => {
      try {
        const metadataPath = resolve(cmdOptions.inputDir, 'metadata.json');
        if (!existsSync(metadataPath)) {
          logger.error(`No metadata.json found in ${cmdOptions.inputDir}`);
          process.exit(2);
        }
        const samples = JSON.parse(readFileSync(metadataPath, 'utf8')) as GeneratedSample[];
        const config = cmdOptions.config
          ? await loadConfig(cmdOptions.config)
          : { ...DEFAULT_CONFIG, framework: cmdOptions.framework };
        const analysis = await analyzeSamples(samples, config);
        const outputPath = resolve(cmdOptions.output);
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, JSON.stringify(analysis, null, 2), 'utf8');
        logger.info(`Analyzed ${analysis.summary.total} samples; coverage: ${analysis.summary.coverage}%`);
        logger.info(`Wrote analysis to ${outputPath}`);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(2);
      }
    });

  research
    .command('candidates')
    .description('extract patterns from generated samples and emit candidate rules')
    .requiredOption('--input-dir <path>', 'directory with generated samples containing metadata.json')
    .option('--output <path>', 'output path', '.slopbrick/flywheel/rule-candidates.json')
    .option('--config <path>', 'slopbrick config path')
    .option('--framework <name>', 'framework multiplier to apply', 'react')
    .option('--min-frequency <n>', 'minimum cluster frequency', parseCount, 2)
    .option('--include-covered', 'include samples already covered by AI-specific rules')
    .action(async (cmdOptions) => {
      try {
        const metadataPath = resolve(cmdOptions.inputDir, 'metadata.json');
        if (!existsSync(metadataPath)) {
          logger.error(`No metadata.json found in ${cmdOptions.inputDir}`);
          process.exit(2);
        }
        const samples = JSON.parse(readFileSync(metadataPath, 'utf8')) as GeneratedSample[];
        const config = cmdOptions.config
          ? await loadConfig(cmdOptions.config)
          : { ...DEFAULT_CONFIG, framework: cmdOptions.framework };
        const analysis = await analyzeSamples(samples, config);
        const extraction = extractAndCluster(analysis.samples, {
          includeCovered: Boolean(cmdOptions.includeCovered),
          minCount: cmdOptions.minFrequency,
        });
        const candidates = clustersToCandidates(extraction.clusters, {
          minFrequency: cmdOptions.minFrequency,
        });
        const outputPath = resolve(cmdOptions.output);
        mkdirSync(dirname(outputPath), { recursive: true });
        const payload = {
          generatedAt: new Date().toISOString(),
          sampleCount: analysis.summary.total,
          coveredCount: analysis.summary.covered,
          fingerprintCount: extraction.total,
          candidates,
        };
        writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
        logger.info(`Extracted ${extraction.total} fingerprints across ${analysis.summary.total} samples`);
        logger.info(`Wrote ${candidates.length} candidate rule(s) to ${outputPath}`);
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(2);
      }
    });
}
