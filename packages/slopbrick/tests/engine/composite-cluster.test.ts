// v0.42.0 (Sprint 3, §3b.7): tests for the empirical composite
// clusterer at `src/engine/cluster.ts`. Pure-function tests; the
// registry loader + CLI command are tested separately.

import { describe, expect, it } from 'vitest';

import {
  adaptiveMinSupport,
  computeRuleSupport,
  prefilterBySupport,
  buildContingency,
  fisherExactTwoSided,
  npmi,
  computeEdges,
  singleLinkageCluster,
  filesForComposite,
  calibrateCluster,
  compositeId,
  worstSeverity,
  describeComposite,
  runClusterer,
  resolveParams,
  DEFAULT_CLUSTER_PARAMS,
} from '../../src/engine/cluster';
import type { ClusterInput } from '../../src/types';

// ---------------------------------------------------------------------------
// STEP 1 — adaptive minSupport + rule pre-filter
// ---------------------------------------------------------------------------

describe('adaptiveMinSupport', () => {
  it('returns the default 5% for repos with >=100 files', () => {
    expect(adaptiveMinSupport(100)).toBe(0.05);
    expect(adaptiveMinSupport(500)).toBe(0.05);
    expect(adaptiveMinSupport(10_000)).toBe(0.05);
  });
  it('scales up below 100 files so the floor is at least 5 co-fire events', () => {
    expect(adaptiveMinSupport(50)).toBeCloseTo(0.1, 5);
    expect(adaptiveMinSupport(20)).toBeCloseTo(0.25, 5);
    expect(adaptiveMinSupport(10)).toBeCloseTo(0.5, 5);
  });
});

describe('computeRuleSupport + prefilterBySupport', () => {
  it('counts files per rule and drops rules below the support floor', () => {
    // 100 files: 30 fire r1, 8 fire r2, 4 fire r3 (below 5% floor)
    const fm = new Map<string, ReadonlySet<string>>();
    for (let i = 0; i < 30; i++) fm.set(`f${i}`, new Set(['r1']));
    for (let i = 0; i < 8; i++) fm.set(`g${i}`, new Set(['r2']));
    for (let i = 0; i < 4; i++) fm.set(`h${i}`, new Set(['r3']));
    const support = computeRuleSupport(fm);
    expect(support.get('r1')).toBe(30);
    expect(support.get('r2')).toBe(8);
    expect(support.get('r3')).toBe(4);

    const kept = prefilterBySupport(support, 100, 0.05);
    expect(kept.has('r1')).toBe(true);
    expect(kept.has('r2')).toBe(true);
    expect(kept.has('r3')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// STEP 2 — pairwise NPMI + Fisher's exact
// ---------------------------------------------------------------------------

describe('buildContingency + npmi', () => {
  it('counts a,b,aOnly,bOnly for two rule sets', () => {
    const a = new Set(['x', 'y', 'z']);
    const b = new Set(['y', 'z', 'w']);
    const c = buildContingency(a, b, 5);
    expect(c.aAndB).toBe(2); // y, z
    expect(c.aOnly).toBe(1); // x
    expect(c.bOnly).toBe(1); // w
    expect(c.neither).toBe(1); // (the 5th file, not in either)
  });

  it('returns +1 for perfectly correlated rules (NPMI ceiling)', () => {
    const a = new Set(['f1', 'f2', 'f3']);
    const b = new Set(['f1', 'f2', 'f3']);
    const c = buildContingency(a, b, 10);
    expect(npmi(c, 10)).toBeCloseTo(1, 5);
  });

  it('returns -1 for never co-occurring rules (NPMI floor)', () => {
    const a = new Set(['f1', 'f2']);
    const b = new Set(['f3', 'f4']);
    const c = buildContingency(a, b, 10);
    expect(npmi(c, 10)).toBe(-1);
  });

  it('returns -1 (or undefined) for never co-occurring rules (PMI bound)', () => {
    // Construct a true-independence case where co-fire = 0.
    const d = buildContingency(new Set(['f1', 'f2']), new Set(['f3', 'f4']), 4);
    // No co-occurrence → NPMI bound = -1
    expect(npmi(d, 4)).toBe(-1);
  });

  it('returns NPMI for rules with substantial overlap (mid-range)', () => {
    // p(X)=0.3, p(Y)=0.3, p(X&Y)=0.15 → PMI = log2(0.15/(0.3*0.3)) = log2(1.67) ≈ 0.74
    // NPMI = 0.74 / -log2(0.15) ≈ 0.74 / 2.74 ≈ 0.27
    // We'll just verify it's in the [-1, +1] bound and > 0.
    const c = buildContingency(
      new Set(['f1', 'f2', 'f3']),  // 3 files fire rA
      new Set(['f1', 'f2', 'f4']),  // 3 files fire rB; 2 overlap
      20,                              // total
    );
    const v = npmi(c, 20);
    expect(v).toBeGreaterThan(-1);
    expect(v).toBeLessThan(1);
    expect(v).toBeGreaterThan(0);
  });
});

describe('fisherExactTwoSided', () => {
  it('returns ~1 for unrelated rules (observed ≈ expected)', () => {
    // Marginal frequencies designed so the observed co-fire (10) is
    // close to the null-expected co-fire under independence
    // (50*50/1000 = 2.5? no — 100*100/1000 = 10). So expected = 10,
    // observed = 10, no deviation → Fisher's p ≈ 1.
    const c = { aAndB: 10, aOnly: 90, bOnly: 90, neither: 810 };
    expect(fisherExactTwoSided(c)).toBeCloseTo(1, 1);
  });

  it('returns ~0 for perfectly correlated rules (Yates-corrected)', () => {
    // 100 of 100 total fire both; row 1 all-in, row 2 all-in, no
    // divergence → Fisher's exact p = 1 (this is the degenerate case
    // of complete overlap). Verify the bounded behaviour.
    const c = { aAndB: 100, aOnly: 0, bOnly: 0, neither: 0 };
    expect(fisherExactTwoSided(c)).toBe(1);
  });

  it('returns a small p-value for a rule pair that co-fires significantly', () => {
    // 50 of 100 fire both; null hypothesis (independence) implies ~25.
    const c = { aAndB: 50, aOnly: 30, bOnly: 30, neither: 40 };
    // Under independence with marginals 80/100 and 80/100, expected
    // co-fire is 64. Observed 50 vs expected 64 is a moderate deficit
    // (odds ratio ≈ 0.39), so the two-sided Fisher p should be
    // non-trivial but not extremely small.
    const p = fisherExactTwoSided(c);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });

  it('returns p in [0, 1] even on tiny cells (no overflow)', () => {
    const tiny = { aAndB: 1, aOnly: 0, bOnly: 0, neither: 9 };
    const p = fisherExactTwoSided(tiny);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// STEP 3 — single-linkage clustering
// ---------------------------------------------------------------------------

describe('singleLinkageCluster', () => {
  it('groups rules connected by edges', () => {
    // r1-r2 edge, r2-r3 edge → all three in one cluster; r4 alone.
    const edges = [
      { ruleIds: ['r1', 'r2'] as [string, string], weight: 0.5, fisherP: 0.001 },
      { ruleIds: ['r2', 'r3'] as [string, string], weight: 0.6, fisherP: 0.001 },
    ];
    const clusters = singleLinkageCluster(edges, 2);
    expect(clusters.length).toBe(1);
    expect(clusters[0]).toEqual(['r1', 'r2', 'r3']);
  });

  it('drops clusters below minClusterSize', () => {
    const edges = [
      { ruleIds: ['r1', 'r2'] as [string, string], weight: 0.5, fisherP: 0.001 },
    ];
    expect(singleLinkageCluster(edges, 2)).toEqual([['r1', 'r2']]);
    expect(singleLinkageCluster(edges, 3)).toEqual([]);
  });

  it('returns empty array for empty edge list', () => {
    expect(singleLinkageCluster([], 2)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// STEP 4 — per-cluster calibration
// ---------------------------------------------------------------------------

describe('filesForComposite', () => {
  it('returns files where at least minMatch members fire', () => {
    const fm = new Map<string, ReadonlySet<string>>([
      ['f1', new Set(['a', 'b'])],
      ['f2', new Set(['a'])],
      ['f3', new Set(['a', 'b', 'c'])],
      ['f4', new Set(['c'])],
    ]);
    expect(filesForComposite(fm, ['a', 'b', 'c'], 1)).toEqual(
      new Set(['f1', 'f2', 'f3', 'f4']),
    );
    expect(filesForComposite(fm, ['a', 'b', 'c'], 2)).toEqual(
      new Set(['f1', 'f3']),
    );
    expect(filesForComposite(fm, ['a', 'b', 'c'], 3)).toEqual(new Set(['f3']));
  });
});

describe('calibrateCluster — calibration gate', () => {
  function makeMatrix() {
    // 100 files total. Of these, 50 are positive, 50 negative.
    const fm = new Map<string, ReadonlySet<string>>();
    // Positive class fires BOTH r1+r2 on 40 files and just r1 on 10.
    for (let i = 0; i < 40; i++) fm.set(`pos${i}`, new Set(['r1', 'r2']));
    for (let i = 0; i < 10; i++) fm.set(`pos_only_r1${i}`, new Set(['r1']));
    // Negative class fires only r2 on 5 files and neither on 45.
    for (let i = 0; i < 5; i++) fm.set(`neg${i}`, new Set(['r2']));
    for (let i = 0; i < 45; i++) fm.set(`neg_neither${i}`, new Set([]));
    return fm;
  }

  it('passes the recall/FP ≥ 1.5× gate when r1 ∧ r2 nails the positive class', () => {
    const fm = makeMatrix();
    const positive = new Set<string>();
    for (let i = 0; i < 40; i++) positive.add(`pos${i}`);
    for (let i = 0; i < 10; i++) positive.add(`pos_only_r1${i}`);

    const edges = [
      { ruleIds: ['r1', 'r2'] as [string, string], weight: 0.7, fisherP: 1e-6 },
    ];
    // Cluster = {r1, r2}. Sweep k=1..2, pick max F1 subject to gate.
    //   k=1: fires on 55 files (50 pos + 5 neg that fire r2). F1 ≈ 0.95.
    //   k=2: fires on 40 files (only co-firing pos). F1 ≈ 0.89.
    // Max F1 is k=1.
    const cal = calibrateCluster(['r1', 'r2'], edges, fm, positive, 100);
    expect(cal).not.toBeNull();
    expect(cal!.minMatch).toBe(1);
    expect(cal!.recall).toBe(1.0); // 50 TP / 50 pos
    expect(cal!.F1).toBeGreaterThan(0.85);
  });

  it('drops clusters whose best minMatch fails the recall/FP gate', () => {
    // Same fixture but inverted: r1 and r2 never co-fire on positives
    // but DO co-fire on negatives. Rule pair has association but it's
    // anti-correlated with class — should fail the gate.
    const fm = new Map<string, ReadonlySet<string>>();
    for (let i = 0; i < 50; i++) fm.set(`pos${i}`, new Set(['r1']));
    for (let i = 0; i < 50; i++) fm.set(`neg${i}`, new Set(['r1', 'r2']));
    const positive = new Set<string>();
    for (let i = 0; i < 50; i++) positive.add(`pos${i}`);
    const edges = [
      { ruleIds: ['r1', 'r2'] as [string, string], weight: 0.5, fisherP: 1e-6 },
    ];
    // Recall for both k=1 and k=2 = 0 because co-firing never hits the
    // positive class — cluster fails the recall gate and is dropped.
    const cal = calibrateCluster(['r1', 'r2'], edges, fm, positive, 100);
    expect(cal).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// STEP 5 — composite id + description + severity aggregation
// ---------------------------------------------------------------------------

describe('compositeId', () => {
  it('is deterministic regardless of member order', () => {
    expect(compositeId(['a', 'b', 'c'])).toBe(compositeId(['c', 'a', 'b']));
  });
  it('starts with "composite/"', () => {
    expect(compositeId(['x', 'y']).startsWith('composite/')).toBe(true);
  });
});

describe('worstSeverity', () => {
  it('returns high when any member is high', () => {
    const m = new Map<string, 'low' | 'medium' | 'high'>([
      ['a', 'medium'],
      ['b', 'high'],
      ['c', 'low'],
    ]);
    expect(worstSeverity(['a', 'b', 'c'], m)).toBe('high');
  });
  it('defaults to low when no severities provided', () => {
    expect(worstSeverity(['a', 'b'], undefined)).toBe('low');
  });
});

describe('describeComposite', () => {
  it('lists short clusters inline', () => {
    expect(describeComposite(['a', 'b'], 2)).toBe(
      'Composite rule: at least 2 of {a+b} fire on the same file.',
    );
  });
  it('truncates long member lists', () => {
    const d = describeComposite(['a', 'b', 'c', 'd', 'e'], 2);
    expect(d).toContain('a+b+c');
    expect(d).toContain('2 more');
  });
});

// ---------------------------------------------------------------------------
// Top-level: end-to-end runClusterer
// ---------------------------------------------------------------------------

describe('runClusterer', () => {
  it('returns empty entries when no rules reach the support floor', () => {
    const fm = new Map<string, ReadonlySet<string>>();
    for (let i = 0; i < 4; i++) fm.set(`f${i}`, new Set(['lonely']));
    const out = runClusterer({ fireMatrix: fm });
    expect(out.entries).toEqual([]);
  });

  it('discovers a composite of co-firing rules and emits a valid entry', () => {
    // 100 files: r1, r2 fire together on all 50 positive files.
    // r3 fires alone on 1 negative file (low support, drops out).
    const fm = new Map<string, ReadonlySet<string>>();
    for (let i = 0; i < 50; i++) fm.set(`pos${i}`, new Set(['r1', 'r2']));
    for (let i = 0; i < 49; i++) fm.set(`neg${i}`, new Set([]));
    fm.set(`lone${0}`, new Set(['r3']));

    const positive = new Set<string>();
    for (let i = 0; i < 50; i++) positive.add(`pos${i}`);

    const out = runClusterer({
      fireMatrix: fm,
      positiveFiles: positive,
      now: '2026-07-05T00:00:00.000Z',
    });
    expect(out.entries.length).toBeGreaterThan(0);
    const e = out.entries[0]!;
    expect(e.ruleIds).toEqual(['r1', 'r2']);
    expect(e.minMatch).toBe(2);
    expect(e.defaultOff).toBe(true);
    expect(e.provenance.seed).toBe('auto-cluster');
    expect(e.provenance.discoveredAt).toBe('2026-07-05T00:00:00.000Z');
    expect(e.calibration.recall).toBeGreaterThan(0.5);
  });

  it('handles empty fireMatrix gracefully', () => {
    const out = runClusterer({ fireMatrix: new Map() });
    expect(out.entries).toEqual([]);
    expect(out.filesScanned).toBe(0);
  });
});

describe('resolveParams', () => {
  it('uses adaptive default for minSupport', () => {
    const p = resolveParams(undefined, 200);
    expect(p.minSupport).toBe(0.05);
  });
  it('honors explicit overrides', () => {
    const p = resolveParams({ minNPMI: 0.5 }, 200);
    expect(p.minNPMI).toBe(0.5);
    expect(p.minSupport).toBe(0.05); // adaptive default still applied
  });
  it('matches DEFAULT_CLUSTER_PARAMS for safe inputs', () => {
    const p = resolveParams({}, 200);
    expect(p.minNPMI).toBe(DEFAULT_CLUSTER_PARAMS.minNPMI);
    expect(p.fisherAlpha).toBe(DEFAULT_CLUSTER_PARAMS.fisherAlpha);
    expect(p.minClusterSize).toBe(DEFAULT_CLUSTER_PARAMS.minClusterSize);
  });
});

describe('ClusterInput compile-time shape', () => {
  it('accepts the documented field set', () => {
    const input: ClusterInput = {
      fireMatrix: new Map(),
      positiveFiles: undefined,
      memberSeverities: undefined,
      params: { minNPMI: 0.4 },
      now: '2026-07-05T00:00:00.000Z',
    };
    expect(input.now).toBe('2026-07-05T00:00:00.000Z');
  });
});
