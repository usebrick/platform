import { describe, expect, it } from 'vitest';
import {
  ADMISSION_OVERLAP_RESOURCE_LIMITS,
  calibrationAdmissionOverlapCheckpointSha256,
  calibrationAdmissionOverlapIndexReceiptSha256,
  calibrationAdmissionOverlapResourceReceiptId,
  calibrationAdmissionOverlapEdgeRowSha256,
  calibrationAdmissionOverlapLedgerSha256,
  validateCalibrationAdmissionBoundedShardReceiptV1,
  validateCalibrationAdmissionOverlapCheckpointV1,
  validateCalibrationAdmissionOverlapIndexReceiptV1,
  validateCalibrationAdmissionOverlapResourceReceiptV1,
  validateCalibrationAdmissionOverlapEdgeRowV1,
  validateCalibrationAdmissionOverlapAdjacencyRowV1,
  validateCalibrationAdmissionOverlapClusterSummaryRowV1,
  validateCalibrationAdmissionOverlapClusterMembershipRowV1,
  validateCalibrationAdmissionOverlapLedgerV1,
} from '../src/index';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

function shard(relativePath: string) {
  return { shardId: 'shard-1', pathBase: 'generation_local', relativePath, firstKey: 'a', lastKey: 'z', rowCount: 1, bytes: 10, sha256: A };
}

function checkpoint() {
  const value = {
    version: 'v10.3-admission-overlap-checkpoint-v1', checkpointId: 'checkpoint-1', universeSha256: A,
    normalizerRegistrySha256: A, overlapPolicySha256: A, invocationIntentId: A, phase: 'postings',
    inputShardSha256s: [A], outputShardSha256s: [B], continuationCursorSha256: A,
  } as const;
  return { ...value, checkpointSha256: calibrationAdmissionOverlapCheckpointSha256(value) };
}

function indexReceipt() {
  const value = {
    version: 'v10.3-overlap-index-receipt-v1', universeSha256: A, normalizerRegistrySha256: A,
    overlapPolicySha256: A, method: 'prefix-filter-exact-jaccard-0.80-v1', postingShards: [shard('postings/0001.jsonl')],
    candidatePairShards: [shard('pairs/0001.jsonl')], checkpoints: [checkpoint()], coveredCandidateUnits: 1,
    complete: true, toolReceiptSha256: A,
  } as const;
  return { ...value, receiptSha256: calibrationAdmissionOverlapIndexReceiptSha256(value) };
}

function resourceReceipt() {
  const value = {
    version: 'v10.3-overlap-resource-receipt-v1', receiptId: A, universeSha256: A, recordsJsonlSha256: A,
    overlapPolicySha256: A, realContentDistributionSha256: A, recordCount: 1, tokenCount: 5, shingleCount: 1,
    configuredLimits: { ...ADMISSION_OVERLAP_RESOURCE_LIMITS },
    observed: { maxUnitBytes: 1, maxHeapBytes: 1, maxRssBytes: 1, maxWorkBytes: 1, maxOpenFiles: 1, maxShardBytes: 1, wallMilliseconds: 1 },
    coverageComplete: true, withinAllLimits: true, toolReceiptSha256: A,
  } as const;
  return { ...value, receiptId: calibrationAdmissionOverlapResourceReceiptId({ ...value, receiptId: undefined }) };
}

function edge() {
  return { leftCandidateUnitId: 'candidate-a', rightCandidateUnitId: 'candidate-b', leftPolarityBindingSha256: A,
    rightPolarityBindingSha256: B, leftOverlapSide: 'ai_side', rightOverlapSide: 'human_side', kind: 'near', intersection: 4, union: 5,
    crossSide: true } as const;
}

function ledger() {
  const value = {
    version: 'v10.3-admission-overlap-v1', universeSha256: A, method: 'prefix-filter-exact-jaccard-0.80-v1',
    normalizerRegistrySha256: A, overlapPolicySha256: A, indexReceiptSha256: A, coverageComplete: true,
    unresolvedCandidateUnitIds: [], edgeShards: [shard('edges/0001.jsonl')], adjacencyShards: [shard('adjacency/0001.jsonl')],
    clusterSummaryShards: [shard('clusters/summary/0001.jsonl')], clusterMembershipShards: [shard('clusters/members/0001.jsonl')],
    edgeCount: 1, adjacencyRowCount: 2, exactClusterCount: 0, nearClusterCount: 1, crossSideEdgeCount: 1,
  } as const;
  return { ...value, ledgerSha256: calibrationAdmissionOverlapLedgerSha256(value) };
}

describe('Task 2A overlap artifact semantic contracts', () => {
  it('accepts a fully joined bounded artifact set', () => {
    const checkpointValue = checkpoint();
    const indexValue = indexReceipt();
    const edgeValue = edge();
    expect(validateCalibrationAdmissionBoundedShardReceiptV1(shard('edges/0001.jsonl')).ok).toBe(true);
    expect(validateCalibrationAdmissionOverlapCheckpointV1(checkpointValue).ok).toBe(true);
    expect(validateCalibrationAdmissionOverlapIndexReceiptV1(indexValue).ok).toBe(true);
    expect(validateCalibrationAdmissionOverlapResourceReceiptV1(resourceReceipt()).ok).toBe(true);
    expect(validateCalibrationAdmissionOverlapEdgeRowV1(edgeValue).ok).toBe(true);
    expect(validateCalibrationAdmissionOverlapAdjacencyRowV1({ candidateUnitId: 'candidate-a', neighborCandidateUnitId: 'candidate-b', edgeRowSha256: calibrationAdmissionOverlapEdgeRowSha256(edgeValue), kind: 'near' }).ok).toBe(true);
    expect(validateCalibrationAdmissionOverlapClusterSummaryRowV1({ clusterId: 'cluster-1', kind: 'near', canonicalCandidateUnitId: 'candidate-a', memberCount: 2, overlapSideSet: ['ai_side', 'human_side'], membershipRowsSha256: A }).ok).toBe(true);
    expect(validateCalibrationAdmissionOverlapClusterMembershipRowV1({ kind: 'near', clusterId: 'cluster-1', candidateUnitId: 'candidate-a', overlapSide: 'ai_side' }).ok).toBe(true);
    expect(validateCalibrationAdmissionOverlapLedgerV1(ledger()).ok).toBe(true);
  });

  it('rejects path, hash, and ordering mutations instead of accepting structural JSON', () => {
    expect(validateCalibrationAdmissionBoundedShardReceiptV1({ ...shard('../escape') }).ok).toBe(false);
    expect(validateCalibrationAdmissionOverlapCheckpointV1({ ...checkpoint(), checkpointSha256: B }).ok).toBe(false);
    expect(validateCalibrationAdmissionOverlapIndexReceiptV1({ ...indexReceipt(), receiptSha256: B }).ok).toBe(false);
    expect(validateCalibrationAdmissionOverlapLedgerV1({ ...ledger(), ledgerSha256: B }).ok).toBe(false);
  });

  it('rejects resource overages and inconsistent edge/cluster relationships', () => {
    const over = resourceReceipt();
    const observed = { ...over.observed, maxHeapBytes: ADMISSION_OVERLAP_RESOURCE_LIMITS.maxHeapBytes + 1 };
    expect(validateCalibrationAdmissionOverlapResourceReceiptV1({ ...over, observed }).ok).toBe(false);
    expect(validateCalibrationAdmissionOverlapEdgeRowV1({ ...edge(), crossSide: false }).ok).toBe(false);
    expect(validateCalibrationAdmissionOverlapEdgeRowV1({ ...edge(), leftCandidateUnitId: 'candidate-b', rightCandidateUnitId: 'candidate-a' }).ok).toBe(false);
    expect(validateCalibrationAdmissionOverlapAdjacencyRowV1({ candidateUnitId: 'candidate-a', neighborCandidateUnitId: 'candidate-a', edgeRowSha256: A, kind: 'exact' }).ok).toBe(false);
    expect(validateCalibrationAdmissionOverlapClusterSummaryRowV1({ clusterId: 'cluster-1', kind: 'near', canonicalCandidateUnitId: 'candidate-a', memberCount: 0, overlapSideSet: ['human_side', 'ai_side'], membershipRowsSha256: A }).ok).toBe(false);
  });
});
