// v0.42.0 (Sprint 3, §3b): empirical composite-rule clusterer.
//
// Pure functions over a per-file fired-rule-set map. No I/O — the
// emitting half (STEP 5 + persistence) lives one layer up in
// `src/rules/registry-loader.ts` and the `composite` CLI command.
//
// The algorithm:
//
//   STEP 1 — Rule pre-filter by support
//   keep rule iff support(rule) >= minSupport   (adaptive: 5 / |files|, floor 5%)
//
//   STEP 2 — Pairwise association
//   for each pair (r_i, r_j) with i < j:
//     build 2x2 contingency table from fireMatrix
//     NPMI = pmi(r_i; r_j) / -log2 p(r_i ∧ r_j)
//     Fisher's exact p (two-sided)
//     if NPMI >= minNPMI AND fisherP <= fisherAlpha: edge (r_i, r_j) at weight NPMI
//
//   STEP 3 — Single-linkage clustering (HDBSCAN-style, no k)
//   distance d(i,j) = 1 - NPMI(i,j) for edges, 1 for non-edges
//   min_cluster_size = max(minClusterSize, 2)
//
//   STEP 4 — Per-cluster calibration
//   for each cluster C, sweep minMatch in {1..|C|}, pick value
//   maximizing F1 subject to recall/FP >= 1.5x (AGENTS.md gate)
//   drop clusters that fail the gate
//
//   STEP 5 — Emit synthetic composite entries
//   id = composite/<sha1(sorted members)>
//   ruleIds = members (sorted)
//   minMatch = cluster's chosen threshold
//   severity = worst severity among members
//   defaultOff = true   until user opts in
//   description = auto-generated from cluster composition
//   calibration = { recall, FP, precision, F1, nFiles }
//   provenance = { seed, discoveredAt, nFiles, members, npmi, fisherP }
//
// References in §9b of the plan: NPMI (Bouma 2009), Fisher's exact
// (Wikipedia), single-linkage hierarchical clustering (Wikipedia),
// HDBSCAN (Campello, Moulavi, Sander).

import { createHash } from 'node:crypto';
import type {
  ClusterInput,
  ClusterParams,
  ClusterParamOverrides,
  CompositeRuleEntry,
  Severity,
} from '../types';

/** Default clusterer parameters (per §3b plan, with adaptive minSupport). */
export const DEFAULT_CLUSTER_PARAMS: ClusterParams = {
  minSupport: 0.05,        // 5% of files
  minNPMI: 0.3,            // Cohen's-Landis-and-Koch "fair" agreement
  fisherAlpha: 0.01,       // Bonferroni-style floor for many-pair tests
  minClusterSize: 2,
};

/** Adaptive support floor: max(0.05, 5 / |files|). For repos
 *  with ≥100 files, defaults to 5%. For smaller repos, scales down
 *  so the clusterer always has at least 5 minimum-co-fire events. */
export function adaptiveMinSupport(fileCount: number): number {
  if (fileCount <= 0) return DEFAULT_CLUSTER_PARAMS.minSupport;
  return Math.max(DEFAULT_CLUSTER_PARAMS.minSupport, 5 / fileCount);
}

/** Result of the clusterer — the inputs that survived STEPs 1-4
 *  calibration and the metadata the caller (registry loader) needs
 *  to wire composites into the RuleRegistry. */
export interface ClusterOutput {
  /** Composite rule entries, ready to merge into composites.json. */
  entries: CompositeRuleEntry[];
  /** Per-rule support counts (ruleId → number of files on which the
   *  rule fired). Useful for debug + the CLI `discover` view. */
  supportCounts: Map<string, number>;
  /** Strongest NPMI edge per cluster. Mirrored in provenance.npmi. */
  clusterMaxNPMI: Map<string, number>;
  /** Number of files in `fireMatrix`. Echoed for audit. */
  filesScanned: number;
  /** Effective params used (after adaptive substitution). */
  params: ClusterParams;
}

// ---------------------------------------------------------------------------
// STEP 1 — rule pre-filter by support
// ---------------------------------------------------------------------------

/** Compute the support of every rule that appears in `fireMatrix`.
 *  Returns a Map from ruleId to the count of files that fired it. */
export function computeRuleSupport(
  fireMatrix: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, number> {
  const support = new Map<string, number>();
  for (const ruleIds of fireMatrix.values()) {
    for (const ruleId of ruleIds) {
      support.set(ruleId, (support.get(ruleId) ?? 0) + 1);
    }
  }
  return support;
}

/** Pre-filter rules whose support falls below `minSupport`. Exported
 *  for tests and for callers (CLI discover) that want a per-rule
 *  survive/drop view. */
export function prefilterBySupport(
  support: Map<string, number>,
  totalFiles: number,
  minSupport: number,
): Set<string> {
  const kept = new Set<string>();
  const minCount = Math.max(1, Math.ceil(minSupport * totalFiles));
  for (const [ruleId, count] of support) {
    if (count >= minCount) kept.add(ruleId);
  }
  return kept;
}

// ---------------------------------------------------------------------------
// STEP 2 — pairwise NPMI + Fisher's exact
// ---------------------------------------------------------------------------

interface Contingency {
  /** Files where both rules fired. */
  aAndB: number;
  /** Files where only r_i fired. */
  aOnly: number;
  /** Files where only r_j fired. */
  bOnly: number;
  /** Files where neither rule fired (computed lazily). */
  neither: number;
}

/** Build the 2×2 contingency table for two rule-fired-file sets.
 *  Exported for tests. */
export function buildContingency(
  rA: ReadonlySet<string>,
  rB: ReadonlySet<string>,
  totalFiles: number,
): Contingency {
  let aAndB = 0;
  let aOnly = 0;
  let bOnly = 0;
  // Walk both sets so we can attribute every file to exactly one
  // bucket. Cost is O(|rA| + |rB|); the union could be smaller but
  // the bookkeeping is clearer this way.
  for (const file of rA) {
    if (rB.has(file)) aAndB++;
    else aOnly++;
  }
  for (const file of rB) {
    if (!rA.has(file)) bOnly++;
  }
  return {
    aAndB,
    aOnly,
    bOnly,
    neither: Math.max(0, totalFiles - aAndB - aOnly - bOnly),
  };
}

/** Fisher's exact test, two-sided. Implementation is the standard
 *  hypergeometric sum at the [Wikipedia treatment](https://en.wikipedia.org/wiki/Fisher%27s_exact_test):
 *
 *    p = sum_{k : P(X=k) <= P(X=k_obs)} P(X = k)
 *
 *  where X ~ Hypergeometric(N, K1, K2), k_obs = observed aAndB.
 *  For the typical rule co-fire use case (sparse 2x2 tables),
 *  this is more accurate than chi-squared with Yates' correction
 *  (Cochran rule fails for cells < 5). The implementation truncates
 *  the support at |N| to keep the loop bounded. */
export function fisherExactTwoSided(c: Contingency): number {
  const N = c.aAndB + c.aOnly + c.bOnly + c.neither;
  const K1 = c.aAndB + c.aOnly; // row total r_i
  const K2 = c.aAndB + c.bOnly; // row total r_j
  const n = K1; // column total sample size, irrelevant to formula shape
  const kObs = c.aAndB;

  // Hypergeometric PMF.
  const logPmf = (k: number): number => {
    if (k < Math.max(0, K1 + K2 - N) || k > Math.min(K1, K2)) return -Infinity;
    return (
      lnChoose(K2, k) +
      lnChoose(N - K2, K1 - k) -
      lnChoose(N, K1)
    );
  };
  const pObs = Math.exp(logPmf(kObs));

  // Walk the support and accumulate the tail of probabilities no
  // larger than pObs.
  const kMin = Math.max(0, K1 + K2 - N);
  const kMax = Math.min(K1, K2);
  let p = 0;
  for (let k = kMin; k <= kMax; k++) {
    const pk = Math.exp(logPmf(k));
    if (pk <= pObs + 1e-12) {
      p += pk;
    }
  }
  // Fisher's exact is bounded to <=1, but numerical drift can push it over.
  return Math.min(1, p);
}

/** log( C(n, k) ) via the natural log (avoids overflow on large n). */
function lnChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  if (k === 0 || k === n) return 0;
  // Use symmetry to keep the sum short.
  k = Math.min(k, n - k);
  let s = 0;
  for (let i = 1; i <= k; i++) {
    s += Math.log((n - k + i) / i);
  }
  return s;
}

/** Normalized Pointwise Mutual Information. Bounded in [-1, +1]:
 *    NPMI(x;y) = PMI(x;y) / -log2 P(x ∧ y)
 *  with the convention that the [-1, +1] floor covers the cases of
 *  zero co-occurrence (NPMI = -1) and perfect co-occurrence (NPMI
 *  = +1). See [Wikipedia](https://en.wikipedia.org/wiki/Pointwise_mutual_information)
 *  + Bouma 2009. */
export function npmi(c: Contingency, total: number): number {
  if (total === 0 || c.aAndB === 0) return -1;
  const pXY = c.aAndB / total;
  const pX = (c.aAndB + c.aOnly) / total;
  const pY = (c.aAndB + c.bOnly) / total;
  if (pX === 0 || pY === 0 || pXY === 0) return -1;
  const pmi = Math.log2(pXY / (pX * pY));
  const norm = -Math.log2(pXY);
  return norm === 0 ? 1 : pmi / norm;
}

interface Edge {
  ruleIds: [string, string];
  weight: number;
  fisherP: number;
}

/** STEP 2 — compute the rule-pair edge set filtered by NPMI + Fisher's p. */
export function computeEdges(
  fireMatrix: ReadonlyMap<string, ReadonlySet<string>>,
  rules: ReadonlySet<string>,
  total: number,
  params: ClusterParams,
): Edge[] {
  // Build per-rule fired-file sets so we can compute contingency tables
  // directly without re-iterating fireMatrix per pair.
  const ruleToFiles = new Map<string, Set<string>>();
  for (const ruleId of rules) ruleToFiles.set(ruleId, new Set());
  for (const [file, fired] of fireMatrix) {
    for (const ruleId of fired) {
      if (rules.has(ruleId)) ruleToFiles.get(ruleId)!.add(file);
    }
  }

  const ruleList = Array.from(rules).sort();
  const edges: Edge[] = [];
  for (let i = 0; i < ruleList.length; i++) {
    for (let j = i + 1; j < ruleList.length; j++) {
      const a = ruleList[i]!;
      const b = ruleList[j]!;
      const rA = ruleToFiles.get(a)!;
      const rB = ruleToFiles.get(b)!;
      const c = buildContingency(rA, rB, total);
      const n = npmi(c, total);
      if (n < params.minNPMI) continue;
      const p = fisherExactTwoSided(c);
      if (p > params.fisherAlpha) continue;
      edges.push({ ruleIds: [a, b], weight: n, fisherP: p });
    }
  }
  return edges;
}

// ---------------------------------------------------------------------------
// STEP 3 — single-linkage clustering
// ---------------------------------------------------------------------------

/** Single-linkage clustering by edge weight. Two rules land in the
 *  same cluster if any path of edges connects them (transitive
 *  closure over the edge-induced graph). This is the simplest stable
 *  hierarchical clustering; matches HDBSCAN's core logic for sparse
 *  binary co-fire data while staying in <100 lines. */
export function singleLinkageCluster(
  edges: ReadonlyArray<Edge>,
  minClusterSize: number,
): string[][] {
  // Union-find over ruleIds.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) {
      parent.set(x, x);
      return x;
    }
    if (parent.get(x) === x) return x;
    const root = find(parent.get(x)!);
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const e of edges) {
    union(e.ruleIds[0], e.ruleIds[1]);
  }

  // Group by root.
  const groups = new Map<string, string[]>();
  for (const k of parent.keys()) {
    const root = find(k);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(k);
  }
  // Filter to clusters of size >= minClusterSize and sort members.
  const clusters: string[][] = [];
  for (const members of groups.values()) {
    if (members.length < minClusterSize) continue;
    members.sort();
    clusters.push(members);
  }
  clusters.sort((a, b) => b.length - a.length || a[0]!.localeCompare(b[0]!));
  return clusters;
}

// ---------------------------------------------------------------------------
// STEP 4 — per-cluster calibration
// ---------------------------------------------------------------------------

/** A composite with ruleIds = members and minMatch = k fires on a file
 *  iff at least k of `members` fired on that file. Returns the set of
 *  files on which it would fire. */
export function filesForComposite(
  fireMatrix: ReadonlyMap<string, ReadonlySet<string>>,
  members: ReadonlyArray<string>,
  minMatch: number,
): Set<string> {
  const fired = new Set<string>();
  for (const [file, ids] of fireMatrix) {
    let n = 0;
    for (const m of members) if (ids.has(m)) n++;
    if (n >= minMatch) fired.add(file);
  }
  return fired;
}

interface CalibrationThresholds {
  /** AGENTS.md §"Conventions for new rules" calibration gate. */
  recallFpRatio: number;
  /** Below this absolute FP we accept the cluster even if the ratio
   *  is borderline (small-corpus cushion). */
  minFpFloor: number;
}

const DEFAULT_CALIBRATION: CalibrationThresholds = {
  // 1.5× is the documented floor.
  recallFpRatio: 1.5,
  // 0.05 absolute FP — the same `min` value most rules get via the
  // v0.18.x calibration contract.
  minFpFloor: 0.05,
};

interface CalibrationResult {
  /** Best minMatch per F1 subject to the calibration gate. */
  minMatch: number;
  /** Strongest edge NPMI in the cluster. */
  npmi: number;
  /** Corresponding Fisher's p for the strongest edge. */
  fisherP: number;
  /** Calibration numbers. */
  recall: number;
  FP: number;
  precision: number;
  F1: number;
  nFiles: number;
}

/** STEP 4 — pick minMatch per cluster. Sweeps k from 1..|cluster|,
 *  picks the k maximizing F1 subject to recall/FP >= 1.5x. Drops
 *  clusters where no k clears the gate. */
export function calibrateCluster(
  cluster: ReadonlyArray<string>,
  edges: ReadonlyArray<Edge>,
  fireMatrix: ReadonlyMap<string, ReadonlySet<string>>,
  positiveFiles: ReadonlySet<string> | undefined,
  totalFiles: number,
  thresholds: CalibrationThresholds = DEFAULT_CALIBRATION,
): CalibrationResult | null {
  if (cluster.length < 2) return null;
  const clusterSet = new Set(cluster);
  const clusterEdges = edges.filter(
    (e) => clusterSet.has(e.ruleIds[0]) && clusterSet.has(e.ruleIds[1]),
  );
  if (clusterEdges.length === 0) return null;
  const strongest = clusterEdges.reduce((a, b) => (b.weight > a.weight ? b : a));

  let best: CalibrationResult | null = null;
  for (let k = 1; k <= cluster.length; k++) {
    const firedFiles = filesForComposite(fireMatrix, cluster, k);
    const nFiles = firedFiles.size;
    if (nFiles === 0) continue;

    let recall = 0;
    let fp = 0;
    let precision = 0;
    let canCalibrate = false;
    if (positiveFiles && positiveFiles.size > 0) {
      let tp = 0;
      let fpc = 0;
      for (const file of firedFiles) {
        if (positiveFiles.has(file)) tp++;
        else fpc++;
      }
      const totalPos = positiveFiles.size;
      const totalNeg = Math.max(1, totalFiles - totalPos);
      recall = totalPos > 0 ? tp / totalPos : 0;
      fp = fpc / totalNeg;
      precision = tp + fpc > 0 ? tp / (tp + fpc) : 0;
      canCalibrate = true;
    }

    const F1 =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;

    // Without a labeled positive set, the recall/FP gate is not
    // meaningful. In exploratory mode (`slopbrick composite discover`
    // without a corpus), the cluster still surfaces for the user to
    // audit and label manually.
    if (canCalibrate) {
      if (recall / Math.max(fp, 1e-9) < thresholds.recallFpRatio) continue;
      if (fp < thresholds.minFpFloor && recall < 0.5) continue;
    }
    // Tiebreak: prefer higher minMatch on equal F1. Smaller k fires
    // the composite on more files (closer to "any single member
    // fired"), which defeats the point of a composite. Higher k
    // produces stronger composites when F1 is unchanged.
    if (best === null || F1 > best.F1 + 1e-9 || (Math.abs(F1 - best.F1) < 1e-9 && k > best.minMatch)) {
      best = {
        minMatch: k,
        npmi: strongest.weight,
        fisherP: strongest.fisherP,
        recall,
        FP: fp,
        precision,
        F1,
        nFiles,
      };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// STEP 5 — emit synthetic composite entries
// ---------------------------------------------------------------------------

/** SHA-1 hex of sorted ruleIds — stable composite id so re-running
 *  the clusterer produces identical ids (no UI churn in `slopbrick rules`). */
export function compositeId(members: ReadonlyArray<string>): string {
  const sorted = [...members].sort();
  return 'composite/' + createHash('sha1').update(sorted.join('\n')).digest('hex').slice(0, 12);
}

/** Worst (highest) severity among a member set, by the slopbrick
 *  ordering `low < medium < high`. Used as the composite's severity. */
export function worstSeverity(
  members: ReadonlyArray<string>,
  memberSeverities: ReadonlyMap<string, Severity> | undefined,
): Severity {
  let worst: Severity = 'low';
  const order: Record<Severity, number> = { low: 0, medium: 1, high: 2 };
  for (const m of members) {
    const s = memberSeverities?.get(m);
    if (s && order[s] > order[worst]) worst = s;
  }
  return worst;
}

/** Compose the description for an auto-discovered composite. */
export function describeComposite(
  members: ReadonlyArray<string>,
  minMatch: number,
): string {
  const clusterPart =
    members.length <= 4
      ? members.join('+')
      : `${members.slice(0, 3).join('+')}+${members.length - 3} more`;
  return `Composite rule: at least ${minMatch} of {${clusterPart}} fire on the same file.`;
}

// ---------------------------------------------------------------------------
// Top-level: run the clusterer end-to-end
// ---------------------------------------------------------------------------

/** Run the full STEP 1 → STEP 5 pipeline. Pure: no I/O, no logging,
 *  no `process.exit`. Caller (the registry loader or the CLI
 *  `discover` subcommand) handles persistence + stdout. */
export function runClusterer(input: ClusterInput): ClusterOutput {
  const total = input.fireMatrix.size;
  const minSupport = input.params?.minSupport ?? adaptiveMinSupport(total);
  const params: ClusterParams = {
    minSupport,
    minNPMI: input.params?.minNPMI ?? DEFAULT_CLUSTER_PARAMS.minNPMI,
    fisherAlpha: input.params?.fisherAlpha ?? DEFAULT_CLUSTER_PARAMS.fisherAlpha,
    minClusterSize: input.params?.minClusterSize ?? DEFAULT_CLUSTER_PARAMS.minClusterSize,
  };

  const support = computeRuleSupport(input.fireMatrix);
  const rulesKept = prefilterBySupport(support, total, params.minSupport);
  const edges = computeEdges(input.fireMatrix, rulesKept, total, params);
  const clusters = singleLinkageCluster(edges, params.minClusterSize);

  const entries: CompositeRuleEntry[] = [];
  const clusterMaxNPMI = new Map<string, number>();
  for (const cluster of clusters) {
    const cal = calibrateCluster(
      cluster,
      edges,
      input.fireMatrix,
      input.positiveFiles,
      total,
    );
    if (!cal) continue;
    const id = compositeId(cluster);
    const severity = worstSeverity(cluster, input.memberSeverities);
    entries.push({
      id,
      ruleIds: [...cluster].sort(),
      minMatch: cal.minMatch,
      severity,
      defaultOff: true,
      description: describeComposite(cluster, cal.minMatch),
      calibration: {
        recall: round3(cal.recall),
        FP: round3(cal.FP),
        precision: round3(cal.precision),
        F1: round3(cal.F1),
        nFiles: cal.nFiles,
      },
      provenance: {
        seed: 'auto-cluster',
        discoveredAt: input.now ?? new Date().toISOString(),
        nFiles: total,
        members: cluster.length,
        npmi: round3(cal.npmi),
        fisherP: round3(cal.fisherP),
      },
    });
    clusterMaxNPMI.set(id, cal.npmi);
  }
  entries.sort((a, b) => (b.calibration.F1 - a.calibration.F1) || a.id.localeCompare(b.id));
  return { entries, supportCounts: support, clusterMaxNPMI, filesScanned: total, params };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Re-export the param helpers so test code can pin defaults without
// reaching into the union type.
export function resolveParams(
  overrides: ClusterParamOverrides | undefined,
  fileCount: number,
): ClusterParams {
  return {
    minSupport: overrides?.minSupport ?? adaptiveMinSupport(fileCount),
    minNPMI: overrides?.minNPMI ?? DEFAULT_CLUSTER_PARAMS.minNPMI,
    fisherAlpha: overrides?.fisherAlpha ?? DEFAULT_CLUSTER_PARAMS.fisherAlpha,
    minClusterSize: overrides?.minClusterSize ?? DEFAULT_CLUSTER_PARAMS.minClusterSize,
  };
}
