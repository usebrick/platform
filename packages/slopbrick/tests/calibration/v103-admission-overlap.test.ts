import { describe, expect, it } from 'vitest';

import {
  admissionOverlapEdgeSha256,
  buildAdmissionOverlapCandidatePairs,
  buildAdmissionOverlapEdges,
  type AdmissionOverlapUnitV1,
} from '../../src/calibration/v103/admission-exact-similarity';

function unit(overrides: Partial<AdmissionOverlapUnitV1> = {}): AdmissionOverlapUnitV1 {
  return {
    candidateUnitId: 'unit-a',
    language: 'TypeScript',
    contentSha256: 'a'.repeat(64),
    overlapSide: 'ai_side',
    polarityBindingSha256: 'b'.repeat(64),
    shingles: ['s1', 's2', 's3', 's4', 's5'],
    ...overrides,
  };
}

describe('Task 2A exact similarity and lossless prefix fixtures', () => {
  it('finds a boundary pair at inclusive 0.80 using integer prefix filtering', () => {
    const left = unit();
    const right = unit({
      candidateUnitId: 'unit-b',
      contentSha256: 'c'.repeat(64),
      overlapSide: 'human_side',
      polarityBindingSha256: 'd'.repeat(64),
      shingles: ['s1', 's2', 's3', 's4', 's5', 's6'],
    });
    const pairs = buildAdmissionOverlapCandidatePairs([left, right]);
    expect(pairs).toEqual([{ leftCandidateUnitId: 'unit-a', rightCandidateUnitId: 'unit-b', sharedPrefixShingles: 2 }]);
    const edges = buildAdmissionOverlapEdges([right, left]);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ kind: 'near', intersection: 5, union: 6, crossSide: true });
  });

  it('keeps the exact 4/5 size and Jaccard boundary, but rejects incompatible sizes', () => {
    const four = unit({ shingles: ['s1', 's2', 's3', 's4'], contentSha256: '6'.repeat(64) });
    const five = unit({ candidateUnitId: 'unit-b', shingles: ['s1', 's2', 's3', 's4', 's5'], contentSha256: '7'.repeat(64) });
    expect(buildAdmissionOverlapEdges([four, five])).toHaveLength(1);
    const three = unit({ candidateUnitId: 'unit-c', shingles: ['s1', 's2', 's3'], contentSha256: '8'.repeat(64) });
    expect(buildAdmissionOverlapEdges([three, five])).toEqual([]);
  });

  it('emits exact cross-language duplicates even when shingle sets are empty', () => {
    const left = unit({ candidateUnitId: 'unit-a', language: 'TypeScript', contentSha256: 'e'.repeat(64), shingles: [] });
    const right = unit({ candidateUnitId: 'unit-b', language: 'Python', contentSha256: 'e'.repeat(64), shingles: [], overlapSide: 'human_side' });
    const edges = buildAdmissionOverlapEdges([left, right]);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ kind: 'exact', intersection: 0, union: 0, crossSide: true });
  });

  it('does not create near edges across languages or below the threshold', () => {
    const base = unit({ contentSha256: '1'.repeat(64) });
    const differentLanguage = unit({ candidateUnitId: 'unit-b', contentSha256: '2'.repeat(64), language: 'Python' });
    const below = unit({ candidateUnitId: 'unit-c', contentSha256: '3'.repeat(64), shingles: ['s1', 's2', 's9', 's10', 's11'] });
    expect(buildAdmissionOverlapEdges([base, differentLanguage, below])).toEqual([]);
  });

  it('deduplicates shingles and orders pairs/edges independently of input order', () => {
    const left = unit({ shingles: ['s3', 's1', 's2', 's2', 's4', 's5'] });
    const right = unit({ candidateUnitId: 'unit-b', contentSha256: '4'.repeat(64), shingles: ['s1', 's2', 's3', 's4', 's5'] });
    const forward = buildAdmissionOverlapEdges([left, right]);
    const reverse = buildAdmissionOverlapEdges([right, left]);
    expect(reverse).toEqual(forward);
    expect(admissionOverlapEdgeSha256(forward[0]!)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('uses unique shingle cardinality for duplicate-heavy rows and sorts multi-edge output', () => {
    const duplicateHeavy = unit({
      shingles: [...Array(99).fill('s1'), 's2', 's3', 's4', 's5'],
      contentSha256: '9'.repeat(64),
    });
    const second = unit({ candidateUnitId: 'unit-b', contentSha256: 'a'.repeat(64) });
    const third = unit({ candidateUnitId: 'unit-c', contentSha256: 'c'.repeat(64) });
    const edges = buildAdmissionOverlapEdges([third, duplicateHeavy, second]);
    expect(edges.map((entry) => [entry.leftCandidateUnitId, entry.rightCandidateUnitId])).toEqual([
      ['unit-a', 'unit-b'], ['unit-a', 'unit-c'], ['unit-b', 'unit-c'],
    ]);
  });

  it('keeps unassigned edges non-cross-side while preserving both bindings', () => {
    const left = unit({ overlapSide: 'unassigned' });
    const right = unit({ candidateUnitId: 'unit-b', contentSha256: '5'.repeat(64), overlapSide: 'ai_side' });
    const edges = buildAdmissionOverlapEdges([left, right]);
    expect(edges[0]).toMatchObject({ kind: 'near', crossSide: false, leftOverlapSide: 'unassigned', rightOverlapSide: 'ai_side' });
  });

  it('marks only explicit AI-to-human polarity as cross-side', () => {
    const ai = unit({ contentSha256: 'd'.repeat(64), overlapSide: 'ai_side' });
    const human = unit({ candidateUnitId: 'unit-b', contentSha256: 'e'.repeat(64), overlapSide: 'human_side' });
    const unassigned = unit({ candidateUnitId: 'unit-c', contentSha256: 'f'.repeat(64), overlapSide: 'unassigned' });
    const edges = buildAdmissionOverlapEdges([ai, human, unassigned]);
    expect(edges.map((entry) => [entry.leftCandidateUnitId, entry.rightCandidateUnitId, entry.crossSide])).toEqual([
      ['unit-a', 'unit-b', true], ['unit-a', 'unit-c', false], ['unit-b', 'unit-c', false],
    ]);
  });
});
