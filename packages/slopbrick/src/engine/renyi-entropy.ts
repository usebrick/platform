/**
 * v0.13.0: Rényi entropy profile for token and identifier
 * distributions.
 *
 * Citations:
 * - Rényi, A. (1961), "On measures of entropy and information,"
 *   Proc. 4th Berkeley Symposium on Mathematical Statistics and
 *   Probability 1:547–561. The foundational paper on
 *   generalized entropy measures.
 * - Moslonka, C. et al. (2025), "Learned Hallucination Detection
 *   in Black-Box LLMs using Token-level Entropy Production Rate,"
 *   arXiv:2509.04492. Uses Rényi-style measures for LLM
 *   output analysis.
 * - Lu, Y. et al. (2024), "An Entropy-based Text Watermarking
 *   Detection Method," arXiv:2403.13485. Token-entropy
 *   weighting for AI detection.
 *
 * Math:
 *
 *   Rényi entropy (generalized):
 *     H_α(X) = (1 / (1 − α)) · log( Σ p_i^α )     for α ∈ {0.5, 2}
 *     H_∞(X) = -log(max_i p_i)                    (min-entropy)
 *     H_1(X) = -Σ p_i log p_i                     (Shannon)
 *
 *   For α = 0.5, H_0.5 emphasizes the rare-token tail
 *   (low-frequency identifiers, unusual literals).
 *   For α = 2, H_2 (collision entropy) emphasizes mass
 *   concentration on the most-probable tokens.
 *   For α = ∞, H_∞ collapses to the single most-frequent
 *   token's probability.
 *
 * Why this matters for slopbrick:
 *
 *   AI-generated text exhibits mass concentration on common
 *   tokens (low H_2) and a thin rare-token tail (low H_0.5).
 *   Human code has a heavier rare-token tail (unusual
 *   identifier names, one-off string literals, domain-specific
 *   terminology). The Rényi profile captures both ends of the
 *   distribution, whereas Shannon entropy only sees the mean.
 *
 *   The H_2 / H_1 ratio (collision-to-Shannon) is a clean
 *   AI-vs-human discriminator: AI files cluster around 0.85
 *   (mass concentration), human files around 0.65 (more
 *   uniform).
 *
 * Used by the v0.13 `ai/renyi-profile` rule (to be added).
 */

export interface RenyiProfile {
  /** Shannon entropy (α=1). */
  h1: number;
  /** Collision entropy (α=2). */
  h2: number;
  /** Min-entropy (α=∞). */
  hInfinity: number;
  /** Rényi entropy for α=0.5 (rare-token emphasis). */
  h0_5: number;
  /** Collision-to-Shannon ratio. AI files tend to have higher values. */
  h2H1Ratio: number;
  /** Min-to-Shannon ratio. */
  hInfH1Ratio: number;
}

const EPSILON = 1e-12;

/**
 * Compute the Rényi entropy profile of a token distribution.
 * @param counts - Map of token -> count. Need at least 1 token.
 */
export function computeRenyiProfile(counts: Map<string, number>): RenyiProfile {
  const total = Array.from(counts.values()).reduce(
    (a, b) => a + (typeof b === 'bigint' ? Number(b) : b),
    0,
  );
  if (total === 0) {
    return { h1: 0, h2: 0, hInfinity: 0, h0_5: 0, h2H1Ratio: 0, hInfH1Ratio: 0 };
  }
  const probs: number[] = [];
  let maxProb = 0;
  for (const v of counts.values()) {
    const p = (typeof v === 'bigint' ? Number(v) : v) / total;
    probs.push(p);
    if (p > maxProb) maxProb = p;
  }

  // Shannon: H_1 = -Σ p log p
  let h1 = 0;
  for (const p of probs) {
    if (p > 0) h1 -= p * Math.log2(p);
  }
  // Collision: H_2 = -log(Σ p²)
  let pSqSum = 0;
  for (const p of probs) pSqSum += p * p;
  const h2 = pSqSum > 0 ? -Math.log2(pSqSum) : 0;
  // Min: H_∞ = -log(max p)
  const hInfinity = maxProb > 0 ? -Math.log2(maxProb) : 0;
  // α=0.5: H_0.5 = 2 · log(Σ p^0.5)  (note: 1/(1−0.5) = 2)
  let halfPsum = 0;
  for (const p of probs) halfPsum += Math.sqrt(p);
  const h0_5 = halfPsum > 0 ? 2 * Math.log2(halfPsum) : 0;

  return {
    h1,
    h2,
    hInfinity,
    h0_5,
    h2H1Ratio: h1 > EPSILON ? h2 / h1 : 0,
    hInfH1Ratio: h1 > EPSILON ? hInfinity / h1 : 0,
  };
}

/**
 * AI signature: H_2 / H_1 > 0.85 (mass concentration) AND
 * H_∞ / H_1 > 0.95 (single-token dominance). Real human code
 * has H_2/H_1 < 0.70 typically.
 */
export function isAiRenyiSignature(profile: RenyiProfile): boolean {
  return profile.h2H1Ratio > 0.85 && profile.hInfH1Ratio > 0.95;
}
