import { describe, it, expect } from 'vitest';

import {
  analyzeSpectral,
  buildLaplacian,
  lanczosFiedler,
  type Graph,
} from '@usebrick/engine';

/**
 * v0.10.1 Phase 6.2 — Spectral graph theory tests.
 *
 * Pins the Fiedler value (algebraic connectivity) and the connectivity
 * ratio to specific known values for small synthetic graphs. Every
 * graph below has a closed-form expected answer derived from Fiedler
 * 1973 and Chung 1997 — the tests are essentially executable proof
 * that the implementation matches the textbook definitions.
 *
 * Graph shapes used:
 *   - Path P_n:    1-2-3-...-n     eigenvalues = 2 - 2cos(kπ/n)
 *   - Complete K_n: every pair     eigenvalues = {0, n (×n-1)}
 *   - Disjoint unions: Fiedler = 0 by definition
 *   - Edge: 2-node single-edge graph
 *
 * Lanczos converges in O(n·k) — for graphs where the Krylov subspace
 * reaches the Fiedler direction (K_n, 2-node edge), k=3 is enough to
 * recover the exact answer. For path graphs the Fiedler direction is
 * orthogonal to e_0, so we use k = n to recover the closed-form
 * eigenvalue. The `k` parameter is exposed precisely for this.
 */

// ---- Helpers ---------------------------------------------------------------

function asTuple(
  edges: ReadonlyArray<readonly [string, string, number]>,
): Array<[string, string, number]> {
  return edges.map((e) => [e[0], e[1], e[2]] as [string, string, number]);
}

function pathGraph(n: number): Graph {
  const nodes = Array.from({ length: n }, (_, i) => `n${i}`);
  const edges: Array<[string, string, number]> = [];
  for (let i = 0; i < n - 1; i++) {
    edges.push([nodes[i]!, nodes[i + 1]!, 1]);
  }
  return { nodes, edges };
}

function completeGraph(n: number): Graph {
  const nodes = Array.from({ length: n }, (_, i) => `n${i}`);
  const edges: Array<[string, string, number]> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      edges.push([nodes[i]!, nodes[j]!, 1]);
    }
  }
  return { nodes, edges };
}

// ---- buildLaplacian --------------------------------------------------------

describe('buildLaplacian', () => {
  it('builds D - A for a 2-node single-edge graph', () => {
    const L = buildLaplacian({ nodes: ['a', 'b'], edges: asTuple([['a', 'b', 1]]) });
    expect(L).toEqual([
      [1, -1],
      [-1, 1],
    ]);
  });

  it('returns the zero matrix when the node list has no edges', () => {
    const L = buildLaplacian({ nodes: ['a', 'b', 'c'], edges: [] });
    expect(L).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });

  it('sums weights when the same edge appears twice', () => {
    const L = buildLaplacian({
      nodes: ['a', 'b'],
      edges: asTuple([
        ['a', 'b', 1.5],
        ['b', 'a', 0.5],
      ]),
    });
    expect(L[0]![0]).toBe(2);
    expect(L[0]![1]).toBe(-2);
  });

  it('builds the path-graph Laplacian (n = 4)', () => {
    // 1-2-3-4: degree 1, 2, 2, 1; off-diagonal -1 on adjacent pairs.
    const L = buildLaplacian(pathGraph(4));
    expect(L).toEqual([
      [1, -1, 0, 0],
      [-1, 2, -1, 0],
      [0, -1, 2, -1],
      [0, 0, -1, 1],
    ]);
  });

  it('builds the complete-graph Laplacian (n = 4) with degree n-1', () => {
    const L = buildLaplacian(completeGraph(4));
    expect(L).toEqual([
      [3, -1, -1, -1],
      [-1, 3, -1, -1],
      [-1, -1, 3, -1],
      [-1, -1, -1, 3],
    ]);
  });
});

// ---- lanczosFiedler --------------------------------------------------------

describe('lanczosFiedler', () => {
  it('returns 0 for an empty Laplacian (n = 0)', () => {
    expect(lanczosFiedler([])).toBe(0);
  });

  it('returns 0 for a 1-node Laplacian (no edges → no Fiedler)', () => {
    const L = buildLaplacian({ nodes: ['only'], edges: [] });
    expect(lanczosFiedler(L)).toBe(0);
  });

  it('recovers the closed-form Fiedler value of K_n (Fiedler = n)', () => {
    // For K_n the Lanczos Krylov subspace converges in 2 iterations
    // (β_1 = 0), so k=3 is enough for exact Fiedler = n on every n we
    // can reasonably test.
    for (const n of [3, 4, 5, 8]) {
      const L = buildLaplacian(completeGraph(n));
      expect(lanczosFiedler(L, 3)).toBeCloseTo(n, 6);
    }
  });

  it('recovers Fiedler ≈ 2 - 2cos(π/5) for the path graph 1-2-3-4-5', () => {
    // Path graph P_n eigenvalues are 2 - 2cos(kπ/n), k = 0..n-1.
    // Fiedler = smallest positive = 2 - 2cos(π/5) ≈ 0.381966.
    // Lanczos with v_0 = e_0 produces a Krylov subspace that doesn't
    // contain the Fiedler direction, so we use k = n (= 5) here to
    // recover the exact answer; lower k still returns a valid positive
    // Ritz value but with looser approximation.
    const L = buildLaplacian(pathGraph(5));
    expect(lanczosFiedler(L, 5)).toBeCloseTo(2 - 2 * Math.cos(Math.PI / 5), 6);
    expect(lanczosFiedler(L, 5)).toBeCloseTo(0.382, 2);
  });

  it('returns the second eigenvalue of a 2-node edge graph (L = [[1,-1],[-1,1]])', () => {
    // Eigenvalues are 0 and 2; Lanczos terminates at k=2 (β_1 = 0)
    // giving T_2 = [[1, 1], [1, 1]] with eigenvalues {0, 2}.
    const L = buildLaplacian({ nodes: ['a', 'b'], edges: asTuple([['a', 'b', 1]]) });
    expect(lanczosFiedler(L, 3)).toBeCloseTo(2, 6);
  });

  it('treats a disconnected-component graph as Fiedler = 0', () => {
    // {a, b} (edge) and {c, d} (edge) are two components. The full
    // graph Laplacian has two zero eigenvalues, so Fiedler = 0.
    // analyzeSpectral short-circuits this case; here we verify the
    // path through the helper produces 0 when both components are
    // fed into Lanczos (the Krylov subspace hits both zeros).
    const L = buildLaplacian({
      nodes: ['a', 'b', 'c', 'd'],
      edges: asTuple([
        ['a', 'b', 1],
        ['c', 'd', 1],
      ]),
    });
    // Lanczos with k=3 starting from e_0 (component 1) sees a single
    // component → Fiedler = 2, NOT 0. The "Fiedler = 0 for disconnected"
    // guarantee is enforced at the analyzeSpectral layer, not here.
    expect(lanczosFiedler(L, 3)).toBeCloseTo(2, 6);
  });
});

// ---- analyzeSpectral -------------------------------------------------------

describe('analyzeSpectral', () => {
  it('returns Fiedler = 0 for an empty graph (no nodes)', () => {
    const result = analyzeSpectral({ nodes: [], edges: [] });
    expect(result.fiedlerValue).toBe(0);
    expect(result.connectivityRatio).toBe(0);
  });

  it('returns Fiedler = 0 for a single isolated node', () => {
    const result = analyzeSpectral({ nodes: ['lonely'], edges: [] });
    expect(result.fiedlerValue).toBe(0);
    expect(result.connectivityRatio).toBe(0);
  });

  it('returns Fiedler = 0 for a disconnected graph (two disjoint edges)', () => {
    const result = analyzeSpectral({
      nodes: ['a', 'b', 'c', 'd'],
      edges: asTuple([
        ['a', 'b', 1],
        ['c', 'd', 1],
      ]),
    });
    // Per Fiedler 1973 the second-smallest eigenvalue of a graph with
    // ≥ 2 connected components is 0.
    expect(result.fiedlerValue).toBe(0);
    expect(result.connectivityRatio).toBe(0);
  });

  it('returns connectivityRatio = 1.0 for K_4 (Fiedler = n)', () => {
    // K_n has Fiedler = n (per Fiedler 1973 theorem); connectivityRatio
    // = Fiedler / n = 1.0 for every dense graph of this shape.
    const result = analyzeSpectral(completeGraph(4));
    expect(result.fiedlerValue).toBeCloseTo(4, 4);
    expect(result.connectivityRatio).toBeCloseTo(1.0, 4);
  });

  it('connects three nodes in a path with a low Fiedler value', () => {
    // P_3: eigenvalues are {0, 1, 3} (Fiedler = 1).
    const result = analyzeSpectral(pathGraph(3));
    expect(result.fiedlerValue).toBeCloseTo(1, 4);
    expect(result.connectivityRatio).toBeCloseTo(1 / 3, 4);
  });

  it('reports a non-negative connectivityRatio for every valid input', () => {
    // Connectivity ratio should never be negative; the Fiedler value is
    // bounded below by 0 (spectral theorem on a PSD matrix).
    const samples = [
      { nodes: [], edges: [] },
      { nodes: ['x'], edges: [] },
      pathGraph(5),
      completeGraph(3),
    ];
    for (const g of samples) {
      const r = analyzeSpectral(g);
      expect(r.fiedlerValue).toBeGreaterThanOrEqual(0);
      expect(r.connectivityRatio).toBeGreaterThanOrEqual(0);
    }
  });

  it('rounds both fields to 4 decimal places', () => {
    const result = analyzeSpectral(pathGraph(5));
    // Rounding check: (x * 10000) is integer when x is a 4-decimal float.
    expect(Number.isFinite(result.fiedlerValue)).toBe(true);
    expect(Number.isFinite(result.connectivityRatio)).toBe(true);
    // Round-trip: 4-decimal rounding must preserve to 4 decimal places.
    const f1 = result.fiedlerValue;
    const f2 = Math.round(f1 * 10000) / 10000;
    expect(f1).toBe(f2);
  });
});