import type { CalibrationAdmissionToolAuthoritySnapshotV1 } from './generated/calibration-admission-tool-authority-snapshot';
import type { CalibrationAcquisitionRoundAuthorizationV1 } from './generated/calibration-acquisition-round-authorization';
import type { CalibrationApprovedAcquisitionV1 } from './generated/calibration-approved-acquisition';
import type { CalibrationAcquisitionReceiptV1 } from './generated/calibration-acquisition-receipt';
import type { CalibrationAcquisitionRoundReceiptV1 } from './generated/calibration-acquisition-round-receipt';
import type { CalibrationAcquisitionRoundLockV1 } from './generated/calibration-acquisition-round-lock';
import type { CalibrationAcquisitionRoundTransactionV1 } from './generated/calibration-acquisition-round-transaction';
import { calibrationAdmissionSha256, isCalibrationAdmissionToolAuthoritySnapshotV1 } from './calibration-admission-evidence';
import { calibrationAdmissionMaterializationId } from './calibration-admission-review';
import {
  exactKeys,
  isAdmissionId as id,
  isJsonRecord as isRecord,
  isSha256 as sha,
  sortedUniqueByPredicate,
  withoutJsonKeys as withoutKeys,
  type JsonRecord,
} from './calibration-admission-primitives';
import { isIP } from 'node:net';

/** The round contract is deliberately offline: it validates durable bytes, not network state. */
export const CALIBRATION_ACQUISITION_ROUND_MAX_BYTES = 5 * 1024 ** 3;

const COMMIT_SHA = /^[a-f0-9]{40}$/;
const SLUG = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const MATERIALIZATION_ID = /^sbm_[a-f0-9]{64}$/;
const STRICT_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const RELATIVE_SEGMENT = /^[A-Za-z0-9._@+%=-]+$/;
const MAX_URL_LENGTH = 4096;

function commitSha(value: unknown): value is string {
  return typeof value === 'string' && COMMIT_SHA.test(value);
}

function slug(value: unknown): value is string {
  return typeof value === 'string' && SLUG.test(value);
}

function materializationId(value: unknown): value is string {
  return typeof value === 'string' && MATERIALIZATION_ID.test(value);
}

function safeInteger(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function boundedBytes(value: unknown, minimum = 0): value is number {
  return safeInteger(value, minimum, CALIBRATION_ACQUISITION_ROUND_MAX_BYTES);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

function strictTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !STRICT_TIMESTAMP.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function strictHttps(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_LENGTH || /\s/.test(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0
      && parsed.username.length === 0 && parsed.password.length === 0
      && parsed.hash.length === 0;
  } catch {
    return false;
  }
}

function relativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096
    || value.startsWith('/') || value.includes('\\') || value.includes('//')) return false;
  const segments = value.split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..' && RELATIVE_SEGMENT.test(segment));
}

function sortedUniqueStrings(value: unknown, predicate: (entry: unknown) => boolean, allowEmpty = false): value is readonly string[] {
  return sortedUniqueByPredicate(value, predicate, allowEmpty);
}

/** Ordered unique strings.  Acquisition source arrays use the authorization's
 * explicit order as their canonical order; they are not independently sorted. */
function uniqueStrings(value: unknown, predicate: (entry: unknown) => boolean, allowEmpty = false): value is readonly string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || !value.every(predicate)) return false;
  return new Set(value).size === value.length;
}

function stringArray(value: unknown, predicate: (entry: unknown) => boolean, allowEmpty = false): value is readonly string[] {
  return Array.isArray(value) && (allowEmpty || value.length > 0) && value.every(predicate);
}

function hashWithout(value: unknown, keys: readonly string[]): string {
  return calibrationAdmissionSha256(withoutKeys(value, keys));
}

function arrayEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  try { return calibrationAdmissionSha256(left) === calibrationAdmissionSha256(right); } catch { return false; }
}

function releaseMaterialization(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, ['kind', 'assetUrl', 'assetSha256', 'assetBytes', 'archiveFormat', 'rootPrefix', 'extractionPolicy'])) return false;
  return value.kind === 'release_archive'
    && strictHttps(value.assetUrl)
    && sha(value.assetSha256)
    && safeInteger(value.assetBytes, 1)
    && value.archiveFormat === 'zip'
    && relativePath(value.rootPrefix)
    && value.extractionPolicy === 'safe-zip-v1';
}

function extractionReceipt(value: unknown, materialization: JsonRecord): boolean {
  if (!isRecord(value) || !exactKeys(value, ['receiptVersion', 'extractionPolicy', 'assetSha256', 'assetBytes', 'inventorySha256', 'entries'])) return false;
  if (value.receiptVersion !== 'v1' || value.extractionPolicy !== 'safe-zip-v1'
    || value.assetSha256 !== materialization.assetSha256 || value.assetBytes !== materialization.assetBytes
    || !sha(value.assetSha256) || !safeInteger(value.assetBytes, 1) || !sha(value.inventorySha256)
    || !Array.isArray(value.entries)) return false;
  let previousPath = '';
  for (const entry of value.entries) {
    if (!isRecord(entry) || typeof entry.path !== 'string' || !relativePath(entry.path) || entry.path <= previousPath) return false;
    previousPath = entry.path;
    if (entry.kind === 'directory') {
      if (!exactKeys(entry, ['path', 'kind'])) return false;
    } else if (entry.kind === 'file') {
      if (!exactKeys(entry, ['path', 'kind', 'bytes', 'sha256']) || !safeInteger(entry.bytes) || !sha(entry.sha256)) return false;
    } else return false;
  }
  try { return calibrationAdmissionSha256(value.entries) === value.inventorySha256; } catch { return false; }
}

function approvedTransport(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'git_https') {
    return exactKeys(value, ['kind', 'commitSha', 'transportByteLimit', 'ownerAcknowledgedUnboundedTransport'])
      && commitSha(value.commitSha)
      && value.transportByteLimit === 'not_enforceable_by_stock_git'
      && value.ownerAcknowledgedUnboundedTransport === true;
  }
  if (value.kind === 'release_https') {
    return exactKeys(value, ['kind', 'materialization', 'maxTransferBytes', 'approvedRedirectUrls'])
      && releaseMaterialization(value.materialization)
      && boundedBytes(value.maxTransferBytes, 1)
      && sortedUniqueStrings(value.approvedRedirectUrls, strictHttps, true)
      && isRecord(value.materialization)
      && safeInteger(value.materialization.assetBytes, 1)
      && value.materialization.assetBytes <= value.maxTransferBytes;
  }
  return false;
}

function receiptTransport(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'git_https') {
    return exactKeys(value, ['kind', 'commitSha', 'treeSha', 'observedPackBytes', 'observedNetworkBytes'])
      && commitSha(value.commitSha) && sha(value.treeSha) && boundedBytes(value.observedPackBytes)
      && value.observedNetworkBytes === 'not_observable_exactly';
  }
  if (value.kind === 'release_https') {
    return exactKeys(value, ['kind', 'materialization', 'extractionReceipt', 'observedTransferBytes', 'redirectChain'])
      && releaseMaterialization(value.materialization)
      && isRecord(value.materialization)
      && extractionReceipt(value.extractionReceipt, value.materialization)
      && boundedBytes(value.observedTransferBytes)
      && Array.isArray(value.redirectChain)
      && value.redirectChain.every(strictHttps);
  }
  return false;
}

function networkObservation(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, ['requestUrl', 'redirectChain', 'resolvedPublicAddresses', 'connectedPeerAddress'])) return false;
  if (!strictHttps(value.requestUrl) || !Array.isArray(value.redirectChain) || !value.redirectChain.every(strictHttps)
    || !sortedUniqueStrings(value.resolvedPublicAddresses, (entry) => typeof entry === 'string' && entry.length > 0 && entry.length <= 128)
    || typeof value.connectedPeerAddress !== 'string' || value.connectedPeerAddress.length === 0 || value.connectedPeerAddress.length > 128) return false;
  return value.resolvedPublicAddresses.every(isPublicAddress)
    && isPublicAddress(value.connectedPeerAddress)
    && value.resolvedPublicAddresses.includes(value.connectedPeerAddress);
}

function isPublicAddress(value: string): boolean {
  const family = isIP(value);
  if (family === 4) {
    // node:net rejects malformed/ambiguous IPv4 spellings.  Requiring the
    // canonical dotted-decimal spelling also rejects octal/leading-zero forms.
    const octets = value.split('.').map((part) => Number(part));
    if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
      || value !== octets.join('.')) return false;
    const [first, second, third] = octets;
    if (first === undefined || second === undefined || third === undefined) return false;
    // RFC 6890 special-purpose, private, link-local, documentation,
    // benchmarking, multicast, and future-reserved IPv4 ranges.
    const inCidr = (network: readonly number[], prefix: number): boolean => {
      const valueNumber = (((first * 256 + second) * 256 + third) * 256 + octets[3]!);
      const networkNumber = (((network[0]! * 256 + network[1]!) * 256 + network[2]!) * 256 + network[3]!);
      const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
      return (valueNumber >>> 0 & mask) === (networkNumber >>> 0 & mask);
    };
    return !inCidr([0, 0, 0, 0], 8)
      && !inCidr([10, 0, 0, 0], 8)
      && !inCidr([100, 64, 0, 0], 10)
      && !inCidr([127, 0, 0, 0], 8)
      && !inCidr([169, 254, 0, 0], 16)
      && !inCidr([172, 16, 0, 0], 12)
      && !inCidr([192, 0, 0, 0], 24)
      && !inCidr([192, 0, 2, 0], 24)
      && !inCidr([192, 31, 196, 0], 24)
      && !inCidr([192, 52, 193, 0], 24)
      && !inCidr([192, 88, 99, 0], 24)
      && !inCidr([192, 168, 0, 0], 16)
      && !inCidr([198, 18, 0, 0], 15)
      && !inCidr([198, 51, 100, 0], 24)
      && !inCidr([203, 0, 113, 0], 24)
      && !inCidr([224, 0, 0, 0], 4);
  }
  if (family !== 6 || value.includes('%') || value.includes('.')) return false;
  const parts = value.toLowerCase().split('::');
  if (parts.length > 2) return false;
  const parseParts = (part: string): number[] => {
    if (part === '') return [];
    const values = part.split(':');
    if (values.some((entry) => !/^[0-9a-f]{1,4}$/.test(entry))) return [];
    return values.map((entry) => Number.parseInt(entry, 16));
  };
  const left = parseParts(parts[0] ?? '');
  const right = parseParts(parts.length === 2 ? parts[1] ?? '' : '');
  if (parts.length === 1 && left.length !== 8) return false;
  if (parts.length === 2 && left.length + right.length >= 8) return false;
  const units = parts.length === 2 ? [...left, ...new Array(8 - left.length - right.length).fill(0), ...right] : left;
  if (units.length !== 8) return false;
  const bytes = units.flatMap((unit) => [unit >>> 8, unit & 0xff]);
  const allZero = bytes.every((entry) => entry === 0);
  const loopback = allZero || (bytes.slice(0, 15).every((entry) => entry === 0) && bytes[15] === 1);
  const mapped = bytes.slice(0, 10).every((entry) => entry === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  const uniqueLocal = (bytes[0]! & 0xfe) === 0xfc;
  const linkLocal = bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80;
  const multicast = bytes[0] === 0xff;
  const prefix = (length: number): number => {
    let result = 0;
    for (let index = 0; index < length; index += 1) result = (result << 8) | bytes[index]!;
    return result >>> 0;
  };
  const reserved = prefix(4) === 0x00000000 // IPv4-compatible/unspecified space
    || prefix(4) === 0x0064ff9b // NAT64 well-known prefix
    || prefix(4) === 0x20010000 // 2001:0000::/32 (Teredo)
    || prefix(4) === 0x20010002 // 2001:0002::/48 (benchmarking)
    || prefix(4) === 0x20010db8 // documentation
    || ((prefix(4) >>> 4) === 0x2001001) // 2001:0010::/28 (ORCHID)
    || ((((bytes[0]! << 16) | (bytes[1]! << 8) | bytes[2]!) & 0xfffff) === 0x3fff0); // 3fff::/20 documentation
  return !(loopback || mapped || uniqueLocal || linkLocal || multicast || reserved);
}

function canonicalArrayEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((entry, index) => canonicalEqual(entry, right[index]));
}

function redirectChainWithinApproved(chain: unknown, approved: unknown): boolean {
  if (!Array.isArray(chain) || !Array.isArray(approved) || !chain.every(strictHttps)) return false;
  const allowed = new Set(approved.filter(strictHttps));
  return chain.every((entry) => allowed.has(entry));
}

function expectedMaterializationId(value: JsonRecord): string | undefined {
  if (!slug(value.sourceId) || !slug(value.repositoryId) || !isRecord(value.transport)) return undefined;
  if (value.transport.kind === 'git_https' && commitSha(value.transport.commitSha)) {
    return calibrationAdmissionMaterializationId(value.sourceId, value.repositoryId, {
      kind: 'git', repositoryId: value.repositoryId, commitSha: value.transport.commitSha,
    });
  }
  if (value.transport.kind === 'release_https' && isRecord(value.transport.materialization)) {
    return calibrationAdmissionMaterializationId(value.sourceId, value.repositoryId, value.transport.materialization);
  }
  return undefined;
}

function profileMatchesTransport(transport: unknown, profileId: unknown): boolean {
  if (!isRecord(transport)) return false;
  return (transport.kind === 'git_https' && profileId === 'admission-git-acquire-v1')
    || (transport.kind === 'release_https' && profileId === 'admission-release-acquire-v1');
}

function sourceInvocation(value: unknown): value is {
  authorizationId: string;
  invocationIntentId: string;
  profileId: 'admission-git-acquire-v1' | 'admission-release-acquire-v1';
  profileSha256: string;
} {
  return isRecord(value) && exactKeys(value, ['authorizationId', 'invocationIntentId', 'profileId', 'profileSha256'])
    && sha(value.authorizationId) && sha(value.invocationIntentId)
    && (value.profileId === 'admission-git-acquire-v1' || value.profileId === 'admission-release-acquire-v1')
    && sha(value.profileSha256);
}

function sourceState(value: unknown): boolean {
  if (!isRecord(value) || typeof value.phase !== 'string') return false;
  const phase = value.phase;
  if (phase === 'not_started' || phase === 'transport_complete') return exactKeys(value, ['phase']);
  if (['network_observation_fsynced', 'tree_verified', 'temporary_fsynced', 'destination_promoted', 'destination_directory_fsynced'].includes(phase)) {
    return exactKeys(value, ['phase', 'networkObservationSha256']) && sha(value.networkObservationSha256);
  }
  if (phase === 'materialization_receipt_staged_fsynced') {
    return exactKeys(value, ['phase', 'networkObservationSha256', 'childToolReceiptId', 'childToolReceiptSha256', 'toolAuthorityIndexSha256', 'materializationReceiptId', 'materializationReceiptSha256'])
      && sha(value.networkObservationSha256) && sha(value.childToolReceiptId) && sha(value.childToolReceiptSha256)
      && sha(value.toolAuthorityIndexSha256) && id(value.materializationReceiptId) && sha(value.materializationReceiptSha256);
  }
  if (phase === 'source_receipt_staged_fsynced') {
    return exactKeys(value, ['phase', 'networkObservationSha256', 'childToolReceiptId', 'childToolReceiptSha256', 'toolAuthorityIndexSha256', 'materializationReceiptId', 'materializationReceiptSha256', 'sourceReceiptId', 'sourceReceiptSha256'])
      && sha(value.networkObservationSha256) && sha(value.childToolReceiptId) && sha(value.childToolReceiptSha256)
      && sha(value.toolAuthorityIndexSha256) && id(value.materializationReceiptId) && sha(value.materializationReceiptSha256)
      && sha(value.sourceReceiptId) && sha(value.sourceReceiptSha256);
  }
  return false;
}

function sourceTransaction(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, ['authorizationId', 'temporaryRelativePath', 'finalRelativePath', 'expectedIdentitySha256', 'maxMaterializedBytes', 'networkObservationRelativePath', 'sourceReceiptTemporaryRelativePath', 'sourceReceiptFinalRelativePath', 'materializationReceiptTemporaryRelativePath', 'materializationReceiptFinalRelativePath', 'toolReceiptTemporaryRelativePath', 'state'])) return false;
  return sha(value.authorizationId) && relativePath(value.temporaryRelativePath) && relativePath(value.finalRelativePath)
    && sha(value.expectedIdentitySha256) && boundedBytes(value.maxMaterializedBytes, 1)
    && relativePath(value.networkObservationRelativePath) && relativePath(value.sourceReceiptTemporaryRelativePath)
    && relativePath(value.sourceReceiptFinalRelativePath) && relativePath(value.materializationReceiptTemporaryRelativePath)
    && relativePath(value.materializationReceiptFinalRelativePath) && relativePath(value.toolReceiptTemporaryRelativePath)
    && sourceState(value.state);
}

function transactionState(value: unknown): boolean {
  if (!isRecord(value) || typeof value.phase !== 'string') return false;
  const phase = value.phase;
  if (phase === 'intent_fsynced' || phase === 'all_sources_verified' || phase === 'all_destinations_promoted') return exactKeys(value, ['phase']);
  if (phase === 'orchestrator_tool_receipt_indexed') return exactKeys(value, ['phase', 'orchestratorToolReceiptId', 'orchestratorToolReceiptSha256', 'toolAuthorityIndexSha256'])
    && sha(value.orchestratorToolReceiptId) && sha(value.orchestratorToolReceiptSha256) && sha(value.toolAuthorityIndexSha256);
  if (phase === 'round_receipt_staged_fsynced') return exactKeys(value, ['phase', 'orchestratorToolReceiptId', 'orchestratorToolReceiptSha256', 'toolAuthorityIndexSha256', 'roundReceiptId', 'roundReceiptSha256', 'roundReceiptTemporaryRelativePath'])
    && sha(value.orchestratorToolReceiptId) && sha(value.orchestratorToolReceiptSha256) && sha(value.toolAuthorityIndexSha256)
    && sha(value.roundReceiptId) && sha(value.roundReceiptSha256) && relativePath(value.roundReceiptTemporaryRelativePath);
  if (phase === 'metadata_publication_complete' || phase === 'complete') return exactKeys(value, ['phase', 'orchestratorToolReceiptId', 'orchestratorToolReceiptSha256', 'toolAuthorityIndexSha256', 'roundReceiptId', 'roundReceiptSha256', 'roundReceiptTemporaryRelativePath', 'acquisitionIndexSha256', 'acquisitionPublicationTransactionId', 'materializationReceiptLedgerSha256', 'evidenceBundleSha256'])
    && sha(value.orchestratorToolReceiptId) && sha(value.orchestratorToolReceiptSha256) && sha(value.toolAuthorityIndexSha256)
    && sha(value.roundReceiptId) && sha(value.roundReceiptSha256) && relativePath(value.roundReceiptTemporaryRelativePath)
    && sha(value.acquisitionIndexSha256) && id(value.acquisitionPublicationTransactionId)
    && sha(value.materializationReceiptLedgerSha256) && sha(value.evidenceBundleSha256);
  return false;
}

export function calibrationAcquisitionRoundAuthorizationId(value: unknown): string {
  return hashWithout(value, ['roundId', 'authorizationSha256']);
}

export function calibrationAcquisitionRoundAuthorizationSha256(value: unknown): string {
  return hashWithout(value, ['authorizationSha256']);
}

export function calibrationApprovedAcquisitionAuthorizationId(value: unknown): string {
  return hashWithout(value, ['authorizationId', 'authorizationSha256']);
}

export function calibrationApprovedAcquisitionAuthorizationSha256(value: unknown): string {
  return hashWithout(value, ['authorizationSha256']);
}

export function calibrationAcquisitionReceiptId(value: unknown): string {
  return hashWithout(value, ['receiptId', 'receiptSha256']);
}

export function calibrationAcquisitionReceiptSha256(value: unknown): string {
  return hashWithout(value, ['receiptSha256']);
}

export function calibrationAcquisitionRoundReceiptId(value: unknown): string {
  return hashWithout(value, ['receiptId', 'receiptSha256']);
}

export function calibrationAcquisitionRoundReceiptSha256(value: unknown): string {
  return hashWithout(value, ['receiptSha256']);
}

export function calibrationAcquisitionRoundLockId(value: unknown): string {
  return hashWithout(value, ['lockId', 'lockSha256']);
}

export function calibrationAcquisitionRoundLockSha256(value: unknown): string {
  return hashWithout(value, ['lockSha256']);
}

function transactionIntentProjection(value: unknown): JsonRecord {
  const projection = withoutKeys(value, ['transactionId', 'lockSha256', 'state', 'transactionSha256']);
  if (Array.isArray(projection.sources)) {
    projection.sources = projection.sources.map((source) => withoutKeys(source, ['state']));
  }
  return projection;
}

export function calibrationAcquisitionRoundTransactionId(value: unknown): string {
  return calibrationAdmissionSha256(transactionIntentProjection(value));
}

export function calibrationAcquisitionRoundTransactionSha256(value: unknown): string {
  return hashWithout(value, ['transactionSha256']);
}

export function isCalibrationAcquisitionRoundAuthorizationV1(value: unknown): value is CalibrationAcquisitionRoundAuthorizationV1 {
  if (!isRecord(value) || !exactKeys(value, ['version', 'roundId', 'approvedBy', 'approvedAt', 'parentCensusSha256', 'measuredDeficitsSha256', 'sourceAuthorizationIds', 'maxSources', 'maxTotalMaterializedBytes', 'authorizationSha256'])) return false;
  if (value.version !== 'v10.3-acquisition-round-authorization-v1' || !sha(value.roundId) || !nonEmptyString(value.approvedBy)
    || !strictTimestamp(value.approvedAt) || !sha(value.parentCensusSha256) || !sha(value.measuredDeficitsSha256)
    || !uniqueStrings(value.sourceAuthorizationIds, sha) || value.sourceAuthorizationIds.length > 2
    || value.maxSources !== 2 || !boundedBytes(value.maxTotalMaterializedBytes, 1)
    || !sha(value.authorizationSha256)) return false;
  try { return calibrationAcquisitionRoundAuthorizationId(value) === value.roundId && calibrationAcquisitionRoundAuthorizationSha256(value) === value.authorizationSha256; } catch { return false; }
}

export function isCalibrationApprovedAcquisitionV1(value: unknown): value is CalibrationApprovedAcquisitionV1 {
  if (!isRecord(value) || !exactKeys(value, ['version', 'authorizationId', 'approvedBy', 'approvedAt', 'sourceId', 'repositoryId', 'materializationId', 'originUrl', 'transport', 'maxMaterializedBytes', 'licenseEvidenceId', 'licensePath', 'licenseSha256', 'authorizationSha256'])) return false;
  if (value.version !== 'v10.3-approved-acquisition-v1' || !sha(value.authorizationId) || !nonEmptyString(value.approvedBy)
    || !strictTimestamp(value.approvedAt) || !slug(value.sourceId) || !slug(value.repositoryId) || !materializationId(value.materializationId)
    || !strictHttps(value.originUrl) || !approvedTransport(value.transport) || !boundedBytes(value.maxMaterializedBytes, 1)
    || !id(value.licenseEvidenceId) || !relativePath(value.licensePath) || !sha(value.licenseSha256) || !sha(value.authorizationSha256)
    || expectedMaterializationId(value) !== value.materializationId) return false;
  if (isRecord(value.transport) && value.transport.kind === 'release_https' && isRecord(value.transport.materialization)
    && value.transport.materialization.assetUrl !== value.originUrl) return false;
  try { return calibrationApprovedAcquisitionAuthorizationId(value) === value.authorizationId && calibrationApprovedAcquisitionAuthorizationSha256(value) === value.authorizationSha256; } catch { return false; }
}

export function isCalibrationAcquisitionReceiptV1(value: unknown): value is CalibrationAcquisitionReceiptV1 {
  if (!isRecord(value) || !exactKeys(value, ['version', 'receiptId', 'authorizationId', 'roundId', 'authorizationSha256', 'sourceId', 'repositoryId', 'materializationId', 'originUrl', 'transport', 'materializedBytes', 'inventorySha256', 'licenseSha256', 'materializationReceiptId', 'materializationReceiptSha256', 'networkObservation', 'resolvedPublicAddressesSha256', 'connectedPeerEvidenceSha256', 'transactionId', 'toolReceiptId', 'toolReceiptSha256', 'receiptSha256'])) return false;
  if (value.version !== 'v10.3-acquisition-receipt-v1' || !sha(value.receiptId) || !sha(value.authorizationId) || !sha(value.roundId)
    || !sha(value.authorizationSha256) || !slug(value.sourceId) || !slug(value.repositoryId) || !materializationId(value.materializationId)
    || !strictHttps(value.originUrl) || !receiptTransport(value.transport) || !boundedBytes(value.materializedBytes)
    || !sha(value.inventorySha256) || !sha(value.licenseSha256) || !id(value.materializationReceiptId) || !sha(value.materializationReceiptSha256)
    || !networkObservation(value.networkObservation) || !sha(value.resolvedPublicAddressesSha256) || !sha(value.connectedPeerEvidenceSha256)
    || !sha(value.transactionId) || !sha(value.toolReceiptId) || !sha(value.toolReceiptSha256) || !sha(value.receiptSha256)) return false;
  const observation = value.networkObservation as JsonRecord;
  if (observation.requestUrl !== value.originUrl) return false;
  if (isRecord(value.transport) && value.transport.kind === 'git_https' && (observation.redirectChain as unknown[]).length !== 0) return false;
  if (isRecord(value.transport) && value.transport.kind === 'release_https') {
    const materialization = value.transport.materialization as JsonRecord;
    if (materialization.assetUrl !== value.originUrl
      || !canonicalEqual(observation.redirectChain, value.transport.redirectChain)) return false;
  }
  if (calibrationAdmissionSha256(observation.resolvedPublicAddresses) !== value.resolvedPublicAddressesSha256
    || calibrationAdmissionSha256(observation.connectedPeerAddress) !== value.connectedPeerEvidenceSha256) return false;
  try { return calibrationAcquisitionReceiptId(value) === value.receiptId && calibrationAcquisitionReceiptSha256(value) === value.receiptSha256; } catch { return false; }
}

export function isCalibrationAcquisitionRoundReceiptV1(value: unknown): value is CalibrationAcquisitionRoundReceiptV1 {
  if (!isRecord(value) || !exactKeys(value, ['version', 'receiptId', 'roundId', 'parentCensusSha256', 'sourceReceiptSha256s', 'sourceInvocationIntentIds', 'sourceProfileSha256s', 'sourceToolReceiptSha256s', 'orchestratorInvocationIntentId', 'orchestratorToolReceiptId', 'orchestratorToolReceiptSha256', 'toolAuthoritySnapshot', 'acquiredSourceCount', 'totalMaterializedBytes', 'withinAuthorizedCountAndBytes', 'receiptSha256'])) return false;
  if (value.version !== 'v10.3-acquisition-round-receipt-v1' || !sha(value.receiptId) || !sha(value.roundId) || !sha(value.parentCensusSha256)
    || !uniqueStrings(value.sourceReceiptSha256s, sha) || value.sourceReceiptSha256s.length > 2
    || !uniqueStrings(value.sourceInvocationIntentIds, sha) || value.sourceInvocationIntentIds.length > 2
    || !stringArray(value.sourceProfileSha256s, sha) || value.sourceProfileSha256s.length > 2
    || !uniqueStrings(value.sourceToolReceiptSha256s, sha) || value.sourceToolReceiptSha256s.length > 2
    || !sha(value.orchestratorInvocationIntentId) || !sha(value.orchestratorToolReceiptId) || !sha(value.orchestratorToolReceiptSha256)
    || !isCalibrationAdmissionToolAuthoritySnapshotV1(value.toolAuthoritySnapshot) || (value.acquiredSourceCount !== 1 && value.acquiredSourceCount !== 2)
    || value.sourceReceiptSha256s.length !== value.acquiredSourceCount || value.sourceInvocationIntentIds.length !== value.acquiredSourceCount
    || value.sourceProfileSha256s.length !== value.acquiredSourceCount
    || value.sourceToolReceiptSha256s.length !== value.acquiredSourceCount
    || !boundedBytes(value.totalMaterializedBytes) || value.totalMaterializedBytes > CALIBRATION_ACQUISITION_ROUND_MAX_BYTES
    || value.withinAuthorizedCountAndBytes !== true || !sha(value.receiptSha256)) return false;
  try { return calibrationAcquisitionRoundReceiptId(value) === value.receiptId && calibrationAcquisitionRoundReceiptSha256(value) === value.receiptSha256; } catch { return false; }
}

export function isCalibrationAcquisitionRoundLockV1(value: unknown): value is CalibrationAcquisitionRoundLockV1 {
  if (!isRecord(value) || !exactKeys(value, ['version', 'lockId', 'intendedTransactionId', 'roundId', 'orchestratorInvocationIntentId', 'sourceInvocations', 'sourceAuthorizationIds', 'maxTotalMaterializedBytes', 'recoveryNonce', 'lockSha256'])) return false;
  if (value.version !== 'v10.3-acquisition-round-lock-v1' || !sha(value.lockId) || !sha(value.intendedTransactionId) || !sha(value.roundId)
    || !sha(value.orchestratorInvocationIntentId) || !Array.isArray(value.sourceInvocations) || (value.sourceInvocations.length !== 1 && value.sourceInvocations.length !== 2)
    || !value.sourceInvocations.every(sourceInvocation) || !uniqueStrings(value.sourceAuthorizationIds, sha)
    || value.sourceAuthorizationIds.length !== value.sourceInvocations.length || !boundedBytes(value.maxTotalMaterializedBytes, 1)
    || !sha(value.recoveryNonce) || !sha(value.lockSha256)) return false;
  const authorizationIds = value.sourceInvocations.map((entry) => entry.authorizationId);
  if (!arrayEqual(authorizationIds, value.sourceAuthorizationIds)) return false;
  try { return calibrationAcquisitionRoundLockId(value) === value.lockId && calibrationAcquisitionRoundLockSha256(value) === value.lockSha256; } catch { return false; }
}

export function isCalibrationAcquisitionRoundTransactionV1(value: unknown): value is CalibrationAcquisitionRoundTransactionV1 {
  if (!isRecord(value) || !exactKeys(value, ['version', 'transactionId', 'lockSha256', 'roundId', 'orchestratorInvocationIntentId', 'sourceInvocations', 'maxTotalMaterializedBytes', 'reservedMaterializedBytes', 'recoveryNonce', 'sources', 'state', 'transactionSha256'])) return false;
  if (value.version !== 'v10.3-acquisition-round-transaction-v1' || !sha(value.transactionId) || !sha(value.lockSha256) || !sha(value.roundId)
    || !sha(value.orchestratorInvocationIntentId) || !Array.isArray(value.sourceInvocations) || (value.sourceInvocations.length !== 1 && value.sourceInvocations.length !== 2)
    || !value.sourceInvocations.every(sourceInvocation) || !boundedBytes(value.maxTotalMaterializedBytes, 1) || !boundedBytes(value.reservedMaterializedBytes, 1)
    || value.reservedMaterializedBytes > value.maxTotalMaterializedBytes || !sha(value.recoveryNonce) || !Array.isArray(value.sources)
    || (value.sources.length !== 1 && value.sources.length !== 2) || !value.sources.every(sourceTransaction) || !transactionState(value.state) || !sha(value.transactionSha256)) return false;
  const authorizationIds = value.sourceInvocations.map((entry) => entry.authorizationId);
  const sourceIds = value.sources.map((entry) => entry.authorizationId);
  if (!uniqueStrings(authorizationIds, sha) || !uniqueStrings(sourceIds, sha) || !arrayEqual(authorizationIds, sourceIds)) return false;
  const paths = value.sources.flatMap((source) => [source.temporaryRelativePath, source.finalRelativePath, source.networkObservationRelativePath, source.sourceReceiptTemporaryRelativePath, source.sourceReceiptFinalRelativePath, source.materializationReceiptTemporaryRelativePath, source.materializationReceiptFinalRelativePath, source.toolReceiptTemporaryRelativePath]);
  if (new Set(paths).size !== paths.length || value.sources.some((source) => source.temporaryRelativePath === source.finalRelativePath || source.sourceReceiptTemporaryRelativePath === source.sourceReceiptFinalRelativePath || source.materializationReceiptTemporaryRelativePath === source.materializationReceiptFinalRelativePath)) return false;
  try { return calibrationAcquisitionRoundTransactionId(value) === value.transactionId && calibrationAcquisitionRoundTransactionSha256(value) === value.transactionSha256; } catch { return false; }
}

export interface CalibrationAcquisitionRoundGraphInputV1 {
  readonly roundAuthorization: unknown;
  readonly sourceAuthorizations: readonly unknown[];
  readonly sourceReceipts: readonly unknown[];
  readonly roundReceipt: unknown;
  readonly lock: unknown;
  readonly transaction: unknown;
}

export interface CalibrationAcquisitionRoundGraphValidationV1 {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

function transportMatches(authorization: JsonRecord, receipt: JsonRecord): boolean {
  if (!isRecord(authorization.transport) || !isRecord(receipt.transport) || authorization.transport.kind !== receipt.transport.kind) return false;
  if (authorization.transport.kind === 'git_https' && receipt.transport.kind === 'git_https') return authorization.transport.commitSha === receipt.transport.commitSha;
  if (authorization.transport.kind === 'release_https' && receipt.transport.kind === 'release_https') {
    return canonicalEqual(authorization.transport.materialization, receipt.transport.materialization);
  }
  return false;
}

/** Validate the complete offline authority join without performing acquisition or filesystem I/O. */
export function validateCalibrationAcquisitionRoundGraph(input: CalibrationAcquisitionRoundGraphInputV1): CalibrationAcquisitionRoundGraphValidationV1 {
  if (!isRecord(input)) return { ok: false, errors: ['acquisition round graph input is invalid'] };
  const errors: string[] = [];
  const roundAuthorization = isCalibrationAcquisitionRoundAuthorizationV1(input.roundAuthorization) ? input.roundAuthorization : undefined;
  const sourceAuthorizations = Array.isArray(input.sourceAuthorizations) && input.sourceAuthorizations.every(isCalibrationApprovedAcquisitionV1)
    ? input.sourceAuthorizations as CalibrationApprovedAcquisitionV1[] : undefined;
  const sourceReceipts = Array.isArray(input.sourceReceipts) && input.sourceReceipts.every(isCalibrationAcquisitionReceiptV1)
    ? input.sourceReceipts as CalibrationAcquisitionReceiptV1[] : undefined;
  const roundReceipt = isCalibrationAcquisitionRoundReceiptV1(input.roundReceipt) ? input.roundReceipt : undefined;
  const lock = isCalibrationAcquisitionRoundLockV1(input.lock) ? input.lock : undefined;
  const transaction = isCalibrationAcquisitionRoundTransactionV1(input.transaction) ? input.transaction : undefined;
  if (!roundAuthorization) errors.push('round authorization invalid');
  if (!sourceAuthorizations) errors.push('source authorizations invalid');
  if (!sourceReceipts) errors.push('source receipts invalid');
  if (!roundReceipt) errors.push('round receipt invalid');
  if (!lock) errors.push('round lock invalid');
  if (!transaction) errors.push('round transaction invalid');
  if (!roundAuthorization || !sourceAuthorizations || !sourceReceipts || !roundReceipt || !lock || !transaction) return { ok: false, errors };

  const canonicalAuthorizationIds = [...roundAuthorization.sourceAuthorizationIds];
  if (sourceAuthorizations.length !== canonicalAuthorizationIds.length || sourceReceipts.length !== canonicalAuthorizationIds.length) errors.push('source count does not match round authorization');
  const authorizationById = new Map(sourceAuthorizations.map((entry) => [entry.authorizationId, entry]));
  const receiptByAuthorizationId = new Map(sourceReceipts.map((entry) => [entry.authorizationId, entry]));
  const invocationByAuthorizationId = new Map(transaction.sourceInvocations.map((entry) => [entry.authorizationId, entry]));
  const sourceByAuthorizationId = new Map(transaction.sources.map((entry) => [entry.authorizationId, entry]));
  if (authorizationById.size !== sourceAuthorizations.length || receiptByAuthorizationId.size !== sourceReceipts.length
    || invocationByAuthorizationId.size !== transaction.sourceInvocations.length || sourceByAuthorizationId.size !== transaction.sources.length) errors.push('acquisition graph contains duplicate source authorization IDs');
  const orderedSourceAuthorizations = canonicalAuthorizationIds.map((idValue) => authorizationById.get(idValue));
  const orderedSourceReceipts = canonicalAuthorizationIds.map((idValue) => receiptByAuthorizationId.get(idValue));
  const orderedInvocations = canonicalAuthorizationIds.map((idValue) => invocationByAuthorizationId.get(idValue));
  const orderedSources = canonicalAuthorizationIds.map((idValue) => sourceByAuthorizationId.get(idValue));
  if (orderedSourceAuthorizations.some((entry) => entry === undefined) || orderedSourceReceipts.some((entry) => entry === undefined)
    || orderedInvocations.some((entry) => entry === undefined) || orderedSources.some((entry) => entry === undefined)) {
    errors.push('acquisition graph is missing an authorized source tuple');
    return { ok: false, errors };
  }
  const canonicalAuthorizations = orderedSourceAuthorizations as CalibrationApprovedAcquisitionV1[];
  const canonicalReceipts = orderedSourceReceipts as CalibrationAcquisitionReceiptV1[];
  const canonicalInvocations = orderedInvocations as NonNullable<typeof orderedInvocations[number]>[];
  const canonicalSources = orderedSources as NonNullable<typeof orderedSources[number]>[];
  if (sourceReceipts.length !== roundReceipt.acquiredSourceCount || !arrayEqual(canonicalReceipts.map((entry) => entry.receiptSha256), roundReceipt.sourceReceiptSha256s)) errors.push('round receipt does not bind source receipts');
  if (!arrayEqual(canonicalInvocations.map((entry) => entry.invocationIntentId), roundReceipt.sourceInvocationIntentIds)) errors.push('round receipt does not bind child invocation intents');
  if (!arrayEqual(canonicalInvocations.map((entry) => entry.profileSha256), roundReceipt.sourceProfileSha256s)) errors.push('round receipt does not bind child profile hashes');
  if (!arrayEqual(canonicalReceipts.map((entry) => entry.toolReceiptSha256), roundReceipt.sourceToolReceiptSha256s)) errors.push('round receipt does not bind child tool receipts');
  if (roundReceipt.roundId !== roundAuthorization.roundId || roundReceipt.parentCensusSha256 !== roundAuthorization.parentCensusSha256) errors.push('round receipt does not bind authorization census/round');
  if (lock.roundId !== roundAuthorization.roundId || transaction.roundId !== roundAuthorization.roundId || lock.orchestratorInvocationIntentId !== roundReceipt.orchestratorInvocationIntentId || transaction.orchestratorInvocationIntentId !== roundReceipt.orchestratorInvocationIntentId) errors.push('round orchestration identity is inconsistent');
  if (lock.sourceAuthorizationIds.join('\u0000') !== canonicalAuthorizationIds.join('\u0000')) errors.push('lock source authorization set mismatch');
  const lockInvocationByAuthorizationId = new Map(lock.sourceInvocations.map((entry) => [entry.authorizationId, entry]));
  if (lockInvocationByAuthorizationId.size !== lock.sourceInvocations.length
    || canonicalAuthorizationIds.some((idValue, index) => !canonicalEqual(lockInvocationByAuthorizationId.get(idValue), canonicalInvocations[index]))) errors.push('lock and transaction child invocation tuples differ');
  if (lock.intendedTransactionId !== transaction.transactionId || transaction.lockSha256 !== lock.lockSha256) errors.push('lock does not bind transaction identity/hash');
  if (lock.maxTotalMaterializedBytes !== roundAuthorization.maxTotalMaterializedBytes || transaction.maxTotalMaterializedBytes !== roundAuthorization.maxTotalMaterializedBytes) errors.push('acquisition byte cap differs from authorization');
  if (lock.recoveryNonce !== transaction.recoveryNonce) errors.push('lock and transaction recovery nonce differ');
  const authorizedBytes = canonicalAuthorizations.reduce((sum, entry) => sum + entry.maxMaterializedBytes, 0);
  if (transaction.reservedMaterializedBytes !== authorizedBytes || authorizedBytes > roundAuthorization.maxTotalMaterializedBytes) errors.push('reserved bytes do not equal authorized source maxima');
  const receiptBytes = canonicalReceipts.reduce((sum, entry) => sum + entry.materializedBytes, 0);
  if (receiptBytes !== roundReceipt.totalMaterializedBytes || receiptBytes > roundAuthorization.maxTotalMaterializedBytes) errors.push('round receipt byte total is not the source receipt sum/cap');
  for (let index = 0; index < canonicalAuthorizations.length; index += 1) {
    const authorization = canonicalAuthorizations[index]!;
    const receipt = canonicalReceipts[index];
    const invocation = canonicalInvocations[index];
    const source = canonicalSources[index];
    if (!receipt || !invocation || !source) {
      errors.push(`source ${index} transaction/receipt entry is missing`);
      continue;
    }
    if (receipt.authorizationId !== authorization.authorizationId || receipt.authorizationSha256 !== authorization.authorizationSha256) errors.push(`source ${index} receipt does not bind authorization`);
    if (receipt.roundId !== roundAuthorization.roundId || receipt.sourceId !== authorization.sourceId || receipt.repositoryId !== authorization.repositoryId || receipt.materializationId !== authorization.materializationId || receipt.originUrl !== authorization.originUrl || receipt.licenseSha256 !== authorization.licenseSha256) errors.push(`source ${index} receipt identity differs from authorization`);
    if (!transportMatches(authorization as unknown as JsonRecord, receipt as unknown as JsonRecord)) errors.push(`source ${index} receipt transport differs from authorization`);
    if (authorization.transport.kind === 'release_https' && receipt.transport.kind === 'release_https') {
      if (!redirectChainWithinApproved(receipt.transport.redirectChain, authorization.transport.approvedRedirectUrls)) errors.push(`source ${index} receipt redirect chain is not approved`);
      if (receipt.transport.observedTransferBytes > authorization.transport.maxTransferBytes) errors.push(`source ${index} exceeds approved transfer byte limit`);
      if (receipt.transport.materialization.assetBytes > authorization.transport.maxTransferBytes) errors.push(`source ${index} asset exceeds approved transfer byte limit`);
    }
    if (receipt.materializedBytes > authorization.maxMaterializedBytes) errors.push(`source ${index} exceeds its authorization byte limit`);
    if (invocation.authorizationId !== authorization.authorizationId || source.authorizationId !== authorization.authorizationId || source.maxMaterializedBytes !== authorization.maxMaterializedBytes) errors.push(`source ${index} transaction authorization mismatch`);
    if (receipt.transactionId !== transaction.transactionId) errors.push(`source ${index} receipt transaction mismatch`);
    if (!profileMatchesTransport(authorization.transport, invocation.profileId)) errors.push(`source ${index} invocation profile does not match transport`);
    const expectedProfile = authorization.transport.kind === 'git_https' ? 'admission-git-acquire-v1' : 'admission-release-acquire-v1';
    if (!roundReceipt.toolAuthoritySnapshot.profileIds.includes(expectedProfile)
      || !roundReceipt.toolAuthoritySnapshot.invocationIntentIds.includes(invocation.invocationIntentId)
      || !roundReceipt.toolAuthoritySnapshot.receiptIds.includes(receipt.toolReceiptId)
      || invocation.profileId !== expectedProfile
      || !sha(invocation.profileSha256)) errors.push(`source ${index} child authority tuple is not in authority snapshot`);
    const sourceStateValue = source.state as unknown as JsonRecord;
    if (sourceStateValue.phase !== 'not_started' && sourceStateValue.phase !== 'transport_complete') {
      const expectedNetworkObservationSha256 = calibrationAdmissionSha256(receipt.networkObservation);
      if (sourceStateValue.networkObservationSha256 !== expectedNetworkObservationSha256) errors.push(`source ${index} state does not bind network observation`);
    }
    if (sourceStateValue.phase === 'materialization_receipt_staged_fsynced' || sourceStateValue.phase === 'source_receipt_staged_fsynced') {
      if (sourceStateValue.toolAuthorityIndexSha256 !== roundReceipt.toolAuthoritySnapshot.indexGenerationSha256) errors.push(`source ${index} state does not bind tool authority generation`);
      if (sourceStateValue.materializationReceiptId !== receipt.materializationReceiptId || sourceStateValue.materializationReceiptSha256 !== receipt.materializationReceiptSha256
        || sourceStateValue.childToolReceiptId !== receipt.toolReceiptId || sourceStateValue.childToolReceiptSha256 !== receipt.toolReceiptSha256) errors.push(`source ${index} state does not bind materialization/tool receipt`);
    }
    if (sourceStateValue.phase === 'source_receipt_staged_fsynced'
      && (sourceStateValue.sourceReceiptId !== receipt.receiptId || sourceStateValue.sourceReceiptSha256 !== receipt.receiptSha256)) errors.push(`source ${index} state does not bind source receipt`);
  }
  if (!roundReceipt.toolAuthoritySnapshot.profileIds.includes('admission-acquisition-round-v1')
    || !roundReceipt.toolAuthoritySnapshot.invocationIntentIds.includes(roundReceipt.orchestratorInvocationIntentId)
    || !roundReceipt.toolAuthoritySnapshot.receiptIds.includes(roundReceipt.orchestratorToolReceiptId)) errors.push('round receipt orchestrator authority is not present in its snapshot');
  if (transaction.state.phase === 'orchestrator_tool_receipt_indexed' || transaction.state.phase === 'round_receipt_staged_fsynced'
    || transaction.state.phase === 'metadata_publication_complete' || transaction.state.phase === 'complete') {
    if (transaction.state.orchestratorToolReceiptId !== roundReceipt.orchestratorToolReceiptId
      || transaction.state.orchestratorToolReceiptSha256 !== roundReceipt.orchestratorToolReceiptSha256
      || transaction.state.toolAuthorityIndexSha256 !== roundReceipt.toolAuthoritySnapshot.indexGenerationSha256) errors.push('transaction state does not bind orchestrator authority');
  }
  if (transaction.state.phase === 'round_receipt_staged_fsynced' || transaction.state.phase === 'metadata_publication_complete' || transaction.state.phase === 'complete') {
    if (transaction.state.roundReceiptId !== roundReceipt.receiptId || transaction.state.roundReceiptSha256 !== roundReceipt.receiptSha256
      || transaction.state.orchestratorToolReceiptId !== roundReceipt.orchestratorToolReceiptId
      || transaction.state.orchestratorToolReceiptSha256 !== roundReceipt.orchestratorToolReceiptSha256
      || transaction.state.toolAuthorityIndexSha256 !== roundReceipt.toolAuthoritySnapshot.indexGenerationSha256) errors.push('transaction state does not bind round authority receipt');
  }
  return { ok: errors.length === 0, errors };
}
