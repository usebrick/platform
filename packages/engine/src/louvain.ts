/**
 * Louvain community detection (Blondel et al. 2008).
 *
 * Reference:
 *   Blondel, V. D., Guillaume, J.-L., Lambiotte, R., & Lefebvre, E. (2008).
 *   "Fast unfolding of communities in large networks."
 *   Journal of Statistical Mechanics: Theory and Experiment, 2008(10), P10008.
 *   https://doi.org/10.1088/1742-5468/2008/10/P10008
 *
 * Modularity Q on a weighted undirected graph is:
 *
 *     Q = (1 / 2m) Σ_ij [A_ij − k_i k_j / 2m] δ(c_i, c_j)
 *
 * where m = Σ A_ij / 2 (total edge weight), k_i is the weighted degree
 * of node i, and δ(c_i, c_j) is 1 iff i and j share a community. For
 * a community c with σ_in_c (sum of internal edge weights, each once)
 * and Σ_tot_c (sum of weighted degrees in c):
 *
 *     Q_c = σ_in_c / m − (Σ_tot_c)² / (4m²)
 *
 * The algorithm has two phases that repeat until convergence:
 *
 *   1. Local moving — for each node, evaluate moving it into each
 *      neighbouring community; pick the move with the highest ΔQ. Loop
 *      until no node moves (a local modularity maximum).
 *
 *   2. Aggregation — collapse each community into a super-node; edges
 *      between communities become weighted edges between super-nodes,
 *      and internal edges become super-node self-loops.
 *
 * Phases 1+2 are repeated on the new graph until no further modularity
 * gain is achieved. The super-node assignments are then projected back
 * onto the original nodes to give the final partition.
 *
 * The implementation is deterministic: nodes are visited in input
 * order, ties are broken by the smallest target-community id, and the
 * iteration counter never exceeds `maxIterations`. Repeated calls on
 * the same graph return the same partition.
 */

import type { InventoryFile } from '@usebrick/core';

/** Local minimal types — mirror the shapes in slopbrick's
 *  `engine/graph-types.ts`. The engine doesn't import from there to
 *  avoid a workspace-level dep. */
export interface Community {
  id: number;
  files: string[];
  internalEdges: number;
}

export interface CommunityDetection {
  communities: Community[];
  modularity: number;
  iterations: number;
}

/** Local copies of the two edge-weight helpers from slopbrick's
 *  `engine/graph-helpers.ts`. Tiny pure functions; inlining keeps the
 *  engine self-contained. */
function normalizeEdgeWeights(
  edges: ReadonlyArray<readonly [string, string, number]>,
): Map<string, number> {
  const weights = new Map<string, number>();
  for (const [u, v, w] of edges) {
    const key = u < v ? `${u}|${v}` : `${v}|${u}`;
    weights.set(key, (weights.get(key) ?? 0) + w);
  }
  return weights;
}

function totalEdgeWeight(
  edges: ReadonlyArray<readonly [string, string, number]>,
): number {
  let total = 0;
  const seen = new Set<string>();
  for (const [u, v, w] of edges) {
    const key = u < v ? `${u}|${v}` : `${v}|${u}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += w;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an undirected weighted import graph from a Repository Memory
 * inventory.
 *
 * Nodes are canonical pattern names (e.g. `"zustand"`,
 * `"@tanstack/react-query"`). Edges are inferred from co-import
 * frequency: for each unordered pair of patterns `(a, b)`, the edge
 * weight is `min(fileCount_a, fileCount_b)` — the tightest lower bound
 * available from the pattern-level aggregates in `InventoryFile`
 * (which does not track per-file import lists).
 *
 * Self-loops (a pattern paired with itself) are skipped. Patterns with
 * `fileCount === 0` produce no edges. The `_workspaceDir` parameter is
 * accepted for future extension (e.g. augmenting with file-level
 * co-import data read from disk); the current implementation is pure.
 */
export function buildImportGraph(
  _workspaceDir: string,
  inventory: InventoryFile,
): { nodes: string[]; edges: Array<[string, string, number]> } {
  const patterns = inventory.patterns;
  const nodes = patterns.map((p) => p.name);
  const edges: Array<[string, string, number]> = [];

  for (let i = 0; i < patterns.length; i++) {
    const a = patterns[i]!;
    for (let j = i + 1; j < patterns.length; j++) {
      const b = patterns[j]!;
      if (a.fileCount === 0 || b.fileCount === 0) continue;
      // min(fileCount_a, fileCount_b) is the maximum possible number of
      // files that import both — the strongest signal available from
      // pattern-level aggregates.
      const weight = Math.min(a.fileCount, b.fileCount);
      if (weight > 0) {
        edges.push([a.name, b.name, weight]);
      }
    }
  }

  return { nodes, edges };
}

/**
 * Run Louvain community detection on a weighted graph.
 *
 * @param graph          Nodes and `(u, v, w)` edges.
 * @param maxIterations  Outer iteration cap. Defaults to 100 — in
 *                       practice the algorithm converges in 2–5
 *                       iterations on graphs up to a few thousand nodes.
 * @returns The community partition, modularity score, and iteration
 *          count. Returns an empty partition for an empty graph and a
 *          per-node singleton partition with `modularity = 0` for a
 *          graph with no edges.
 */
export function louvainCommunityDetection(
  graph: { nodes: string[]; edges: Array<[string, string, number]> },
  maxIterations: number = 100,
): CommunityDetection {
  const { nodes, edges } = graph;
  if (nodes.length === 0) {
    return { communities: [], modularity: 0, iterations: 0 };
  }

  const m = totalEdgeWeight(edges);
  if (m === 0) {
    // No edges → every node is a singleton community; modularity = 0
    // because each community contributes 0 to σ_in and (Σ_tot)² / (4m²)
    // (every k_i = 0).
    const communities: Community[] = nodes
      .slice()
      .sort()
      .map((name, idx) => ({ id: idx, files: [name], internalEdges: 0 }));
    return { communities, modularity: 0, iterations: 0 };
  }

  return runLouvain(nodes, edges, m, maxIterations);
}

// ---------------------------------------------------------------------------
// Test-only helpers
// ---------------------------------------------------------------------------

/**
 * Compute the modularity of an arbitrary (possibly hand-crafted)
 * partition. Used by tests to verify Louvain's output against a known
 * reference partition (Zachary's Karate Club, etc.).
 *
 * `communityOf` returns the community id for each node. Nodes that
 * share a community id are considered co-located.
 */
export function computeModularityForTest(
  nodes: string[],
  communityOf: (node: string) => number,
  edges: ReadonlyArray<readonly [string, string, number]>,
): number {
  const m = totalEdgeWeight(edges);
  if (m === 0 || nodes.length === 0) return 0;
  const weights = normalizeEdgeWeights(edges);

  const degrees = new Map<string, number>();
  for (const node of nodes) degrees.set(node, 0);
  for (const [key, w] of weights) {
    const sepIdx = key.indexOf('|');
    const u = key.slice(0, sepIdx);
    const v = key.slice(sepIdx + 1);
    degrees.set(u, (degrees.get(u) ?? 0) + w);
    degrees.set(v, (degrees.get(v) ?? 0) + w);
  }

  const perComm = new Map<number, { sigmaIn: number; total: number }>();
  for (const node of nodes) {
    const c = communityOf(node);
    const entry = perComm.get(c) ?? { sigmaIn: 0, total: 0 };
    entry.total += degrees.get(node) ?? 0;
    perComm.set(c, entry);
  }
  for (const [key, w] of weights) {
    const sepIdx = key.indexOf('|');
    const u = key.slice(0, sepIdx);
    const v = key.slice(sepIdx + 1);
    if (communityOf(u) === communityOf(v)) {
      const c = communityOf(u);
      const entry = perComm.get(c)!;
      entry.sigmaIn += 2 * w; // each undirected edge contributes to both endpoints
    }
  }
  let q = 0;
  for (const { sigmaIn, total } of perComm.values()) {
    q += sigmaIn / (2 * m) - (total * total) / (4 * m * m);
  }
  return q;
}

// ---------------------------------------------------------------------------
// Internal: Louvain core
// ---------------------------------------------------------------------------

interface InternalResult {
  modularity: number;
  /** Renumbered community id (0..K-1, in order of first appearance) →
   *  original nodes assigned to it. */
  communityMap: Map<number, string[]>;
  /** Renumbered community id → σ_in_c (each internal edge once). */
  internalEdges: Map<number, number>;
}

/** Two-phase Louvain loop. */
function runLouvain(
  originalNodes: string[],
  originalEdges: ReadonlyArray<readonly [string, string, number]>,
  m: number,
  maxIterations: number,
): CommunityDetection {
  // Current-level state. After Phase 2, `currentNodes` is replaced by
  // the super-node names, and `currentToOriginal` records which
  // original nodes each super-node aggregates.
  let currentNodes = originalNodes.slice();
  let adjacency = buildAdjacency(currentNodes, originalEdges);
  let degrees = computeDegrees(currentNodes, originalEdges);

  // Map: current-level node → current community id.
  let nodeToCommunity = new Map<string, number>();
  currentNodes.forEach((node, idx) => nodeToCommunity.set(node, idx));

  // Per-community aggregates. `totals[c]` = Σ k_i (sum of weighted
  // degrees in c); `selfLoops[c]` = σ_in_c (sum of internal edge weights
  // in c, each edge counted once).
  const totals = new Map<number, number>();
  const selfLoops = new Map<number, number>();
  for (const node of currentNodes) {
    const c = nodeToCommunity.get(node)!;
    totals.set(c, degrees.get(node) ?? 0);
    selfLoops.set(c, 0);
  }

  // Map: community id → a "label" node used as the super-node name
  // after aggregation. Stable across rounds: we always pick the
  // lowest-index current-level node in the community.
  let communityLabel = new Map<number, string>();
  currentNodes.forEach((node, idx) => communityLabel.set(idx, node));

  // Map: current-level node → set of original nodes it represents.
  // Initially each current node IS an original node. After Phase 2,
  // each current node (a super-node) maps to the union of original
  // nodes in its underlying community.
  let currentToOriginal = new Map<string, string[]>();
  for (const node of currentNodes) currentToOriginal.set(node, [node]);

  // `best` is tracked in ORIGINAL-NODE coordinates so we can compare
  // partitions across rounds. Compute modularity from the original
  // graph + projected partition (correct across all levels).
  let best: InternalResult = projectAndEvaluate(
    originalNodes,
    originalEdges,
    currentToOriginal,
    nodeToCommunity,
  );

  let iterations = 0;
  let totalIterationsUsed = 0;

  while (iterations < maxIterations) {
    iterations++;
    totalIterationsUsed++;

    // ---- Phase 1: local moving on the current level ----
    let moved = true;
    let pass = 0;
    const maxPasses = currentNodes.length * 2;
    while (moved && pass < maxPasses) {
      pass++;
      moved = false;
      for (const node of currentNodes) {
        const current = nodeToCommunity.get(node)!;
        const target = bestNeighbourCommunity(
          node,
          current,
          nodeToCommunity,
          adjacency,
          degrees,
          totals,
          m,
        );
        if (target === null) continue;
        applyMove(
          node,
          current,
          target,
          nodeToCommunity,
          adjacency,
          degrees,
          totals,
          selfLoops,
        );
        moved = true;
      }
    }

    const candidate = projectAndEvaluate(
      originalNodes,
      originalEdges,
      currentToOriginal,
      nodeToCommunity,
    );
    if (candidate.modularity > best.modularity) best = candidate;

    // ---- Phase 2: aggregation ----
    const agg = aggregate(currentNodes, nodeToCommunity, communityLabel, adjacency);
    if (agg.nodes.length === currentNodes.length) {
      // Nothing merged — algorithm has converged on this graph.
      return toCommunityDetection(best, totalIterationsUsed);
    }

    // Update currentToOriginal: each super-node's original set is the
    // union of original sets of its constituent current-level nodes.
    const newCurrentToOriginal = new Map<string, string[]>();
    for (const superNode of agg.nodes) {
      const constituent = agg.constituents.get(superNode) ?? [superNode];
      const originals: string[] = [];
      for (const c of constituent) {
        const origs = currentToOriginal.get(c);
        if (origs) originals.push(...origs);
      }
      newCurrentToOriginal.set(superNode, originals);
    }

    // Replace state with the aggregated graph.
    adjacency = agg.adjacency;
    degrees = agg.degrees;
    currentNodes = agg.nodes;
    currentToOriginal = newCurrentToOriginal;
    nodeToCommunity = new Map();
    currentNodes.forEach((n, idx) => nodeToCommunity.set(n, idx));
    totals.clear();
    selfLoops.clear();
    for (const node of currentNodes) {
      const c = nodeToCommunity.get(node)!;
      totals.set(c, degrees.get(node) ?? 0);
      selfLoops.set(c, agg.selfLoops.get(node) ?? 0);
    }
    communityLabel = new Map();
    currentNodes.forEach((n, idx) => communityLabel.set(idx, n));
  }

  return toCommunityDetection(best, totalIterationsUsed);
}

// ---- Projection from current-level to original-node coordinates -----------

/**
 * Project a current-level partition onto the original-node set and
 * compute its modularity against the original graph.
 *
 * This is O(N + E) per call and runs at the end of every Phase 1
 * iteration. For graphs with thousands of nodes, this dominates; for
 * the scale we target (tens to a few hundred pattern-nodes), it's
 * negligible.
 */
function projectAndEvaluate(
  originalNodes: string[],
  originalEdges: ReadonlyArray<readonly [string, string, number]>,
  currentToOriginal: Map<string, string[]>,
  nodeToCommunity: Map<string, number>,
): InternalResult {
  // Project: original node → community id (inherited from the
  // current-level super-node that aggregates it).
  const originalToCommunity = new Map<string, number>();
  for (const [currentNode, originals] of currentToOriginal) {
    const c = nodeToCommunity.get(currentNode)!;
    for (const o of originals) originalToCommunity.set(o, c);
  }

  // Group original nodes by projected community id.
  const rawCommunities = new Map<number, string[]>();
  for (const node of originalNodes) {
    const c = originalToCommunity.get(node) ?? -1;
    if (!rawCommunities.has(c)) rawCommunities.set(c, []);
    rawCommunities.get(c)!.push(node);
  }

  // Renumber in order of first appearance; compute σ_in_c and Σ_tot_c
  // from the original graph.
  const m = totalEdgeWeight(originalEdges);
  const weights = normalizeEdgeWeights(originalEdges);
  const ordered = [...rawCommunities.entries()].sort((a, b) => a[0] - b[0]);
  const renumbered = new Map<number, string[]>();
  const internalEdges = new Map<number, number>();
  const totals = new Map<number, number>();

  // Σ_tot_c = sum of weighted degrees in c.
  const degrees = computeDegrees(originalNodes, originalEdges);
  ordered.forEach(([oldId, members], newId) => {
    renumbered.set(newId, members);
    internalEdges.set(newId, 0);
    let total = 0;
    for (const node of members) total += degrees.get(node) ?? 0;
    totals.set(newId, total);
  });

  // σ_in_c = sum of internal edge weights (each edge once).
  for (const [key, w] of weights) {
    const sepIdx = key.indexOf('|');
    const u = key.slice(0, sepIdx);
    const v = key.slice(sepIdx + 1);
    const cu = originalToCommunity.get(u);
    const cv = originalToCommunity.get(v);
    if (cu !== undefined && cu === cv) {
      const newId = ordered.findIndex(([, members]) => members.includes(u));
      if (newId >= 0) internalEdges.set(newId, (internalEdges.get(newId) ?? 0) + w);
    }
  }
  void totals;

  // Modularity via the helper (uses σ_in/m - (Σ_tot)²/(4m²) per community).
  // We rebuild a selfLoops map for the helper.
  const selfLoopsForMod = new Map<number, number>();
  for (const [id, sigmaIn] of internalEdges) selfLoopsForMod.set(id, sigmaIn);
  const totalsForMod = new Map<number, number>();
  for (const [id, members] of renumbered) {
    let total = 0;
    for (const node of members) total += degrees.get(node) ?? 0;
    totalsForMod.set(id, total);
  }
  const modularity = modularityFromAggregates(totalsForMod, selfLoopsForMod, m);

  return {
    modularity,
    communityMap: renumbered,
    internalEdges,
  };
}

// ---- Partition snapshot + modularity ---------------------------------------

/**
 * Build a partition snapshot from the live state. Uses the `totals` and
 * `selfLoops` maps (kept in sync during Phase 1) to compute modularity
 * and per-community σ_in_c.
 *
 * Community ids are renumbered 0..K-1 in order of first appearance so
 * the output is stable across runs on the same input.
 */
function snapshotPartition(
  originalNodes: string[],
  nodeToCommunity: Map<string, number>,
  totals: Map<number, number>,
  selfLoops: Map<number, number>,
  m: number,
): InternalResult {
  // Group original nodes by community id.
  const rawCommunities = new Map<number, string[]>();
  for (const node of originalNodes) {
    const c = nodeToCommunity.get(node)!;
    if (!rawCommunities.has(c)) rawCommunities.set(c, []);
    rawCommunities.get(c)!.push(node);
  }

  // Map old id → σ_in_c (read directly from the live selfLoops map,
  // which already stores σ_in_c — each internal edge counted once).
  const sigmaInByOldId = new Map<number, number>();
  for (const [oldId, sigmaIn] of selfLoops) {
    sigmaInByOldId.set(oldId, sigmaIn ?? 0);
  }

  // Renumber in order of first appearance.
  const ordered = [...rawCommunities.entries()].sort((a, b) => a[0] - b[0]);
  const renumbered = new Map<number, string[]>();
  const internalEdges = new Map<number, number>();
  ordered.forEach(([oldId, members], newId) => {
    renumbered.set(newId, members);
    internalEdges.set(newId, sigmaInByOldId.get(oldId) ?? 0);
  });

  // Compute modularity using the live totals + selfLoops maps (still
  // keyed by old id).
  const modularity = modularityFromAggregates(totals, selfLoops, m);
  return {
    modularity,
    communityMap: renumbered,
    internalEdges,
  };
}

/**
 * Compute Q = Σ_c [σ_in_c / m − (Σ_tot_c)² / (4m²)] using the live
 * per-community aggregates. O(K).
 *
 * `selfLoops[c]` is σ_in_c (each internal edge counted once); we read
 * it directly without halving.
 */
function modularityFromAggregates(
  totals: Map<number, number>,
  selfLoops: Map<number, number>,
  m: number,
): number {
  let q = 0;
  for (const [comm, total] of totals) {
    if (total === 0 && (selfLoops.get(comm) ?? 0) === 0) continue;
    const sigmaIn = selfLoops.get(comm) ?? 0;
    q += sigmaIn / m - (total * total) / (4 * m * m);
  }
  return q;
}

// ---- Phase 1: local moving ------------------------------------------------

/**
 * Decide which (if any) neighbouring community the node should move into.
 *
 * ΔQ for moving i from C to D is:
 *
 *   ΔQ = (σ_in_D(i) − σ_in_C(i)) / m
 *       − k_i (Σ_tot_D − Σ_tot_C) / (2m²)
 *       − k_i² / (2m²)
 *
 * where σ_in_C(i) and σ_in_D(i) are i's connections into C and D
 * (sums of weights of edges from i to other nodes in each), and
 * Σ_tot_C, Σ_tot_D are the pre-move community totals.
 *
 * Singletons are not considered — standard Louvain only moves a node
 * into a community that already contains one of its neighbours. The
 * starting state is already a partition of singletons.
 */
function bestNeighbourCommunity(
  node: string,
  currentComm: number,
  nodeToCommunity: Map<string, number>,
  adjacency: Map<string, Array<{ neighbor: string; weight: number }>>,
  degrees: Map<string, number>,
  totals: Map<number, number>,
  m: number,
): number | null {
  const k_i = degrees.get(node) ?? 0;
  const neighbours = adjacency.get(node) ?? [];

  // σ_in per neighbour community (sum of weights from `node` into c).
  const sigmaInByComm = new Map<number, number>();
  for (const { neighbor, weight } of neighbours) {
    const c = nodeToCommunity.get(neighbor)!;
    sigmaInByComm.set(c, (sigmaInByComm.get(c) ?? 0) + weight);
  }

  const sigmaInCurrent = sigmaInByComm.get(currentComm) ?? 0;
  const totalsCurrent = totals.get(currentComm) ?? 0;
  const m2 = 2 * m * m;

  let bestTarget: number | null = null;
  let bestGain = 0;
  for (const [targetComm, sigmaInTarget] of sigmaInByComm) {
    if (targetComm === currentComm) continue;
    const totalsTarget = totals.get(targetComm) ?? 0;
    const deltaQ =
      (sigmaInTarget - sigmaInCurrent) / m -
      (k_i * (totalsTarget - totalsCurrent)) / m2 -
      (k_i * k_i) / m2;
    if (deltaQ > bestGain + 1e-12) {
      bestGain = deltaQ;
      bestTarget = targetComm;
    }
  }

  return bestTarget;
}

/**
 * Apply a single move; update all per-community aggregates.
 *
 * `selfLoops[c]` tracks σ_in_c (each edge once), so the per-edge
 * contribution is `weight` (not `2 * weight`).
 */
function applyMove(
  node: string,
  fromComm: number,
  toComm: number,
  nodeToCommunity: Map<string, number>,
  adjacency: Map<string, Array<{ neighbor: string; weight: number }>>,
  degrees: Map<string, number>,
  totals: Map<number, number>,
  selfLoops: Map<number, number>,
): void {
  const k_i = degrees.get(node) ?? 0;
  let sigmaInFrom = 0;
  let sigmaInTo = 0;
  for (const { neighbor, weight } of adjacency.get(node) ?? []) {
    const c = nodeToCommunity.get(neighbor)!;
    if (c === fromComm) sigmaInFrom += weight;
    else if (c === toComm) sigmaInTo += weight;
  }

  // selfLoops[c] = σ_in_c (each internal edge counted once). When a
  // leaves C, each internal edge (a, v) with v in C contributes w to
  // sigmaInFrom, and σ_in_C decreases by w. When a joins D, each new
  // internal edge (a, v) with v in D contributes w to sigmaInTo, and
  // σ_in_D increases by w.
  selfLoops.set(fromComm, (selfLoops.get(fromComm) ?? 0) - sigmaInFrom);
  selfLoops.set(toComm, (selfLoops.get(toComm) ?? 0) + sigmaInTo);

  totals.set(fromComm, (totals.get(fromComm) ?? 0) - k_i);
  totals.set(toComm, (totals.get(toComm) ?? 0) + k_i);

  nodeToCommunity.set(node, toComm);
}

// ---- Phase 2: aggregation -------------------------------------------------

interface AggregatedGraph {
  nodes: string[];
  adjacency: Map<string, Array<{ neighbor: string; weight: number }>>;
  degrees: Map<string, number>;
  /** Per-super-node self-loop weight (Σ_in, each undirected edge once). */
  selfLoops: Map<string, number>;
  /**
   * Map: super-node → the current-level nodes it aggregates. Used by
   * `runLouvain` to maintain `currentToOriginal` across rounds.
   */
  constituents: Map<string, string[]>;
}

/**
 * Build a new graph where each community is a super-node. Edges between
 * communities become weighted edges between super-nodes; internal edges
 * become super-node self-loops.
 */
function aggregate(
  originalNodes: string[],
  nodeToCommunity: Map<string, number>,
  communityLabel: Map<number, string>,
  adjacency: Map<string, Array<{ neighbor: string; weight: number }>>,
): AggregatedGraph {
  // Pick one representative name per community (lowest-index original
  // node in the community). This keeps super-node ids stable across
  // runs on the same input.
  const seenComms = new Set<number>();
  const superNodes: string[] = [];
  const constituents = new Map<string, string[]>();
  for (const node of originalNodes) {
    const c = nodeToCommunity.get(node)!;
    if (seenComms.has(c)) continue;
    seenComms.add(c);
    const label = communityLabel.get(c) ?? node;
    superNodes.push(label);
    constituents.set(label, []);
  }
  // Populate constituents: for each current-level node, add it to the
  // list of its super-node.
  for (const node of originalNodes) {
    const c = nodeToCommunity.get(node)!;
    const label = communityLabel.get(c) ?? node;
    constituents.get(label)!.push(node);
  }

  const superAdjacency = new Map<string, Array<{ neighbor: string; weight: number }>>();
  const superDegrees = new Map<string, number>();
  const superSelfLoops = new Map<string, number>();
  for (const sn of superNodes) {
    superAdjacency.set(sn, []);
    superDegrees.set(sn, 0);
    superSelfLoops.set(sn, 0);
  }

  // Walk each undirected edge once. The adjacency map already collapses
  // parallel edges, but the same undirected edge appears in BOTH
  // endpoints' adjacency lists, so we dedupe by walking `u` only when
  // its label is alphabetically before its neighbour's.
  const emitted = new Set<string>();
  for (const u of originalNodes) {
    for (const { neighbor: v, weight } of adjacency.get(u) ?? []) {
      // Only count each undirected edge once: when u's label is the
      // alphabetically-first endpoint.
      if (u > v) continue;
      const cu = nodeToCommunity.get(u)!;
      const cv = nodeToCommunity.get(v)!;
      const superU = communityLabel.get(cu) ?? u;
      const superV = communityLabel.get(cv) ?? v;
      if (superU === superV) {
        // Internal edge: contributes to the super-node's self-loop AND
        // counts toward its degree (twice — once per endpoint).
        superSelfLoops.set(superU, (superSelfLoops.get(superU) ?? 0) + weight);
        superDegrees.set(superU, (superDegrees.get(superU) ?? 0) + 2 * weight);
        continue;
      }
      const a = superU < superV ? superU : superV;
      const b = superU < superV ? superV : superU;
      const key = `${a}|${b}`;
      if (emitted.has(key)) continue;
      emitted.add(key);
      superAdjacency.get(a)!.push({ neighbor: b, weight });
      superAdjacency.get(b)!.push({ neighbor: a, weight });
      superDegrees.set(a, (superDegrees.get(a) ?? 0) + weight);
      superDegrees.set(b, (superDegrees.get(b) ?? 0) + weight);
    }
  }

  return {
    nodes: superNodes,
    adjacency: superAdjacency,
    degrees: superDegrees,
    selfLoops: superSelfLoops,
    constituents,
  };
}

// ---- Initial adjacency + degree maps ---------------------------------------

function buildAdjacency(
  nodes: string[],
  edges: ReadonlyArray<readonly [string, string, number]>,
): Map<string, Array<{ neighbor: string; weight: number }>> {
  const weights = normalizeEdgeWeights(edges);
  const adjacency = new Map<string, Array<{ neighbor: string; weight: number }>>();
  for (const node of nodes) adjacency.set(node, []);
  for (const [key, w] of weights) {
    const sepIdx = key.indexOf('|');
    const u = key.slice(0, sepIdx);
    const v = key.slice(sepIdx + 1);
    adjacency.get(u)!.push({ neighbor: v, weight: w });
    adjacency.get(v)!.push({ neighbor: u, weight: w });
  }
  return adjacency;
}

function computeDegrees(
  nodes: string[],
  edges: ReadonlyArray<readonly [string, string, number]>,
): Map<string, number> {
  const weights = normalizeEdgeWeights(edges);
  const degrees = new Map<string, number>();
  for (const node of nodes) degrees.set(node, 0);
  for (const [key, w] of weights) {
    const sepIdx = key.indexOf('|');
    const u = key.slice(0, sepIdx);
    const v = key.slice(sepIdx + 1);
    degrees.set(u, (degrees.get(u) ?? 0) + w);
    degrees.set(v, (degrees.get(v) ?? 0) + w);
  }
  return degrees;
}

// ---- Final shape ----------------------------------------------------------

function toCommunityDetection(best: InternalResult, iterations: number): CommunityDetection {
  const communities: Community[] = [];
  for (const [id, files] of best.communityMap) {
    communities.push({
      id,
      files: files.slice().sort(),
      internalEdges: best.internalEdges.get(id) ?? 0,
    });
  }
  communities.sort((a, b) => a.id - b.id);
  return {
    communities,
    modularity: best.modularity,
    iterations,
  };
}