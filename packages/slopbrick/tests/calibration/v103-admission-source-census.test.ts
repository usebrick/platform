import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/calibration/v103/admission-evidence-context', () => ({
  isVerifiedAdmissionEvidenceContext: (value: unknown): boolean => typeof value === 'object' && value !== null && (value as { readonly __verified?: unknown }).__verified === true,
}));

import {
  admissionRecordJsonl,
  admissionRecordStreamContentSha256,
  admissionRecordStreamSha256,
  calibrationAdmissionSha256,
  calibrationAdmissionInitialSourceIdsSha256,
  calibrationAdmissionMaterializationId,
  calibrationAdmissionSourceRegisterEntrySha256,
  calibrationAdmissionSourceRegisterSha256,
  type CalibrationAdmissionSourceRegisterV1,
  type CalibrationSourceReviewV103,
} from '@usebrick/core';
import { buildAdmissionSourceCensus } from '../../src/calibration/v103/admission-source-census';

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');

function fixture(): { readonly register: CalibrationAdmissionSourceRegisterV1; readonly reviews: readonly CalibrationSourceReviewV103[] } {
  const materials = [
    {
      sourceId: 'legacy-ai-slop-baseline',
      kind: 'material_source' as const,
      materialPartition: 'baseline' as const,
      contributesToAdditiveCounts: true,
      childMaterialSourceIds: [],
      registerEvidenceIds: ['evidence-legacy-ai-slop-baseline'],
      inventoryCandidateUnits: 58089,
    },
    ...Array.from({ length: 317 }, (_, index) => ({
      sourceId: `legacy-repo-${String(index).padStart(3, '0')}`,
      kind: 'material_source' as const,
      materialPartition: 'repository' as const,
      contributesToAdditiveCounts: true,
      childMaterialSourceIds: [],
      registerEvidenceIds: [`evidence-legacy-repo-${String(index).padStart(3, '0')}`],
      inventoryCandidateUnits: 1243 + (index < 262 ? 1 : 0),
    })),
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
    childMaterialSourceIds: materials.filter((entry) => entry.inventoryCandidateUnits > 0).map((entry) => entry.sourceId).sort(),
    registerEvidenceIds: ['evidence-legacy-v5-inventory'],
    inventoryCandidateUnits: 452382,
  };
  const entries = [...materials, aggregate].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const withoutHash = {
    version: 'v10.3-admission-source-register-v1' as const,
    generation: 0,
    initialSourceIdsSha256: calibrationAdmissionInitialSourceIdsSha256(entries.map((entry) => entry.sourceId)),
    appliedDeltaIds: [],
    rawDiscoveryPopulation: { declaredAi: 635830 as const, declaredHuman: 842520 as const, closedWorld: false as const },
    selectedCoverage: { total: 452382 as const, baselineMaterialUnits: 58089 as const, repositoryMaterialUnits: 394293 as const },
    entries,
  };
  const register = { ...withoutHash, registerSha256: calibrationAdmissionSourceRegisterSha256(withoutHash) };
  const reviews = register.entries.map((entry) => ({
    version: 'v10.3-source-review-v1' as const,
    sourceId: entry.sourceId,
    sourceKind: entry.kind,
    contributesToAdditiveCounts: entry.contributesToAdditiveCounts,
    sourceRegisterEntrySha256: calibrationAdmissionSourceRegisterEntrySha256(entry),
    originEvidenceId: entry.registerEvidenceIds[0]!,
    origin: { kind: 'local_unpublished' as const, localSourceId: entry.sourceId },
    materialization: entry.kind === 'aggregate_inventory'
      ? { kind: 'aggregate_only' as const, childMaterialSourceIds: entry.childMaterialSourceIds }
      : (() => {
        const materializationWithoutId = { kind: 'git' as const, repositoryId: entry.sourceId, commitSha: sha(entry.sourceId).slice(0, 40) };
        return { ...materializationWithoutId, materializationId: calibrationAdmissionMaterializationId(entry.sourceId, entry.sourceId, materializationWithoutId) };
      })(),
    sourceRights: { status: 'absent' as const, scope: entry.kind === 'aggregate_inventory' ? 'dataset' as const : 'code' as const, analysisUse: 'unresolved' as const, redistribution: 'unresolved' as const, thirdPartyChain: 'incomplete' as const, evidenceIds: [entry.registerEvidenceIds[0]!] },
    inventory: { physicalMemberCount: entry.inventoryCandidateUnits, candidateCodeUnitCount: entry.inventoryCandidateUnits, inventorySha256: sha(`inventory-${entry.sourceId}`), closedWorld: false },
    reviewerDecisionIds: [],
    reviewedAt: '2026-07-13T00:00:00.000Z',
    decision: 'source_quarantine' as const,
    reasons: ['review_incomplete', 'source_wide_quarantine'] as const,
  }));
  return { register, reviews };
}

describe('v10.3 source:census diagnostic', () => {
  it('reports all 329 sources and preserves the exact zero-eligible quarantine boundary', () => {
    const { register, reviews } = fixture();
    const result = buildAdmissionSourceCensus({ context: { __verified: true, evidenceContextSha256: sha('context') }, sourceRegister: register, sourceReviews: reviews });
    expect(result.ready).toBe(false);
    expect(result.authorityEligible).toBe(false);
    expect(result.witnessAuthority).toBe('unavailable');
    expect(result.registeredSourceCount).toBe(329);
    expect(result.reviewedSourceCount).toBe(329);
    expect(result.sources).toHaveLength(329);
    expect(result.counts).toMatchObject({ selectedCoverage: 452382, additiveRegisteredUnits: 452382, quarantineUnits: 452382, eligibleUnits: 0 });
    expect(result.sources.filter((source) => source.kind === 'material_source').reduce((sum, source) => sum + source.additiveUnits, 0)).toBe(result.counts.additiveRegisteredUnits);
    expect(result.sources.filter((source) => source.kind === 'aggregate_inventory').every((source) => source.additiveUnits === 0)).toBe(true);
    expect(result.sources.filter((source) => source.kind === 'material_source').reduce((sum, source) => sum + source.representedUnits, 0)).toBe(0);
    expect(result.sources.filter((source) => source.kind === 'material_source').reduce((sum, source) => sum + source.unrepresentedUnits, 0)).toBe(452382);
    expect(result.blockers).toEqual(expect.arrayContaining(['static_authority_unavailable', 'witness_authority_unavailable']));
  });

  it('rejects an unverified context and never emits source authority from a malformed set', () => {
    const { register, reviews } = fixture();
    const result = buildAdmissionSourceCensus({ context: {}, sourceRegister: register, sourceReviews: reviews.slice(0, -1) });
    expect(result.ready).toBe(false);
    expect(result.authorityEligible).toBe(false);
    expect(result.sources).toHaveLength(0);
    expect(result.counts.selectedCoverage).toBe(0);
    expect(result.blockers).toEqual(['verified_evidence_context_required']);
    expect(result.counts.eligibleUnits).toBe(0);
  });

  it('keeps a candidate review as quarantine and labels it as a candidate claim', () => {
    const { register, reviews } = fixture();
    const candidate = reviews.map((review) => review.sourceId === 'legacy-repo-000'
      ? { ...review, origin: { kind: 'https' as const, url: 'https://example.test/repo.git' }, decision: 'candidate' as const, reviewerDecisionIds: [sha('a'), sha('b')].sort() }
      : review);
    const result = buildAdmissionSourceCensus({ context: { __verified: true }, sourceRegister: register, sourceReviews: candidate });
    const row = result.sources.find((source) => source.sourceId === 'legacy-repo-000');
    expect(result.candidateSourceCount).toBe(1);
    expect(result.counts.candidateUnits).toBe(1244);
    expect(result.counts.eligibleUnits).toBe(0);
    expect(row?.decision).toBe('candidate');
    expect(row?.eligibleUnits).toBe(0);
    expect(row?.reasons).toContain('candidate_not_yet_eligible');
    expect(result.blockers).toContain('structured_blind_review_authority_unavailable');
  });

  it('consumes an explicitly supplied structured stream while retaining zero eligibility', () => {
    const { register, reviews } = fixture();
    const bytes = admissionRecordJsonl([]);
    const streamWithoutHash = {
      version: 'v10.3-admission-record-stream-v1' as const,
      relativePath: 'review/admission/admission-records.jsonl' as const,
      recordsJsonlSha256: admissionRecordStreamContentSha256(bytes),
      recordCount: 0,
      recordIdSetSha256: calibrationAdmissionSha256([]),
      canonicalRecordHashesSha256: calibrationAdmissionSha256([]),
    };
    const recordStream = { ...streamWithoutHash, streamSha256: admissionRecordStreamSha256(streamWithoutHash) };
    const result = buildAdmissionSourceCensus({
      context: { __verified: true, evidenceContextSha256: sha('context') },
      sourceRegister: register,
      sourceReviews: reviews,
      admissionRecordStream: recordStream,
      admissionRecords: [],
      reviewSamples: [],
      decisions: [],
      blindAssignments: [],
      blindReviewReceipts: [],
      decisionLedgers: [],
    });
    expect(result.structured).toMatchObject({ present: true, valid: true, recordCount: 0 });
    expect(result.sources).toHaveLength(329);
    expect(result.counts.eligibleUnits).toBe(0);
    expect(result.blockers).not.toContain('admission_record_authority_not_implemented_in_this_slice');
  });

  it('returns a non-authority diagnostic for null or array runtime inputs', () => {
    expect(buildAdmissionSourceCensus(null as unknown as never).blockers).toEqual(['admission_source_census_input_invalid']);
    expect(buildAdmissionSourceCensus([] as unknown as never).blockers).toEqual(['admission_source_census_input_invalid']);
  });
});
