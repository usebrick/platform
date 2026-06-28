/**
 * v0.10.7: Repository Memory Platform — MCP fast-path wrapper.
 *
 * `slop_suggest_with_memory` is a thin wrapper around `slop_suggest`
 * that prefers a persisted `.slopbrick/memory.md` over re-scanning.
 * On the fast path the agent gets the markdown in O(read file); on
 * the slow path (no persisted memory yet) it falls back to the
 * existing re-scan behavior, with a `memoryHint` annotation so the
 * caller knows what to do next time.
 *
 * Latency win: O(re-parse AST) → O(read file). 100–1000× faster on
 * agent integrations that call the tool frequently.
 */

import { readMemoryMarkdown } from '../engine/memory-md';
import type { ToolContext } from './tools';

// Inferred return shape from `handleToolCall` in `./tools`. The actual
// `ToolResult` interface is not re-exported from tools.ts, but we only
// need its public shape (content array of text blocks, optional isError).
type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

const MEMORY_NOT_FOUND_HINT =
  'No .slopbrick/memory.md found. Run `slopbrick scan` to persist the pattern inventory, then call this tool again for the O(read file) fast path.';

/**
 * Run the fast-path `slop_suggest` if `.slopbrick/memory.md` exists,
 * otherwise delegate to the existing `slop_suggest` (re-scan). The
 * slow-path response is annotated with `memoryHint` so the caller can
 * surface the upgrade path to the user.
 */
export async function runSuggestWithMemory(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const cached = await readMemoryMarkdown(ctx.cwd);
  if (cached !== null) {
    // Fast path: the markdown is already a complete agent-readable
    // summary (rendered by `renderMemoryMarkdown`). Return it as a
    // single text block — MCP clients render it inline so the agent
    // sees the patterns directly without parsing JSON.
    return {
      content: [{ type: 'text', text: cached }],
    };
  }

  // Slow path: lazy-import the existing handler so we don't create
  // a load-time cycle between this module and `tools.ts`.
  const { handleToolCall } = await import('./tools.js');
  const result = await handleToolCall('slop_suggest', args, ctx);
  if (result.isError) return result;

  // Annotate with the upgrade hint. If the slow-path response is not
  // JSON (shouldn't happen, but be defensive), pass it through unchanged.
  try {
    const parsed: unknown = JSON.parse(result.content[0].text);
    if (parsed !== null && typeof parsed === 'object') {
      (parsed as Record<string, unknown>).memoryHint = MEMORY_NOT_FOUND_HINT;
      return {
        content: [{ type: 'text', text: JSON.stringify(parsed, null, 2) }],
      };
    }
  } catch {
    // Not JSON — leave the slow-path response as-is.
  }
  return result;
}