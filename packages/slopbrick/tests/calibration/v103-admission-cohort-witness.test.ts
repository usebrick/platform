import { describe, expect, it } from 'vitest';
import {
  calibrationAdmissionSha256,
  validateCalibrationAdmissionCensusV103,
  isCalibrationAdmissionCohortWitnessV1,
  validateCalibrationAdmissionCohortWitnessV1,
} from '@usebrick/core';
import {
  searchAdmissionWitness,
  type AdmissionWitnessCandidateV1,
} from '../../src/calibration/v103/admission-cohort-witness';
import { buildAdmissionCensus, buildAdmissionSearchResultBundleFromCandidates } from '../../src/calibration/v103/admission-census';
import { buildVerifiedAdmissionContext } from '../../src/calibration/v103/admission-context';
import { cleanupRuntimeFixtures, runtimeFixture } from './v103-admission-context-fixture';
import { afterEach } from 'vitest';

const H = 'a'.repeat(64);

function id(n: number): string {
  return n.toString(16).padStart(64, '0');
}

function candidates(perPolarity = 100): AdmissionWitnessCandidateV1[] {
  const result: AdmissionWitnessCandidateV1[] = [];
  for (const label of ['verified_ai', 'verified_human'] as const) {
    for (let index = 0; index < perPolarity; index += 1) {
      result.push({
        recordId: id((label === 'verified_ai' ? 1 : 10_000) + index),
        contentClusterId: `cluster-${label}-${index}`,
        label,
        language: index % 2 === 0 ? 'typescript' : 'python',
        materialSourceId: `source-${Math.floor(index / 25)}`,
        repositoryId: `repo-${Math.floor(index / 25)}`,
        familyId: `family-${Math.floor(index / 20)}`,
        split: index % 3 === 0 ? 'train' : index % 3 === 1 ? 'validation' : 'test',
        selectionKey: `${label}|${index.toString().padStart(6, '0')}`,
      });
    }
  }
  return result;
}

describe('v10.3 deterministic witness search', () => {
  afterEach(cleanupRuntimeFixtures);
  it('selects an exact diverse smoke cohort and is byte-deterministic', () => {
    const input = { gate: 'smoke' as const, eligibilitySnapshotSha256: H, verifiedContextSha256: H, candidates: candidates() };
    const first = searchAdmissionWitness(input);
    const second = searchAdmissionWitness(input);
    expect(first.kind).toBe('witness');
    expect(second).toEqual(first);
    if (first.kind !== 'witness') return;
    expect(first.witness.units).toHaveLength(200);
    expect(isCalibrationAdmissionCohortWitnessV1(first.witness)).toBe(true);
    expect(validateCalibrationAdmissionCohortWitnessV1(first.witness)).toEqual({ ok: true, errors: [] });
  });

  it('returns an explicit proven capacity certificate when joint capacity is impossible', () => {
    const impossible = candidates().map((candidate) => ({ ...candidate, materialSourceId: 'source-only', familyId: 'family-only' }));
    const result = searchAdmissionWitness({ gate: 'smoke', eligibilitySnapshotSha256: H, verifiedContextSha256: H, candidates: impossible });
    expect(result.kind).toBe('infeasibility');
    if (result.kind !== 'infeasibility') return;
    expect(result.certificate.proven).toBe(true);
    expect(result.certificate.proofKind).toBe('capacity_cut');
    expect(result.certificate.violatedConstraints).toContain('verified_ai_minimum_sources');
  });

  it('keeps a bounded search-limit result non-proven', () => {
    const result = searchAdmissionWitness({ gate: 'smoke', eligibilitySnapshotSha256: H, verifiedContextSha256: H, candidates: candidates(), maxSearchNodes: 1 });
    expect(result.kind).toBe('infeasibility');
    if (result.kind !== 'infeasibility') return;
    expect(result.certificate.proven).toBe(false);
    expect(result.certificate.proofKind).toBe('indeterminate_search_limit');
  });

  it('rejects a candidate stream that is not already in canonical selection order', () => {
    expect(() => searchAdmissionWitness({ gate: 'smoke', eligibilitySnapshotSha256: H, verifiedContextSha256: H, candidates: [...candidates()].reverse() })).toThrow('strictly sorted');
  });

  it('builds a complete diagnostic census while keeping readiness false without witness review', async () => {
    const fixture = await runtimeFixture();
    const contextResult = await buildVerifiedAdmissionContext(fixture.root, fixture.evidence);
    expect(contextResult.ok).toBe(true);
    if (!contextResult.ok) return;
    const snapshot = calibrationAdmissionSha256({ contextSha256: contextResult.context.contextSha256, candidates: [] });
    const smoke = buildAdmissionSearchResultBundleFromCandidates(contextResult.context, 'smoke', snapshot, [], {});
    const canary = buildAdmissionSearchResultBundleFromCandidates(contextResult.context, 'canary', snapshot, [], {});
    const census = buildAdmissionCensus({
      context: contextResult.context,
      search: {
        smoke: { bundle: smoke, publicationCompletionSha256: '0'.repeat(64), publicationCompletionRelativePath: 'witnesses/smoke/search-results/diagnostic.json' },
        canary: { bundle: canary, publicationCompletionSha256: '0'.repeat(64), publicationCompletionRelativePath: 'witnesses/canary/search-results/diagnostic.json' },
      },
    });
    expect(census.ok, JSON.stringify(census)).toBe(true);
    if (!census.ok) return;
    expect(census.census.smoke.ready).toBe(false);
    expect(census.census.canary.ready).toBe(false);
    expect(validateCalibrationAdmissionCensusV103(census.census)).toEqual({ ok: true, errors: [] });
    const forgedReady = {
      ...census.census,
      smoke: { ...census.census.smoke, ready: true, witnessSha256: H },
    };
    expect(validateCalibrationAdmissionCensusV103(forgedReady).ok).toBe(false);
  });
});
