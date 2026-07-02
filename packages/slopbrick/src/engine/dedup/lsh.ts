/**
 * LSH (Locality-Sensitive Hashing) — find candidate near-duplicate
 * pairs from a collection of MinHash signatures.
 *
 * Algorithm (Indyk-Motwani, 1998; Leskovec/Rajaraman/Ullman §3.4.4):
 *
 *   1. Divide each signature into `numBands` bands of `rowsPerBand`
 *      consecutive rows.
 *   2. For each band, hash the (bandIndex, bandContent) pair to a
 *      bucket.
 *   3. Two signatures that share a bucket in ANY band are
 *      "candidate pairs" — they're flagged for verification.
 *   4. The verification step (not done here) computes the actual
 *      Jaccard similarity.
 *
 * Probability of two signatures with Jaccard similarity s being
 * candidates:
 *
 *   P(candidate) = 1 - (1 - s^rowsPerBand)^numBands
 *
 * This S-curve can be tuned: increasing `rowsPerBand` raises the
 * threshold (fewer false positives, more false negatives) and
 * decreasing it lowers the threshold.
 *
 * Default parameters (rowsPerBand=4, numBands=32) approximate a
 * threshold near Jaccard ≈ 0.7:
 *
 *   s=0.5  →  P ≈ 0.0002   (correctly rejected)
 *   s=0.7  →  P ≈ 0.40     (probabilistic)
 *   s=0.8  →  P ≈ 0.92     (almost always caught)
 *   s=0.9  →  P ≈ 0.9997   (correctly caught)
 *
 * The signature length MUST be divisible by rowsPerBand. With the
 * MinHash default of 128 hashes and rowsPerBand=4, numBands=32
 * works.
 *
 * Time: O(numSignatures × numBands) for the bucketing step.
 * Space: O(numSignatures × numBands) buckets in the worst case.
 */

import { createHash } from 'node:crypto';

export interface LshConfig {
  /** Number of rows per band. Higher = stricter threshold. Default 4. */
  rowsPerBand: number;
  /** Number of bands. Default 32 (gives 128-row signature). */
  numBands: number;
}

const DEFAULT_CONFIG: LshConfig = {
  rowsPerBand: 4,
  numBands: 32,
};

/** Hash a band (a slice of the signature) to a bucket. */
function bandHash(signature: Uint32Array, bandIdx: number, rowsPerBand: number): string {
  // Stable, fast, includes band index so different bands hash differently.
  const h = createHash('sha1');
  h.update(`b${bandIdx}:`);
  for (let i = 0; i < rowsPerBand; i++) {
    h.update(`${signature[bandIdx * rowsPerBand + i]},`);
  }
  return h.digest('hex').slice(0, 16);
}

export interface Candidate {
  /** Index into the signatures array. */
  i: number;
  /** Other index into the signatures array. */
  j: number;
}

export interface LshIndex {
  /** All candidate pairs found. (i < j, deduplicated.) */
  candidates(): readonly Candidate[];
  /** Number of input signatures. */
  size(): number;
}

/**
 * Build an LSH index from a list of MinHash signatures.
 *
 * The returned index is queryable for candidate pairs in O(candidates)
 * time. Each candidate pair (i, j) has i < j.
 *
 * Two signatures must have the same length. The length must be
 * divisible by `rowsPerBand` (else throws).
 */
export function buildLshIndex(
  signatures: readonly Uint32Array[],
  config: Partial<LshConfig> = {},
): LshIndex {
  const { rowsPerBand, numBands } = { ...DEFAULT_CONFIG, ...config };
  if (signatures.length === 0) {
    return { candidates: () => [], size: () => 0 };
  }
  const firstSig = signatures[0]!;
  const sigLen = firstSig.length;
  if (sigLen !== rowsPerBand * numBands) {
    throw new Error(
      `lsh: signature length ${sigLen} != rowsPerBand ${rowsPerBand} × numBands ${numBands}`,
    );
  }

  // For each band, maintain a Map<bucketHash, Set<signatureIndex>>.
  const bandBuckets: Map<string, Set<number>>[] = Array.from(
    { length: numBands },
    () => new Map(),
  );

  for (let idx = 0; idx < signatures.length; idx++) {
    const sig = signatures[idx]!;
    for (let b = 0; b < numBands; b++) {
      const bucket = bandHash(sig, b, rowsPerBand);
      let set = bandBuckets[b]!.get(bucket);
      if (!set) {
        set = new Set();
        bandBuckets[b]!.set(bucket, set);
      }
      set.add(idx);
    }
  }

  // Collect candidate pairs across all bands, dedupe.
  const seen = new Set<string>();
  const pairs: Candidate[] = [];
  for (const buckets of bandBuckets) {
    for (const set of buckets.values()) {
      if (set.size < 2) continue;
      const arr = Array.from(set);
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const ai = arr[i]!;
          const aj = arr[j]!;
          const a = Math.min(ai, aj);
          const b = Math.max(ai, aj);
          const key = `${a}:${b}`;
          if (seen.has(key)) continue;
          seen.add(key);
          pairs.push({ i: a, j: b });
        }
      }
    }
  }
  return {
    candidates: () => pairs,
    size: () => signatures.length,
  };
}
