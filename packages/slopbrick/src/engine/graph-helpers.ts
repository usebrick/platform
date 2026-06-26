// Shared graph utilities for v0.10.1 Tier 2 graph-theoretic methods
// (Phase 6 of the v0.10.1 roadmap).
//
// Used by:
//   - Louvain community detection (src/engine/louvain.ts)
//   - Spectral graph analysis   (forthcoming)
//   - Bayesian changepoint detection operates over a 1-D stream, not
//     a 2-D graph, so it does not import from here.
//
// Pure functions. No I/O. Deterministic given the same input.

/**
 * Convert a list of `(u, v, w)` edges to a keyed weight map for fast
 * lookup. Direction is collapsed: parallel edges `u→v` and `v→u`
 * (or two `u→v` entries with the same weight) are summed into one entry.
 *
 * The key format is `"min|max"` so the lookup is symmetric — callers
 * don't need to know which endpoint came first in the original edge
 * triple. This is the undirected view that Louvain needs internally.
 *
 * The map values are plain numbers (not tuples), so when callers need
 * the per-edge structure back they should iterate the original
 * `edges` array, not the map.
 */
export function normalizeEdgeWeights(
  edges: ReadonlyArray<readonly [string, string, number]>,
): Map<string, number> {
  const weights = new Map<string, number>();
  for (const [u, v, w] of edges) {
    if (u === v) continue; // self-loops carry no community signal here
    const key = u < v ? `${u}|${v}` : `${v}|${u}`;
    weights.set(key, (weights.get(key) ?? 0) + w);
  }
  return weights;
}

/**
 * Sum of all edge weights in a `(u, v, w)` triple list.
 *
 * For undirected weighted graphs this equals `m` — the total weight of
 * edges, each counted once. (Modularity's `2m` notation refers to twice
 * this value, because Newman's formula counts each endpoint of each
 * edge; our helper gives the raw `m`.) For directed graphs it is also
 * the sum of edge weights, each directed edge counted once.
 *
 * Returns `0` for an empty edge list — callers can short-circuit
 * modularity / density calculations on a weightless graph.
 */
export function totalEdgeWeight(
  edges: ReadonlyArray<readonly [string, string, number]>,
): number {
  let total = 0;
  for (const [, , w] of edges) {
    total += w;
  }
  return total;
}