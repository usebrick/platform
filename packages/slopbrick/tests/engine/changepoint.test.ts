import { describe, it, expect } from 'vitest';

import {
  bayesianOnlineChangepointDetection,
  detectChangepoints,
  detectChangepointsFromSignals,
  runBOCPD,
  DEFAULT_STRICT_CHANGEPOSURE_THRESHOLD,
  DEFAULT_MAP_RATIO_THRESHOLD,
  CHANGEPOSURE_WARMUP,
} from '../../src/engine/changepoint';

/**
 * v0.10.1: Bayesian Online Changepoint Detection (BOCPD) tests.
 *
 * Pins the Adams & MacKay 2007 algorithm to specific synthetic
 * regimes so future refactors of the message-passing loop, the
 * NIG prior defaults, or the two-signal detection rule are caught
 * by deterministic tests.
 *
 * Detection uses two complementary signals:
 *   - `P(r=0) > 0.5` — strict Adams-MacKay "did a changepoint
 *     happen at this very step?" Spikes for `hazard = 1` (forced
 *     resets) and noisy data.
 *   - `MAP(t) / (t+1) < 0.1` with first-crossing — relaxed
 *     "regime-just-changed" signal. Spikes for clean step-function
 *     transitions where P(r=0) stays near the hazard rate.
 */

describe('bayesianOnlineChangepointDetection', () => {
  it('returns empty analysis with stabilityScore = 1.0 for empty input', () => {
    const a = bayesianOnlineChangepointDetection([]);
    expect(a.changepoints).toEqual([]);
    expect(a.segments).toEqual([]);
    expect(a.stabilityScore).toBe(1.0);
  });

  it('returns no changepoints for a single observation (cannot establish a regime)', () => {
    const a = bayesianOnlineChangepointDetection([0]);
    expect(a.changepoints).toEqual([]);
    expect(a.segments).toEqual([]);
    expect(a.stabilityScore).toBe(1.0);
  });

  it('produces no changepoints on constant observations (stabilityScore ≈ 1.0)', () => {
    // 200 identical observations under default prior (μ=0, σ=1) all
    // sit comfortably on the regime's predictive distribution. The
    // P(r=0) signal stays bounded by the hazard rate (1/100) and the
    // MAP-ratio stays near 1.0 throughout — neither signal fires.
    const data = new Array(200).fill(0);
    const a = bayesianOnlineChangepointDetection(data);
    expect(a.changepoints).toEqual([]);
    expect(a.stabilityScore).toBeCloseTo(1.0, 10);
    expect(a.segments).toHaveLength(1);
    expect(a.segments[0]?.startLine).toBe(1);
    expect(a.segments[0]?.endLine).toBe(200);
    expect(a.segments[0]?.meanRate).toBeCloseTo(0, 10);
    expect(a.segments[0]?.stdDev).toBeCloseTo(0, 10);
    // First segment has no previous regime to compare → 1.0.
    expect(a.segments[0]?.regimeChangeProb).toBe(1.0);
  });

  it('detects exactly one changepoint near index 100 for [0 × 100, 1 × 100]', () => {
    // 100 zeros then 100 ones. The transition from mean 0 to mean 1
    // under default stdPrior = 1 collapses the long-run predictive
    // (P(x=1 | run of 100 zeros) ≈ 0), so the MAP run length drops
    // from 100 to ~1 at the first "1" observation (1-indexed line
    // 101). The MAP-ratio first-crossing detection fires there.
    const data: number[] = [
      ...new Array(100).fill(0),
      ...new Array(100).fill(1),
    ];
    const a = bayesianOnlineChangepointDetection(data);
    expect(a.changepoints).toHaveLength(1);
    expect(a.changepoints[0]).toBe(101);
    expect(a.segments).toHaveLength(2);
    expect(a.segments[0]?.startLine).toBe(1);
    expect(a.segments[0]?.endLine).toBe(100);
    expect(a.segments[0]?.meanRate).toBeCloseTo(0, 10);
    expect(a.segments[1]?.startLine).toBe(101);
    expect(a.segments[1]?.endLine).toBe(200);
    expect(a.segments[1]?.meanRate).toBeCloseTo(1, 10);
    expect(a.stabilityScore).toBeCloseTo(1 - 1 / 200, 10);
    // The boundary between segments 0 and 1 reports a small
    // "same-regime" probability — the MAP-ratio at the first step
    // of segment 1 collapses to ~0.01 (algorithm believes the new
    // regime is much shorter than the data history).
    expect(a.segments[1]?.regimeChangeProb).toBeLessThan(0.5);
  });

  it('detects exactly two changepoints near indices 50 and 100 for [0 × 50, 1 × 50, 2 × 50]', () => {
    const data: number[] = [
      ...new Array(50).fill(0),
      ...new Array(50).fill(1),
      ...new Array(50).fill(2),
    ];
    const a = bayesianOnlineChangepointDetection(data);
    expect(a.changepoints).toHaveLength(2);
    expect(a.changepoints[0]).toBe(51);
    expect(a.changepoints[1]).toBe(101);
    expect(a.segments).toHaveLength(3);
    expect(a.segments.map((s) => s.startLine)).toEqual([1, 51, 101]);
    expect(a.segments.map((s) => s.endLine)).toEqual([50, 100, 150]);
    expect(a.segments.map((s) => s.meanRate)).toEqual([0, 1, 2]);
    expect(a.stabilityScore).toBeCloseTo(1 - 2 / 150, 10);
  });

  it('increasing hazard rate (shorter expected runs) produces more changepoints', () => {
    // Noisy data with two clear regimes: 50 points around mean 0,
    // then 50 points around mean 3 (noise std = 0.3 — small relative
    // to the regime gap). With low hazard the algorithm commits to
    // long runs and may detect only the single regime transition;
    // with high hazard it detects additional "mini-changepoints"
    // within each regime because it expects short runs to begin with.
    // Deterministic LCG noise keeps the test reproducible.
    const data: number[] = [];
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const boxMuller = () => {
      const u1 = Math.max(rand(), 1e-12);
      const u2 = rand();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };
    for (let i = 0; i < 50; i++) data.push(0 + 0.3 * boxMuller());
    for (let i = 0; i < 50; i++) data.push(3 + 0.3 * boxMuller());
    const longRuns = bayesianOnlineChangepointDetection(data, 1 / 1000);
    const shortRuns = bayesianOnlineChangepointDetection(data, 1 / 10);
    expect(shortRuns.changepoints.length).toBeGreaterThanOrEqual(
      longRuns.changepoints.length,
    );
    expect(shortRuns.stabilityScore).toBeLessThanOrEqual(
      longRuns.stabilityScore,
    );
  });

  it('decreasing hazard rate (longer expected runs) produces fewer changepoints', () => {
    // Symmetric to the previous test: regression guard for "hazard
    // rate is monotone in expected run length" on data with regime
    // structure. Same noisy two-regime dataset.
    const data: number[] = [];
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const boxMuller = () => {
      const u1 = Math.max(rand(), 1e-12);
      const u2 = rand();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };
    for (let i = 0; i < 50; i++) data.push(0 + 0.3 * boxMuller());
    for (let i = 0; i < 50; i++) data.push(3 + 0.3 * boxMuller());
    const aggressive = bayesianOnlineChangepointDetection(data, 1 / 20);
    const cautious = bayesianOnlineChangepointDetection(data, 1 / 500);
    expect(aggressive.changepoints.length).toBeGreaterThanOrEqual(
      cautious.changepoints.length,
    );
  });

  it('returns stabilityScore = 1.0 when no changepoints are detected', () => {
    const data = new Array(50).fill(0.5);
    const a = bayesianOnlineChangepointDetection(data);
    expect(a.changepoints).toEqual([]);
    expect(a.stabilityScore).toBe(1.0);
  });

  it('returns stabilityScore = 0 when every observation is a changepoint (hazard = 1)', () => {
    // Hazard rate 1.0 forces P(r=0) = 1 at every step, so the strict
    // Adams-MacKay signal fires on every observation. StabilityScore
    // collapses to 0 — no stable regime can be found.
    const data = new Array(20).fill(0);
    const a = bayesianOnlineChangepointDetection(data, 1.0);
    expect(a.changepoints).toHaveLength(data.length);
    expect(a.stabilityScore).toBe(0);
  });

  it('uses the supplied strict threshold for detectChangepoints (lower threshold → more changepoints via MAP-ratio signal)', () => {
    // With default hazard (1/100), the strict P(r=0) signal rarely
    // fires for clean step-function data; most detections come from
    // the MAP-ratio first-crossing. Lowering the MAP-ratio threshold
    // (or raising the strict threshold past the data's spike) should
    // monotonically change the changepoint count.
    const data: number[] = [
      ...new Array(20).fill(0),
      ...new Array(20).fill(2),
    ];
    const conservative = detectChangepoints(data, 0.5, 1 / 100, 0, 1, 0.05);
    const liberal = detectChangepoints(data, 0.5, 1 / 100, 0, 1, 0.5);
    expect(liberal.length).toBeGreaterThanOrEqual(conservative.length);
    expect(conservative.length).toBeGreaterThanOrEqual(1);
  });

  it('default strict threshold matches the paper\'s Bayes-factor-1 cutoff (0.5)', () => {
    expect(DEFAULT_STRICT_CHANGEPOSURE_THRESHOLD).toBe(0.5);
  });

  it('default map-ratio threshold is small (0.1) — only sharp drops trigger', () => {
    expect(DEFAULT_MAP_RATIO_THRESHOLD).toBe(0.1);
  });

  it('warmup constant is 5 (skips first 5 observations to avoid degenerate detections)', () => {
    expect(CHANGEPOSURE_WARMUP).toBe(5);
  });

  it('per-segment stdDev is zero on constant-input segments', () => {
    const data: number[] = [
      ...new Array(50).fill(7),
      ...new Array(50).fill(7),
    ];
    const a = bayesianOnlineChangepointDetection(data);
    expect(a.segments.every((s) => s.stdDev === 0)).toBe(true);
  });

  it('detects a changepoint on a small drift (mean shift of 0.5 with low noise)', () => {
    // Tiny drift: 30 zeros then 30 values of 0.5 with stdPrior = 0.1.
    // The mean shift is 5 sigma — detectable via the MAP-ratio first
    // crossing on the very first out-of-regime observation.
    const data: number[] = [
      ...new Array(30).fill(0),
      ...new Array(30).fill(0.5),
    ];
    const a = bayesianOnlineChangepointDetection(data, 1 / 100, 0, 0.1);
    expect(a.changepoints).toHaveLength(1);
    expect(a.changepoints[0]).toBe(31);
    expect(a.segments).toHaveLength(2);
  });
});

describe('detectChangepoints', () => {
  it('returns an empty array for a single observation', () => {
    expect(detectChangepoints([0])).toEqual([]);
    expect(detectChangepoints([0], 0.5)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(detectChangepoints([])).toEqual([]);
  });

  it('agrees with the analysis changepoints for a clear regime change', () => {
    const data: number[] = [
      ...new Array(50).fill(0),
      ...new Array(50).fill(5),
    ];
    const a = bayesianOnlineChangepointDetection(data);
    const lines = detectChangepoints(data);
    expect(lines).toEqual(a.changepoints);
  });
});

describe('detectChangepointsFromSignals', () => {
  it('fires on a strict P(r=0) spike past threshold', () => {
    // Hand-built signals: P(r=0) = 0.9 at t = 5 (post-warmup).
    // Detection should fire regardless of mapRatio.
    const signals = {
      pR0: [0.1, 0.1, 0.1, 0.1, 0.1, 0.9, 0.1, 0.1],
      mapRatio: [0, 0.2, 0.4, 0.6, 0.8, 0.9, 0.95, 0.99],
    };
    const lines = detectChangepointsFromSignals(signals, 0.5, 0.1);
    expect(lines).toEqual([6]); // 1-indexed
  });

  it('fires on MAP-ratio first crossing (post-warmup)', () => {
    // Hand-built signals: MAP-ratio drops from 0.95 → 0.05 at t = 6.
    const signals = {
      pR0: new Array(8).fill(0.01),
      mapRatio: [0, 0.2, 0.4, 0.6, 0.8, 0.95, 0.05, 0.06],
    };
    const lines = detectChangepointsFromSignals(signals, 0.5, 0.1);
    expect(lines).toEqual([7]); // 1-indexed
  });

  it('skips the first 5 observations for MAP-ratio detection (warmup)', () => {
    // The strict P(r=0) signal fires whenever it exceeds threshold,
    // regardless of warmup (so hazard=1 produces a detection at every
    // step including t=0..4). The MAP-ratio first-crossing signal,
    // however, requires t ≥ CHANGEPOSURE_WARMUP — hand-built signals
    // with a MAP-ratio spike at t=2 should NOT fire.
    const signals = {
      pR0: [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01],
      mapRatio: [0.5, 0.5, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7],
    };
    const lines = detectChangepointsFromSignals(signals, 0.5, 0.1);
    // The MAP-ratio first crossing at t=2 is in the warmup window
    // (CHANGEPOSURE_WARMUP = 5), so it is skipped. No other signal
    // fires.
    expect(lines).toEqual([]);
  });

  it('returns empty array for empty signals', () => {
    const signals = { pR0: [], mapRatio: [] };
    expect(detectChangepointsFromSignals(signals, 0.5, 0.1)).toEqual([]);
  });

  it('returns empty array when neither signal fires (stable regime)', () => {
    const signals = {
      pR0: new Array(20).fill(0.01),
      mapRatio: new Array(20).fill(0.9),
    };
    expect(detectChangepointsFromSignals(signals, 0.5, 0.1)).toEqual([]);
  });
});

describe('runBOCPD signal shape (white-box)', () => {
  it('emits a P(r=0) spike at every step under hazard = 1', () => {
    const signals = runBOCPD([0, 0, 0, 0, 0, 0, 0], 1.0, 0, 1);
    // Hazard = 1 forces the changepoint message to dominate at
    // every step. After warmup, every post-warmup pR0 should be
    // close to 1.0.
    for (let t = CHANGEPOSURE_WARMUP; t < signals.pR0.length; t++) {
      expect(signals.pR0[t]).toBeGreaterThan(0.99);
    }
  });

  it('keeps the MAP-ratio near 1.0 on constant data', () => {
    const signals = runBOCPD(new Array(50).fill(0), 1 / 100, 0, 1);
    for (let t = CHANGEPOSURE_WARMUP; t < signals.mapRatio.length; t++) {
      expect(signals.mapRatio[t]).toBeGreaterThan(0.9);
    }
  });

  it('drops the MAP-ratio sharply on the first out-of-regime observation', () => {
    const signals = runBOCPD(
      [...new Array(50).fill(0), ...new Array(50).fill(1)],
      1 / 100,
      0,
      1,
    );
    // Before the transition the MAP-ratio is close to 1.0; at the
    // transition (1-indexed line 51, 0-indexed step 50) it collapses.
    const beforeTransition = signals.mapRatio[48]!; // 0-indexed line 49
    const atTransition = signals.mapRatio[50]!; // 0-indexed line 51
    expect(beforeTransition).toBeGreaterThan(0.9);
    expect(atTransition).toBeLessThan(0.1);
  });
});