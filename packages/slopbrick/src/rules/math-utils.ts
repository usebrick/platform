/**
 * Shared math utilities for math-based AI slop detection rules.
 *
 * These functions were previously duplicated inline across 10+ rule files.
 * Centralizing them ensures consistent implementation and easier maintenance.
 */

/**
 * Shannon entropy of a discrete distribution.
 *
 *   H = -Σ pᵢ log₂ pᵢ
 *
 * @param counts Map from value to its frequency.
 * @returns `{ h, vocab, total }` where `h` is entropy in bits,
 *   `vocab` is the number of distinct values, `total` is the sum.
 *
 * Higher entropy = more diverse distribution. AI tends to produce
 * low-entropy distributions (repeating the same handful of values);
 * humans produce high-entropy ones.
 */
export function shannonEntropy(counts: Map<number | string, number>): {
  h: number;
  vocab: number;
  total: number;
} {
  let total = 0;
  for (const v of counts.values()) total += v;
  if (total === 0) return { h: 0, vocab: 0, total: 0 };
  const vocab = counts.size;
  let h = 0;
  for (const c of counts.values()) {
    if (c === 0) continue;
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return { h, vocab, total };
}

/**
 * Standard deviation of a numeric array.
 *
 * Returns 0 if fewer than 2 values. Used to detect uniform
 * distributions where AI repeats the same value (σ ≈ 0).
 */
export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Gini coefficient of a distribution.
 *
 * Gini = 0 means perfect equality (all values the same).
 * Gini → 1 means one value dominates everything.
 *
 * AI-generated class usage tends to have a few classes dominating
 * (high Gini); humans spread usage more evenly (low Gini).
 */
export function gini(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const cumSum = sorted.reduce((s, v) => s + v, 0);
  if (cumSum === 0) return 0;
  let weighted = 0;
  for (let i = 0; i < n; i++) weighted += sorted[i]! * (i + 1);
  return (2 * weighted) / (n * cumSum) - (n + 1) / n;
}

/**
 * Circular angular distance in degrees (smallest of |a-b| and 360-|a-b|).
 *
 * Used for hue comparisons. Two colors 30° apart have a circular distance
 * of 30°. Two colors 350° apart have a circular distance of 10°.
 */
export function circularDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Coefficient of variation (CV = σ / μ).
 *
 * Scale-invariant measure of dispersion. Useful when comparing
 * distributions of different magnitudes.
 */
export function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return 0;
  return stddev(values) / mean;
}

/**
 * Mean of a numeric array.
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}
