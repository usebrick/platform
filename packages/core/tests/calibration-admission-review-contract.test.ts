import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

import {
  calibrationAdmissionInitialSourceIdsSha256,
  calibrationAdmissionMaterializationId,
  calibrationAdmissionSourceRegisterEntrySha256,
  calibrationAdmissionSourceRegisterSha256,
  isCalibrationAdmissionSourceRegisterV1,
  isCalibrationSourceReviewV103,
  validateCalibrationAdmissionSourceRegisterReviewSet,
  type CalibrationAdmissionSourceRegisterV1,
  type CalibrationSourceReviewV103,
} from '../src/index';

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');

function makeRegister(): CalibrationAdmissionSourceRegisterV1 {
  const repositoryEntries = Array.from({ length: 317 }, (_, index) => ({
      sourceId: `legacy-repo-${String(index).padStart(3, '0')}`,
      kind: 'material_source' as const,
    materialPartition: 'repository' as const,
    contributesToAdditiveCounts: true,
    childMaterialSourceIds: [],
    registerEvidenceIds: [`evidence-legacy-repo-${String(index).padStart(3, '0')}`],
    inventoryCandidateUnits: 1243 + (index < 262 ? 1 : 0),
  }));
  const materialEntries = [
    {
      sourceId: 'legacy-ai-slop-baseline',
      kind: 'material_source' as const,
      materialPartition: 'baseline' as const,
      contributesToAdditiveCounts: true,
      childMaterialSourceIds: [],
      registerEvidenceIds: ['evidence-legacy-ai-slop-baseline'],
      inventoryCandidateUnits: 58089,
    },
    ...repositoryEntries,
    ...Array.from({ length: 10 }, (_, index) => ({
      sourceId: `benchmark-${String(index).padStart(2, '0')}`,
      kind: 'material_source' as const,
      materialPartition: 'non_selected' as const,
      contributesToAdditiveCounts: true,
      childMaterialSourceIds: [],
      registerEvidenceIds: [`evidence-benchmark-${String(index).padStart(2, '0')}`],
      inventoryCandidateUnits: 0,
    })),
  ].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const aggregate = {
    sourceId: 'legacy-v5-inventory',
    kind: 'aggregate_inventory' as const,
    materialPartition: 'aggregate' as const,
    contributesToAdditiveCounts: false,
    childMaterialSourceIds: materialEntries
      .filter((entry) => entry.inventoryCandidateUnits > 0)
      .map((entry) => entry.sourceId)
      .sort(),
    registerEvidenceIds: ['evidence-legacy-v5-inventory'],
    inventoryCandidateUnits: 452382,
  };
  const entries = [...materialEntries, aggregate].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const withoutHash = {
    version: 'v10.3-admission-source-register-v1' as const,
    generation: 0,
    initialSourceIdsSha256: calibrationAdmissionInitialSourceIdsSha256(entries.map((entry) => entry.sourceId)),
    appliedDeltaIds: [],
    rawDiscoveryPopulation: { declaredAi: 635830 as const, declaredHuman: 842520 as const, closedWorld: false as const },
    selectedCoverage: { total: 452382 as const, baselineMaterialUnits: 58089 as const, repositoryMaterialUnits: 394293 as const },
    entries,
  };
  return { ...withoutHash, registerSha256: calibrationAdmissionSourceRegisterSha256(withoutHash) };
}

function makeReview(entry: CalibrationAdmissionSourceRegisterV1['entries'][number]): CalibrationSourceReviewV103 {
  const aggregate = entry.kind === 'aggregate_inventory';
  const gitMaterializationWithoutId = {
    kind: 'git' as const,
    repositoryId: entry.sourceId,
    commitSha: sha('c').slice(0, 40),
  };
  const withoutHash: CalibrationSourceReviewV103 = {
    version: 'v10.3-source-review-v1',
    sourceId: entry.sourceId,
    sourceKind: entry.kind,
    contributesToAdditiveCounts: entry.contributesToAdditiveCounts,
    sourceRegisterEntrySha256: calibrationAdmissionSourceRegisterEntrySha256(entry),
    originEvidenceId: entry.registerEvidenceIds[0]!,
    origin: { kind: 'local_unpublished', localSourceId: entry.sourceId },
    materialization: aggregate
      ? { kind: 'aggregate_only', childMaterialSourceIds: entry.childMaterialSourceIds }
      : { ...gitMaterializationWithoutId, materializationId: calibrationAdmissionMaterializationId(entry.sourceId, entry.sourceId, gitMaterializationWithoutId) },
    sourceRights: {
      status: 'absent',
      scope: aggregate ? 'dataset' : 'code',
      analysisUse: 'unresolved',
      redistribution: 'unresolved',
      thirdPartyChain: 'incomplete',
      evidenceIds: [entry.registerEvidenceIds[0]!],
    },
    inventory: {
      physicalMemberCount: entry.inventoryCandidateUnits,
      candidateCodeUnitCount: entry.inventoryCandidateUnits,
      inventorySha256: sha(`inventory-${entry.sourceId}`),
      closedWorld: false,
    },
    reviewerDecisionIds: [],
    reviewedAt: '2026-07-13T00:00:00.000Z',
    decision: 'source_quarantine',
    reasons: ['review_incomplete', 'source_wide_quarantine'],
  };
  return withoutHash;
}

function makeReviews(register: CalibrationAdmissionSourceRegisterV1): CalibrationSourceReviewV103[] {
  return register.entries.map(makeReview);
}

describe('v10.3 source register/review contracts', () => {
  it('accepts the exact 329-entry aggregate/material fixture and conserves counts', () => {
    const register = makeRegister();
    const reviews = makeReviews(register);
    expect(register.entries).toHaveLength(329);
    expect(isCalibrationAdmissionSourceRegisterV1(register)).toBe(true);
    expect(reviews.every(isCalibrationSourceReviewV103)).toBe(true);
    const result = validateCalibrationAdmissionSourceRegisterReviewSet(register, reviews);
    expect(result).toMatchObject({
      ok: true,
      registeredSourceCount: 329,
      reviewedSourceCount: 329,
      candidateSourceCount: 0,
      candidateClaimedUnits: 0,
      additiveMaterialUnits: 452382,
      quarantineUnits: 452382,
    });
    expect(register.selectedCoverage.total).toBe(register.selectedCoverage.baselineMaterialUnits + register.selectedCoverage.repositoryMaterialUnits);
  });

  it('rejects register self-hash, initial ID-set, count, and aggregate ownership mutations', () => {
    const register = makeRegister();
    expect(isCalibrationAdmissionSourceRegisterV1({ ...register, registerSha256: sha('x') })).toBe(false);
    expect(isCalibrationAdmissionSourceRegisterV1({ ...register, initialSourceIdsSha256: sha('x') })).toBe(false);
    const alteredEntries = register.entries.map((entry) => entry.sourceId === 'legacy-repo-000' ? { ...entry, inventoryCandidateUnits: entry.inventoryCandidateUnits + 1 } : entry);
    const altered = { ...register, entries: alteredEntries, registerSha256: calibrationAdmissionSourceRegisterSha256({ ...register, entries: alteredEntries }) };
    expect(isCalibrationAdmissionSourceRegisterV1(altered)).toBe(false);
    const brokenAggregateEntries = register.entries.map((entry) => entry.sourceId === 'legacy-v5-inventory' ? { ...entry, childMaterialSourceIds: entry.childMaterialSourceIds.slice(1) } : entry);
    const brokenAggregate = { ...register, entries: brokenAggregateEntries, registerSha256: calibrationAdmissionSourceRegisterSha256({ ...register, entries: brokenAggregateEntries }) };
    expect(isCalibrationAdmissionSourceRegisterV1(brokenAggregate)).toBe(false);
    const wrongBaselinePartitionEntries = register.entries.map((entry) => entry.sourceId === 'legacy-ai-slop-baseline' ? { ...entry, materialPartition: 'repository' as const } : entry);
    const wrongBaselinePartition = { ...register, entries: wrongBaselinePartitionEntries, registerSha256: calibrationAdmissionSourceRegisterSha256({ ...register, entries: wrongBaselinePartitionEntries }) };
    expect(isCalibrationAdmissionSourceRegisterV1(wrongBaselinePartition)).toBe(false);
    const wrongRepositoryPartitionEntries = register.entries.map((entry) => entry.sourceId === 'legacy-repo-000' ? { ...entry, materialPartition: 'baseline' as const } : entry);
    const wrongRepositoryPartition = { ...register, entries: wrongRepositoryPartitionEntries, registerSha256: calibrationAdmissionSourceRegisterSha256({ ...register, entries: wrongRepositoryPartitionEntries }) };
    expect(isCalibrationAdmissionSourceRegisterV1(wrongRepositoryPartition)).toBe(false);
    const nonConsecutiveDuplicateDeltasWithoutHash = {
      ...register,
      generation: 3,
      parentRegisterSha256: sha('parent-register'),
      appliedDeltaIds: ['delta-a', 'delta-b', 'delta-a'],
    };
    const nonConsecutiveDuplicateDeltas = {
      ...nonConsecutiveDuplicateDeltasWithoutHash,
      registerSha256: calibrationAdmissionSourceRegisterSha256(nonConsecutiveDuplicateDeltasWithoutHash),
    };
    expect(isCalibrationAdmissionSourceRegisterV1(nonConsecutiveDuplicateDeltas)).toBe(false);
  });

  it('requires exact review ID equality and binds each review to its immutable entry', () => {
    const register = makeRegister();
    const reviews = makeReviews(register);
    expect(validateCalibrationAdmissionSourceRegisterReviewSet(register, reviews.slice(1)).ok).toBe(false);
    expect(validateCalibrationAdmissionSourceRegisterReviewSet(register, null as unknown as readonly unknown[]).ok).toBe(false);
    expect(validateCalibrationAdmissionSourceRegisterReviewSet(register, [...reviews, reviews[0]!]).errors.join('\n')).toContain('duplicate source review IDs');
    const extra = { ...reviews[0]!, sourceId: 'unauthorized-extra' };
    expect(validateCalibrationAdmissionSourceRegisterReviewSet(register, [...reviews.slice(0, -1), extra]).errors.join('\n')).toContain('ID set mismatch');
    const wrongHash = reviews.map((review) => review.sourceId === 'legacy-repo-000' ? { ...review, sourceRegisterEntrySha256: sha('wrong') } : review);
    expect(validateCalibrationAdmissionSourceRegisterReviewSet(register, wrongHash).errors.join('\n')).toContain('not bound to the exact register entry');
    const wrongOrigin = reviews.map((review) => review.sourceId === 'legacy-repo-000' ? { ...review, originEvidenceId: 'unbound-origin-evidence' } : review);
    expect(validateCalibrationAdmissionSourceRegisterReviewSet(register, wrongOrigin).errors.join('\n')).toContain('origin evidence is not bound to its register entry');
  });

  it('counts a candidate review separately from final eligibility', () => {
    const register = makeRegister();
    const reviews = makeReviews(register);
    const candidate = reviews.map((review) => review.sourceId === 'legacy-repo-000'
      ? { ...review, decision: 'candidate' as const, origin: { kind: 'https' as const, url: 'https://example.test/repo.git' }, reviewerDecisionIds: [sha('a'), sha('b')].sort() }
      : review);
    const result = validateCalibrationAdmissionSourceRegisterReviewSet(register, candidate);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.candidateSourceCount).toBe(1);
    expect(result.candidateClaimedUnits).toBe(1244);
    const reviewed = candidate.find((review) => review.sourceId === 'legacy-repo-000')!;
    expect(isCalibrationSourceReviewV103({ ...reviewed, reviewedAt: '2026-07-13' })).toBe(false);
    expect(isCalibrationSourceReviewV103({ ...reviewed, reviewedAt: '2026-02-31T00:00:00.000Z' })).toBe(false);
    expect(isCalibrationSourceReviewV103({ ...reviewed, origin: { kind: 'https' as const, url: 'https://' } })).toBe(false);
    expect(isCalibrationSourceReviewV103({ ...reviewed, reviewerDecisionIds: ['decision-a', 'decision-b'] })).toBe(false);
    if (reviewed.materialization.kind === 'git') {
      expect(isCalibrationSourceReviewV103({
        ...reviewed,
        materialization: { ...reviewed.materialization, materializationId: `sbm_${'0'.repeat(64)}` },
      })).toBe(false);
    }
  });
});
