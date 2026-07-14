import {
  isAdmissionOverlapJaccardAtLeast80,
  isAdmissionOverlapSizeCompatible,
  type AdmissionOverlapSideV1,
} from '@usebrick/core';
import { canonicalSha256 } from './canonical';

export interface AdmissionOverlapUnitV1 {
  readonly candidateUnitId: string;
  readonly language: string;
  readonly contentSha256: string;
  readonly overlapSide: AdmissionOverlapSideV1;
  readonly polarityBindingSha256: string;
  readonly shingles: readonly string[];
}

export interface AdmissionOverlapEdgeV1 {
  readonly leftCandidateUnitId: string;
  readonly rightCandidateUnitId: string;
  readonly leftPolarityBindingSha256: string;
  readonly rightPolarityBindingSha256: string;
  readonly leftOverlapSide: AdmissionOverlapSideV1;
  readonly rightOverlapSide: AdmissionOverlapSideV1;
  readonly kind: 'exact' | 'near';
  readonly intersection: number;
  readonly union: number;
  readonly crossSide: boolean;
}

export interface AdmissionOverlapCandidatePairV1 {
  readonly leftCandidateUnitId: string;
  readonly rightCandidateUnitId: string;
  readonly sharedPrefixShingles: number;
}

export interface AdmissionExactSimilarityV1 {
  readonly intersection: number;
  readonly union: number;
  readonly jaccardAtLeast80: boolean;
}

function compareId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(compareId);
}

function exactSimilarity(left: readonly string[], right: readonly string[]): AdmissionExactSimilarityV1 {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;
  for (const value of leftSet) if (rightSet.has(value)) intersection += 1;
  const union = leftSet.size + rightSet.size - intersection;
  return { intersection, union, jaccardAtLeast80: isAdmissionOverlapJaccardAtLeast80(intersection, union) };
}

function ceilFourFifths(value: number): number {
  return Number((4n * BigInt(value) + 4n) / 5n);
}

function prefixLength(shingleCount: number): number {
  return shingleCount === 0 ? 0 : shingleCount - ceilFourFifths(shingleCount) + 1;
}

function tokenOrder(units: readonly AdmissionOverlapUnitV1[]): ReadonlyMap<string, number> {
  const frequency = new Map<string, number>();
  for (const unit of units) {
    for (const shingle of uniqueSorted(unit.shingles)) {
      const key = `${unit.language}\u0000${shingle}`;
      frequency.set(key, (frequency.get(key) ?? 0) + 1);
    }
  }
  const keys = [...frequency.keys()].sort((left, right) => {
    const frequencyOrder = frequency.get(left)! - frequency.get(right)!;
    return frequencyOrder || compareId(left, right);
  });
  return new Map(keys.map((key, index) => [key, index]));
}

function orderedShingles(unit: AdmissionOverlapUnitV1, order: ReadonlyMap<string, number>): readonly string[] {
  return [...uniqueSorted(unit.shingles)].sort((left, right) => {
    const leftOrder = order.get(`${unit.language}\u0000${left}`) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(`${unit.language}\u0000${right}`) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || compareId(left, right);
  });
}

function pairKey(left: string, right: string): string {
  return `${left}\u0000${right}`;
}

/**
 * Lossless prefix-filter candidate generation. Exact SHA-256 duplicates are
 * handled separately by `buildAdmissionOverlapEdges`; this function only
 * proposes same-language near-overlap pairs after integer size filtering.
 */
export function buildAdmissionOverlapCandidatePairs(
  units: readonly AdmissionOverlapUnitV1[],
): readonly AdmissionOverlapCandidatePairV1[] {
  const order = tokenOrder(units);
  const postings = new Map<string, string[]>();
  const byId = new Map(units.map((unit) => [unit.candidateUnitId, unit]));
  const ordered = new Map<string, readonly string[]>();
  for (const unit of units) {
    const shingles = orderedShingles(unit, order);
    ordered.set(unit.candidateUnitId, shingles);
    for (const shingle of shingles.slice(0, prefixLength(shingles.length))) {
      const key = `${unit.language}\u0000${shingle}`;
      const list = postings.get(key) ?? [];
      list.push(unit.candidateUnitId);
      postings.set(key, list);
    }
  }
  const pairShared = new Map<string, number>();
  for (const unit of units) {
    const leftShingles = ordered.get(unit.candidateUnitId)!;
    for (const shingle of leftShingles.slice(0, prefixLength(leftShingles.length))) {
      const posting = postings.get(`${unit.language}\u0000${shingle}`) ?? [];
      for (const otherId of posting) {
        if (otherId === unit.candidateUnitId) continue;
        const leftId = compareId(unit.candidateUnitId, otherId) < 0 ? unit.candidateUnitId : otherId;
        const rightId = leftId === unit.candidateUnitId ? otherId : unit.candidateUnitId;
        const left = byId.get(leftId)!;
        const right = byId.get(rightId)!;
        const leftUniqueShingles = ordered.get(leftId)!;
        const rightUniqueShingles = ordered.get(rightId)!;
        if (!isAdmissionOverlapSizeCompatible(leftUniqueShingles.length, rightUniqueShingles.length)) continue;
        const key = pairKey(leftId, rightId);
        pairShared.set(key, (pairShared.get(key) ?? 0) + 1);
      }
    }
  }
  return [...pairShared.entries()]
    .map(([key, sharedPrefixShingles]) => {
      const parts = key.split('\u0000');
      const leftCandidateUnitId = parts[0]!;
      const rightCandidateUnitId = parts[1]!;
      return { leftCandidateUnitId, rightCandidateUnitId, sharedPrefixShingles };
    })
    .sort((left, right) => compareId(left.leftCandidateUnitId, right.leftCandidateUnitId)
      || compareId(left.rightCandidateUnitId, right.rightCandidateUnitId));
}

function sideCrosses(left: AdmissionOverlapSideV1, right: AdmissionOverlapSideV1): boolean {
  return (left === 'ai_side' && right === 'human_side') || (left === 'human_side' && right === 'ai_side');
}

function edge(left: AdmissionOverlapUnitV1, right: AdmissionOverlapUnitV1, kind: 'exact' | 'near'): AdmissionOverlapEdgeV1 {
  const similarity = exactSimilarity(left.shingles, right.shingles);
  return {
    leftCandidateUnitId: left.candidateUnitId,
    rightCandidateUnitId: right.candidateUnitId,
    leftPolarityBindingSha256: left.polarityBindingSha256,
    rightPolarityBindingSha256: right.polarityBindingSha256,
    leftOverlapSide: left.overlapSide,
    rightOverlapSide: right.overlapSide,
    kind,
    intersection: similarity.intersection,
    union: similarity.union,
    crossSide: sideCrosses(left.overlapSide, right.overlapSide),
  };
}

/** Build exact duplicate and threshold-complete near edges in deterministic order. */
export function buildAdmissionOverlapEdges(
  units: readonly AdmissionOverlapUnitV1[],
): readonly AdmissionOverlapEdgeV1[] {
  const sortedUnits = [...units].sort((left, right) => compareId(left.candidateUnitId, right.candidateUnitId));
  const byContent = new Map<string, AdmissionOverlapUnitV1[]>();
  for (const unit of sortedUnits) {
    const group = byContent.get(unit.contentSha256) ?? [];
    group.push(unit);
    byContent.set(unit.contentSha256, group);
  }
  const edges = new Map<string, AdmissionOverlapEdgeV1>();
  for (const group of byContent.values()) {
    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
        const left = group[leftIndex]!;
        const right = group[rightIndex]!;
        edges.set(pairKey(left.candidateUnitId, right.candidateUnitId), edge(left, right, 'exact'));
      }
    }
  }
  const unitsById = new Map(sortedUnits.map((unit) => [unit.candidateUnitId, unit]));
  for (const pair of buildAdmissionOverlapCandidatePairs(sortedUnits)) {
    const left = unitsById.get(pair.leftCandidateUnitId)!;
    const right = unitsById.get(pair.rightCandidateUnitId)!;
    const similarity = exactSimilarity(left.shingles, right.shingles);
    if (similarity.jaccardAtLeast80 && left.contentSha256 !== right.contentSha256) {
      edges.set(pairKey(left.candidateUnitId, right.candidateUnitId), edge(left, right, 'near'));
    }
  }
  return [...edges.values()].sort((left, right) => compareId(left.leftCandidateUnitId, right.leftCandidateUnitId)
    || compareId(left.rightCandidateUnitId, right.rightCandidateUnitId)
    || compareId(left.kind, right.kind));
}

export function admissionOverlapEdgeSha256(edgeRow: AdmissionOverlapEdgeV1): string {
  return canonicalSha256(edgeRow);
}
