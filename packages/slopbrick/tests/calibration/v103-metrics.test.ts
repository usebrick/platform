import { describe, expect, it } from 'vitest';
import {
  computeV103MacroMetrics,
  computeV103Metrics,
  computeV103RepositoryClusterBootstrap,
  type V103MetricObservation,
} from '../../src/calibration/v103/metrics';

const ruleCatalog = [
  { ruleId: 'security/sql-construction', aiSpecific: false },
  { ruleId: 'ai/zero-fire', aiSpecific: true },
  { ruleId: 'ai/comment-ratio', aiSpecific: true },
] as const;

const observations: readonly V103MetricObservation[] = [
  {
    version: 'v10.3', runId: 'metrics-fixture', fileId: 'ai-1', repositoryId: 'ai-repo',
    familyId: 'ai-family', language: 'typescript', polarity: 'verified_ai',
    status: 'success_findings', findingsCount: 2,
    ruleEvidence: [{ ruleId: 'ai/comment-ratio', category: 'ai', aiSpecific: true, severity: 'high', count: 2 }],
  },
  {
    version: 'v10.3', runId: 'metrics-fixture', fileId: 'ai-2', repositoryId: 'ai-repo',
    familyId: 'ai-family', language: 'typescript', polarity: 'verified_ai',
    status: 'success_zero', findingsCount: 0,
  },
  {
    version: 'v10.3', runId: 'metrics-fixture', fileId: 'human-1', repositoryId: 'human-repo',
    familyId: 'human-family', language: 'typescript', polarity: 'verified_human',
    status: 'success_findings', findingsCount: 1,
    ruleEvidence: [{ ruleId: 'ai/comment-ratio', category: 'ai', aiSpecific: true, severity: 'medium', count: 1 }],
  },
  {
    version: 'v10.3', runId: 'metrics-fixture', fileId: 'human-2', repositoryId: 'human-repo',
    familyId: 'human-family', language: 'typescript', polarity: 'verified_human',
    status: 'success_zero', findingsCount: 0,
  },
  {
    version: 'v10.3', runId: 'metrics-fixture', fileId: 'human-3', repositoryId: 'human-repo',
    familyId: 'human-family', language: 'typescript', polarity: 'verified_human',
    status: 'success_zero', findingsCount: 0,
  },
] as const;

const eligibleFileIdsByPolarity = {
  verified_ai: ['ai-1', 'ai-2'],
  verified_human: ['human-1', 'human-2', 'human-3'],
} as const;

describe('v10.3 pure metrics producer', () => {
  it('computes file-level TP/FP/P/N rates and Haldane-smoothed LR+ with an explicit prior', () => {
    const result = computeV103Metrics({ observations, ruleCatalog, eligibleFileIdsByPolarity, prior: 0.8 });
    expect(result.status).toBe('available');
    if (result.status !== 'available') return;

    const metric = result.rules.find((rule) => rule.ruleId === 'ai/comment-ratio');
    expect(metric).toMatchObject({
      status: 'measured', tp: 1, fp: 1, p: 2, n: 3,
      recall: 0.5, fpr: 1 / 3,
    });
    expect(metric!.lrPlus).toBeCloseTo((1.5 / 3) / (1.5 / 4), 12);
    expect(metric!.balancedPpv).toBeCloseTo(0.6, 12);
    expect(metric!.priorPpv).toBeCloseTo(0.8 * 0.5 / (0.8 * 0.5 + 0.2 * (1 / 3)), 12);
    expect(metric!.recallInterval).toMatchObject({ lower: expect.any(Number), upper: expect.any(Number) });
    expect(metric!.fprInterval).toMatchObject({ lower: expect.any(Number), upper: expect.any(Number) });
    expect(metric!.recallInterval!.lower).toBeLessThan(metric!.recallInterval!.upper);
    expect(metric!.fprInterval!.lower).toBeLessThan(metric!.fprInterval!.upper);
    expect(Number.isFinite(metric!.lrPlus)).toBe(true);
  });

  it('keeps zero-fire AI rules distinct from ineligible non-AI rules', () => {
    const result = computeV103Metrics({ observations, ruleCatalog, eligibleFileIdsByPolarity });
    expect(result.status).toBe('available');
    if (result.status !== 'available') return;

    const zero = result.rules.find((rule) => rule.ruleId === 'ai/zero-fire');
    expect(zero).toMatchObject({ status: 'zero-fire', tp: 0, fp: 0, p: 2, n: 3, recall: 0, fpr: 0 });
    expect(zero!.lrPlus).toBeCloseTo((0.5 / 3) / (0.5 / 4), 12);
    const ineligible = result.rules.find((rule) => rule.ruleId === 'security/sql-construction');
    expect(ineligible).toEqual({ ruleId: 'security/sql-construction', aiSpecific: false, status: 'ineligible' });
  });

  it('refuses to infer an eligible cohort when no file IDs are supplied', () => {
    expect(computeV103Metrics({ observations, ruleCatalog, eligibleFileIdsByPolarity: { verified_ai: [], verified_human: [] } })).toEqual({
      status: 'unavailable', reason: 'eligible-cohort-unavailable',
    });
  });

  it('requires both polarity denominators before calculating rates', () => {
    expect(computeV103Metrics({
      observations,
      ruleCatalog,
      eligibleFileIdsByPolarity: { verified_ai: ['ai-1', 'ai-2'], verified_human: [] },
    })).toEqual({ status: 'unavailable', reason: 'eligible-cohort-unavailable' });
  });

  it('does not turn missing rule evidence into a zero-fire claim', () => {
    const incomplete = observations.map((observation) => observation.fileId === 'ai-1'
      ? { ...observation, ruleEvidence: undefined }
      : observation);
    expect(computeV103Metrics({ observations: incomplete, ruleCatalog, eligibleFileIdsByPolarity })).toEqual({
      status: 'unavailable', reason: 'rule-evidence-unavailable',
    });
  });

  it('is deterministic and path-free for the same verified inputs', () => {
    const first = computeV103Metrics({ observations, ruleCatalog, eligibleFileIdsByPolarity });
    const second = computeV103Metrics({ observations, ruleCatalog, eligibleFileIdsByPolarity });
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toContain('/Users/');
    expect(JSON.stringify(first)).not.toContain('checkoutPath');
    if (first.status === 'available') expect(first.rules.map((rule) => rule.ruleId)).toEqual([
      'ai/comment-ratio', 'ai/zero-fire', 'security/sql-construction',
    ]);
  });

  it('rejects observations from different runs and schema-incompatible terminal metadata', () => {
    const mixedRun = observations.map((observation) => observation.fileId === 'human-1'
      ? { ...observation, runId: 'different-run' }
      : observation);
    expect(() => computeV103Metrics({ observations: mixedRun, ruleCatalog, eligibleFileIdsByPolarity })).toThrow();

    const invalidFailure = observations.map((observation) => observation.fileId === 'human-2'
      ? {
        ...observation,
        status: 'timeout' as const,
        findingsCount: undefined,
        ruleEvidence: undefined,
        failureCode: 'timeout',
        exclusionReason: 'also-excluded',
      }
      : observation);
    expect(() => computeV103Metrics({ observations: invalidFailure, ruleCatalog, eligibleFileIdsByPolarity })).toThrow();
  });
});

describe('v10.3 deterministic macro metrics', () => {
  const macroObservations: readonly V103MetricObservation[] = [
    {
      version: 'v10.3', runId: 'macro-fixture', fileId: 'ai-a-ts', repositoryId: 'ai-repo-a',
      familyId: 'ai-family-a', language: 'typescript', polarity: 'verified_ai',
      status: 'success_findings', findingsCount: 1,
      ruleEvidence: [{ ruleId: 'ai/comment-ratio', category: 'ai', aiSpecific: true, severity: 'high', count: 1 }],
    },
    {
      version: 'v10.3', runId: 'macro-fixture', fileId: 'ai-b-ts', repositoryId: 'ai-repo-b',
      familyId: 'ai-family-b', language: 'typescript', polarity: 'verified_ai',
      status: 'success_zero', findingsCount: 0,
    },
    {
      version: 'v10.3', runId: 'macro-fixture', fileId: 'ai-b-py', repositoryId: 'ai-repo-b',
      familyId: 'ai-family-b', language: 'python', polarity: 'verified_ai',
      status: 'success_findings', findingsCount: 1,
      ruleEvidence: [{ ruleId: 'ai/comment-ratio', category: 'ai', aiSpecific: true, severity: 'high', count: 1 }],
    },
    {
      version: 'v10.3', runId: 'macro-fixture', fileId: 'human-a-ts', repositoryId: 'human-repo-a',
      familyId: 'human-family-a', language: 'typescript', polarity: 'verified_human',
      status: 'success_findings', findingsCount: 1,
      ruleEvidence: [{ ruleId: 'ai/comment-ratio', category: 'ai', aiSpecific: true, severity: 'medium', count: 1 }],
    },
    {
      version: 'v10.3', runId: 'macro-fixture', fileId: 'human-b-ts', repositoryId: 'human-repo-b',
      familyId: 'human-family-b', language: 'typescript', polarity: 'verified_human',
      status: 'success_zero', findingsCount: 0,
    },
    {
      version: 'v10.3', runId: 'macro-fixture', fileId: 'human-b-py', repositoryId: 'human-repo-b',
      familyId: 'human-family-b', language: 'python', polarity: 'verified_human',
      status: 'success_zero', findingsCount: 0,
    },
  ];

  const macroEligibleFileIdsByPolarity = {
    verified_ai: ['ai-a-ts', 'ai-b-ts', 'ai-b-py'],
    verified_human: ['human-a-ts', 'human-b-ts', 'human-b-py'],
  } as const;

  it('computes equal-weight family and language macro rates plus F1 without pooled-arm bias', () => {
    const result = computeV103MacroMetrics({
      observations: macroObservations,
      ruleCatalog,
      eligibleFileIdsByPolarity: macroEligibleFileIdsByPolarity,
    });
    expect(result.status).toBe('available');
    if (result.status !== 'available') return;

    expect(result.repositoryCluster).toMatchObject({
      kind: 'repository-cluster',
      groupKeys: ['ai-family-a', 'ai-family-b', 'human-family-a', 'human-family-b'],
      positiveGroupCount: 2,
      negativeGroupCount: 2,
    });
    const familyRule = result.repositoryCluster.rules.find((rule) => rule.ruleId === 'ai/comment-ratio');
    expect(familyRule).toMatchObject({
      status: 'measured', tp: 2, fp: 1, p: 3, n: 3,
      positiveGroups: 2, negativeGroups: 2,
      recall: 0.75, fpr: 0.5, balancedPpv: 0.6,
      f1: 2 * 0.6 * 0.75 / (0.6 + 0.75),
    });

    expect(result.language).toMatchObject({
      kind: 'language', groupKeys: ['python', 'typescript'], positiveGroupCount: 2, negativeGroupCount: 2,
    });
    const languageRule = result.language.rules.find((rule) => rule.ruleId === 'ai/comment-ratio');
    expect(languageRule!.recall).toBeCloseTo(0.75, 12);
    expect(languageRule!.fpr).toBeCloseTo(0.25, 12);
    expect(languageRule!.balancedPpv).toBeCloseTo(0.75, 12);
    expect(languageRule!.f1).toBeCloseTo(0.75, 12);
  });

  it('keeps macro output deterministic and preserves zero-fire/ineligible states', () => {
    const input = { observations: macroObservations, ruleCatalog, eligibleFileIdsByPolarity: macroEligibleFileIdsByPolarity };
    const first = computeV103MacroMetrics(input);
    const second = computeV103MacroMetrics(input);
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toContain('/Users/');
    if (first.status !== 'available') return;
    expect(first.repositoryCluster.rules.find((rule) => rule.ruleId === 'ai/zero-fire')).toMatchObject({ status: 'zero-fire', f1: 0 });
    expect(first.language.rules.find((rule) => rule.ruleId === 'security/sql-construction')).toEqual({
      ruleId: 'security/sql-construction', aiSpecific: false, status: 'ineligible',
    });
  });

  it('computes deterministic seeded family-bootstrap percentile intervals for LR+, PPV, and F1', () => {
    const input = { observations: macroObservations, ruleCatalog, eligibleFileIdsByPolarity: macroEligibleFileIdsByPolarity };
    const options = { seed: 42, replicates: 128, confidenceLevel: 0.95 } as const;
    const first = computeV103RepositoryClusterBootstrap(input, options);
    const second = computeV103RepositoryClusterBootstrap(input, options);
    expect(first).toEqual(second);
    expect(first.status).toBe('available');
    if (first.status !== 'available') return;
    expect(first).toMatchObject({
      method: 'cluster-bootstrap-percentile-v1', unit: 'familyId', seed: 42, replicates: 128, confidenceLevel: 0.95,
    });
    const rule = first.rules.find((candidate) => candidate.ruleId === 'ai/comment-ratio');
    expect(rule).toMatchObject({ status: 'measured' });
    expect(rule!.lrPlus).toMatchObject({ lower: expect.any(Number), upper: expect.any(Number) });
    expect(rule!.balancedPpv).toMatchObject({ lower: expect.any(Number), upper: expect.any(Number) });
    expect(rule!.f1).toMatchObject({ lower: expect.any(Number), upper: expect.any(Number) });
    for (const interval of [rule!.lrPlus!, rule!.balancedPpv!, rule!.f1!]) {
      expect(interval.lower).toBeLessThanOrEqual(interval.upper);
      expect(interval.lower).toBeGreaterThanOrEqual(0);
      if (interval !== rule!.lrPlus) expect(interval.upper).toBeLessThanOrEqual(1);
    }
    const zero = first.rules.find((candidate) => candidate.ruleId === 'ai/zero-fire');
    expect(zero).toMatchObject({ status: 'zero-fire', f1: { lower: 0, upper: 0 } });
    expect(first.rules.find((candidate) => candidate.ruleId === 'security/sql-construction')).toEqual({
      ruleId: 'security/sql-construction', aiSpecific: false, status: 'ineligible',
    });
  });

  it('fails closed for invalid bootstrap options and unavailable cohorts', () => {
    const input = { observations: macroObservations, ruleCatalog, eligibleFileIdsByPolarity: macroEligibleFileIdsByPolarity };
    expect(() => computeV103RepositoryClusterBootstrap(input, { seed: -1, replicates: 32 })).toThrow();
    expect(() => computeV103RepositoryClusterBootstrap(input, { seed: 1, replicates: 1 })).toThrow();
    expect(() => computeV103RepositoryClusterBootstrap(input, { seed: 1, replicates: 10_001 })).toThrow();
    expect(computeV103RepositoryClusterBootstrap({
      ...input,
      eligibleFileIdsByPolarity: { verified_ai: [], verified_human: [] },
    }, { seed: 1, replicates: 32 })).toEqual({ status: 'unavailable', reason: 'eligible-cohort-unavailable' });
  });
});
