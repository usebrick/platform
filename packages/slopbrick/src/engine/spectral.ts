/**
 * v0.10.1: Spectral graph analysis (Phase 6, Tier 2).
 *
 * Computes the algebraic connectivity (Fiedler value) of an undirected
 * weighted graph via the Lanczos iteration. The Fiedler value is the
 * second-smallest eigenvalue of the graph Laplacian L = D - A; a small
 * value means the graph is weakly connected, while a value close to the
 * average degree means the modules are tightly glued.
 *
 * Why Lanczos: the full eigendecomposition of an n×n matrix is O(n^3),
 * but we only need the smallest 2-3 eigenvalues. The Lanczos iteration
 * builds a k×k tridiagonal matrix T_k in O(n·k) operations whose
 * eigenvalues (Ritz values) approximate those of L. We then diagonalize
 * T_k via cyclic Jacobi rotations and read off the smallest positive
 * Ritz value as the Fiedler approximation.
 *
 * References:
 *   - Fiedler, M. (1973). "Algebraic connectivity of graphs."
 *     Czechoslovak Mathematical Journal, 23(98), 298-305.
 *   - Chung, F. R. K. (1997). Spectral Graph Theory.
 *     American Mathematical Society, CBMS Regional Conference Series
 *     in Mathematics, Vol. 92.
 *
 * Why this matters for slopbrick: a low Fiedler value on the import
 * graph (built from pattern co-imports) is a strong signal that the
 * codebase has fragmented into weakly-coupled modules — the same lens
 * that the Architecture Consistency Score applies at the per-category
 * level, now extended to the global graph structure.
 */

/** Simple weighted undirected graph used by every Phase 6 engine. */
export interface Graph {
  nodes: string[];
  edges: Array<[string, string, number]>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the Laplacian L = D - A of a graph as an n×n dense matrix.
 *
 * L[i][i] = sum of weights on edges incident to node i.
 * L[i][j] = -weight of edge (i, j), or 0 if no edge.
 *
 * Edge weights are summed into degrees — parallel edges contribute
 * additively. Edges that reference unknown node names are skipped
 * (defensive against malformed input).
 */
export function buildLaplacian(graph: Graph): number[][] {
  const { nodes, edges } = graph;
  const n = nodes.length;
  const index = new Map<string, number>();
  for (let i = 0; i < n; i++) index.set(nodes[i], i);

  const L: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const [u, v, w] of edges) {
    const i = index.get(u);
    const j = index.get(v);
    if (i === undefined || j === undefined) continue;
    L[i][j] -= w;
    L[j][i] -= w;
    L[i][i] += w;
    L[j][j] += w;
  }
  return L;
}

/**
 * Approximate the second-smallest eigenvalue of a symmetric matrix
 * (i.e. the Fiedler value when the matrix is a graph Laplacian) using
 * the Lanczos iteration with k steps.
 *
 * The initial vector is the first standard basis vector e_0 for
 * determinism. The Krylov subspace is then K(A, e_0, k), and we
 * diagonalize the resulting k×k tridiagonal matrix via Jacobi
 * rotations to obtain Ritz values. The smallest positive Ritz value
 * is returned.
 *
 * Complexity: O(n·k) for the Lanczos pass + O(k^3) for the diagonalization
 * of T_k (negligible for k ≤ ~10). Total wall-clock cost is dominated
 * by the matrix-vector products in the Lanczos loop.
 *
 * Edge cases:
 *   - n ≤ 1                  → 0 (no Fiedler to define)
 *   - k ≤ 0                  → 0
 *   - Lanczos terminates     → returns whatever Ritz values survived
 *     early (β_j = 0)         (typically exact for the visited subspace)
 */
export function lanczosFiedler(laplacian: number[][], k: number = 3): number {
  const n = laplacian.length;
  if (n === 0 || n === 1) return 0;
  if (k <= 0) return 0;

  const T = lanczosTridiagonal(laplacian, k);
  if (T.length === 0) return 0;
  if (T.length === 1) return T[0]![0]!;

  const eigenvalues = symmetricEigenvalues(T);

  // Walk ascending; return the first eigenvalue strictly above the
  // numerical floor (treats the trivial 0 as a separator).
  for (const ev of eigenvalues) {
    if (ev > 1e-9) return ev;
  }
  return 0;
}

/**
 * Top-level spectral analysis: returns the Fiedler value (algebraic
 * connectivity) and a connectivity ratio that normalizes it against the
 * node count.
 *
 * The ratio fiedlerValue / n maps each graph onto a [0, 1]-ish scale:
 *   - Complete graph K_n   → Fiedler = n           → ratio = 1.0
 *   - Path graph P_n       → Fiedler → 0 as n grows → ratio → 0
 *   - Disconnected graph   → Fiedler = 0            → ratio = 0
 *
 * Connected-but-empty (no edges) graphs are special-cased to 0 as well,
 * because their Fiedler value is also 0 (one zero per connected
 * component, but with k Lanczos steps we can't always see both).
 */
export function analyzeSpectral(graph: Graph): { fiedlerValue: number; connectivityRatio: number } {
  const { nodes, edges } = graph;
  const n = nodes.length;

  if (n === 0) return { fiedlerValue: 0, connectivityRatio: 0 };
  if (n === 1) return { fiedlerValue: 0, connectivityRatio: 0 };

  // Disconnected → Fiedler = 0 (definition; second-smallest eigenvalue
  // of a graph with multiple components is 0).
  if (countConnectedComponents(nodes, edges) > 1) {
    return { fiedlerValue: 0, connectivityRatio: 0 };
  }

  // Edgeless connected graph → Fiedler is 0; Lanczos on the zero
  // matrix returns 0. Skip the matrix build entirely.
  if (totalEdgeWeight(edges) === 0) {
    return { fiedlerValue: 0, connectivityRatio: 0 };
  }

  const L = buildLaplacian(graph);
  const fiedler = lanczosFiedler(L, 3);
  return {
    fiedlerValue: round4(fiedler),
    connectivityRatio: round4(n === 0 ? 0 : fiedler / n),
  };
}

// ---------------------------------------------------------------------------
// Internal: Lanczos iteration
// ---------------------------------------------------------------------------

/**
 * Run k iterations of the Lanczos algorithm on a symmetric matrix A,
 * starting from the first standard basis vector e_0. Returns the k×k
 * tridiagonal matrix T_k (or smaller if the iteration terminates
 * early because β_j collapsed to numerical zero).
 */
function lanczosTridiagonal(A: number[][], k: number): number[][] {
  const n = A.length;
  // Deterministic initial vector e_0.
  let v: number[] = new Array<number>(n).fill(0);
  v[0] = 1;
  let vPrev: number[] | null = null;

  const alphas: number[] = [];
  const betas: number[] = [];

  // Cap iterations at min(k, n) — beyond that, the Krylov subspace can't
  // grow anyway, and the extra steps just zero out β_j.
  const iterations = Math.min(k, n);

  // Reference scale for β. When the exact β_j should be zero (e.g.
  // complete graphs, rank-1 updates), floating-point residue can be
  // ~1e-15 of this scale — anything below `epsScale * maxDiag` is noise.
  // We use 1e-10 as a conservative absolute floor combined with a
  // relative floor against the largest diagonal entry seen so far.
  let maxAbsAlpha = 0;
  for (let j = 0; j < iterations; j++) {
    // w = A v
    const w: number[] = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let l = 0; l < n; l++) sum += A[i]![l]! * v[l]!;
      w[i] = sum;
    }

    // w -= β_{j-1} v_{j-1}  (skip on j=0; v_{j-1} is undefined)
    if (vPrev !== null && betas.length > 0) {
      const betaPrev = betas[betas.length - 1]!;
      for (let i = 0; i < n; i++) w[i]! -= betaPrev * vPrev[i]!;
    }

    // α_j = v · w
    let alpha = 0;
    for (let i = 0; i < n; i++) alpha += v[i]! * w[i]!;
    alphas.push(alpha);
    if (Math.abs(alpha) > maxAbsAlpha) maxAbsAlpha = Math.abs(alpha);

    // w -= α_j v
    for (let i = 0; i < n; i++) w[i]! -= alpha * v[i]!;

    // β_j = ||w||
    let betaSq = 0;
    for (let i = 0; i < n; i++) {
      const wi = w[i]!;
      betaSq += wi * wi;
    }
    const beta = Math.sqrt(betaSq);

    // Treat β as zero if it's negligible relative to the running scale
    // of the iteration (so K_n terminates cleanly at k=2 instead of
    // producing spurious noise-driven rows on the diagonal). When that
    // happens the Krylov subspace has reached its full extent — there's
    // no new direction to add — so we stop iterating immediately rather
    // than continuing with a stale `v` and producing a phantom row.
    const threshold = Math.max(1e-12, 1e-10 * Math.max(maxAbsAlpha, 1));
    if (beta <= threshold) {
      // Push zero β so the off-diagonal entry sits in T_k; iteration ends.
      if (j < iterations - 1) break;
      break;
    }
    if (j < iterations - 1) {
      betas.push(beta);
      vPrev = v;
      const invBeta = 1 / beta;
      v = w.map((x) => x! * invBeta);
    }
  }

  const size = alphas.length;
  const T: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  for (let i = 0; i < size; i++) T[i]![i]! = alphas[i]!;
  for (let i = 0; i < size - 1; i++) {
    const b = betas[i] ?? 0;
    T[i]![i + 1]! = b;
    T[i + 1]![i]! = b;
  }
  return T;
}

// ---------------------------------------------------------------------------
// Internal: small symmetric eigensolver (Jacobi rotations)
// ---------------------------------------------------------------------------

/**
 * Diagonalize a symmetric matrix via cyclic Jacobi rotations. Returns
 * eigenvalues sorted ascending.
 *
 * For the k×k tridiagonal matrices produced by Lanczos (typically
 * k ≤ 10), this converges in well under the maxIter budget; the
 * quadratic-convergence of Jacobi rotations on small matrices makes
 * it faster than QR for k < 20.
 */
function symmetricEigenvalues(A: number[][], maxIter: number = 200, tol: number = 1e-14): number[] {
  const n = A.length;
  if (n === 0) return [];
  if (n === 1) return [A[0]![0]!];

  const M: number[][] = A.map((row) => row.slice());

  for (let iter = 0; iter < maxIter; iter++) {
    // Locate the largest off-diagonal element.
    let p = 0;
    let q = 1;
    let maxOff = Math.abs(M[0]![1]!);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = Math.abs(M[i]![j]!);
        if (a > maxOff) {
          maxOff = a;
          p = i;
          q = j;
        }
      }
    }
    if (maxOff < tol) break;

    // Rotation angle that zeros M[p][q] in one sweep.
    const diff = M[p]![p]! - M[q]![q]!;
    let theta: number;
    if (Math.abs(diff) < tol) {
      // 45° rotation when the diagonal entries are (numerically) equal.
      theta = (M[p]![q]! >= 0 ? 1 : -1) * (Math.PI / 4);
    } else {
      theta = 0.5 * Math.atan2(2 * M[p]![q]!, diff);
    }

    const c = Math.cos(theta);
    const s = Math.sin(theta);

    // Apply J^T M J: standard Jacobi update formulas. The sign of the
    // 2·c·s·Mpq term is positive in the (p, p) entry and negative in
    // the (q, q) entry — getting this backwards swaps the two
    // eigenvalues (verified against [[3, √3], [√3, 1]] which must yield
    // 4 and 0, not 1 and 3).
    const Mpp = M[p]![p]!;
    const Mqq = M[q]![q]!;
    const Mpq = M[p]![q]!;

    M[p]![p]! = c * c * Mpp + 2 * c * s * Mpq + s * s * Mqq;
    M[q]![q]! = s * s * Mpp - 2 * c * s * Mpq + c * c * Mqq;
    M[p]![q]! = 0;
    M[q]![p]! = 0;

    for (let i = 0; i < n; i++) {
      if (i === p || i === q) continue;
      const Mip = M[i]![p]!;
      const Miq = M[i]![q]!;
      M[i]![p]! = c * Mip - s * Miq;
      M[p]![i]! = M[i]![p]!;
      M[i]![q]! = s * Mip + c * Miq;
      M[q]![i]! = M[i]![q]!;
    }
  }

  const diagonal = new Array<number>(n);
  for (let i = 0; i < n; i++) diagonal[i] = M[i]![i]!;
  return diagonal.sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Internal: small graph helpers (kept local; louvain.ts has its own)
// ---------------------------------------------------------------------------

/** Sum of all edge weights (each triple once). */
function totalEdgeWeight(edges: ReadonlyArray<readonly [string, string, number]>): number {
  let total = 0;
  for (const [, , w] of edges) total += w;
  return total;
}

/** Count connected components via BFS. */
function countConnectedComponents(
  nodes: readonly string[],
  edges: ReadonlyArray<readonly [string, string, number]>,
): number {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n, []);
  for (const [u, v] of edges) {
    adj.get(u)?.push(v);
    adj.get(v)?.push(u);
  }
  const visited = new Set<string>();
  let count = 0;
  for (const n of nodes) {
    if (visited.has(n)) continue;
    count++;
    const queue: string[] = [n];
    while (queue.length > 0) {
      const x = queue.shift()!;
      if (visited.has(x)) continue;
      visited.add(x);
      for (const y of adj.get(x) ?? []) {
        if (!visited.has(y)) queue.push(y);
      }
    }
  }
  return count;
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}