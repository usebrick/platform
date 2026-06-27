/**
 * v0.12.0: Benjamini–Hochberg False Discovery Rate correction.
 *
 * Citation: Benjamini, Y. & Hochberg, Y. (1995), "Controlling the false
 * discovery rate: a practical and powerful approach to multiple testing,"
 * *Journal of the Royal Statistical Society, Series B* 57(1):289–300.
 *
 * The 60-rule multi-testing problem:
 *
 *   slopbrick runs ~60 rules on every file. When 60 rules all fire on
 *   `examples/foo.ts`, the chance that at least one is a false positive is
 *
 *     P(≥1 false positive) = 1 − (1 − α)^N ≈ 1 for N = 60, α = 0.05.
 *
 * Benjamini–Hochberg (BH) controls the *expected* False Discovery Rate
 * (FDR) at level α:
 *
 *     E[V/R] ≤ α
 *
 * where V is the number of false rejections and R is the number of
 * rejections. BH is preferred over Bonferroni when tests are correlated
 * (which is the case here — many rules depend on the same underlying
 * facts). The procedure:
 *
 *   1. Sort p-values ascending: p_(1) ≤ p_(2) ≤ … ≤ p_(N).
 *   2. Find the largest k such that p_(k) ≤ (k / N) · α.
 *   3. Reject hypotheses 1..k (all are "significant" under FDR control).
 *
 * Step-up procedure; monotone in N; valid under independence or positive
 * regression dependence on subsets (PRDS), which holds for our use case
 * (a rule's p-value can only become less significant when other rules
 * also fire, since multiple fires indicate a more AI-distributional file).
 *
 * Public API:
 *
 *   benjaminiHochberg(pvalues, alpha) → Set<index> of significant indices
 *   pValuesFromFires(fires, baselineFpr) → Map<ruleId, p-value>
 *
 * The latter is a convenience that turns "rule fired yes/no" + a baseline
 * false-positive rate per rule into a p-value, which is then fed into BH.
 */

export interface BHResult {
  /** Indices into the input array that are rejected (significant under FDR α). */
  rejected: Set<number>;
  /** The critical value k · α / N for each k (useful for diagnostics). */
  criticalValues: number[];
  /** Sorted p-values (parallel to indices into the original input). */
  sortedPValues: { originalIndex: number; pValue: number }[];
  /** Effective FDR level used. */
  alpha: number;
}

/**
 * Benjamini–Hochberg FDR-controlling procedure.
 *
 * @param pvalues - Array of p-values (one per hypothesis). NaN → treated as 1.
 * @param alpha   - Target FDR level (typically 0.05). Must be in [0, 1].
 * @returns BHResult with the set of rejected indices.
 *
 * @example
 *   const { rejected } = benjaminiHochberg([0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205], 0.05);
 *   // → rejected = {0, 1, 2, 3, 4}
 */
export function benjaminiHochberg(pvalues: readonly number[], alpha: number): BHResult {
  if (alpha < 0 || alpha > 1) {
    throw new RangeError(`alpha must be in [0, 1], got ${alpha}`);
  }
  const n = pvalues.length;
  if (n === 0) {
    return { rejected: new Set(), criticalValues: [], sortedPValues: [], alpha };
  }

  // Pair each p-value with its original index, treating NaN as 1.
  const indexed: { originalIndex: number; pValue: number }[] = pvalues.map((p, i) => ({
    originalIndex: i,
    pValue: Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 1,
  }));

  // Sort ascending by p-value.
  indexed.sort((a, b) => a.pValue - b.pValue);

  // Critical values for each rank k (1-based in the BH formula).
  const criticalValues: number[] = indexed.map((_, k) => ((k + 1) / n) * alpha);

  // Find the largest k such that p_(k) ≤ criticalValues[k].
  // All hypotheses 1..k are rejected (including k itself).
  let maxK = -1;
  for (let k = 0; k < n; k++) {
    if (indexed[k].pValue <= criticalValues[k]) {
      maxK = k;
    }
  }

  const rejected = new Set<number>();
  for (let k = 0; k <= maxK; k++) {
    rejected.add(indexed[k].originalIndex);
  }

  return { rejected, criticalValues, sortedPValues: indexed, alpha };
}

/**
 * Convert a set of rule-fire booleans + per-rule baseline FPR into p-values
 * for use with Benjamini–Hochberg.
 *
 * Each rule's "p-value" under the null hypothesis "this rule fires by
 * chance given the baseline FPR" is:
 *
 *     p_i = (1 − fired_i) · 1 + fired_i · baselineFpr_i
 *
 * i.e. if the rule fired and the rule's baseline FPR is small, the
 * p-value is small (significant). If the rule didn't fire, p = 1 (no
 * evidence to reject).
 *
 * @param fires        - Map<ruleId, boolean>: did each rule fire on this file?
 * @param baselineFprs - Map<ruleId, number>: each rule's measured FPR from
 *                       signal-strength.json. Falls back to 0.5 if unknown.
 * @returns Map<ruleId, pValue> suitable for input to benjaminiHochberg.
 */
export function pValuesFromFires(
  fires: ReadonlyMap<string, boolean>,
  baselineFprs: ReadonlyMap<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [ruleId, fired] of fires) {
    if (!fired) {
      out.set(ruleId, 1);
      continue;
    }
    const fpr = baselineFprs.get(ruleId);
    // Clamp to a sensible range: a rule with FPR = 0 gets a small but
    // non-zero p-value (we can never prove FPR is exactly 0).
    const safeFpr = typeof fpr === 'number' && Number.isFinite(fpr)
      ? Math.max(0.001, Math.min(1, fpr))
      : 0.5;
    out.set(ruleId, safeFpr);
  }
  return out;
}

/**
 * Apply BH-FDR correction to a fire map and return only the rules that
 * remain significant.
 *
 * @param fires        - Map<ruleId, boolean> of fires on this file.
 * @param baselineFprs - Map<ruleId, number> of per-rule baseline FPRs.
 * @param alpha        - FDR level (default 0.05).
 * @returns Set of ruleIds that survived FDR correction.
 */
export function survivingFires(
  fires: ReadonlyMap<string, boolean>,
  baselineFprs: ReadonlyMap<string, number>,
  alpha = 0.05,
): Set<string> {
  const ruleIds = [...fires.keys()];
  const pvals = ruleIds.map((id) => {
    const fired = fires.get(id) ?? false;
    if (!fired) return 1;
    const fpr = baselineFprs.get(id);
    const safeFpr = typeof fpr === 'number' && Number.isFinite(fpr)
      ? Math.max(0.001, Math.min(1, fpr))
      : 0.5;
    return safeFpr;
  });
  const { rejected } = benjaminiHochberg(pvals, alpha);
  const survivors = new Set<string>();
  ruleIds.forEach((id, i) => {
    if (rejected.has(i)) survivors.add(id);
  });
  return survivors;
}