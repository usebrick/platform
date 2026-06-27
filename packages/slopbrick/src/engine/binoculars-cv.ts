/**
 * v0.13.0: Binoculars-style per-segment cross-entropy CV. Adapts
 * Hans et al. 2024 (ICML) to use a corpus n-gram LM instead of
 * an LLM for cross-entropy estimation.
 *
 * Re-exports `tokenizeSourceCode` from gltr-logrank so rules can
 * import both from a single module.
 *
 * Citations:
 * - Hans, A., Schwarzschild, A., Cherepanova, V. et al. (2024),
 *   "Spotting LLMs with Binoculars: Zero-Shot Detection of
 *   Machine-Generated Text," ICML 2024, arXiv:2401.12070.
 *   The foundational paper: AI text occupies a *narrow band* of
 *   cross-entropy under a reference LM.
 *
 * Math:
 *
 *   Slice the file into N windows (default 20). For each window
 *   w_j, compute cross-entropy under a corpus n-gram LM:
 *     H(w_j) = -Σ log_2 p_LM(t_i | context) / |w_j|
 *
 *   Then:
 *     surprisal_mean   = mean(H(w_j))
 *     surprisal_std    = std(H(w_j))
 *     surprisal_cv     = std / mean        # coefficient of variation
 *     surprisal_range  = max(H(w_j)) - min(H(w_j))
 *     surprisal_max_slope = max |H(w_j+1) - H(w_j)|  # largest "jump"
 *
 *   AI signature:
 *     surprisal_cv < 0.10  (very uniform)
 *     surprisal_max_slope < 0.5  (no "registers" within the file)
 *
 *   Human signature:
 *     surprisal_cv > 0.20  (real edits, varied registers)
 *     surprisal_max_slope > 1.0  (docstring section vs hot loop)
 *
 * Why this matters for slopbrick:
 *
 *   The Binoculars insight is that AI text has near-constant
 *   per-window cross-entropy. For code, this means AI code lacks
 *   the "register switches" that humans naturally produce: a
 *   docstring block, then a hot loop, then a regex, then another
 *   docstring. Humans vary per-window entropy by 2-3x; AI is
 *   within 10-20%.
 *
 *   This is the *spatial* dimension that the existing KS test
 *   (aggregate) and Zipf/Heaps (per-file distribution) do not
 *   capture. It complements the existing stack.
 *
 * Used by the v0.13 `ai/segment-surprisal-cv` rule (to be added).
 */

export interface SegmentSurprisalStats {
  nSegments: number;
  meanH: number;
  stdH: number;
  cvH: number;             // coefficient of variation
  rangeH: number;
  maxSlope: number;        // largest |H_{j+1} - H_j|
  /** Per-segment cross-entropy values (in nats or bits, see `bits`). */
  segments: number[];
}

export interface NgramLM {
  /** log2 probability of token t given context (the 2 tokens before t). */
  logProb(context: string[], t: string): number;
}

/**
 * Build a simple trigram LM from a token frequency table. Uses
 * add-α smoothing (α = 1, Laplace).
 */
export function buildTrigramLM(
  samples: string[][],
  alpha: number = 1,
): NgramLM {
  // Count unigrams, bigrams, trigrams
  const uni = new Map<string, number>();
  const bi = new Map<string, number>();
  const tri = new Map<string, number>();
  let total = 0;
  for (const toks of samples) {
    const padded = ['<s>', '<s>', ...toks, '</s>'];
    for (let i = 0; i < padded.length; i++) {
      const t = padded[i]!;
      uni.set(t, (uni.get(t) ?? 0) + 1);
      total++;
      if (i >= 1) {
        const bg = `${padded[i - 1]}|${t}`;
        bi.set(bg, (bi.get(bg) ?? 0) + 1);
      }
      if (i >= 2) {
        const tg = `${padded[i - 2]}|${padded[i - 1]}|${t}`;
        tri.set(tg, (tri.get(tg) ?? 0) + 1);
      }
    }
  }
  return {
    logProb(context, t) {
      const ctxKey = context.slice(-2).join('|');
      const triKey = `${ctxKey}|${t}`;
      const biKey = context.slice(-1).join('|') + '|' + t;
      // Trigram probability: P(t | c2, c1) = (count(c2,c1,t) + α) /
      // (count(c2,c1) + α * V)
      const triCount = tri.get(triKey) ?? 0;
      const biCount = bi.get(ctxKey) ?? 0;
      const V = uni.size;
      const p = (triCount + alpha) / (biCount + alpha * V);
      return Math.log2(p);
    },
  };
}

/**
 * Compute the Binoculars-style per-segment cross-entropy CV.
 * Splits the token stream into `nSegments` equal-length windows.
 */
export function segmentSurprisalCV(
  tokens: string[],
  lm: NgramLM,
  nSegments: number = 20,
): SegmentSurprisalStats {
  if (tokens.length < nSegments * 5) {
    // Not enough tokens for stable estimation
    return {
      nSegments: 0,
      meanH: 0, stdH: 0, cvH: 0, rangeH: 0, maxSlope: 0,
      segments: [],
    };
  }
  const windowSize = Math.floor(tokens.length / nSegments);
  const segH: number[] = [];
  for (let s = 0; s < nSegments; s++) {
    const start = s * windowSize;
    const end = (s === nSegments - 1) ? tokens.length : start + windowSize;
    const win = tokens.slice(start, end);
    let h = 0;
    for (let i = 0; i < win.length; i++) {
      const ctx = win.slice(Math.max(0, i - 2), i);
      h -= lm.logProb(ctx, win[i]!);
    }
    h /= win.length;
    segH.push(h);
  }
  const meanH = mean(segH);
  const stdH = std(segH);
  const cvH = meanH > 1e-9 ? stdH / meanH : 0;
  const rangeH = Math.max(...segH) - Math.min(...segH);
  let maxSlope = 0;
  for (let i = 0; i < segH.length - 1; i++) {
    const slope = Math.abs(segH[i + 1]! - segH[i]!);
    if (slope > maxSlope) maxSlope = slope;
  }
  return { nSegments: segH.length, meanH, stdH, cvH, rangeH, maxSlope, segments: segH };
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / xs.length);
}

// Re-export the tokenizer so rules using Binoculars-CV can
// import both from one module.
export { tokenizeSourceCode } from './gltr-logrank';
