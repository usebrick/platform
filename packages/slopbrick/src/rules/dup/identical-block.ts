/**
 * Rule: dup/identical-block
 *
 * Detects blocks of >=10 lines that are byte-for-byte identical across
 * >=2 files (Type-1 clone detector). The most common AI code pattern:
 * copy-paste from training data.
 *
 * **Why this matters:**
 * - AI agents frequently copy-paste boilerplate (validation logic, error
 *   handling, fetch wrappers) from their training data verbatim. The
 *   same 10-50 line block can appear in hundreds of files in a single
 *   AI-generated codebase.
 * - Real hand-written code rarely has identical 10+ line blocks across
 *   files — engineers refactor to a shared helper, or the code differs
 *   by project context.
 * - Severity: medium. False positives are rare because the 10-line
 *   minimum + per-line comment/whitespace normalization filters out
 *   license headers and trivial boilerplate.
 *
 * **Architecture (v0.19):**
 * This rule uses a module-scope in-memory cache for cross-file
 * dedup. The cache persists across `analyze()` calls in the same
 * worker process. **Limitations:**
 *   1. **Cross-worker:** the cache is per-worker-process. Files split
 *      across worker threads are deduplicated within each worker, but
 *      not across workers. For full coverage, run with `--threads 1`.
 *   2. **Cross-scan:** the cache is not reset between `slopbrick scan`
 *      invocations in long-running processes. For CLI usage (process
 *      exits after each scan), this is a non-issue.
 *   3. **Ordering:** duplicates are reported for the file that is
 *      processed LATER. If file A is analyzed before file B, the
 *      duplicate is reported for B but not for A. This is a v0.19
 *      limitation; v0.20 will add a proper two-phase pass.
 *
 * **Scope:** file-local analysis, but cross-file state via the cache.
 * Cross-file dedup is opt-in (default off until calibrated on v0.20's
 * near-dup calibration corpus).
 */

import * as crypto from 'node:crypto';
import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/** Number of lines per window. v0.19: 10. v0.21.1: 20.
 *  Larger windows reduce FPs (the longer a block, the less likely
 *  it is to match by coincidence) at the cost of missing shorter
 *  real duplications. The v0.21.0 self-scan with WINDOW_SIZE=10
 *  produced ~575 fires in src/; WINDOW_SIZE=20 (v0.21.1) drops
 *  that to ~177 fires — net better signal-to-noise for the
 *  default-on rule. */
const WINDOW_SIZE = 20;

/**
 * Minimum normalized-block length (chars) before we hash it. Blocks
 * shorter than this are too short to produce a reliable hash and too
 * short to be meaningful (trivial boilerplate).
 */
const MIN_NORMALIZED_LENGTH = 40;

/**
 * Truncate the SHA-1 to 16 hex chars (64 bits). Collision risk is
 * ~2^-32 per pair — acceptable for a dedup cache where the worst
 * case is a false positive (we report a duplicate that isn't really
 * identical).
 */
const HASH_PREFIX_LENGTH = 16;

/**
 * Module-scope cache. Key: hash. Value: list of (file, line) where
 * this hash was seen. The cache grows as files are processed; for
 * 50k files × 200 lines / 10 window = 1M entries ≈ 50MB. Acceptable
 * for v0.19.
 */
const DEDUP_CACHE: Map<string, Array<{ file: string; line: number }>> = new Map();

/**
 * Test-only: clear the in-memory dedup cache. Used by the test suite to
 * ensure each test starts with a fresh cache. Not exported from the
 * rule's public API (no callers outside the test suite).
 */
export function _resetDedupCacheForTesting(): void {
  DEDUP_CACHE.clear();
}

export interface DupIdenticalBlockContext {
  // No configuration needed. Future: add minLines, ignore patterns, etc.
}

/**
 * Normalize a 10-line window and hash it. Returns undefined if the
 * normalized block is too short or empty.
 *
 * Normalization:
 *   1. Strip line comments (// ...) and block comments (/* ... *​/)
 *   2. Collapse internal whitespace to single spaces
 *   3. Drop empty lines
 *   4. Trim each line
 */
function normalizeAndHash(lines: string[]): string | undefined {
  const normalized = lines
    .map((line) =>
      line
        .replace(/\/\/.*$/, '')             // strip // comments
        .replace(/\/\*[\s\S]*?\*\//g, '')   // strip /* ... */ block comments
        .replace(/\s+/g, ' ')                // collapse whitespace
        .trim(),
    )
    .filter((line) => line.length > 0)
    .join('\n');
  if (normalized.length < MIN_NORMALIZED_LENGTH) return undefined;
  return crypto.createHash('sha1').update(normalized).digest('hex').slice(0, HASH_PREFIX_LENGTH);
}

export const dupIdenticalBlockRule = createRule<DupIdenticalBlockContext>({
  id: 'dup/identical-block',
  category: 'logic',
  severity: 'medium',
  aiSpecific: false,
  description: 'Block of >=10 lines is identical across >=2 files (Type-1 clone detector)',
  create(_context: RuleContext): DupIdenticalBlockContext {
    return {};
  },
  analyze(_context: DupIdenticalBlockContext, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;

    const filePath = facts.filePath;
    const lines = source.split('\n');

    for (let i = 0; i <= lines.length - WINDOW_SIZE; i++) {
      const window = lines.slice(i, i + WINDOW_SIZE);
      const hash = normalizeAndHash(window);
      if (!hash) continue;

      const existing = DEDUP_CACHE.get(hash) ?? [];
      const matches = existing.filter((m) => m.file !== filePath);

      for (const match of matches) {
        // v0.19 limitation: we emit an issue for the CURRENT file only.
        // The previous file (match.file) does not get a duplicate issue
        // from this rule because the rule's `analyze` runs per-file and
        // the previous file is no longer in the scan context. v0.20
        // will add a post-scan pass that emits deferred issues for all
        // files in a duplicate group.
        issues.push({
          ruleId: 'dup/identical-block',
          category: 'logic',
          severity: 'medium',
          aiSpecific: false,
          message:
            `Identical ${WINDOW_SIZE}-line block at line ${i + 1} ` +
            `also appears in ${match.file}:${match.line + 1}`,
          line: i + 1,
          column: 0,
          advice:
            'Refactor to a shared helper. This is a Type-1 clone ' +
            '(byte-for-byte identical after normalization). Common in ' +
            'AI-generated code that copy-pastes from training data.',
          extras: {
            duplicateOf: {
              file: match.file,
              line: match.line + 1,
              hash,
            },
          },
        });
      }

      // Add the current window to the cache so later files can find it.
      existing.push({ file: filePath, line: i });
      DEDUP_CACHE.set(hash, existing);
    }

    return issues;
  },
});

export default dupIdenticalBlockRule satisfies Rule<DupIdenticalBlockContext>;
