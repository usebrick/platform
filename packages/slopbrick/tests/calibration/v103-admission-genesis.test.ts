import { describe, expect, it } from 'vitest';
import {
  buildV103GenesisDiagnostic,
  buildV103GenesisFromNormalizedInput,
  type GenesisInventorySummary,
} from '../../src/calibration/v103/admission-genesis';
import {
  calibrationAdmissionSha256,
} from '@usebrick/core';

const ORIGINAL_SOURCE_IDS = [
  'legacy-ai-slop-baseline',
  'legacy-v5-inventory',
  'bigcodebench',
  'lpcode',
  'droidcollection',
  'aigcodeset',
  'whodunit-zenodo',
  'human-eval',
  'evalplus-v0.1.0',
  'humaneval-gpt5-smoke-v1',
  'magic8ball',
  'programs-generated-by-chatgpt',
] as const;

function draftInputs(): { readonly sourceRegister: unknown; readonly repositoryInventory: unknown; readonly summary: GenesisInventorySummary } {
  const repositories = Array.from({ length: 317 }, (_, index) => ({
    repositoryId: `${index < 225 ? 'positive' : 'negative'}-repo-${String(index).padStart(3, '0')}`,
    declaredPolarity: index < 225 ? 'declared_ai' : 'declared_human',
    localPath: `${index < 225 ? 'positive' : 'negative'}/repo-${String(index).padStart(3, '0')}`,
    originUrl: `https://example.test/repo-${String(index).padStart(3, '0')}.git`,
    commitSha: 'a'.repeat(40),
    licenseFile: null,
    reviewStatus: 'pending_origin_commit_license_family_and_label_review',
  }));
  const repositoryInventory = { version: 'v10.3-draft', repositories };
  const sourceRegister = {
    version: 'v10.3-draft',
    sources: ORIGINAL_SOURCE_IDS.map((sourceId) => ({
      sourceId,
      originUrl: sourceId === 'legacy-ai-slop-baseline' || sourceId === 'legacy-v5-inventory' ? `local:${sourceId}` : `https://example.test/${sourceId}.git`,
      commitSha: sourceId === 'legacy-ai-slop-baseline' || sourceId === 'legacy-v5-inventory' ? 'not_available_local_extract' : 'a'.repeat(40),
      localPath: `../sources/${sourceId}`,
      status: 'quarantine_pending_source_review',
    })),
  };
  const aiId = 'positive-repo-000';
  const humanId = 'negative-repo-225';
  const positiveRepositoryCounts: Record<string, number> = { [aiId]: 219094 };
  const negativeRepositoryCounts: Record<string, number> = { [humanId]: 175199 };
  const positiveRepositoryInventorySha256ById: Record<string, string> = { [aiId]: calibrationAdmissionSha256('positive') };
  const negativeRepositoryInventorySha256ById: Record<string, string> = { [humanId]: calibrationAdmissionSha256('negative') };
  const arm = (declaredPolarity: 'declared_ai' | 'declared_human', rows: number, baselineRows: number, repositoryRows: number, repositoryCounts: Record<string, number>, repositoryInventorySha256ById: Record<string, string>): GenesisInventorySummary['positive'] => ({
    declaredPolarity,
    rows,
    bytes: rows,
    inventorySha256: calibrationAdmissionSha256(declaredPolarity),
    baselineRows,
    baselineBytes: baselineRows,
    repositoryRows,
    repositoryBytes: repositoryRows,
    repositoryCounts,
    repositoryBytesById: Object.fromEntries(Object.entries(repositoryCounts).map(([id, count]) => [id, count])),
    repositoryInventorySha256ById,
  });
  return {
    sourceRegister,
    repositoryInventory,
    summary: {
      positive: arm('declared_ai', 224903, 5809, 219094, positiveRepositoryCounts, positiveRepositoryInventorySha256ById),
      negative: arm('declared_human', 227479, 52280, 175199, negativeRepositoryCounts, negativeRepositoryInventorySha256ById),
    },
  };
}

describe('v10.3 Task-4 Step-1 genesis composition', () => {
  it('builds exactly 329 quarantined source reviews and preserves selected coverage', () => {
    const input = draftInputs();
    const result = buildV103GenesisFromNormalizedInput({
      sourceRegister: input.sourceRegister,
      repositoryInventory: input.repositoryInventory,
      inventorySummary: input.summary,
      reviewedAt: '2026-07-14T00:00:00.000Z',
    });
    expect(result.register.entries).toHaveLength(329);
    expect(result.sourceReviews).toHaveLength(329);
    expect(result.validation.ok).toBe(true);
    expect(result.validation.additiveMaterialUnits).toBe(452382);
    expect(result.validation.quarantineUnits).toBe(452382);
    expect(result.validation.candidateSourceCount).toBe(0);
    expect(result.sourceReviews.every((review) => review.decision === 'source_quarantine')).toBe(true);
    expect(result.sourceReviews.every((review) => review.reviewerDecisionIds.length === 0)).toBe(true);
    const aggregate = result.register.entries.find((entry) => entry.sourceId === 'legacy-v5-inventory');
    expect(aggregate?.kind).toBe('aggregate_inventory');
    expect(aggregate?.childMaterialSourceIds).toHaveLength(317);
    expect(result.register.entries.filter((entry) => entry.materialPartition === 'baseline').reduce((sum, entry) => sum + entry.inventoryCandidateUnits, 0)).toBe(58089);
    expect(result.register.entries.filter((entry) => entry.materialPartition === 'repository').reduce((sum, entry) => sum + entry.inventoryCandidateUnits, 0)).toBe(394293);
  });

  it('rejects a non-frozen review timestamp before composing artifacts', () => {
    const input = draftInputs();
    expect(() => buildV103GenesisFromNormalizedInput({
      sourceRegister: input.sourceRegister,
      repositoryInventory: input.repositoryInventory,
      inventorySummary: input.summary,
      reviewedAt: '2026-07-14',
    })).toThrow(/reviewedAt/);
  });

  it('rejects a repository whose declared polarity disagrees with its inventory arm', () => {
    const input = draftInputs();
    const repositories = (input.repositoryInventory as { repositories: readonly Record<string, unknown>[] }).repositories
      .map((repository) => repository.repositoryId === 'positive-repo-000'
        ? { ...repository, declaredPolarity: 'declared_human' }
        : repository);
    expect(() => buildV103GenesisFromNormalizedInput({
      sourceRegister: input.sourceRegister,
      repositoryInventory: { ...(input.repositoryInventory as Record<string, unknown>), repositories },
      inventorySummary: input.summary,
      reviewedAt: '2026-07-14T00:00:00.000Z',
    })).toThrow(/polarity/);
  });

  it('rejects a normalized summary whose repository byte totals are inconsistent', () => {
    const input = draftInputs();
    const positive = input.summary.positive;
    expect(() => buildV103GenesisFromNormalizedInput({
      sourceRegister: input.sourceRegister,
      repositoryInventory: input.repositoryInventory,
      inventorySummary: {
        ...input.summary,
        positive: {
          ...positive,
          repositoryBytesById: { ...positive.repositoryBytesById, 'positive-repo-000': 0 },
        },
      },
      reviewedAt: '2026-07-14T00:00:00.000Z',
    })).toThrow(/repository byte counts/);
  });

  it('reports deterministic overlapping blocker counts without upgrading quarantine', () => {
    const input = draftInputs();
    const result = buildV103GenesisFromNormalizedInput({
      sourceRegister: input.sourceRegister,
      repositoryInventory: input.repositoryInventory,
      inventorySummary: input.summary,
      reviewedAt: '2026-07-14T00:00:00.000Z',
    });

    const diagnostic = buildV103GenesisDiagnostic(result);

    expect(diagnostic).toMatchObject({
      authorityEligible: false,
      persisted: false,
      selectedCoverage: 452382,
      quarantineUnits: 452382,
      candidateSources: 0,
      candidateUnits: 0,
      eligibleUnits: 0,
    });
    expect(diagnostic.blockers).toEqual([
      { reason: 'authorship_unproven', sourceCount: 317, materialUnits: 394293 },
      { reason: 'evidence_unresolved', sourceCount: 327, materialUnits: 394293 },
      { reason: 'family_unknown', sourceCount: 318, materialUnits: 394293 },
      { reason: 'review_incomplete', sourceCount: 329, materialUnits: 452382 },
      { reason: 'source_bytes_unbound', sourceCount: 1, materialUnits: 58089 },
      { reason: 'source_inventory_open', sourceCount: 1, materialUnits: 0 },
      { reason: 'source_wide_quarantine', sourceCount: 329, materialUnits: 452382 },
    ]);
  });
});
