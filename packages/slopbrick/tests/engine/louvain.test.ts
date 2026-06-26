import { describe, it, expect } from 'vitest';
import {
  louvainCommunityDetection,
  buildImportGraph,
  computeModularityForTest,
} from '../../src/engine/louvain';
import { normalizeEdgeWeights, totalEdgeWeight } from '../../src/engine/graph-helpers';
import { MEMORY_SCHEMA_VERSION, type InventoryFile } from '@usebrick/core';
import type { CommunityDetection } from '../../src/engine/graph-types';

/**
 * v0.10.1: Louvain community detection (Blondel et al. 2008).
 *
 * References:
 *   Blondel, V. D., Guillaume, J.-L., Lambiotte, R., & Lefebvre, E. (2008).
 *   "Fast unfolding of communities in large networks." J. Stat. Mech. P10008.
 *
 * These tests pin the engine's behaviour on a mix of synthetic graphs
 * (where the expected partition is obvious by construction) and the
 * Zachary Karate Club benchmark (where the canonical Louvain output
 * is well-known: 4 communities, Q ≈ 0.42).
 */

function asDetection(result: CommunityDetection): CommunityDetection {
  return result;
}

function asTuple(
  edges: ReadonlyArray<readonly [string, string, number]>,
): Array<[string, string, number]> {
  return edges.map((e) => [e[0], e[1], e[2]] as [string, string, number]);
}

function makeInventory(
  patterns: Array<{ name: string; fileCount: number; imports?: string[] }>,
): InventoryFile {
  return {
    version: MEMORY_SCHEMA_VERSION,
    generatedAt: new Date('2026-06-25T00:00:00.000Z').toISOString(),
    workspace: '/tmp/fake-workspace',
    scannedFiles: patterns.reduce((s, p) => s + p.fileCount, 0),
    scanDurationMs: 0,
    patterns: patterns.map((p) => ({
      category: 'stateManagement',
      name: p.name,
      imports: p.imports ?? [p.name],
      fileCount: p.fileCount,
    })),
    components: [],
  };
}

describe('normalizeEdgeWeights', () => {
  it('sums parallel edges into one keyed entry', () => {
    const map = normalizeEdgeWeights([
      ['a', 'b', 1],
      ['b', 'a', 2],
      ['a', 'b', 3],
    ]);
    expect(map.size).toBe(1);
    expect(map.get('a|b')).toBe(6);
  });

  it('skips self-loops', () => {
    const map = normalizeEdgeWeights([
      ['a', 'a', 5],
      ['a', 'b', 1],
    ]);
    expect(map.size).toBe(1);
    expect(map.get('a|b')).toBe(1);
  });
});

describe('totalEdgeWeight', () => {
  it('returns 0 for an empty edge list', () => {
    expect(totalEdgeWeight([])).toBe(0);
  });

  it('sums all edge weights (each triple once)', () => {
    expect(totalEdgeWeight([['a', 'b', 2], ['b', 'c', 3], ['a', 'c', 5]])).toBe(10);
  });
});

describe('louvainCommunityDetection', () => {
  it('returns an empty partition for an empty graph', () => {
    const result = louvainCommunityDetection({ nodes: [], edges: [] });
    expect(result.communities).toEqual([]);
    expect(result.modularity).toBe(0);
    expect(result.iterations).toBe(0);
  });

  it('returns singleton communities with modularity 0 for an edgeless graph', () => {
    const result = louvainCommunityDetection({
      nodes: ['a', 'b', 'c'],
      edges: [],
    });
    expect(result.communities).toHaveLength(3);
    expect(result.modularity).toBe(0);
    // Each community is a singleton; the per-node sort puts them in
    // alphabetical id order regardless of original node order.
    const ids = result.communities.map((c) => c.id);
    expect(ids).toEqual([0, 1, 2]);
    const files = result.communities.map((c) => c.files).flat();
    expect(files.sort()).toEqual(['a', 'b', 'c']);
    expect(result.iterations).toBe(0);
  });

  it('isolated nodes (no edges) become singleton communities even when other nodes are connected', () => {
    // Two cliques (a-b, c-d) plus an isolated node x. Louvain should
    // produce 3 communities: {a,b}, {c,d}, {x}.
    const result = louvainCommunityDetection({
      nodes: ['a', 'b', 'c', 'd', 'x'],
      edges: asTuple([
        ['a', 'b', 5],
        ['c', 'd', 5],
      ]),
    });
    expect(result.communities).toHaveLength(3);
    const byFiles = new Map(result.communities.map((c) => [c.files.sort().join(','), c]));
    expect(byFiles.has('a,b')).toBe(true);
    expect(byFiles.has('c,d')).toBe(true);
    expect(byFiles.has('x')).toBe(true);
    // The two edge-bearing communities should each have non-zero
    // internalEdges; the singleton must have 0.
    expect(byFiles.get('a,b')!.internalEdges).toBe(5);
    expect(byFiles.get('c,d')!.internalEdges).toBe(5);
    expect(byFiles.get('x')!.internalEdges).toBe(0);
  });

  it('separates two dense cliques into two communities', () => {
    // Two K4 cliques: {a, b, c, d} and {e, f, g, h}, each with 6 internal
    // edges. There are no inter-clique edges. The optimal partition is
    // the trivial 2-community split.
    const clique1Edges: Array<[string, string, number]> = [
      ['a', 'b', 1], ['a', 'c', 1], ['a', 'd', 1],
      ['b', 'c', 1], ['b', 'd', 1],
      ['c', 'd', 1],
    ];
    const clique2Edges: Array<[string, string, number]> = [
      ['e', 'f', 1], ['e', 'g', 1], ['e', 'h', 1],
      ['f', 'g', 1], ['f', 'h', 1],
      ['g', 'h', 1],
    ];
    const result = louvainCommunityDetection({
      nodes: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      edges: asTuple([...clique1Edges, ...clique2Edges]),
    });
    expect(result.communities).toHaveLength(2);
    const sizes = result.communities.map((c) => c.files.length).sort();
    expect(sizes).toEqual([4, 4]);
    // Both cliques should achieve the maximum possible modularity for
    // this graph: Q = 1 − (Σ_tot / 2m)² × 2 = 1 − (12 / 24)² × 2
    //          = 1 − (0.5)² × 2 = 1 − 0.5 = 0.5
    // (Each K4 has Σ_tot = 12, total Σ_tot = 24, m = 12.)
    expect(result.modularity).toBeCloseTo(0.5, 6);
  });

  it('modularity is non-negative when community structure is clear', () => {
    // Two star graphs: centre a connected to {b, c, d}; centre e
    // connected to {f, g, h}. Stars maximise within-community density.
    const edges: Array<[string, string, number]> = [
      ['a', 'b', 1], ['a', 'c', 1], ['a', 'd', 1],
      ['e', 'f', 1], ['e', 'g', 1], ['e', 'h', 1],
    ];
    const result = louvainCommunityDetection({
      nodes: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      edges,
    });
    expect(result.modularity).toBeGreaterThan(0);
    expect(result.communities.length).toBeGreaterThanOrEqual(2);
  });

  it('heavier edges pull nodes into the same community', () => {
    // Two triangles (a-b-c and d-e-f) with weak inter-triangle edges
    // AND one extra-strong inter-triangle edge (a-f, weight 100). The
    // strong edge should pull {a, f} together; Louvain may merge into
    // a single community OR split into 2 sub-communities of 3+3 — but
    // the partition must NOT separate {a, f} into different communities
    // (they share a weight-100 edge).
    const edges: Array<[string, string, number]> = [
      // triangle 1
      ['a', 'b', 1], ['b', 'c', 1], ['a', 'c', 1],
      // triangle 2
      ['d', 'e', 1], ['e', 'f', 1], ['d', 'f', 1],
      // cross-links (weak)
      ['b', 'd', 1], ['c', 'e', 1],
      // strong bridge
      ['a', 'f', 100],
    ];
    const result = louvainCommunityDetection({
      nodes: ['a', 'b', 'c', 'd', 'e', 'f'],
      edges,
    });
    // Find which community contains 'a' and 'f'.
    const aComm = result.communities.find((c) => c.files.includes('a'));
    const fComm = result.communities.find((c) => c.files.includes('f'));
    expect(aComm).toBeDefined();
    expect(fComm).toBeDefined();
    expect(aComm!.id).toBe(fComm!.id);
  });

  it('converges within maxIterations and produces a valid partition', () => {
    // A small graph that should converge in 1-3 iterations.
    const edges: Array<[string, string, number]> = [
      ['a', 'b', 1], ['b', 'c', 1], ['c', 'd', 1],
      ['d', 'e', 1], ['e', 'f', 1], ['f', 'a', 1], // ring
      ['a', 'c', 1], ['b', 'd', 1], ['c', 'e', 1], ['d', 'f', 1], // chords
    ];
    const result = louvainCommunityDetection(
      { nodes: ['a', 'b', 'c', 'd', 'e', 'f'], edges },
      10, // hard cap
    );
    expect(result.iterations).toBeGreaterThanOrEqual(1);
    expect(result.iterations).toBeLessThanOrEqual(10);
    // Every original node appears in exactly one community.
    const seen = new Set<string>();
    for (const c of result.communities) {
      for (const f of c.files) {
        expect(seen.has(f)).toBe(false);
        seen.add(f);
      }
    }
    expect(seen.size).toBe(6);
    expect(result.modularity).toBeGreaterThanOrEqual(0);
  });

  it('returns the same partition on repeated runs (deterministic)', () => {
    const edges: Array<[string, string, number]> = [
      ['a', 'b', 2], ['a', 'c', 2], ['b', 'c', 2],
      ['d', 'e', 2], ['d', 'f', 2], ['e', 'f', 2],
      ['c', 'd', 1],
    ];
    const graph = { nodes: ['a', 'b', 'c', 'd', 'e', 'f'], edges };
    const r1 = louvainCommunityDetection(graph);
    const r2 = louvainCommunityDetection(graph);
    expect(r2.communities).toEqual(r1.communities);
    expect(r2.modularity).toBeCloseTo(r1.modularity, 10);
    expect(r2.iterations).toBe(r1.iterations);
  });

  it('matches the Blondel 2008 reference: Zachary\'s Karate Club, Q between 0.37 and 0.43', () => {
    // Zachary's Karate Club (Zachary 1977): 34 members, 78 friendships.
    // Blondel et al. 2008 report Q ≈ 0.4198 with 4 communities; the
    // canonical 2-community (Mr. Hi vs. John A) split has Q ≈ 0.371.
    // Both are well-known reference points. Our deterministic
    // implementation depends on node-visit order; we accept either.
    //
    // Source: Zachary, W. W. (1977). "An information flow model for
    // conflict and fission in small groups." Journal of Anthropological
    // Research, 33(4), 452-473. Edge list as published.
    const edges: Array<[string, string, number]> = [
      [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [0, 8],
      [0, 10], [0, 11], [0, 12], [0, 13], [0, 17], [0, 19], [0, 21], [0, 31],
      [1, 2], [1, 3], [1, 7], [1, 13], [1, 17], [1, 19], [1, 21], [1, 30],
      [2, 3], [2, 7], [2, 8], [2, 9], [2, 13], [2, 27], [2, 28], [2, 32],
      [3, 7], [3, 12], [3, 13],
      [4, 6], [4, 10],
      [5, 6], [5, 10], [5, 16],
      [6, 16],
      [8, 30], [8, 32], [8, 33],
      [9, 33],
      [13, 33],
      [14, 32], [14, 33],
      [15, 32], [15, 33],
      [18, 32], [18, 33],
      [19, 33],
      [20, 32], [20, 33],
      [21, 33],
      [22, 32], [22, 33],
      [23, 25], [23, 27], [23, 29], [23, 32], [23, 33],
      [24, 25], [24, 27], [24, 31],
      [25, 31],
      [26, 29], [26, 33],
      [27, 33],
      [28, 31], [28, 33],
      [29, 32],
      [30, 32], [30, 33],
      [31, 32], [31, 33],
      [32, 33],
    ].map(([u, v]) => [String(u), String(v), 1] as [string, string, number]);

    const nodes = Array.from({ length: 34 }, (_, i) => String(i));
    const result = louvainCommunityDetection({ nodes, edges });

    // Acceptable range: 0.371 (canonical 2-community) to 0.42 (4-community).
    expect(result.communities.length).toBeGreaterThanOrEqual(2);
    expect(result.communities.length).toBeLessThanOrEqual(5);
    expect(result.modularity).toBeGreaterThan(0.37);
    expect(result.modularity).toBeLessThanOrEqual(0.43);

    // Every node must appear in exactly one community.
    const seen = new Set<string>();
    for (const c of result.communities) {
      for (const f of c.files) {
        expect(seen.has(f)).toBe(false);
        seen.add(f);
      }
    }
    expect(seen.size).toBe(34);

    // Sanity: modularity from our engine matches the reference
    // computation against the same partition.
    const partitionFn = (node: string) => {
      const c = result.communities.find((cc) => cc.files.includes(node));
      return c ? c.id : -1;
    };
    const referenceQ = computeModularityForTest(nodes, partitionFn, edges);
    expect(result.modularity).toBeCloseTo(referenceQ, 10);

    // The Mr. Hi faction (centre 0) and John A faction (centre 33) must
    // end up in DIFFERENT communities — that's the canonical split.
    void asDetection;
    const c0 = result.communities.find((c) => c.files.includes('0'))!.id;
    const c33 = result.communities.find((c) => c.files.includes('33'))!.id;
    expect(c0).not.toBe(c33);
  });
});

describe('buildImportGraph', () => {
  it('builds nodes from pattern names and edges from min(fileCount) co-import heuristic', () => {
    const inv = makeInventory([
      { name: 'zustand', fileCount: 10 },
      { name: '@tanstack/react-query', fileCount: 8 },
      { name: 'react', fileCount: 12 },
      { name: 'unused', fileCount: 0 },
    ]);
    const graph = buildImportGraph('/tmp/anywhere', inv);
    expect(graph.nodes).toEqual(['zustand', '@tanstack/react-query', 'react', 'unused']);
    // 'unused' has fileCount = 0 → no edges incident to it.
    // Edge weights are min(fileCount_a, fileCount_b):
    //   zustand - react-query: min(10, 8) = 8
    //   zustand - react:       min(10, 12) = 10
    //   react-query - react:   min(8, 12) = 8
    // The unused pattern contributes nothing (weight would be 0).
    expect(graph.edges).toContainEqual(['zustand', '@tanstack/react-query', 8]);
    expect(graph.edges).toContainEqual(['zustand', 'react', 10]);
    expect(graph.edges).toContainEqual(['@tanstack/react-query', 'react', 8]);
    expect(graph.edges.some(([u, v]) => u === 'unused' || v === 'unused')).toBe(false);
  });

  it('returns an empty edge list when only one pattern exists', () => {
    const inv = makeInventory([{ name: 'react', fileCount: 5 }]);
    const graph = buildImportGraph('/tmp/anywhere', inv);
    expect(graph.nodes).toEqual(['react']);
    expect(graph.edges).toEqual([]);
  });

  it('returns an empty graph for an empty inventory', () => {
    const inv = makeInventory([]);
    const graph = buildImportGraph('/tmp/anywhere', inv);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });
});

describe('computeModularityForTest', () => {
  it('returns 0 for an empty graph', () => {
    expect(computeModularityForTest([], () => 0, [])).toBe(0);
  });

  it('returns 0 for a graph with no edges (singletons)', () => {
    const q = computeModularityForTest(
      ['a', 'b', 'c'],
      () => 0,
      [],
    );
    expect(q).toBe(0);
  });

  it('matches the textbook formula on two K4 cliques', () => {
    // Two K4s (each a 4-clique with 6 edges) as separate communities.
    // For one K4: σ_in = 6, Σ_tot = 12, m = 12 (whole graph).
    //   Q_c = σ_in / m − (Σ_tot)² / (4m²) = 6/12 − 144/576 = 0.5 − 0.25 = 0.25
    // Total Q = 2 × 0.25 = 0.5.
    const edges: Array<[string, string, number]> = [
      ['a', 'b', 1], ['a', 'c', 1], ['a', 'd', 1],
      ['b', 'c', 1], ['b', 'd', 1], ['c', 'd', 1],
      ['e', 'f', 1], ['e', 'g', 1], ['e', 'h', 1],
      ['f', 'g', 1], ['f', 'h', 1], ['g', 'h', 1],
    ];
    const q = computeModularityForTest(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      (node) => (['a', 'b', 'c', 'd'].includes(node) ? 0 : 1),
      edges,
    );
    expect(q).toBeCloseTo(0.5, 6);
  });
});