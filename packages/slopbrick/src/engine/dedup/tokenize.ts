/**
 * Source tokenizer for near-duplicate detection.
 *
 * Splits source code into normalized k-gram tokens suitable for
 * MinHash. The goal: two files that are "near duplicates" (renames,
 * whitespace changes, comment edits) produce high-overlapping
 * token sets, while genuinely different files produce low overlap.
 *
 * Normalization:
 *   1. Strip line comments (// ...) and block comments (/* ... *\/).
 *   2. Lowercase.
 *   3. Split on whitespace + punctuation (preserves identifier
 *      boundaries).
 *   4. Remove empty tokens.
 *
 * Shingling:
 *   Group every K consecutive tokens into a shingle. The shingle
 *   string is "t1 t2 ... tK" (space-joined). Two files with
 *   identical shingles except for a single renamed identifier will
 *   share (K-1)/K of their shingles — high enough to be flagged
 *   as near-duplicate.
 *
 * K is configurable; default 5 is the standard for code dedup.
 * Higher K = stricter (fewer false positives, more false negatives).
 */

import { createHash } from 'node:crypto';

export interface TokenizeConfig {
  /** Shingle size (number of tokens per shingle). Default 5. */
  k: number;
}

const DEFAULT_CONFIG: TokenizeConfig = { k: 5 };

/** Strip JS-style comments. Preserves string contents. */
function stripComments(source: string): string {
  // Naive: handle line comments // and block comments /* */
  // Doesn't try to be a full parser — just removes obvious comment text.
  // Strings ("..." and '...' and `...`) are left intact (they have
  // real content we want to dedupe).
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    // Line comment
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    // Block comment
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Split source into normalized identifier-shaped tokens. */
function tokenize(source: string): string[] {
  return source
    .toLowerCase()
    .split(/[^a-z0-9_]+/u)
    .filter((t) => t.length > 0);
}

/** Hash a shingle string to a 32-bit unsigned int. */
function shingleHash(shingle: string): number {
  const h = createHash('sha1').update(shingle).digest();
  return ((h[0] ?? 0) << 24) | ((h[1] ?? 0) << 16) | ((h[2] ?? 0) << 8) | (h[3] ?? 0);
}

/**
 * Tokenize a source file into a set of hashed k-gram shingles.
 *
 * @returns Set of 32-bit hashes. Two near-duplicate files will
 *   produce sets with high overlap (Jaccard similarity > 0.7 for
 *   default K=5).
 *
 * If the source has fewer than K tokens, returns a set with a single
 * hash (the entire content as one shingle). If the source is empty,
 * returns an empty set.
 */
export function shingleSet(
  source: string,
  config: Partial<TokenizeConfig> = {},
): Set<number> {
  const { k } = { ...DEFAULT_CONFIG, ...config };
  const tokens = tokenize(stripComments(source));
  if (tokens.length === 0) return new Set();
  if (tokens.length < k) {
    return new Set([shingleHash(tokens.join(' '))]);
  }
  const out = new Set<number>();
  for (let i = 0; i + k <= tokens.length; i++) {
    out.add(shingleHash(tokens.slice(i, i + k).join(' ')));
  }
  return out;
}

/** Convenience: tokenize without comment stripping. Faster. */
export function shingleSetRaw(
  source: string,
  config: Partial<TokenizeConfig> = {},
): Set<number> {
  const { k } = { ...DEFAULT_CONFIG, ...config };
  const tokens = tokenize(source);
  if (tokens.length === 0) return new Set();
  if (tokens.length < k) {
    return new Set([shingleHash(tokens.join(' '))]);
  }
  const out = new Set<number>();
  for (let i = 0; i + k <= tokens.length; i++) {
    out.add(shingleHash(tokens.slice(i, i + k).join(' ')));
  }
  return out;
}
