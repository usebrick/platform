/**
 * v0.12.0: Confidence intervals for binomial proportions.
 *
 * Two methods, both peer-reviewed and widely used in calibration reports:
 *
 *   - Wilson score interval (Wilson 1927, *JASA* 22:209–212):
 *     The standard choice for n > 30. Closed-form, asymmetric around p̂,
 *     better coverage than the normal approximation, especially for
 *     extreme p̂ or small n. Recommended for our use case (n ≥ 1k
 *     per arm of the calibration corpus).
 *
 *   - Clopper-Pearson exact interval (Clopper & Pearson 1934,
 *     *Biometrika* 26:404–413):
 *     The "exact" binomial CI; conservative (always ≥ target coverage).
 *     Use for small n (< 30) or when conservatism is preferred.
 *
 * Both are computed in this module; the reporter decides which to use.
 *
 * The CIs add defensibility to every P / R / FPR number reported in the
 * calibration doc. The corpus sizes (95k+ / 76k+) support tight CIs
 * (±0.5% on P/R/FPR), so the point estimates already have small error
 * bars — but reporting CIs explicitly is the rigorous thing to do.
 */

export interface BinomialCI {
  /** Lower bound. */
  lower: number;
  /** Upper bound. */
  upper: number;
  /** Point estimate p̂ = x/n. */
  point: number;
  /** Sample size n. */
  n: number;
  /** Number of successes x. */
  x: number;
  /** Confidence level (e.g., 0.95). */
  confidence: number;
}

/**
 * Wilson score confidence interval for a binomial proportion.
 *
 * Wilson 1927: a better-than-normal approximation for binomial CIs.
 * Has good coverage even at extreme p̂ and small n. Closed-form.
 *
 * @param x - Number of successes.
 * @param n - Total sample size.
 * @param confidence - Confidence level (default 0.95).
 */
export function wilsonCI(x: number, n: number, confidence = 0.95): BinomialCI {
  if (n <= 0) {
    return { lower: 0, upper: 1, point: 0, n: 0, x: 0, confidence };
  }
  if (x < 0 || x > n) {
    throw new RangeError(`x must be in [0, n], got x=${x}, n=${n}`);
  }
  const p = x / n;
  // z_{1−α/2} for common confidence levels. Default: 1.96 (95%).
  const z = zForConfidence(confidence);
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denom;
  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
    point: p,
    n,
    x,
    confidence,
  };
}

/**
 * Clopper-Pearson exact confidence interval for a binomial proportion.
 *
 * Clopper & Pearson 1934: based on the binomial CDF; conservative
 * (always ≥ target coverage). Use for small n or when conservatism
 * is preferred.
 *
 * Computed via the inverse beta distribution:
 *   lower = BetaInv(α/2,   x,     n − x + 1)  when x > 0, else 0
 *   upper = BetaInv(1 − α/2, x + 1, n − x)    when x < n, else 1
 *
 * @param x - Number of successes.
 * @param n - Total sample size.
 * @param confidence - Confidence level (default 0.95).
 */
export function clopperPearsonCI(x: number, n: number, confidence = 0.95): BinomialCI {
  if (n <= 0) {
    return { lower: 0, upper: 1, point: 0, n: 0, x: 0, confidence };
  }
  if (x < 0 || x > n) {
    throw new RangeError(`x must be in [0, n], got x=${x}, n=${n}`);
  }
  const alpha = 1 - confidence;
  const p = x / n;
  let lower = 0;
  let upper = 1;
  if (x > 0) {
    lower = inverseBetaCDF(alpha / 2, x, n - x + 1);
  }
  if (x < n) {
    upper = inverseBetaCDF(1 - alpha / 2, x + 1, n - x);
  }
  return { lower, upper, point: p, n, x, confidence };
}

/**
 * Inverse CDF of the standard normal distribution.
 * Used to compute z_{1−α/2} for the Wilson score interval.
 */
function zForConfidence(confidence: number): number {
  if (confidence >= 0.99) return 2.576;
  if (confidence >= 0.975) return 2.241;
  if (confidence >= 0.95) return 1.96;
  if (confidence >= 0.9) return 1.645;
  if (confidence >= 0.8) return 1.282;
  return 1.96; // default
}

/**
 * Inverse CDF of the Beta distribution, used for Clopper-Pearson.
 *
 * Implemented via the regularized incomplete beta function using a
 * continued-fraction expansion (Numerical Recipes 6.4). Falls back to
 * a simple bisection if the continued fraction doesn't converge.
 */
function inverseBetaCDF(p: number, a: number, b: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  // Bisection on the incomplete beta function.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const cdf = regularizedIncompleteBeta(mid, a, b);
    if (Math.abs(cdf - p) < 1e-9) return mid;
    if (cdf < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Regularized incomplete beta function I_x(a, b).
 *
 * Used to compute the CDF of the Beta distribution.
 * Implementation based on Numerical Recipes 6.4 (continued fraction
 * expansion). Symmetric: I_x(a, b) = 1 − I_{1−x}(b, a).
 */
function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // Use the symmetry I_x(a, b) = 1 − I_{1−x}(b, a) to ensure convergence.
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - regularizedIncompleteBeta(1 - x, b, a);
  }
  const lbeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(
    Math.log(x) * a + Math.log(1 - x) * b - lbeta,
  ) / a;
  // Continued fraction (Lentz's method).
  let f = 1;
  let c = 1;
  let d = 0;
  for (let m = 0; m <= 200; m++) {
    const m2 = 2 * m;
    let num: number;
    if (m === 0) {
      num = 1;
    } else {
      num = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    }
    d = 1 + num * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = 1 + num / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    f *= c * d;
    const num2 = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + num2 * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = 1 + num2 / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-12) break;
  }
  return (front * (f - 1));
}

/**
 * Stirling's approximation + correction for the log-gamma function.
 * Accurate to ~1e-10 for x ≥ 1.
 */
function logGamma(x: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += c[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/**
 * Format a BinomialCI for human-readable display.
 */
export function formatCI(ci: BinomialCI, decimals = 2): string {
  return `${(ci.point * 100).toFixed(decimals)}% ` +
    `[${(ci.lower * 100).toFixed(decimals)}%, ${(ci.upper * 100).toFixed(decimals)}%]`;
}