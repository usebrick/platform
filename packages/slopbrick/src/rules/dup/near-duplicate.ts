/**
 * Rule: dup/near-duplicate
 *
 * Type-2 clone detection. Two source files whose tokenized k-gram
 * sets have Jaccard similarity > threshold (default 0.7) are
 * near-duplicates. Catches the common AI-edit pattern: the model
 * produces a similar function with whitespace/comment edits
 * (Type-2a) and a subset of renames (Type-2b).
 *
 * **Why this matters:**
 * - The v0.19 dup/identical-block (Type-1) catches only byte-
 *   for-byte matches after normalization. Real AI refactors
 *   produce Type-2 (renames) and Type-3 (structural) clones
 *   that v0.19 misses.
 * - slopbrick is the first SAST-class tool to ship the full
 *   clone taxonomy (Type-1 in v0.19, Type-2 in v0.23, Type-3
 *   in v0.27). Type-2 is the most common AI-edit pattern.
 * - Severity: medium. Duplication is a code smell (hard to
 *   maintain, hard to evolve), not a bug.
 *
 * **Scope:** cross-file. Module-scope dedup cache. Same pattern
 * as dup/identical-block — the cache is per-process, so each
 * `slopbrick scan` run sees a fresh state.
 *
 * **Algorithm (per-process):**
 *   1. Tokenize source into k-gram shingles (k=5)
 *   2. Compute MinHash signature (128 hashes)
 *   3. Compare against all previously-seen signatures
 *   4. Fire if Jaccard similarity > 0.7
 *
 * v0.23.0 ships defaultOff (DORMANT) until calibration confirms
 * the threshold.
 *
 * v0.23.0 limitations:
 *   - Full renames (Type-2b) break all 5-grams. The rule catches
 *     whitespace/comment differences (Type-2a) and partial
 *     renames. Full-rename detection requires identifier
 *     canonicalization or AST similarity (planned for v0.27.0).
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { shingleSet } from '../../engine/dedup/tokenize.js';
import { minHash, minHashSimilarity } from '../../engine/dedup/minhash.js';

export interface NearDuplicateContext {
  /** Jaccard similarity threshold for firing. Default 0.7. */
  threshold: number;
  /** Shingle size k. Default 5. */
  k: number;
}

const DEFAULT_CONTEXT: NearDuplicateContext = {
  threshold: 0.7,
  k: 5,
};

/**
 * Module-scope dedup cache. The MinHash signature is keyed by
 * file path. Mirrors the dup/identical-block pattern. The cache
 * is per-process, so each `slopbrick scan` run sees a fresh state.
 */
const signatureCache: Map<string, Uint32Array> = new Map();

/** Clear the per-process cache before a new project scan. */
export function resetNearDuplicateCache(): void {
  signatureCache.clear();
}

/** Backward-compatible test helper. */
export const _resetNearDupCacheForTesting = resetNearDuplicateCache;

export const nearDuplicateRule = createRule<NearDuplicateContext>({
  id: 'dup/near-duplicate',
  category: 'logic',
  severity: 'medium',
  aiSpecific: true,
  description:
    'Near-duplicate file (Type-2 clone) — token-set Jaccard similarity > 0.7 ' +
    'after MinHash. Catches AI whitespace/comment refactors.',
  create(_context: RuleContext): NearDuplicateContext {
    return { ...DEFAULT_CONTEXT };
  },
  analyze(context: NearDuplicateContext, facts: ScanFacts): Issue[] {
    // Merge with defaults so a direct analyze() call with an empty
    // context (e.g. in tests) still works. The engine calls analyze
    // with the result of create(), which already fills in defaults,
    // so this is a no-op in production.
    const ctx: NearDuplicateContext = { ...DEFAULT_CONTEXT, ...context };
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    const filePath = facts.filePath;
    if (!filePath) return issues;

    // 1. Tokenize + MinHash
    const shingles = shingleSet(source, { k: ctx.k });
    if (shingles.size === 0) return issues;
    const sig = minHash(shingles);

    // 2. Compare against all previously-seen signatures
    const matched: { path: string; similarity: number }[] = [];
    for (const [prevPath, prevSig] of signatureCache.entries()) {
      const sim = minHashSimilarity(sig, prevSig);
      if (sim >= ctx.threshold) {
        matched.push({ path: prevPath, similarity: sim });
      }
    }

    // 3. Fire one issue per match (point to the highest-similarity match)
    if (matched.length > 0) {
      matched.sort((a, b) => b.similarity - a.similarity);
      const best = matched[0]!;
      issues.push({
        ruleId: 'dup/near-duplicate',
        category: 'logic',
        severity: 'medium',
        aiSpecific: true,
        message:
          `Near-duplicate of ${best.path} (Jaccard ${(best.similarity * 100).toFixed(1)}%, threshold ${(ctx.threshold * 100).toFixed(0)}%)`,
        line: 1,
        column: 1,
        advice:
          'Refactor to share the implementation, or rename/restructure to make the difference intentional. ' +
          'This is the v0.23.0 Type-2 clone detector; similarity can be intentional reuse or copy-paste. ' +
          'Reference: dup/near-duplicate v0.23.',
      });
    }

    // 4. Add this file's signature to the cache for subsequent files
    signatureCache.set(filePath, sig);

    return issues;
  },
});

export default nearDuplicateRule satisfies Rule<NearDuplicateContext>;
