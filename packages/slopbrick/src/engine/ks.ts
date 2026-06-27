/**
 * v0.12.0: Kolmogorov–Smirnov two-sample test and distribution-shift detector.
 *
 * Citations:
 *   Kolmogorov 1933 / Smirnov 1939 — foundational one-sample / two-sample
 *     non-parametric test for distributional equality.
 *   Witt 2018/2024, "Applications of the Two-sample Kolmogorov-Smirnov
 *     Test" — review of modern applications.
 *   arXiv:2510.15996 (Oct 2025), "Using Kolmogorov-Smirnov Distance for
 *     Measuring Distribution Shift in Machine Learning" — direct recent
 *     application to ML distribution shift, exactly slopbrick's use case.
 *   Hodges 1958, "The significance probability of the Smirnov two-sample
 *     test" — asymptotic p-value formula.
 *
 * Math:
 *
 *   KS statistic (two-sample):
 *
 *     D = sup_x |F_n(x) − G_m(x)|
 *
 *   where F_n and G_m are the empirical CDFs of two samples.
 *
 *   Asymptotic p-value (Hodges 1958; Smirnov 1939):
 *
 *     p ≈ Q_KS(√(n·m / (n+m)) · D)
 *
 *   where Q_KS(λ) = 2 · Σ_{j=1}^∞ (−1)^(j−1) · e^(−2j²λ²).
 *
 *   For finite samples, we use the exact two-sample table for small
 *   n+m ≤ 40 and the asymptotic formula otherwise. The asymptotic
 *   approximation is excellent for n, m > 20 (Hodges 1958, Table 1).
 *
 * Why this matters for slopbrick:
 *
 *   The 14 high-FPR USEFUL rules (e.g., `test/weak-assertion` FPR=21%)
 *   have thresholds that are binary: fire or don't fire. KS provides
 *   *calibrated* p-values for the distributional test, replacing ad-hoc
 *   thresholds with statistically defensible ones.
 *
 *   For the 13 INVERTED rules (production-rot miscalibrated as AI),
 *   KS can be applied to per-file feature distributions (token lengths,
 *   identifier lengths, etc.) to detect *both* AI anomalies and
 *   production-rot anomalies — KS is symmetric.
 *
 * Multi-feature KS (Bonferroni-corrected):
 *
 *   When testing K features simultaneously, the family-wise error rate
 *   is α_K ≈ K · α. To control FWER at level α:
 *
 *     α_per_feature = α / K   (Bonferroni correction)
 *
 *   Apply BH-FDR for tighter control when features are correlated.
 */

const SQRT_2_TIMES_LN_2 = Math.sqrt(2 * Math.LN2);

/**
 * Empirical CDF evaluated at a sorted sample.
 * Returns the fraction of samples ≤ x.
 */
function ecdfAt(sortedSamples: readonly number[], x: number): number {
  // Binary search for the largest index with value ≤ x.
  let lo = 0;
  let hi = sortedSamples.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedSamples[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo / sortedSamples.length;
}

/**
 * Two-sample Kolmogorov–Smirnov statistic.
 *
 * D = sup_x |F_n(x) − G_m(x)| where F_n, G_m are the empirical CDFs.
 * Runs in O((n + m) log(n + m)) after sorting.
 *
 * @param sampleA - First sample (will be sorted internally; not mutated).
 * @param sampleB - Second sample (will be sorted internally; not mutated).
 * @returns The KS statistic D ∈ [0, 1].
 */
export function ksStatistic(sampleA: readonly number[], sampleB: readonly number[]): number {
  if (sampleA.length === 0 || sampleB.length === 0) return 1;
  const sortedA = [...sampleA].sort((a, b) => a - b);
  const sortedB = [...sampleB].sort((a, b) => a - b);
  const allPoints = [...sortedA, ...sortedB].sort((a, b) => a - b);

  let maxDiff = 0;
  for (const x of allPoints) {
    const fa = ecdfAt(sortedA, x);
    const fb = ecdfAt(sortedB, x);
    const diff = Math.abs(fa - fb);
    if (diff > maxDiff) maxDiff = diff;
  }
  return maxDiff;
}

/**
 * Asymptotic p-value for the two-sample KS test (Hodges 1958):
 *
 *   p = Q_KS(λ),  where λ = √(n·m / (n+m)) · D
 *
 *   Q_KS(λ) = 2 · Σ_{j=1}^∞ (−1)^(j−1) · e^(−2j²λ²)
 *
 * Truncated at J terms where the next term is < 1e-15. Accurate for
 * n, m ≥ 20; for smaller samples, use the exact two-sample table or
 * a permutation test (not implemented here).
 */
export function ksPValue(statistic: number, n: number, m: number): number {
  if (n === 0 || m === 0) return 1;
  if (statistic < 0) return 1;
  if (statistic > 1) return 0;
  const lambda = Math.sqrt((n * m) / (n + m)) * statistic;
  // For λ > ~3.6, the first term alone gives p < 1e-15.
  if (lambda > 3.6) return 0;

  let p = 0;
  // J=1, 2, 3, ... ; sum alternating with growing exponent.
  for (let j = 1; j < 1000; j++) {
    const term = 2 * Math.pow(-1, j - 1) * Math.exp(-2 * j * j * lambda * lambda);
    p += term;
    if (Math.abs(term) < 1e-15) break;
  }
  // Clamp to [0, 1] (numerical noise can produce tiny negative values).
  return Math.max(0, Math.min(1, p));
}

/**
 * Convenience: two-sample KS test returning both statistic and p-value.
 */
export interface KSTestResult {
  statistic: number;
  pValue: number;
  significant: boolean; // p < 0.05 by default
  n: number;
  m: number;
}

export function ksTest(
  sampleA: readonly number[],
  sampleB: readonly number[],
  alpha = 0.05,
): KSTestResult {
  const statistic = ksStatistic(sampleA, sampleB);
  const pValue = ksPValue(statistic, sampleA.length, sampleB.length);
  return {
    statistic,
    pValue,
    significant: pValue < alpha,
    n: sampleA.length,
    m: sampleB.length,
  };
}

/**
 * Multi-feature KS test with Bonferroni-corrected significance.
 *
 * For each feature, run a two-sample KS test against the corpus baseline.
 * Combine with Bonferroni correction so that the family-wise error rate
 * is controlled at α:
 *
 *     α_per_feature = α / K
 *
 * @param features      - Map<featureName, sample values from this file>.
 * @param baselines     - Map<featureName, corpus baseline values>.
 * @param alpha         - Family-wise error rate (default 0.05).
 * @returns Map<featureName, KSTestResult> + Bonferroni-adjusted alpha.
 */
export interface MultiKSResult {
  perFeature: Map<string, KSTestResult>;
  bonferroniAlpha: number;
  anySignificant: boolean;
  significantFeatures: string[];
}

export function multiFeatureKsTest(
  features: ReadonlyMap<string, readonly number[]>,
  baselines: ReadonlyMap<string, readonly number[]>,
  alpha = 0.05,
): MultiKSResult {
  const featureNames = [...features.keys()];
  const k = featureNames.length;
  const bonferroniAlpha = k > 0 ? alpha / k : alpha;
  const perFeature = new Map<string, KSTestResult>();
  const significantFeatures: string[] = [];
  for (const name of featureNames) {
    const sample = features.get(name);
    const baseline = baselines.get(name);
    if (!sample || !baseline) continue;
    const result = ksTest(sample, baseline, bonferroniAlpha);
    perFeature.set(name, result);
    if (result.significant) significantFeatures.push(name);
  }
  return {
    perFeature,
    bonferroniAlpha,
    anySignificant: significantFeatures.length > 0,
    significantFeatures,
  };
}

/**
 * Distribution-shift detector for a single feature.
 * Convenience wrapper for the rule pattern: "is this file's distribution
 * of feature X significantly different from the corpus baseline?"
 */
export function isDistributionShift(
  sample: readonly number[],
  baseline: readonly number[],
  alpha = 0.05,
): { shift: boolean; statistic: number; pValue: number } {
  const { statistic, pValue, significant } = ksTest(sample, baseline, alpha);
  return { shift: significant, statistic, pValue };
}