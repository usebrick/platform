/**
 * MinHash — locality-sensitive hashing for set similarity estimation.
 *
 * Given a set of integers (typically hash values of k-gram tokens from
 * a source file), produces a fixed-size signature where the Jaccard
 * similarity of two sets can be estimated by the fraction of signature
 * positions that match.
 *
 * Algorithm (Broder, 1997):
 *   For each of `numHashes` independent hash functions h_i:
 *     sig[i] = min { h_i(x) for x in set }
 *   Two sets A, B: Jaccard(A, B) ≈ |{ i : sig_A[i] = sig_B[i] }| / numHashes
 *
 * In practice we use a single universal hash family parameterized by
 * (a, b) where h(x) = (a*x + b) mod p, with p a fixed prime larger
 * than the maximum hash value. This gives the (a, b) trick from
 * Leskovec, Rajaraman, Ullman (2014) MMDS textbook §3.4.
 *
 * Time: O(|set| × numHashes). Space: O(numHashes) for the signature.
 *
 * Used by dup/near-duplicate to estimate token-set similarity between
 * source files. The output signature is consumed by lsh.ts to find
 * candidate pairs efficiently.
 */

import { createHash } from 'node:crypto';

/** Largest prime > 2^32 — Leskovec/Rajaraman/Ullman §3.4.2. */
const PRIME = (1n << 61n) - 1n;

/** 64-bit mix — MurmurHash3 finalizer. Stable across runs. */
function mix64(x: bigint): bigint {
  x ^= x >> 33n;
  x = (x * 0xff51afd7ed558ccdn) & 0xffffffffffffffffn;
  x ^= x >> 33n;
  x = (x * 0xc4ceb9fe1a85ec53n) & 0xffffffffffffffffn;
  x ^= x >> 33n;
  return x;
}

/** Bigint mod for positive divisor. */
function bmod(a: bigint, m: bigint): bigint {
  const r = a % m;
  return r < 0n ? r + m : r;
}

/**
 * Hash a token string to a 32-bit unsigned int.
 *
 * Uses SHA-1 of the token (deterministic, fast, well-distributed).
 * We only need the first 4 bytes; the rest is discarded.
 */
export function hashToken(token: string): number {
  const h = createHash('sha1').update(token).digest();
  // Read first 4 bytes as big-endian uint32.
  return ((h[0] ?? 0) << 24) | ((h[1] ?? 0) << 16) | ((h[2] ?? 0) << 8) | (h[3] ?? 0);
}

/** Random-but-deterministic (a, b) pair for hash i. Same i ⇒ same (a, b). */
function hashParams(i: number): [bigint, bigint] {
  // Mix i to get a, b. Bigint domain.
  const a = (mix64(BigInt(i) * 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn) | 1n;
  const b = mix64(BigInt(i) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
  return [a, b];
}

/**
 * Hash function h_i(x) = (a_i * x + b_i) mod p, then take lower 32 bits.
 * Output: uint32.
 */
function hashAt(i: number, x: number): number {
  const [a, b] = hashParams(i);
  const xb = BigInt(x >>> 0);
  const combined = a * xb + b;
  const h = Number(bmod(combined, PRIME) & 0xffffffffn);
  return h >>> 0;
}

export interface MinHashConfig {
  /** Number of hash functions (signature size). Default 128. */
  numHashes: number;
}

const DEFAULT_CONFIG: MinHashConfig = {
  numHashes: 128,
};

/**
 * Compute a MinHash signature for a set of hashed tokens.
 *
 * @param tokens Hash values of tokens (typically hashToken() applied to
 *   k-gram tokens from a source file).
 * @param config.numHashes Signature length. More = better precision,
 *   more memory. 128 is the standard (≈0.5% error on similarity 0.7).
 * @returns Array of length numHashes. sig[i] is the min over all
 *   tokens of hashAt(i, token).
 *
 * If `tokens` is empty, returns an array of `numHashes` copies of
 * `0xffffffff` (the max uint32 — distinct enough from any real
 * signature to never collide).
 */
export function minHash(
  tokens: ReadonlySet<number> | Iterable<number>,
  config: Partial<MinHashConfig> = {},
): Uint32Array {
  const { numHashes } = { ...DEFAULT_CONFIG, ...config };
  const sig = new Uint32Array(numHashes);
  // Initialize to max uint32 (sentinel for "no min found yet").
  sig.fill(0xffffffff);

  const tokenIter: Iterable<number> =
    tokens instanceof Set ? tokens : Array.from(tokens as Iterable<number>);
  for (const t of tokenIter) {
    for (let i = 0; i < numHashes; i++) {
      const h = hashAt(i, t);
      if (h < (sig[i] ?? 0xffffffff)) sig[i] = h;
    }
  }
  return sig;
}

/**
 * Estimate the Jaccard similarity of two MinHash signatures.
 *
 * Returns the fraction of positions where the signatures match
 * (within a 32-bit comparison). This is an unbiased estimator with
 * variance ≈ 1/(numHashes × Jaccard).
 *
 * Two empty signatures return 1.0 (both empty sets are equal).
 */
export function minHashSimilarity(a: Uint32Array, b: Uint32Array): number {
  if (a.length !== b.length) {
    throw new Error(`minHashSimilarity: length mismatch ${a.length} vs ${b.length}`);
  }
  if (a.length === 0) return 1.0;
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) matches++;
  }
  return matches / a.length;
}
