import { isAdmissionOverlapJaccardAtLeast80 } from './calibration-admission-overlap';
import type { AdmissionOverlapContractValidationV1 } from './calibration-admission-overlap';
import { calibrationAdmissionSha256 } from './calibration-admission-evidence';
import type { AdmissionBoundedShardReceiptV1 } from './generated/calibration-admission-bounded-shard-receipt';
import type { AdmissionOverlapCheckpointV1 } from './generated/calibration-admission-overlap-checkpoint';
import type { AdmissionOverlapIndexReceiptV1 } from './generated/calibration-admission-overlap-index-receipt';
import type { AdmissionOverlapResourceReceiptV1 } from './generated/calibration-admission-overlap-resource-receipt';
import type { AdmissionOverlapEdgeRowV1 } from './generated/calibration-admission-overlap-edge-row';
import type { AdmissionOverlapAdjacencyRowV1 } from './generated/calibration-admission-overlap-adjacency-row';
import type { AdmissionOverlapClusterSummaryRowV1 } from './generated/calibration-admission-overlap-cluster-summary-row';
import type { AdmissionOverlapClusterMembershipRowV1 } from './generated/calibration-admission-overlap-cluster-membership-row';
import type { AdmissionOverlapLedgerV1 } from './generated/calibration-admission-overlap-ledger';
import {
  exactKeys,
  isAdmissionId,
  isJsonRecord,
  isSha256,
  sortedUniqueByPredicate,
  withoutJsonKey,
} from './calibration-admission-primitives';

/** Semantic checks for the disk-facing overlap artifacts. No I/O is done here. */

const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const MAX_SHARD_BYTES = 67_108_864;
const MAX_OPEN_FILES = 64;
const MAX_HEAP_BYTES = 4_294_967_296;
const MAX_RSS_BYTES = 6_442_450_944;
const MAX_WORK_BYTES = 214_748_364_800;
const MAX_WALL_MS = 86_400_000;
const MAX_ARRAY_ITEMS = 65_536;
const MAX_UNRESOLVED = 452_382;
const METHOD = 'prefix-filter-exact-jaccard-0.80-v1';
const PRINTABLE = /^[\x20-\x7e]+$/;
const RELATIVE_PATH = /^(?=[\x20-\x7e]+$)(?!\/)(?!.*\\)(?!.*\/\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\/$).+$/;
const SIDE_ORDER = ['ai_side', 'human_side', 'unassigned'] as const;

export const ADMISSION_OVERLAP_RESOURCE_LIMITS = Object.freeze({
  maxUnitBytes: 33_554_432,
  maxHeapBytes: MAX_HEAP_BYTES,
  maxRssBytes: MAX_RSS_BYTES,
  maxWorkBytes: MAX_WORK_BYTES,
  maxOpenFiles: MAX_OPEN_FILES,
  maxShardBytes: MAX_SHARD_BYTES,
  maxWallMilliseconds: MAX_WALL_MS,
});

type Validation = AdmissionOverlapContractValidationV1;
type JsonObject = Record<string, unknown>;
type Side = 'ai_side' | 'human_side' | 'unassigned';

function result(errors: string[]): Validation { return { ok: errors.length === 0, errors }; }
function safeInt(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= MAX_SAFE;
}
function selfHash(value: unknown, key: string): string { return calibrationAdmissionSha256(withoutJsonKey(value, key)); }
function printable(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && PRINTABLE.test(value);
}
function relativePath(value: unknown): value is string {
  return typeof value === 'string' && RELATIVE_PATH.test(value);
}
function sortedShas(value: unknown, maximum = MAX_ARRAY_ITEMS): value is readonly string[] {
  return Array.isArray(value) && value.length <= maximum && sortedUniqueByPredicate(value, isSha256, true);
}
function sortedIds(value: unknown, maximum = MAX_ARRAY_ITEMS): value is readonly string[] {
  return Array.isArray(value) && value.length <= maximum && sortedUniqueByPredicate(value, isAdmissionId, true);
}
function sortedSides(value: unknown): value is readonly Side[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 3
    && value.every((entry): entry is Side => SIDE_ORDER.includes(entry as Side))
    && value.every((entry, index) => index === 0 || SIDE_ORDER.indexOf(entry as Side) > SIDE_ORDER.indexOf(value[index - 1] as Side));
}
function errorsForShape(value: unknown, keys: readonly string[], errors: string[]): value is JsonObject {
  if (!isJsonRecord(value) || !exactKeys(value, keys)) { errors.push('object shape is invalid'); return false; }
  return true;
}

export function calibrationAdmissionOverlapCheckpointSha256(
  value: Omit<AdmissionOverlapCheckpointV1, 'checkpointSha256'> | JsonObject,
): string { return selfHash(value, 'checkpointSha256'); }

export function calibrationAdmissionOverlapIndexReceiptSha256(
  value: Omit<AdmissionOverlapIndexReceiptV1, 'receiptSha256'> | JsonObject,
): string { return selfHash(value, 'receiptSha256'); }

export function calibrationAdmissionOverlapResourceReceiptId(
  value: Omit<AdmissionOverlapResourceReceiptV1, 'receiptId'> | JsonObject,
): string { return selfHash(value, 'receiptId'); }

export function calibrationAdmissionOverlapEdgeRowSha256(value: AdmissionOverlapEdgeRowV1 | JsonObject): string {
  return calibrationAdmissionSha256(value);
}

export function calibrationAdmissionOverlapLedgerSha256(
  value: Omit<AdmissionOverlapLedgerV1, 'ledgerSha256'> | JsonObject,
): string { return selfHash(value, 'ledgerSha256'); }

function shardShape(value: unknown, errors: string[]): value is AdmissionBoundedShardReceiptV1 {
  if (!errorsForShape(value, ['shardId', 'pathBase', 'relativePath', 'firstKey', 'lastKey', 'rowCount', 'bytes', 'sha256'], errors)) return false;
  const row = value as JsonObject;
  if (!isAdmissionId(row.shardId)) errors.push('shardId is invalid');
  if (row.pathBase !== 'generation_local') errors.push('pathBase is invalid');
  if (!relativePath(row.relativePath)) errors.push('relativePath is not a safe relative path');
  if (!printable(row.firstKey, 512) || !printable(row.lastKey, 512)) errors.push('shard key is invalid');
  if (printable(row.firstKey, 512) && printable(row.lastKey, 512) && row.firstKey > row.lastKey) errors.push('shard key range is inverted');
  if (!safeInt(row.rowCount, 1)) errors.push('rowCount must be positive');
  if (!safeInt(row.bytes, 1) || row.bytes > MAX_SHARD_BYTES) errors.push('shard bytes exceed the frozen limit');
  if (!isSha256(row.sha256)) errors.push('shard sha256 is invalid');
  return errors.length === 0;
}

export function validateCalibrationAdmissionBoundedShardReceiptV1(value: unknown): Validation {
  const errors: string[] = []; shardShape(value, errors); return result(errors);
}
export function isCalibrationAdmissionBoundedShardReceiptV1(value: unknown): value is AdmissionBoundedShardReceiptV1 {
  return validateCalibrationAdmissionBoundedShardReceiptV1(value).ok;
}

export function validateCalibrationAdmissionOverlapCheckpointV1(value: unknown): Validation {
  const errors: string[] = [];
  if (!errorsForShape(value, ['version', 'checkpointId', 'universeSha256', 'normalizerRegistrySha256', 'overlapPolicySha256', 'invocationIntentId', 'phase', 'inputShardSha256s', 'outputShardSha256s', 'continuationCursorSha256', 'checkpointSha256'], errors)) return result(errors);
  const row = value as JsonObject;
  if (row.version !== 'v10.3-admission-overlap-checkpoint-v1') errors.push('checkpoint version is invalid');
  if (!isAdmissionId(row.checkpointId)) errors.push('checkpointId is invalid');
  for (const key of ['universeSha256', 'normalizerRegistrySha256', 'overlapPolicySha256', 'invocationIntentId', 'continuationCursorSha256', 'checkpointSha256']) if (!isSha256(row[key])) errors.push(`${key} is invalid`);
  if (!['postings', 'candidate_pairs', 'exact_edges', 'clusters'].includes(row.phase as string)) errors.push('checkpoint phase is invalid');
  if (!sortedShas(row.inputShardSha256s) || !sortedShas(row.outputShardSha256s)) errors.push('checkpoint shard hashes must be sorted, unique, and bounded');
  try { if (isSha256(row.checkpointSha256) && calibrationAdmissionOverlapCheckpointSha256(row) !== row.checkpointSha256) errors.push('checkpointSha256 does not match canonical bytes'); } catch { errors.push('checkpointSha256 cannot be recomputed'); }
  return result(errors);
}
export function isCalibrationAdmissionOverlapCheckpointV1(value: unknown): value is AdmissionOverlapCheckpointV1 { return validateCalibrationAdmissionOverlapCheckpointV1(value).ok; }

function sortedShards(value: unknown, errors: string[], name: string): value is readonly AdmissionBoundedShardReceiptV1[] {
  if (!Array.isArray(value) || value.length > MAX_ARRAY_ITEMS) { errors.push(`${name} is not bounded`); return false; }
  let previous = '';
  let ok = true;
  for (const child of value) {
    const childErrors: string[] = [];
    if (!shardShape(child, childErrors)) { errors.push(...childErrors.map((entry) => `${name}: ${entry}`)); ok = false; continue; }
    const path = (child as AdmissionBoundedShardReceiptV1).relativePath;
    if (path <= previous) { errors.push(`${name} must be sorted and unique by relativePath`); ok = false; }
    previous = path;
  }
  return ok;
}

export function validateCalibrationAdmissionOverlapIndexReceiptV1(value: unknown): Validation {
  const errors: string[] = [];
  if (!errorsForShape(value, ['version', 'universeSha256', 'normalizerRegistrySha256', 'overlapPolicySha256', 'method', 'postingShards', 'candidatePairShards', 'checkpoints', 'coveredCandidateUnits', 'complete', 'toolReceiptSha256', 'receiptSha256'], errors)) return result(errors);
  const row = value as JsonObject;
  if (row.version !== 'v10.3-overlap-index-receipt-v1' || row.method !== METHOD) errors.push('index receipt version or method is invalid');
  for (const key of ['universeSha256', 'normalizerRegistrySha256', 'overlapPolicySha256', 'toolReceiptSha256', 'receiptSha256']) if (!isSha256(row[key])) errors.push(`${key} is invalid`);
  if (!safeInt(row.coveredCandidateUnits)) errors.push('coveredCandidateUnits is invalid');
  if (typeof row.complete !== 'boolean') errors.push('complete is invalid');
  sortedShards(row.postingShards, errors, 'postingShards'); sortedShards(row.candidatePairShards, errors, 'candidatePairShards');
  if (!Array.isArray(row.checkpoints) || row.checkpoints.length > MAX_ARRAY_ITEMS) errors.push('checkpoints are not bounded');
  else {
    let previous = '';
    for (const checkpoint of row.checkpoints) {
      if (!isCalibrationAdmissionOverlapCheckpointV1(checkpoint)) { errors.push('checkpoint reference is invalid'); continue; }
      if (checkpoint.universeSha256 !== row.universeSha256
        || checkpoint.normalizerRegistrySha256 !== row.normalizerRegistrySha256
        || checkpoint.overlapPolicySha256 !== row.overlapPolicySha256) errors.push('checkpoint authority hashes do not match the index receipt');
      if (checkpoint.checkpointId <= previous) errors.push('checkpoints must be sorted and unique');
      previous = checkpoint.checkpointId;
    }
  }
  try { if (isSha256(row.receiptSha256) && calibrationAdmissionOverlapIndexReceiptSha256(row) !== row.receiptSha256) errors.push('receiptSha256 does not match canonical bytes'); } catch { errors.push('receiptSha256 cannot be recomputed'); }
  return result(errors);
}
export function isCalibrationAdmissionOverlapIndexReceiptV1(value: unknown): value is AdmissionOverlapIndexReceiptV1 { return validateCalibrationAdmissionOverlapIndexReceiptV1(value).ok; }

export function validateCalibrationAdmissionOverlapResourceReceiptV1(value: unknown): Validation {
  const errors: string[] = [];
  const keys = ['version', 'receiptId', 'universeSha256', 'recordsJsonlSha256', 'overlapPolicySha256', 'realContentDistributionSha256', 'recordCount', 'tokenCount', 'shingleCount', 'configuredLimits', 'observed', 'coverageComplete', 'withinAllLimits', 'toolReceiptSha256'];
  if (!errorsForShape(value, keys, errors)) return result(errors);
  const row = value as JsonObject;
  if (row.version !== 'v10.3-overlap-resource-receipt-v1') errors.push('resource receipt version is invalid');
  if (!isSha256(row.receiptId)) errors.push('receiptId is invalid');
  for (const key of ['universeSha256', 'recordsJsonlSha256', 'overlapPolicySha256', 'realContentDistributionSha256', 'toolReceiptSha256']) if (!isSha256(row[key])) errors.push(`${key} is invalid`);
  for (const key of ['recordCount', 'tokenCount', 'shingleCount']) if (!safeInt(row[key])) errors.push(`${key} is invalid`);
  if (typeof row.coverageComplete !== 'boolean' || typeof row.withinAllLimits !== 'boolean') errors.push('coverage/limit flags are invalid');
  const configured = row.configuredLimits as JsonObject;
  const observed = row.observed as JsonObject;
  const configKeys = Object.keys(ADMISSION_OVERLAP_RESOURCE_LIMITS);
  if (!isJsonRecord(configured) || !exactKeys(configured, configKeys)) errors.push('configuredLimits shape is invalid');
  if (!isJsonRecord(observed) || !exactKeys(observed, [...configKeys.filter((key) => key !== 'maxWallMilliseconds'), 'wallMilliseconds'])) errors.push('observed shape is invalid');
  if (isJsonRecord(configured)) for (const key of configKeys) if (configured[key] !== ADMISSION_OVERLAP_RESOURCE_LIMITS[key as keyof typeof ADMISSION_OVERLAP_RESOURCE_LIMITS]) errors.push(`configured ${key} is not frozen`);
  const observedMap: Record<string, string> = { maxUnitBytes: 'maxUnitBytes', maxHeapBytes: 'maxHeapBytes', maxRssBytes: 'maxRssBytes', maxWorkBytes: 'maxWorkBytes', maxOpenFiles: 'maxOpenFiles', maxShardBytes: 'maxShardBytes', wallMilliseconds: 'maxWallMilliseconds' };
  let within = true;
  if (isJsonRecord(observed) && isJsonRecord(configured)) for (const [observedKey, configuredKey] of Object.entries(observedMap)) {
    if (!safeInt(observed[observedKey])) { errors.push(`observed ${observedKey} is invalid`); within = false; }
    else if (!safeInt(configured[configuredKey]) || observed[observedKey] > configured[configuredKey]) within = false;
  }
  if (typeof row.withinAllLimits === 'boolean' && row.withinAllLimits !== within) errors.push('withinAllLimits does not match observed usage');
  try { if (isSha256(row.receiptId) && calibrationAdmissionOverlapResourceReceiptId(row) !== row.receiptId) errors.push('receiptId does not match canonical bytes'); } catch { errors.push('receiptId cannot be recomputed'); }
  return result(errors);
}
export function isCalibrationAdmissionOverlapResourceReceiptV1(value: unknown): value is AdmissionOverlapResourceReceiptV1 { return validateCalibrationAdmissionOverlapResourceReceiptV1(value).ok; }

export function validateCalibrationAdmissionOverlapEdgeRowV1(value: unknown): Validation {
  const errors: string[] = [];
  if (!errorsForShape(value, ['leftCandidateUnitId', 'rightCandidateUnitId', 'leftPolarityBindingSha256', 'rightPolarityBindingSha256', 'leftOverlapSide', 'rightOverlapSide', 'kind', 'intersection', 'union', 'crossSide'], errors)) return result(errors);
  const row = value as JsonObject;
  if (!isAdmissionId(row.leftCandidateUnitId) || !isAdmissionId(row.rightCandidateUnitId) || row.leftCandidateUnitId >= row.rightCandidateUnitId) errors.push('edge endpoints must be distinct and ordered');
  for (const key of ['leftPolarityBindingSha256', 'rightPolarityBindingSha256']) if (!isSha256(row[key])) errors.push(`${key} is invalid`);
  if (!SIDE_ORDER.includes(row.leftOverlapSide as Side) || !SIDE_ORDER.includes(row.rightOverlapSide as Side)) errors.push('edge side is invalid');
  if (!['exact', 'near'].includes(row.kind as string)) errors.push('edge kind is invalid');
  if (!safeInt(row.intersection) || !safeInt(row.union) || row.intersection > row.union || (row.union === 0 && row.intersection !== 0)) errors.push('edge intersection/union is invalid');
  const crossSide = (row.leftOverlapSide === 'ai_side' && row.rightOverlapSide === 'human_side') || (row.leftOverlapSide === 'human_side' && row.rightOverlapSide === 'ai_side');
  if (row.crossSide !== crossSide) errors.push('crossSide is not derived from explicit sides');
  const intersection = row.intersection;
  const union = row.union;
  if (row.kind === 'near' && !isAdmissionOverlapJaccardAtLeast80(intersection, union)) errors.push('near edge does not meet inclusive 0.80 Jaccard');
  return result(errors);
}
export function isCalibrationAdmissionOverlapEdgeRowV1(value: unknown): value is AdmissionOverlapEdgeRowV1 { return validateCalibrationAdmissionOverlapEdgeRowV1(value).ok; }

export function validateCalibrationAdmissionOverlapAdjacencyRowV1(value: unknown): Validation {
  const errors: string[] = [];
  if (!errorsForShape(value, ['candidateUnitId', 'neighborCandidateUnitId', 'edgeRowSha256', 'kind'], errors)) return result(errors);
  const row = value as JsonObject;
  if (!isAdmissionId(row.candidateUnitId) || !isAdmissionId(row.neighborCandidateUnitId) || row.candidateUnitId === row.neighborCandidateUnitId) errors.push('adjacency endpoints must be distinct');
  if (!isSha256(row.edgeRowSha256)) errors.push('edgeRowSha256 is invalid');
  if (!['exact', 'near'].includes(row.kind as string)) errors.push('adjacency kind is invalid');
  return result(errors);
}
export function isCalibrationAdmissionOverlapAdjacencyRowV1(value: unknown): value is AdmissionOverlapAdjacencyRowV1 { return validateCalibrationAdmissionOverlapAdjacencyRowV1(value).ok; }

export function validateCalibrationAdmissionOverlapClusterSummaryRowV1(value: unknown): Validation {
  const errors: string[] = [];
  if (!errorsForShape(value, ['clusterId', 'kind', 'canonicalCandidateUnitId', 'memberCount', 'overlapSideSet', 'membershipRowsSha256'], errors)) return result(errors);
  const row = value as JsonObject;
  if (!isAdmissionId(row.clusterId) || !isAdmissionId(row.canonicalCandidateUnitId)) errors.push('cluster IDs are invalid');
  if (!['exact', 'near'].includes(row.kind as string)) errors.push('cluster kind is invalid');
  if (!safeInt(row.memberCount, 1)) errors.push('memberCount must be positive');
  if (!sortedSides(row.overlapSideSet)) errors.push('overlapSideSet must be sorted and unique');
  if (!isSha256(row.membershipRowsSha256)) errors.push('membershipRowsSha256 is invalid');
  return result(errors);
}
export function isCalibrationAdmissionOverlapClusterSummaryRowV1(value: unknown): value is AdmissionOverlapClusterSummaryRowV1 { return validateCalibrationAdmissionOverlapClusterSummaryRowV1(value).ok; }

export function validateCalibrationAdmissionOverlapClusterMembershipRowV1(value: unknown): Validation {
  const errors: string[] = [];
  if (!errorsForShape(value, ['kind', 'clusterId', 'candidateUnitId', 'overlapSide'], errors)) return result(errors);
  const row = value as JsonObject;
  if (!['exact', 'near'].includes(row.kind as string)) errors.push('membership kind is invalid');
  if (!isAdmissionId(row.clusterId) || !isAdmissionId(row.candidateUnitId)) errors.push('membership IDs are invalid');
  if (!SIDE_ORDER.includes(row.overlapSide as Side)) errors.push('membership side is invalid');
  return result(errors);
}
export function isCalibrationAdmissionOverlapClusterMembershipRowV1(value: unknown): value is AdmissionOverlapClusterMembershipRowV1 { return validateCalibrationAdmissionOverlapClusterMembershipRowV1(value).ok; }

function shardList(value: unknown, errors: string[], name: string): void { sortedShards(value, errors, name); }

export function validateCalibrationAdmissionOverlapLedgerV1(value: unknown): Validation {
  const errors: string[] = [];
  const keys = ['version', 'universeSha256', 'method', 'normalizerRegistrySha256', 'overlapPolicySha256', 'indexReceiptSha256', 'coverageComplete', 'unresolvedCandidateUnitIds', 'edgeShards', 'adjacencyShards', 'clusterSummaryShards', 'clusterMembershipShards', 'edgeCount', 'adjacencyRowCount', 'exactClusterCount', 'nearClusterCount', 'crossSideEdgeCount', 'ledgerSha256'];
  if (!errorsForShape(value, keys, errors)) return result(errors);
  const row = value as JsonObject;
  if (row.version !== 'v10.3-admission-overlap-v1' || row.method !== METHOD) errors.push('ledger version or method is invalid');
  for (const key of ['universeSha256', 'normalizerRegistrySha256', 'overlapPolicySha256', 'indexReceiptSha256', 'ledgerSha256']) if (!isSha256(row[key])) errors.push(`${key} is invalid`);
  if (typeof row.coverageComplete !== 'boolean') errors.push('coverageComplete is invalid');
  if (!sortedIds(row.unresolvedCandidateUnitIds, MAX_UNRESOLVED)) errors.push('unresolvedCandidateUnitIds must be sorted and bounded');
  for (const [name, valueForList] of [['edgeShards', row.edgeShards], ['adjacencyShards', row.adjacencyShards], ['clusterSummaryShards', row.clusterSummaryShards], ['clusterMembershipShards', row.clusterMembershipShards]] as const) shardList(valueForList, errors, name);
  for (const key of ['edgeCount', 'adjacencyRowCount', 'exactClusterCount', 'nearClusterCount', 'crossSideEdgeCount']) if (!safeInt(row[key])) errors.push(`${key} is invalid`);
  if (row.coverageComplete === true && Array.isArray(row.unresolvedCandidateUnitIds) && row.unresolvedCandidateUnitIds.length !== 0) errors.push('complete ledger cannot retain unresolved units');
  if (safeInt(row.edgeCount) && safeInt(row.adjacencyRowCount) && row.coverageComplete === true && BigInt(row.adjacencyRowCount) !== BigInt(row.edgeCount) * 2n) errors.push('complete ledger adjacency count must be symmetric');
  if (safeInt(row.crossSideEdgeCount) && safeInt(row.edgeCount) && row.crossSideEdgeCount > row.edgeCount) errors.push('cross-side edge count exceeds edge count');
  try { if (isSha256(row.ledgerSha256) && calibrationAdmissionOverlapLedgerSha256(row) !== row.ledgerSha256) errors.push('ledgerSha256 does not match canonical bytes'); } catch { errors.push('ledgerSha256 cannot be recomputed'); }
  return result(errors);
}
export function isCalibrationAdmissionOverlapLedgerV1(value: unknown): value is AdmissionOverlapLedgerV1 { return validateCalibrationAdmissionOverlapLedgerV1(value).ok; }
