import { resolve } from 'node:path';
import { Command } from 'commander';
import { logger } from '../../engine/logger';

/**
 * v0.18.x (R-H1): memory subcommand extracted from cli/program.ts.
 *
 * Show or regenerate `.slopbrick/structure.md` (the agent-readable
 * repository summary) without re-scanning.
 *
 * Dynamic imports: `structure-md.js` and `@usebrick/core` use
 * dynamic imports here (vs. require) to survive esbuild's CJS
 * bundling. Same pattern as the original inline action.
 */
export function registerMemory(program: Command): void {
  program
    .command('memory')
    .description('show or regenerate .slopbrick/structure.md (the agent-readable repository summary) without re-scanning')
    .option('--show', 'print the current .slopbrick/structure.md to stdout (default if no flag is passed)')
    .option('--regenerate', 're-render structure.md from the existing inventory.json + constitution.json (no scan)')
    .option('--workspace <path>', 'workspace directory', process.cwd())
    .action(
      async (cmdOptions: { show?: boolean; regenerate?: boolean; workspace?: string }) => {
        const cwd = resolve(cmdOptions.workspace ?? process.cwd());
        // Dynamic import — survives esbuild's CJS bundling. The migrate
        // command uses `require('./migrate.js')` because that's a relative
        // path esbuild bundles. We need the same here.
        const { renderStructureMarkdown, readStructureMarkdown, writeStructureMarkdown } =
          await import('../engine/structure-md.js') as typeof import('../engine/structure-md.js');
        const { loadInventory, loadConstitution, inventoryPath: invPath, constitutionPath: conPath } =
          await import('@usebrick/core') as typeof import('@usebrick/core');

        if (cmdOptions.regenerate) {
          // Re-render from existing artifacts — no AST re-parse.
          const inv = loadInventory(cwd);
          const con = loadConstitution(cwd);
          if (!inv) {
            logger.warn(`No .slopbrick/inventory.json at ${invPath(cwd)}. Run \`slopbrick scan\` first.`);
            process.exit(1);
          }
          if (!con) {
            logger.warn(`No .slopbrick/constitution.json at ${conPath(cwd)}. Run \`slopbrick scan\` first.`);
            process.exit(1);
          }
          const md = renderStructureMarkdown(inv, con);
          await writeStructureMarkdown(cwd, md);
          logger.info(`Regenerated .slopbrick/structure.md (${md.length} bytes from inventory + constitution).`);
          return;
        }

        // Default: --show
        const md = await readStructureMarkdown(cwd);
        if (md === null) {
          logger.warn(`No .slopbrick/structure.md at ${cwd}/.slopbrick/structure.md. Run \`slopbrick scan\` to generate it, or pass --regenerate after a prior scan.`);
          process.exit(1);
        }
        process.stdout.write(md + '\n');
      },
    );
}
