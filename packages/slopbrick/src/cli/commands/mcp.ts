import { Command } from 'commander';
import { logger } from '../../engine/logger';
import { runMcpServer } from '../../mcp/server.js';

/**
 * v0.18.x (R-H1): mcp subcommand extracted from cli/program.ts.
 * Starts the MCP server on stdio for AI agent integration
 * (Claude Code, Cursor, Copilot, Aider). The 4 exposed tools are
 * `slop_suggest`, `slop_suggest_with_structure`, `slop_check_constitution`,
 * `slop_find_similar` — see `packages/slopbrick/src/mcp/`.
 */
export function registerMcp(program: Command): void {
  program
    .command('mcp')
    .description('MCP server for AI agents (JSON-RPC 2.0 over stdio)')
    .action(() => {
      runMcpServer(process.stdin, process.stdout, process.cwd()).catch((err) => {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(2);
      });
    });
}
