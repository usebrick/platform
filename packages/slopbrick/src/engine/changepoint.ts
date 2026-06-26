/**
 * v0.10.1: Bayesian Online Changepoint Detection (BOCPD).
 *
 * Reference: Adams & MacKay, "Bayesian Online Changepoint Detection"
 * (arXiv:0710.3742, 2007). Maintains a posterior distribution over
 * the time-since-last-changepoint ("run length" `r_t`) using the
 * conjugate Normal-Inverse-Gamma prior for a Gaussian observation
 * model and a constant hazard function `H(r) = 1/λ`.
 *
 * At each step `t`, the algorithm:
 *   1. Computes predictive probabilities `P(x_t | r_t = r, x_{1:t-1})`
 *      for every possible run length `r` using the Student-t
 *      predictive distribution derived from the NIG posterior.
 *   2. Propagates the run-length posterior through two messages:
 *        growth:    P(r_{t+1} = r+1, x_{1:t+1}) = P(r_t = r, x_{1:t})
 *                                            · P(x_{t+1} | r_t = r)
 *                                            · (1 − H(r))
 *        changepoint: P(r_{t+1} = 0, x_{1:t+1}) = Σ_r P(r_t = r, x_{1:t})
 *                                            · P(x_{t+1} | r_t = r)
 *                                            · H(r)
 *   3. Updates the NIG sufficient statistics for every new run length.
 *
 * Working in log space throughout so the product of small
 * probabilities does not underflow as the run-length distribution
 * grows. The unnormalized log masses are normalized at the end of
 * each step via log-sum-exp.
 *
 * Detection uses two complementary signals:
 *   - `P(r_t = 0)` — the strict Adams & MacKay "did a changepoint
 *     happen at this very step?" posterior. High for data drawn
 *     from `hazard = 1` (the algorithm is forced to reset every
 *     step) but never spikes for clean step-function inputs.
 *   - `MAP(t) / (t + 1)` — the MAP run length as a fraction of
 *     the maximum possible. Drops sharply at the first step of a
 *     new regime (the algorithm believes the regime is much
 *     shorter than the data history). Detects the clean
 *     step-function transitions that P(r = 0) misses.
 *
 * A step `t` is declared a changepoint when either signal
 * crosses its threshold. This gives exactly one detection per
 * regime transition for both clean and noisy data, with no
 * spurious detections during the warmup (the first
 * `CHANGEPOSURE_WARMUP` steps are skipped because the
 * run-length distribution is naturally degenerate there).
 *
 * Why this matters for slopbrick: detects regime changes in
 * rule-firing rate over lines of a file (or commits over time).
 * "This PR was authored under a different regime than the rest of
 * the file" surfaces as `changepoints.length > 0` and a
 * `stabilityScore < 1.0` on the `changepoint` axis of the
 * Module Structure axis (graph-types.ts).
 */
import type { ChangepointAnalysis, RegimeSegment } from './graph-types';

/**
 * The four Normal-Inverse-Gamma hyperparameters treated as
 * fixed across all run lengths. Defaults match the spec:
 *   - `kappa0 = 1`     one pseudo-observation's worth of evidence
 *   - `alpha0 = 2`     ensures E[σ²] = β0/(α0−1) is finite
 *   - `beta0 = stdPrior²` so E[σ²] = stdPrior²
 *   - `mu0 = meanPrior` user's chosen prior mean
 */
export interface NIGPrior {
  kappa0: number;
  mu0: number;
  alpha0: number;
  beta0: number;
}

/**
 * Running sufficient statistics of a single regime: `n` observation
 * count, current `mean`, and `M2 = Σ(x − mean)²` (sum of squared
 * deviations from the running mean). Stored as the Welford triple
 * so updates are O(1) and numerically stable.
 *
 * `n = 0` represents "no observations yet" — the predictive
 * distribution under this statistic equals the prior predictive.
 */
interface RunningStats {
  n: number;
  mean: number;
  M2: number;
}

/**
 * Posterior probability threshold for the strict Adams-MacKay
 * `P(r = 0)` signal. Default `0.5` matches the canonical
 * Bayes-factor-1 cutoff.
 */
export const DEFAULT_STRICT_CHANGEPOSURE_THRESHOLD = 0.5;

/**
 * MAP-ratio threshold for the relaxed "regime-just-changed"
 * signal: a changepoint is declared at the first step where
 * `MAP(t) / (t + 1)` drops below this value. Default `0.1` —
 * tight enough that stable regimes don't trigger it, loose
 * enough that a single regime transition is caught on the first
 * out-of-regime observation.
 */
export const DEFAULT_MAP_RATIO_THRESHOLD = 0.1;

/**
 * Number of initial observations excluded from changepoint
 * detection. The run-length distribution is degenerate during
 * the warmup (only short run lengths are supported), so any
 * signal fires trivially. Default `5` matches the typical
 * Student-t predictive "few observations to establish a
 * regime" rule of thumb.
 */
export const CHANGEPOSURE_WARMUP = 5;

/**
 * log-sum-exp helper. Accepts `-Infinity` as the neutral element
 * so callers can fold many small log-probabilities without
 * branching on the empty case.
 */
function logSumExp(a: number, b: number): number {
  if (!Number.isFinite(a)) return b;
  if (!Number.isFinite(b)) return a;
  if (a > b) return a + Math.log1p(Math.exp(b - a));
  return b + Math.log1p(Math.exp(a - b));
}

/**
 * Lanczos approximation of `log Γ(x)` (Numerical Recipes §6.1).
 * Accurate to ~1e-15 for `x > 0`. Used by the Student-t log pdf.
 */
function logGamma(x: number): number {
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += cof[j]! / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/**
 * log predictive probability `P(x | ss)` under the NIG-posterior
 * Student-t. Equivalent to `P(x | x_{1:n})` for a regime with
 * running stats `ss`. Closed-form (Adams & MacKay 2007, eq. 18):
 *
 *   x | x_{1:n}  ~  t_{2α_n}( μ_n ,  β_n(κ_n+1) / (α_n κ_n) )
 *
 * with `κ_n = κ_0 + n`, `μ_n = (κ_0 μ_0 + n x̄) / κ_n`,
 * `α_n = α_0 + n/2`, and
 * `β_n = β_0 + M2/2 + (κ_0·n / (2·κ_n))(x̄ − μ_0)²`.
 */
function predictiveLogPdf(
  x: number,
  ss: RunningStats,
  prior: NIGPrior,
): number {
  const { n, mean, M2 } = ss;
  const { kappa0, mu0, alpha0, beta0 } = prior;
  const kappaN = kappa0 + n;
  const muN = (kappa0 * mu0 + n * mean) / kappaN;
  const alphaN = alpha0 + n / 2;
  const betaN =
    beta0 +
    M2 / 2 +
    (kappa0 * n / (2 * kappaN)) * (mean - mu0) * (mean - mu0);
  const df = 2 * alphaN;
  const scale = (betaN * (kappaN + 1)) / (alphaN * kappaN);
  const z2 = ((x - muN) ** 2) / (df * scale);
  return (
    logGamma((df + 1) / 2) -
    logGamma(df / 2) -
    0.5 * Math.log(df * Math.PI * scale) -
    ((df + 1) / 2) * Math.log(1 + z2)
  );
}

/**
 * Welford update: incorporate a new observation into the running
 * stats. Returns a new triple; the input is not mutated.
 */
function appendObservation(ss: RunningStats, x: number): RunningStats {
  const newN = ss.n + 1;
  const newMean = ss.mean + (x - ss.mean) / newN;
  const newM2 = ss.M2 + (x - ss.mean) * (x - newMean);
  return { n: newN, mean: newMean, M2: newM2 };
}

/**
 * Two detection signals at every step `t`:
 *   - `pR0[t] = exp(newLogT[0])` — strict "changepoint at this step."
 *   - `mapRatio[t] = argmax(newLogT) / (t + 1)` — "regime is short
 *     relative to data history."
 */
interface BOCPDSignals {
  pR0: number[];
  mapRatio: number[];
}

/**
 * Run the BOCPD message-passing loop. Returns per-step arrays of
 * detection signals. Computation is O(t²) in time and O(t) in
 * space: the run-length distribution grows linearly with t, and
 * the per-step message passing is O(t). For the inputs slopbrick
 * actually feeds it (rule-firing rate per line of a file, ≤ a few
 * hundred lines) this is fast enough.
 */
export function runBOCPD(
  observations: readonly number[],
  hazardRate: number,
  meanPrior: number,
  stdPrior: number,
): BOCPDSignals {
  const prior: NIGPrior = {
    kappa0: 1,
    mu0: meanPrior,
    alpha0: 2,
    beta0: stdPrior * stdPrior,
  };

  // Initial run-length distribution: P(r_0 = 0) = 1.
  let logT: number[] = [0];
  let stats: RunningStats[] = [{ n: 0, mean: 0, M2: 0 }];

  const pR0: number[] = [];
  const mapRatio: number[] = [];

  for (let t = 0; t < observations.length; t++) {
    const x = observations[t]!;

    // 1. Joint log mass for each (run length, new observation):
    //    logT[r] + log P(x | r).
    const logJoint: number[] = new Array(logT.length);
    for (let r = 0; r < logT.length; r++) {
      logJoint[r] = logT[r]! + predictiveLogPdf(x, stats[r]!, prior);
    }

    // 2. Message passing. The new run-length distribution has
    //    support over r_{t+1} = 0, 1, ..., t+1 (length t+2).
    const newLogT: number[] = new Array(logT.length + 1).fill(-Infinity);

    // Changepoint message: r_{t+1} = 0, aggregated from every
    // previous run length r weighted by H(r) = hazardRate.
    let logChangepointMass = -Infinity;
    for (let r = 0; r < logT.length; r++) {
      const candidate = logJoint[r]! + Math.log(hazardRate);
      logChangepointMass = logSumExp(logChangepointMass, candidate);
    }
    newLogT[0] = logChangepointMass;

    // Growth messages: r_{t+1} = r+1, with survival probability
    // (1 − H). Each old r contributes to exactly one new entry.
    const logSurvival = Math.log(1 - hazardRate);
    for (let r = 0; r < logT.length; r++) {
      const candidate = logJoint[r]! + logSurvival;
      newLogT[r + 1] = logSumExp(newLogT[r + 1]!, candidate);
    }

    // Normalize so Σ_r P(r_{t+1} | x_{1:t+1}) = 1.
    let logZ = -Infinity;
    for (const v of newLogT) logZ = logSumExp(logZ, v);
    for (let r = 0; r < newLogT.length; r++) newLogT[r]! -= logZ;

    // MAP run length (argmax of the normalized distribution).
    let mapR = 0;
    let mapLogMass = newLogT[0]!;
    for (let r = 1; r < newLogT.length; r++) {
      if (newLogT[r]! > mapLogMass) {
        mapLogMass = newLogT[r]!;
        mapR = r;
      }
    }

    pR0.push(Math.exp(newLogT[0]!));
    mapRatio.push(mapR / (t + 1));

    // 3. Update sufficient statistics: new run length r+1 sees
    //    one more observation than old run length r.
    const newStats: RunningStats[] = new Array(newLogT.length);
    newStats[0] = { n: 0, mean: 0, M2: 0 };
    for (let r = 0; r < stats.length; r++) {
      newStats[r + 1] = appendObservation(stats[r]!, x);
    }

    logT = newLogT;
    stats = newStats;
  }

  return { pR0, mapRatio };
}

/**
 * Bayesian Online Changepoint Detection (Adams & MacKay 2007).
 *
 * Scans a 1-D sequence of scalar observations and surfaces regime
 * changes in the underlying generative process. Returns changepoint
 * line numbers (1-indexed), per-segment summary statistics, and a
 * `stabilityScore ∈ [0, 1]` (1 = no changepoints detected, 0 =
 * every observation is a changepoint).
 *
 * Parameters:
 *   - `hazardRate` ∈ (0, 1) is `1/λ` where `λ` is the expected run
 *     length between changepoints. Default `1/100`. Use a smaller
 *     value when you expect long stable regimes; a larger value
 *     when regimes are short.
 *   - `meanPrior` and `stdPrior` describe the Gaussian prior on the
 *     observation's conditional mean and standard deviation.
 *     Default `(0, 1)` matches the standard NIG prior used in the
 *     paper.
 *
 * Empty or singleton input returns a degenerate analysis with
 * empty `changepoints` / `segments` and `stabilityScore = 1.0`.
 */
export function bayesianOnlineChangepointDetection(
  observations: readonly number[],
  hazardRate: number = 1 / 100,
  meanPrior: number = 0,
  stdPrior: number = 1,
): ChangepointAnalysis {
  if (observations.length < 2) {
    return { changepoints: [], segments: [], stabilityScore: 1.0 };
  }

  const signals = runBOCPD(observations, hazardRate, meanPrior, stdPrior);
  const changepoints = detectChangepointsFromSignals(
    signals,
    DEFAULT_STRICT_CHANGEPOSURE_THRESHOLD,
    DEFAULT_MAP_RATIO_THRESHOLD,
  );
  const segments = buildSegments(
    observations,
    changepoints,
    signals.mapRatio,
  );
  const stabilityScore = Math.max(
    0,
    1 - changepoints.length / observations.length,
  );

  return { changepoints, segments, stabilityScore };
}

/**
 * Convenience: return the 1-indexed line numbers of observations
 * where the algorithm declares a regime change. Runs the BOCPD
 * message-passing internally with default priors.
 */
export function detectChangepoints(
  observations: readonly number[],
  threshold: number = DEFAULT_STRICT_CHANGEPOSURE_THRESHOLD,
  hazardRate: number = 1 / 100,
  meanPrior: number = 0,
  stdPrior: number = 1,
  mapRatioThreshold: number = DEFAULT_MAP_RATIO_THRESHOLD,
): number[] {
  if (observations.length < 2) return [];
  const signals = runBOCPD(observations, hazardRate, meanPrior, stdPrior);
  return detectChangepointsFromSignals(signals, threshold, mapRatioThreshold);
}

/**
 * Pure post-processing: apply the two-signal detection rule to a
 * precomputed signal array. Exported so callers that have already
 * run BOCPD (and want to try different thresholds) don't have to
 * re-run the whole loop.
 *
 * Detection rule (matches `bayesianOnlineChangepointDetection`):
 *   1. Declare a changepoint at step `t` if
 *      `pR0[t] > threshold` (strict Adams-MacKay signal). This
 *      fires unconditionally at every step for `hazard = 1` —
 *      no warmup skip, because the strict signal is well-defined
 *      even at `t = 0`.
 *   2. Also declare a changepoint at step `t ≥ CHANGEPOSURE_WARMUP`
 *      if `mapRatio[t] < mapRatioThreshold AND
 *      mapRatio[t-1] ≥ mapRatioThreshold` (first crossing of the
 *      relaxed MAP-ratio signal). The warmup skip avoids the
 *      degenerate short-run-length distributions of the first few
 *      observations.
 *
 * Returns 1-indexed line numbers.
 */
export function detectChangepointsFromSignals(
  signals: BOCPDSignals,
  threshold: number,
  mapRatioThreshold: number,
): number[] {
  const lines: number[] = [];
  const { pR0, mapRatio } = signals;
  for (let t = 0; t < pR0.length; t++) {
    if (pR0[t]! > threshold) {
      lines.push(t + 1); // 1-indexed
      continue;
    }
    if (t < CHANGEPOSURE_WARMUP) continue;
    if (
      mapRatio[t]! < mapRatioThreshold &&
      mapRatio[t - 1]! >= mapRatioThreshold
    ) {
      lines.push(t + 1); // 1-indexed
    }
  }
  return lines;
}

/**
 * Slice `observations` into consecutive segments bounded by the
 * detected changepoints. Each segment reports its observation
 * mean, sample standard deviation (ddof = 1), and a proxy for
 * "probability that the segment is in the same regime as the
 * previous one" — set to `mapRatio[t]` at the boundary step,
 * i.e. small after a true transition (the algorithm believes
 * the new regime is much shorter than the data history) and
 * large for two adjacent segments in a long stable regime.
 *
 * The first segment's `regimeChangeProb` is `1.0` because there
 * is no preceding regime to compare it to.
 */
function buildSegments(
  observations: readonly number[],
  changepoints: readonly number[],
  mapRatio: readonly number[],
): RegimeSegment[] {
  const totalLines = observations.length;
  if (totalLines === 0) return [];

  const boundaries: number[] = [1];
  for (const cp of changepoints) {
    if (cp > boundaries[boundaries.length - 1]! && cp <= totalLines) {
      boundaries.push(cp);
    }
  }
  boundaries.push(totalLines + 1);

  const segments: RegimeSegment[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const startLine = boundaries[i]!;
    const endLine = boundaries[i + 1]! - 1;
    if (endLine < startLine) continue;
    const slice = observations.slice(startLine - 1, endLine);
    const { mean, stdDev } = meanAndStdDev(slice);

    // regimeChangeProb: small after a true transition (MAP believes
    // the regime is short relative to history); large when both
    // sides of the boundary look like one long regime. We use the
    // MAP-ratio at the FIRST step of the current segment (i.e.,
    // observation index `startLine − 1`) — that's the moment when
    // a clean transition is most visible in the run-length
    // distribution.
    let regimeChangeProb: number;
    if (i === 0) {
      regimeChangeProb = 1.0;
    } else {
      const boundaryIdx = startLine - 1; // 0-indexed first step of segment
      regimeChangeProb =
        boundaryIdx >= 0 && boundaryIdx < mapRatio.length
          ? Math.max(0, Math.min(1, mapRatio[boundaryIdx]!))
          : 1.0;
    }

    segments.push({
      startLine,
      endLine,
      meanRate: mean,
      stdDev,
      regimeChangeProb,
    });
  }

  return segments;
}

/**
 * Sample mean and standard deviation (ddof = 1) of a numeric
 * slice. Returns `{ mean: 0, stdDev: 0 }` for empty / singleton
 * input — degenerate but keeps callers from branching.
 */
function meanAndStdDev(values: readonly number[]): { mean: number; stdDev: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, stdDev: 0 };
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / n;
  if (n === 1) return { mean, stdDev: 0 };
  let sq = 0;
  for (const v of values) {
    const d = v - mean;
    sq += d * d;
  }
  return { mean, stdDev: Math.sqrt(sq / (n - 1)) };
}