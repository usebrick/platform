import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { builtinRules } from '../../rules/builtins';
import { refreshRegistrySnapshot, copyBundledSnapshotToCache } from '../../rules/registry-loader';
import { runScan, buildBaselineCache } from '../scan.js';
import type { CliGlobalOptions } from '../scan.js';
import { runInitWizard, isInteractive } from '../init.js';
import { DEFAULT_CONFIG, detectStack, detectStylingSolution, buildInitConfig } from '../../config';
import type { ResolvedConfig } from '../../config';
import { serializeConfig, appendGitignore } from '../threshold';
import { getGitHead } from '../git.js';
import { saveBaseline, baselinePath, hashConfig } from '../../engine/cache';
import {
  SNIPPET_TARGETS,
  resolveTargetPath,
  renderMatrix,
} from '../../snippet/targets.js';

/**
 * v0.18.x (R-H1): init subcommand extracted from cli/program.ts.
 *
 * The largest single command in the CLI (~150 lines inline). Creates
 * a slopbrick.config.mjs, runs the optional setup wizard, generates
 * AI agent rule snippets for the requested targets (Cursor, Claude,
 * Aider, etc.), optionally saves a baseline.
 *
 * Note: runScan is imported twice (once from '../scan.js' for the
 * init wizard output, once from '../../engine/cache' for the
 * baseline save). Both have the same name but different signatures
 * — the cache one is the engine-level scan used for the baseline
 * hash. This is a known quirk of the original inline action.
 */
export function registerInit(program: Command): void {
  program
    .command('init')
    .description('create a slopbrick config file')
    .option('--yes', 'overwrite existing config')
    .option('--all', 'write snippets for every supported agent')
    .option('--matrix', 'print the agent x file matrix and exit')
    .option('--cursor', 'also generate .cursor/rules/slopbrick.mdc for Cursor AI')
    .option('--cursorrules', 'legacy Cursor .cursorrules format')
    .option('--agents-md', 'also generate AGENTS.md for Codex / opencode / Pi / Cline')
    .option('--claude-md', 'also generate CLAUDE.md for Claude Code (takes precedence over AGENTS.md)')
    .option('--aider', 'also generate CONVENTIONS.md for Aider')
    .option('--windsurf', 'also generate .windsurfrules for Windsurf')
    .option('--cline', 'also generate .clinerules/AGENTS.md for Cline')
    .option('--gemini', 'also generate .gemini/GEMINI.md for Gemini CLI')
    .option('--copilot', 'also generate .github/copilot-instructions.md for GitHub Copilot')
    .action(async (
      cmdOptions: {
        yes?: boolean;
        all?: boolean;
        matrix?: boolean;
        cursor?: boolean;
        cursorrules?: boolean;
        agentsMd?: boolean;
        claudeMd?: boolean;
        aider?: boolean;
        windsurf?: boolean;
        cline?: boolean;
        gemini?: boolean;
        copilot?: boolean;
      },
      command: Command,
    ) => {
      const options = command.optsWithGlobals() as CliGlobalOptions;

      // --matrix: print the agent x file table and exit without writing.
      if (cmdOptions.matrix) {
        logger.info(renderMatrix());
        process.exit(0);
      }

      const cwd = resolve(options.workspace ?? process.cwd());
      const configPath = join(cwd, 'slopbrick.config.mjs');
      const detected = detectStack(cwd);
      const fallbackConfig = { ...DEFAULT_CONFIG, ...detected } as ResolvedConfig;
      const proposed = serializeConfig(fallbackConfig);
      if (existsSync(configPath) && !cmdOptions.yes) {
        const current = readFileSync(configPath, 'utf8');
        logger.error(`A config file already exists at ${configPath}.`);
        logger.error('To overwrite it with defaults, run `slopbrick init --yes`.');
        logger.error('');
        logger.error('--- current');
        logger.error(current);
        logger.error('+++ proposed');
        logger.error(proposed);
        logger.error('');
        logger.error('Use --yes to overwrite');
        process.exit(2);
      }

      let config: ResolvedConfig;
      let usedWizard = false;
      if (cmdOptions.yes || !isInteractive()) {
        config = fallbackConfig;
      } else {
        const answers = await runInitWizard(cwd, detected);
        config = buildInitConfig(detected, answers);
        usedWizard = true;
      }

      writeFileSync(configPath, serializeConfig(config));
      appendGitignore(cwd);
      const refresh = await refreshRegistrySnapshot(cwd);
      if (!refresh.ok) {
        copyBundledSnapshotToCache(cwd);
      }
      if (!options.quiet) {
        // Round 25: explain to the user what just happened. If we
        // skipped the wizard (CI / --yes / no TTY), make that clear
        // and tell them how to re-run with the wizard.
        if (!usedWizard) {
          logger.info(`Created ${configPath}`);
          logger.info('');
          logger.info(
            'Skipped the setup wizard (no interactive terminal). Used defaults from detected stack.',
          );
          logger.info(
            `Detected: framework=${detected.framework ?? 'react'}, styling=${detectStylingSolution(cwd)}, ui=${
              (detected.uiLibraries ?? []).length > 0 ? (detected.uiLibraries ?? []).join(',') : 'none'
            }.`,
          );
          logger.info(
            'Re-run `slopbrick init` from a terminal (no `--yes`) to customize thresholds, severity, and rules.',
          );
        } else {
          logger.info(`Created ${configPath}`);
        }
        logger.info(refresh.message);
      }

      // Round 18+19: AI agent rule snippets. Generated from the live
      // rule registry so they always match what slopbrick checks for.
      // Each target knows its file path + content generator.
      const targetsToWrite = SNIPPET_TARGETS.filter((t) => {
        if (cmdOptions.all) return true;
        // Map flag name → option value
        const opts = cmdOptions as Record<string, unknown>;
        return Boolean(opts[t.flag]);
      });
      for (const target of targetsToWrite) {
        const snippetPath = join(cwd, resolveTargetPath(target));
        mkdirSync(dirname(snippetPath), { recursive: true });
        const generated = target.generator(builtinRules);
        // For AGENTS.md-style flat files, merge into existing markers if
        // present (preserves other content the user wrote).
        if (!target.isFolder && existsSync(snippetPath)) {
          const existing = readFileSync(snippetPath, 'utf8');
          if (existing.includes('<!-- slopbrick:begin -->')) {
            const updated = existing.replace(
              /<!-- slopbrick:begin -->[\s\S]*?<!-- slopbrick:end -->/,
              '<!-- slopbrick:begin -->\n' + generated + '<!-- slopbrick:end -->',
            );
            writeFileSync(snippetPath, updated, 'utf8');
            if (!options.quiet) logger.info(`Updated ${snippetPath}`);
            continue;
          }
          writeFileSync(
            snippetPath,
            existing + (existing.endsWith('\n') ? '\n' : '\n\n') + generated,
            'utf8',
          );
          if (!options.quiet) logger.info(`Wrote ${snippetPath}`);
          continue;
        }
        writeFileSync(snippetPath, generated, 'utf8');
        if (!options.quiet) logger.info(`Wrote ${snippetPath}`);
      }

      if (options.baseline) {
        const { report, config } = await runScan({ ...options, workspace: cwd });
        const configHash = hashConfig(config);
        const gitHead = (await getGitHead(cwd)) ?? 'unknown';
        const cache = buildBaselineCache(report, configHash, gitHead, cwd);
        saveBaseline(cwd, cache);
        if (!options.quiet) {
          logger.info(`Saved baseline to ${baselinePath(cwd)}`);
        }
      }
      process.exit(0);
    });
}
