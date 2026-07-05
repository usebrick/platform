/**
 * v0.10.7: Repository Memory Platform — MCP fast-path wrapper.
 *
 * v0.41.0 (Sprint 2, task 2b.0): the implementation has been
 * consolidated into `runSuggest(args, ctx, { includeStructure: true })`
 * in `src/mcp/tools.ts`. This module is now a backward-compat
 * re-export so any external consumer that imports
 * `runSuggestWithStructure` by name still works.
 *
 * Behavior summary (unchanged from v0.10.7):
 *   - Fast path: if `.slopbrick/structure.md` exists on disk, return
 *     it as a single text block. O(read file) — 100–1000× faster
 *     than re-scanning on agent integrations that call this tool
 *     frequently.
 *   - Slow path: fall through to the JSON re-scan and annotate the
 *     response with `structureHint` so the caller knows to run
 *     `slopbrick scan` first.
 *
 * The `handleToolCall` switch in `tools.ts` now routes both
 * `slop_suggest` and `slop_suggest_with_structure` through the
 * consolidated `runSuggest`, so the `handleToolCall` indirection
 * that used to live here is no longer needed.
 */

import type { ToolContext, ToolResult } from './tools';

export { STRUCTURE_NOT_FOUND_HINT } from './tools';

/**
 * Backward-compat re-export. Delegates to the consolidated
 * `runSuggest` in `./tools.ts` with the structure fast-path flag.
 */
export async function runSuggestWithStructure(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  // Lazy import to avoid a load-time cycle between this module and
  // `tools.ts` (tools.ts imports from this file for the
  // `STRUCTURE_NOT_FOUND_HINT` constant).
  const { runSuggest } = await import('./tools.js');
  return runSuggest(args, ctx, { includeStructure: true });
}