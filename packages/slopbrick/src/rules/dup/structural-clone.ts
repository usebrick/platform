/**
 * Rule: dup/structural-clone
 *
 * Type-3 clone detection. Two source files whose canonical-token
 * shingles AND identifier shingles both have high MinHash Jaccard
 * similarity are structural clones. Catches the AI-edit patterns
 * that dup/near-duplicate (Type-2, v0.23) misses:
 *
 *   - Identifier renames (Type-3a): `function add(a,b) { return a+b }`
 *     vs `function sum(x,y) { return x+y }`. Same shape, different
 *     names everywhere.
 *   - Statement add/remove (Type-3b): a developer (or an AI
 *     agent) inserts or deletes a single statement between two
 *     otherwise identical blocks. The canonical streams still match
 *     in 80%+ of positions, so the Jaccard is well above the
 *     structural threshold.
 *
 * **Why this matters:**
 * - dup/identical-block (Type-1, v0.19): byte-for-byte matches
 *   after normalization. Misses every real AI refactor.
 * - dup/near-duplicate (Type-2, v0.23): catches Type-2a
 *   (whitespace + comment) and Type-2b (partial rename). Misses
 *   full renames — every identifier is different, every k-gram
 *   breaks.
 * - dup/structural-clone (Type-3, v0.24): closes the
 *   identifier-canonicalization gap. This is what AI agents
 *   produce when iterating on a function: same control flow,
 *   different names.
 * - Severity: medium. Duplication is a code smell (hard to
 *   maintain, hard to evolve), not a bug.
 *
 * **Algorithm:**
 *   Stage 1: canonicalTokens (identifiers→ID, literals→NUM/BOOL/STR,
 *            keywords + operators + punctuation preserved) →
 *            structuralShingles (k=8) → minHash signature.
 *   Stage 2: identifier shingles (k=5) via existing shingleSet →
 *            minHash signature.
 *   Filter:  harmonic mean of Stage 1 + Stage 2 Jaccard
 *            similarities must exceed `verifyThreshold` AND
 *            Stage 1 alone must exceed `structuralThreshold`.
 *   minHits: minimum number of files that must match before an
 *            issue is emitted. v0.24.0 ships minHits=1; v0.24.1
 *            raises it to 3 to suppress single-shared-clone FPs.
 *
 * v0.24.0 ships this rule `defaultOff` (DORMANT) until the v9
 * corpus confirms precision/recall.
 */

import type { Rule, Issue, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import {
  structuralSignature,
  shingleSet,
  minHash,
  minHashSimilarity,
} from '../../engine/dedup/index.js';

export interface StructuralCloneContext {
  /** Stage-1 (canonical) Jaccard floor. */
  structuralThreshold: number;
  /** Harmonic-mean blended Jaccard floor (Stage 1 + Stage 2). */
  verifyThreshold: number;
  /** k for the canonical shingle. */
  kStruct: number;
  /** k for the identifier shingle. */
  kIdent: number;
  /** Minimum canonical tokens before a file is shingled. */
  minTokens: number;
  /** Minimum number of matched files before an issue fires. v0.24.0
   *  ships 1; v0.24.1 raises to 3. */
  minHits: number;
}

const DEFAULT_CONTEXT: StructuralCloneContext = {
  structuralThreshold: 0.55,
  verifyThreshold: 0.45,
  kStruct: 8,
  kIdent: 5,
  minTokens: 60,
  minHits: 1,
};

/**
 * Module-scope caches. The dedup cache is per-process so each
 * `slopbrick scan` run sees a fresh state. Two maps: one keyed by
 * the Stage-1 (canonical) signature, one by the Stage-2
 * (identifier) signature. The cache lookup walks the Stage-1 map
 * first (cheap structural filter) before consulting the Stage-2
 * map for the verification step — that ordering avoids MinHash
 * compares on the Stage-2 signatures of files the Stage-1 gate
 * already rejected.
 */
const structuralCache: Map<string, Uint32Array> = new Map();
const identifierCache: Map<string, Uint32Array> = new Map();

/** Test-only: clear both caches. */
export function _resetStructuralCloneCacheForTesting(): void {
  structuralCache.clear();
  identifierCache.clear();
}

export const structuralCloneRule = createRule<StructuralCloneContext>({
  id: 'dup/structural-clone',
  category: 'logic',
  severity: 'medium',
  aiSpecific: true,
  defaultOff: true,
  description:
    'Structural clone (Type-3) — same shape after identifier canonicalization with possible added/removed statements. Two-stage MinHash: canonical + identifier.',
  create(_context: RuleContext): StructuralCloneContext {
    return { ...DEFAULT_CONTEXT };
  },
  analyze(context: StructuralCloneContext, facts: ScanFacts): Issue[] {
    // Merge with defaults so a direct analyze() call with an empty
    // context (e.g. in tests) still works. The engine calls analyze
    // with the result of create(), which already fills in defaults,
    // so this is a no-op in production.
    const ctx: StructuralCloneContext = { ...DEFAULT_CONTEXT, ...context };
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    const filePath = facts.filePath;
    if (!filePath) return issues;

    // 1. Compute both signatures.
    const sigStruct = structuralSignature(source, {
      k: ctx.kStruct,
      minTokens: ctx.minTokens,
    });
    // Empty signature (source too short for Stage 1 to shingle)
    // means we cannot fire — but also cannot be cached, because the
    // all-max sentinel would collide with every other empty source.
    if (sigStruct.every((v) => v === 0xffffffff)) return issues;

    const identShingles = shingleSet(source, { k: ctx.kIdent });
    if (identShingles.size === 0) return issues;
    const sigIdent = minHash(identShingles);

    // 2. Two-stage match: walk the Stage-1 cache, gate on
    //    structuralThreshold, then verify with Stage-2 via a
    //    harmonic-mean blend.
    const matched: { path: string; score: number; simStruct: number; simIdent: number }[] = [];
    for (const [prevPath, prevStruct] of structuralCache.entries()) {
      // Don't match a file against its own cached signature. This
      // is the common case for repeat calls on the same file in
      // tests; without the guard, a single file would always fire
      // against itself.
      if (prevPath === filePath) continue;
      const simStruct = minHashSimilarity(sigStruct, prevStruct);
      if (simStruct < ctx.structuralThreshold) continue;
      const prevIdent = identifierCache.get(prevPath);
      if (!prevIdent) continue;
      const simIdent = minHashSimilarity(sigIdent, prevIdent);
      if (simIdent <= 0) continue;
      const score = (2 * simStruct * simIdent) / (simStruct + simIdent + 1e-9);
      if (score >= ctx.verifyThreshold) {
        matched.push({ path: prevPath, score, simStruct, simIdent });
      }
    }

    // 3. Fire one issue per matched group when minHits is met.
    if (matched.length >= ctx.minHits) {
      matched.sort((a, b) => b.score - a.score);
      const best = matched[0]!;
      issues.push({
        ruleId: 'dup/structural-clone',
        category: 'logic',
        severity: 'medium',
        aiSpecific: true,
        message:
          `Structural clone of ${best.path} (canonical Jaccard ` +
          `${(best.simStruct * 100).toFixed(1)}%, identifier Jaccard ` +
          `${(best.simIdent * 100).toFixed(1)}%, blend ` +
          `${(best.score * 100).toFixed(1)}% — threshold ` +
          `${(ctx.verifyThreshold * 100).toFixed(0)}%)`,
        line: 1,
        column: 1,
        advice:
          'Refactor to a shared helper. This is a Type-3 clone — ' +
          'two files share canonical shape after identifier ' +
          'normalization and likely a few added/removed statements. ' +
          'AI agents produce Type-3 clones when iterating on a ' +
          'function: same control flow, different names, a few ' +
          'lines added. (v0.24.0 — two-stage MinHash on canonical ' +
          'k=8 + identifier k=5 shingles.)',
        extras: {
          structuralDuplicateOf: {
            file: best.path,
            score: best.score,
          },
        },
      });
    }

    // 4. Add this file's signatures to the cache for subsequent
    //    files. Always run (even when `analyze` returned early) so
    //    later files compare against this one's signatures too.
    structuralCache.set(filePath, sigStruct);
    identifierCache.set(filePath, sigIdent);

    return issues;
  },
});

export default structuralCloneRule satisfies Rule<StructuralCloneContext>;
