// v0.42.0 (Sprint 3, §3a.3): post-scan hook that rewrites the
// managed slopbrick block in AGENTS.md / CLAUDE.md when the user
// has opted in.
//
// Called from `cli/report/persistRun.ts` after a successful scan.
// Sequence atomically: only rewrite after BOTH `health.json` AND
// `inventory.json` have been written successfully (a partial write
// followed by a snippet rewrite would surface stale data in the
// generated block). Caller is responsible for the precondition
// check; this module is pure over the file system.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeRewrite } from './render';
import { generateAgentsMdSnippet } from './generators';
import type { Rule } from '../types';

/** Files that hold slopbrick-managed snippets. AGENTS.md is the
 *  canonical read-by-most agents; CLAUDE.md is the Claude-specific
 *  companion. Both are wrapped with the v3 markers by
 *  `wrapWithMarkers` in `generators.ts`. */
export const SNIPPET_TARGETS = [
  'AGENTS.md',
  'CLAUDE.md',
] as const;

export interface RefreshResult {
  /** Files that were successfully rewritten. */
  rewritten: ReadonlyArray<string>;
  /** Files where the markers were missing (fail-closed). */
  failClosed: ReadonlyArray<string>;
  /** Files with mismatched markers (warn + skip). */
  mismatched: ReadonlyArray<string>;
  /** Files that didn't exist on disk. Not an error — the user may
   *  not have run `slopbrick init` yet. */
  absent: ReadonlyArray<string>;
}

/** Refresh the managed snippet block in AGENTS.md / CLAUDE.md.
 *  Idempotent — calling multiple times produces the same end state.
 *
 *  The caller passes the rule list (typically `getRules()` from the
 *  freshly-built registry). The generated block body is derived from
 *  the current rule data; safeRewrite replaces only what's between
 *  the markers, never surrounding content.
 *
 *  Atomic write: write to `path.tmp`, then `rename` over the
 *  original. Avoids a torn write on crash mid-refresh.
 */
export function refreshSnippets(
  cwd: string,
  rules: ReadonlyArray<Rule>,
  targets: ReadonlyArray<string> = [...SNIPPET_TARGETS],
): RefreshResult {
  const result: {
    rewritten: string[];
    failClosed: string[];
    mismatched: string[];
    absent: string[];
  } = { rewritten: [], failClosed: [], mismatched: [], absent: [] };
  for (const filename of targets) {
    const path = join(cwd, filename);
    if (!existsSync(path)) {
      result.absent.push(filename);
      continue;
    }
    const existing = readFileSync(path, 'utf-8');
    const agentName = filename.replace(/\.md$/i, '').toLowerCase();
    // Generate the per-agent snippet body. For non-AGENTS/CLAUDE targets,
    // generateAgentsMdSnippet still emits reasonable Markdown.
    const generator =
      agentName === 'claude' ? generateAgentsMdSnippet : generateAgentsMdSnippet;
    const newBlock = generator([...rules]).trim();
    const outcome = safeRewrite(existing, newBlock);
    if (outcome.rewritten) {
      // Atomic write: tmp + rename.
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, outcome.content, 'utf-8');
      const fs = require('node:fs') as typeof import('node:fs');
      fs.renameSync(tmp, path);
      result.rewritten.push(filename);
    } else if (outcome.failClosed) {
      result.failClosed.push(filename);
    } else if (outcome.mismatched) {
      result.mismatched.push(filename);
    }
  }
  return result;
}
