/**
 * v0.13.0: GLTR-style absolute log-rank histogram for token
 * distributions. Adapts Gehrmann et al. 2019 from a GPT-2
 * vocabulary to a corpus-trained unigram distribution.
 *
 * Citations:
 * - Gehrmann, S., Strobelt, H. & Rush, A. (2019), "GLTR:
 *   Statistical Detection and Visualization of Generated Text,"
 *   ACL 2019 Demo, arXiv:1906.04043. The foundational paper
 *   on the log-rank histogram method.
 * - Wu, L. Y. & Segura-Bedmar, I. (2025), "AI-generated Text
 *   Detection with a GLTR-based Approach," arXiv:2502.12064.
 *   Extension to other domains.
 *
 * Math:
 *
 *   For each token t in the file, compute its rank r(t) in a
 *   corpus-trained unigram frequency distribution. Bin into:
 *     P_top10    = #{t : r(t) <= 10} / N
 *     P_top100   = #{t : r(t) <= 100} / N
 *     P_top1000  = #{t : r(t) <= 1000} / N
 *     P_beyond   = #{t : r(t) > 10000} / N
 *
 *   And:
 *     mean_log_rank = mean( log(r(t) + 1) )
 *
 *   Human text has ~70-80% of tokens in the top-1000 (Gehrmann
 *   2019). AI text pushes this to ~95% — AI sticks to corpus-
 *   common identifiers (`function`, `return`, `if`, `else`).
 *   Same pattern holds for code.
 *
 * Why this matters for slopbrick:
 *
 *   The corpus-trained rank is calibration-free: it doesn't need
 *   a held-out LLM. It only needs a token frequency table from
 *   a human corpus (which we already have via the corpus-
 *   baselines infrastructure).
 *
 *   The mean_log_rank is a single-number summary that can be
 *   fed into the Bayesian LR combiner. AI files: mean_log_rank
 *   ~ 2-3 (tokens in top-1000). Human files: mean_log_rank
 *   ~ 4-6 (long tail).
 *
 * Used by the v0.13 `ai/log-rank-histogram` rule (to be added).
 */

export interface LogRankHistogram {
  pTop10: number;
  pTop100: number;
  pTop1000: number;
  pBeyond: number;
  meanLogRank: number;
  /** Histogram as 4-bin vector. */
  bins: [number, number, number, number];
}

/**
 * Compute the log-rank histogram for a token sequence against a
 * corpus-trained unigram frequency distribution.
 *
 * @param tokens - sequence of tokens in the file
 * @param corpusFreq - corpus-trained frequency map (token -> count)
 * @returns - 4-bin histogram + mean log-rank
 */
export function computeLogRankHistogram(
  tokens: string[],
  corpusFreq: Map<string, number>,
): LogRankHistogram {
  if (tokens.length === 0 || corpusFreq.size === 0) {
    return { pTop10: 0, pTop100: 0, pTop1000: 0, pBeyond: 0, meanLogRank: 0, bins: [0, 0, 0, 0] };
  }
  // Sort corpus tokens by frequency (desc) to assign ranks
  const sortedCorpus = [...corpusFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tok]) => tok);
  const rank = new Map<string, number>();
  sortedCorpus.forEach((tok, i) => rank.set(tok, i + 1));

  let top10 = 0, top100 = 0, top1000 = 0, beyond = 0;
  let logRankSum = 0;
  let matched = 0;
  for (const t of tokens) {
    const r = rank.get(t);
    if (r === undefined) {
      beyond++;
      logRankSum += Math.log2(10000 + 1);
    } else {
      logRankSum += Math.log2(r + 1);
      matched++;
      if (r <= 10) top10++;
      else if (r <= 100) top100++;
      else if (r <= 1000) top1000++;
      else beyond++;
    }
  }
  const n = tokens.length;
  return {
    pTop10: top10 / n,
    pTop100: top100 / n,
    pTop1000: top1000 / n,
    pBeyond: beyond / n,
    meanLogRank: logRankSum / n,
    bins: [top10 / n, top100 / n, top1000 / n, beyond / n],
  };
}

/**
 * Build a corpus frequency table from a sample of tokenized
 * source files.
 */
export function buildCorpusFrequency(samples: string[][]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const tokens of samples) {
    for (const t of tokens) {
      freq.set(t, (freq.get(t) ?? 0) + 1);
    }
  }
  return freq;
}

/**
 * Tokenize source code: lowercase words, split on non-identifier
 * characters. Returns identifiers, keywords, and literals.
 */
export function tokenizeSourceCode(source: string): string[] {
  return source.toLowerCase().match(/[a-z_][a-z0-9_]{1,}/g) ?? [];
}
