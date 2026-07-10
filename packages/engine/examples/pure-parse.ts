import { parseSource } from '@usebrick/engine/pure';

/** Parse source already held by an editor, worker, or MCP host. */
export function parseExample(): number {
  const result = parseSource('export const answer = 42;', '/virtual/answer.ts');
  return result.ast.body.length;
}
