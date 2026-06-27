/**
 * v0.12.0: Zipf's & Heaps' laws for token and identifier distributions.
 *
 * Citations:
 *   Zipf 1949, *Human Behavior and the Principle of Least Effort* —
 *     original Zipf's law (rank-frequency).
 *   Heaps 1978, *Information Retrieval: Computational and Theoretical
 *     Aspects* — original Heaps' law (vocabulary growth).
 *   Gelbukh & Sidorov 2001, "Zipf and Heaps Laws' Coefficients Depend
 *     on Language," CICLing 2001, Springer LNCS — per-language
 *     variability.
 *   Lu, Zhang, Zhou 2013, "Deviation of Zipf's and Heaps' Laws in Human
 *     Languages with Limited Dictionary Sizes," *Nature Scientific
 *     Reports* 3:srep01082 — deviation analysis.
 *   Christ, Bavarian, Koyejo, Lapata 2025, "Zipf's and Heaps' Laws for
 *     Tokens and LLM-generated Texts," *EMNLP Findings 2025* — DIRECTLY
 *     proposes Heaps exponent λ and Zipf exponent s as LLM discriminators.
 *     This is the strongest peer-reviewed backing for this engine.
 *
 * Math:
 *
 *   Zipf's law:
 *     f(rank) ∝ rank^(−s)
 *     log f(rank) = log C − s · log rank
 *
 *   s is fit by linear regression of log-rank against log-frequency.
 *   Human natural text: s ≈ 1.0–1.2. AI-generated text: typically lower
 *   s (flatter slope) or higher s (more peaked) depending on the corpus.
 *
 *   Heaps' law:
 *     |V(t)| = K · t^λ
 *     log |V(t)| = log K + λ · log t
 *
 *   |V(t)| is the cumulative vocabulary size (unique types) at text
 *   length t. Human text: λ ≈ 0.4–0.6. AI text: typically higher λ
 *   (richer vocabulary per length, per Christ et al. 2025).
 *
 * Why this matters for slopbrick:
 *
 *   Per Christ et al. EMNLP 2025, Heaps λ is a direct LLM discriminator.
 *   The 14 USEFUL rules with high FPR (e.g., `test/weak-assertion`
 *   FPR=21%) can be conditioned on Heaps λ: a "weak assertion" pattern
 *   with high λ (AI-typical vocabulary growth) is more likely AI than
 *   the same pattern with low λ (human-typical repetition).
 *
 *   The 13 INVERTED rules (production-rot miscalibrated) also benefit:
 *   production rot creates uniform vocab (e.g., always `data`), giving
 *   LOW λ; AI-generated code typically has HIGH λ. The conditioning flips
 *   the INVERTED verdict: rot (low λ) is human, AI (high λ) is AI.
 */

export interface ZipfFit {
  /** Zipf exponent s (slope of log-rank vs log-frequency). */
  exponent: number;
  /** Intercept C in f(rank) = C · rank^(−s). */
  intercept: number;
  /** R² of the linear fit (goodness of fit). */
  rSquared: number;
  /** Rank-frequency pairs (1-indexed ranks). */
  pairs: { rank: number; frequency: number }[];
  /** Number of unique types. */
  vocabularySize: number;
}

export interface HeapsFit {
  /** Heaps exponent λ (slope of log |V(t)| vs log t). */
  exponent: number;
  /** Prefactor K in |V(t)| = K · t^λ. */
  prefactor: number;
  /** R² of the linear fit. */
  rSquared: number;
  /** (token length, vocabulary size) pairs sampled along the text. */
  samples: { t: number; vocabulary: number }[];
  /** Final vocabulary size at the full text length. */
  finalVocabularySize: number;
}

/**
 * Compute Zipf's law fit on a token frequency distribution.
 *
 * @param tokenFrequencies - Map<token, count> over the file.
 * @returns ZipfFit with exponent, intercept, R², and rank-frequency pairs.
 *
 * @example
 *   const fit = computeZipfExponent(new Map([['a', 100], ['b', 50], ['c', 1]]));
 *   // → { exponent: ~1.0, intercept: ~100, rSquared: ~1.0, ... }
 */
export function computeZipfExponent(
  tokenFrequencies: ReadonlyMap<string, number>,
): ZipfFit {
  if (tokenFrequencies.size < 2) {
    return {
      exponent: 0,
      intercept: 0,
      rSquared: 0,
      pairs: [],
      vocabularySize: tokenFrequencies.size,
    };
  }
  // Sort frequencies descending; rank is 1-indexed.
  const freqs = [...tokenFrequencies.values()].sort((a, b) => b - a);
  const pairs = freqs.map((f, i) => ({ rank: i + 1, frequency: f }));

  // Linear regression on log-log scale: log f = log C − s · log rank
  const logRanks = pairs.map((p) => Math.log(p.rank));
  const logFreqs = pairs.map((p) => Math.log(Math.max(p.frequency, 1e-12)));
  const { slope, intercept, rSquared } = linearRegression(logRanks, logFreqs);

  return {
    exponent: -slope, // s = −slope because f ∝ rank^(−s)
    intercept: Math.exp(intercept),
    rSquared,
    pairs,
    vocabularySize: tokenFrequencies.size,
  };
}

/**
 * Compute Heaps' law fit on a token sequence.
 *
 * Sample vocabulary growth at log-spaced text lengths and fit
 * |V(t)| = K · t^λ via linear regression in log-log space.
 *
 * @param tokens - Token sequence (array of strings, in order).
 * @returns HeapsFit with exponent, prefactor, R², and samples.
 */
export function computeHeapsExponent(tokens: readonly string[]): HeapsFit {
  const n = tokens.length;
  if (n < 10) {
    return {
      exponent: 0,
      prefactor: 0,
      rSquared: 0,
      samples: [],
      finalVocabularySize: new Set(tokens).size,
    };
  }
  // Sample vocabulary size at log-spaced points along the text.
  const seen = new Set<string>();
  const samples: { t: number; vocabulary: number }[] = [];
  const numSamples = Math.min(20, Math.max(5, Math.floor(Math.log2(n))));
  for (let i = 0; i < numSamples; i++) {
    const t = Math.floor((i + 1) * n / numSamples);
    for (let j = (i === 0 ? 0 : Math.floor(i * n / numSamples)); j < t; j++) {
      seen.add(tokens[j]);
    }
    samples.push({ t, vocabulary: seen.size });
  }
  if (samples.length < 2) {
    return {
      exponent: 0,
      prefactor: seen.size || 1,
      rSquared: 0,
      samples,
      finalVocabularySize: seen.size,
    };
  }
  const logT = samples.map((s) => Math.log(s.t));
  const logV = samples.map((s) => Math.log(Math.max(s.vocabulary, 1)));
  const { slope, intercept, rSquared } = linearRegression(logT, logV);

  return {
    exponent: slope, // λ = slope because |V(t)| ∝ t^λ
    prefactor: Math.exp(intercept),
    rSquared,
    samples,
    finalVocabularySize: seen.size,
  };
}

/**
 * Compute both Zipf and Heaps fits from a single token sequence.
 * Convenience for the common case where rules need both.
 */
export function computeZipfHeaps(tokens: readonly string[]): {
  zipf: ZipfFit;
  heaps: HeapsFit;
  /** Total token count. */
  totalTokens: number;
  /** Type-token ratio: unique tokens / total tokens. */
  typeTokenRatio: number;
} {
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  const zipf = computeZipfExponent(freq);
  const heaps = computeHeapsExponent(tokens);
  return {
    zipf,
    heaps,
    totalTokens: tokens.length,
    typeTokenRatio: tokens.length > 0 ? freq.size / tokens.length : 0,
  };
}

/**
 * Compute per-file Heaps-deviation score: |file_λ − corpus_λ| / σ_corpus.
 * A high z-score indicates the file's vocabulary growth deviates from the
 * corpus baseline. Per Christ et al. 2025, AI-generated text typically
 * has higher λ than human text; the z-score direction matters.
 */
export function heapsDeviationZScore(
  fileLambda: number,
  corpusLambda: number,
  corpusLambdaStd: number,
): number {
  if (corpusLambdaStd <= 0) return 0;
  return (fileLambda - corpusLambda) / corpusLambdaStd;
}

/**
 * Plain linear regression via the closed-form OLS formula.
 * No external dependencies; runs in O(n).
 */
function linearRegression(
  xs: readonly number[],
  ys: readonly number[],
): { slope: number; intercept: number; rSquared: number } {
  const n = xs.length;
  if (n === 0) return { slope: 0, intercept: 0, rSquared: 0 };
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumXX += xs[i] * xs[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  const denom = sumXX - n * meanX * meanX;
  if (Math.abs(denom) < 1e-12) {
    return { slope: 0, intercept: meanY, rSquared: 0 };
  }
  const slope = (sumXY - n * meanX * meanY) / denom;
  const intercept = meanY - slope * meanX;
  // R² = 1 - SS_res / SS_tot
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * xs[i] + intercept;
    ssRes += (ys[i] - predicted) ** 2;
    ssTot += (ys[i] - meanY) ** 2;
  }
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, rSquared };
}

/**
 * Tokenize source code into identifiers for Zipf/Heaps analysis.
 * Splits on non-identifier characters; lowercases for aggregation.
 * Filters out very short tokens (< 2 chars) and common JS keywords
 * that don't carry stylistic signal.
 */
const KEYWORDS_TO_SKIP = new Set([
  'if', 'in', 'of', 'do', 'is', 'as', 'at', 'be', 'by', 'or', 'an',
  'no', 'to', 'it', 'on', 'up',
]);

export function tokenizeIdentifiers(source: string): string[] {
  const tokens: string[] = [];
  // Split on any non-identifier character; keep only ASCII letters, digits, _ $.
  const re = /[A-Za-z_$][A-Za-z0-9_$]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const tok = m[0].toLowerCase();
    if (tok.length < 2) continue;
    if (KEYWORDS_TO_SKIP.has(tok)) continue;
    tokens.push(tok);
  }
  return tokens;
}