/**
 * v0.10.1: Tier 2 graph-theoretic types (Phase 6).
 *
 * Three peer-reviewed graph methods compose into the Architecture
 * Consistency Score as a new "module structure" axis:
 *
 *   - Louvain community detection (Blondel et al. 2008)
 *     Communities \u2014 modularity-maximizing partition of the import
 *     graph. Files that are outliers in their community = drift signal.
 *
 *   - Spectral graph theory \u2014 Fiedler value (Fiedler 1973)
 *     Second-smallest eigenvalue of the graph Laplacian. Low value
 *     = fragmented modules = architectural drift.
 *
 *   - Bayesian Online Changepoint Detection (Adams & MacKay 2007)
 *     Regime changes in rule-firing rate over lines of a file or
 *     commits over time. Detects "this PR was authored under a
 *     different regime than the rest of the file."
 *
 * Together they form the "module structure + regime stability" axis
 * of the Architecture Consistency Score, complementing the existing
 * pattern-inventory-based axis.
 */

/** A single community from Louvain partition. */
export interface Community {
  /** Stable community id (0-indexed, assigned in order of detection). */
  id: number;
  /** Absolute file paths in this community. */
  files: string[];
  /** Total number of intra-community edges (weighted). */
  internalEdges: number;
}

/** Louvain partition result. */
export interface CommunityDetection {
  communities: Community[];
  /** Modularity score Q in [-1, 1]. Higher = better community structure. */
  modularity: number;
  /** Number of iterations the Louvain algorithm ran to convergence. */
  iterations: number;
}

/** Spectral graph theory result. */
export interface SpectralAnalysis {
  /**
   * Fiedler value \u2014 second-smallest eigenvalue of the Laplacian.
   * Higher = better connected graph. Below 0.1 = fragmented.
   * Above 1.0 = well-connected.
   */
  fiedlerValue: number;
  /**
   * Algebraic connectivity ratio = fiedlerValue / meanDegree.
   * Normalizes the Fiedler value against graph density so that small
   * dense graphs aren't penalized for being small.
   */
  connectivityRatio: number;
}

/** A regime segment between two changepoints. */
export interface RegimeSegment {
  /** Inclusive start line (1-indexed). */
  startLine: number;
  /** Inclusive end line (1-indexed). */
  endLine: number;
  /** Mean rule-firing rate in this segment. */
  meanRate: number;
  /** Standard deviation of the rate within this segment. */
  stdDev: number;
  /** Posterior probability that this segment is the same regime as the previous one. */
  regimeChangeProb: number;
}

/** Bayesian Online Changepoint Detection result. */
export interface ChangepointAnalysis {
  /** Changepoint line numbers (1-indexed, sorted ascending). */
  changepoints: number[];
  /** Regime segments between changepoints. */
  segments: RegimeSegment[];
  /** Overall regime stability score (0 = unstable, 1 = perfectly stable). */
  stabilityScore: number;
}

/**
 * Module structure + regime stability axis that gets attached to
 * Architecture Consistency Score when Phase 6 work ships.
 */
export interface ModuleStructureAxis {
  communityDetection?: CommunityDetection;
  spectral?: SpectralAnalysis;
  changepoint?: ChangepointAnalysis;
}
