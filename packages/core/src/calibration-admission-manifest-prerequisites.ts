import { calibrationAdmissionSha256, isCalibrationNestedPublicationHandoffV1 } from './calibration-admission-evidence';
import type { CalibrationAdmissionManifestBuildReceiptV1 } from './generated/calibration-admission-manifest-build-receipt';
import type { CalibrationAdmissionManifestCurrentV1 } from './generated/calibration-admission-manifest-current';
import type { CalibrationAdmissionManifestGenerationV1 } from './generated/calibration-admission-manifest-generation';
import type { CalibrationAdmissionManifestPrerequisitePublicationCompletionV1 } from './generated/calibration-admission-manifest-prerequisite-publication-completion';
import type { CalibrationAdmissionManifestPrerequisitePublicationCurrentV1 } from './generated/calibration-admission-manifest-prerequisite-publication-current';
import type { CalibrationAdmissionManifestPrerequisitePublicationLockV1 } from './generated/calibration-admission-manifest-prerequisite-publication-lock';
import type { CalibrationAdmissionManifestPrerequisitePublicationRequestV1 } from './generated/calibration-admission-manifest-prerequisite-publication-request';
import type { CalibrationAdmissionManifestPrerequisitePublicationTransactionV1 } from './generated/calibration-admission-manifest-prerequisite-publication-transaction';
import type { CalibrationAdmissionManifestPrerequisiteStagingSetV1 } from './generated/calibration-admission-manifest-prerequisite-staging-set';
import type { CalibrationAdmissionManifestPrerequisiteBundleV1 } from './generated/calibration-admission-manifest-prerequisites';
import type { CalibrationAdmissionManifestPublicationLockV1 } from './generated/calibration-admission-manifest-publication-lock';
import type { CalibrationAdmissionManifestPublicationTransactionV1 } from './generated/calibration-admission-manifest-publication-transaction';
import {
  exactKeys,
  isAdmissionId,
  isJsonRecord,
  isSha256,
  sortedUniqueByPredicate,
  withoutJsonKey,
} from './calibration-admission-primitives';

export type {
  CalibrationAdmissionManifestBuildReceiptV1,
  CalibrationAdmissionManifestCurrentV1,
  CalibrationAdmissionManifestGenerationV1,
  CalibrationAdmissionManifestPrerequisitePublicationCompletionV1,
  CalibrationAdmissionManifestPrerequisitePublicationCurrentV1,
  CalibrationAdmissionManifestPrerequisitePublicationLockV1,
  CalibrationAdmissionManifestPrerequisitePublicationRequestV1,
  CalibrationAdmissionManifestPrerequisitePublicationTransactionV1,
  CalibrationAdmissionManifestPrerequisiteStagingSetV1,
  CalibrationAdmissionManifestPrerequisiteBundleV1,
  CalibrationAdmissionManifestPublicationLockV1,
  CalibrationAdmissionManifestPublicationTransactionV1,
};

type JsonObject = Record<string, unknown>;
type ExpectedCurrentState =
  | { readonly kind: 'absent' }
  | { readonly kind: 'existing'; readonly bundleSha256?: string; readonly currentSha256?: string; readonly generationSha256?: string };
type ManifestId = 'v10.3-admission-smoke' | 'v10.3-admission-canary';

export interface CalibrationAdmissionManifestContractValidationV1 {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

const MANIFEST_PREREQUISITE_BUNDLE_VERSION = 'v10.3-admission-manifest-prerequisites-v1';
const STAGING_SET_VERSION = 'v10.3-admission-manifest-prerequisite-staging-set-v1';
const PREREQUISITE_REQUEST_VERSION = 'v10.3-admission-manifest-prerequisite-publication-request-v1';
const PREREQUISITE_LOCK_VERSION = 'v10.3-admission-manifest-prerequisite-publication-lock-v1';
const PREREQUISITE_TRANSACTION_VERSION = 'v10.3-admission-manifest-prerequisite-publication-transaction-v1';
const PREREQUISITE_COMPLETION_VERSION = 'v10.3-admission-manifest-prerequisite-publication-completion-v1';
const PREREQUISITE_CURRENT_VERSION = 'v10.3-admission-manifest-prerequisite-publication-current-v1';
const BUILD_RECEIPT_VERSION = 'v10.3-admission-manifest-build-receipt-v1';
const GENERATION_VERSION = 'v10.3-admission-manifest-generation-v1';
const MANIFEST_CURRENT_VERSION = 'v10.3-admission-manifest-current-v1';
const MANIFEST_LOCK_VERSION = 'v10.3-admission-manifest-publication-lock-v1';
const MANIFEST_TRANSACTION_VERSION = 'v10.3-admission-manifest-publication-transaction-v1';

const PREREQUISITE_PROJECTION_FINAL = 'review/admission/manifest-prerequisites/bundle.json';
const PREREQUISITE_CURRENT_FINAL = 'review/admission/manifest-prerequisites/publications/current.json';
const MANIFEST_LEAF_NAMES = ['manifest.json', 'build-receipt.json', 'generation.json'] as const;
const MANIFEST_IDS = new Set<ManifestId>(['v10.3-admission-smoke', 'v10.3-admission-canary']);
const ARTIFACT_KINDS = new Set([
  'release_plan',
  'release_plan_approval',
  'score_wire_closure_receipt',
  'run_init_receipt',
  'post_scan_receipt',
  'packed_runtime_receipt',
  'package_tarball',
  'manifest_builder',
]);
const MEDIA_TYPES = new Set(['text/markdown', 'application/json', 'application/gzip', 'application/javascript']);
const PREREQUISITE_PHASES = new Set([
  'intent_fsynced',
  'request_staged_fsynced',
  'request_promoted',
  'request_directory_fsynced',
  'artifacts_staged_fsynced',
  'artifacts_promoted',
  'artifact_directories_fsynced',
  'bundle_staged_fsynced',
  'bundle_promoted',
  'bundle_directory_fsynced',
  'projection_staged_fsynced',
  'projection_promoted',
  'projection_directory_fsynced',
]);
const MANIFEST_PHASES = new Set([
  'intent_fsynced',
  'manifest_staged_fsynced',
]);
const MANIFEST_COMPLETION_PHASES = new Set([
  'build_receipt_staged_fsynced',
  'generation_directory_staged_fsynced',
  'generation_directory_promoted',
  'generations_parent_fsynced',
  'current_temporary_fsynced',
  'current_promoted',
  'output_directories_fsynced',
  'complete',
]);

type ArtifactRule = {
  readonly owner: string;
  readonly mediaType: string;
  readonly schemaId: string | null;
};

const ARTIFACT_RULES: Record<string, ArtifactRule> = {
  release_plan: { owner: 'release_asset_plan', mediaType: 'text/markdown', schemaId: null },
  release_plan_approval: { owner: 'release_asset_plan', mediaType: 'application/json', schemaId: 'https://usebrick.dev/schemas/v1/calibration-release-prerequisite-approval.schema.json' },
  score_wire_closure_receipt: { owner: 'score_wire_gate', mediaType: 'application/json', schemaId: 'https://usebrick.dev/schemas/v1/calibration-score-wire-closure-receipt.schema.json' },
  run_init_receipt: { owner: 'run_lifecycle_gate', mediaType: 'application/json', schemaId: 'https://usebrick.dev/schemas/v1/calibration-run-lifecycle-receipt.schema.json' },
  post_scan_receipt: { owner: 'run_lifecycle_gate', mediaType: 'application/json', schemaId: 'https://usebrick.dev/schemas/v1/calibration-run-lifecycle-receipt.schema.json' },
  packed_runtime_receipt: { owner: 'packed_runtime_matrix', mediaType: 'application/json', schemaId: 'https://usebrick.dev/schemas/v1/calibration-packed-runtime-receipt.schema.json' },
  package_tarball: { owner: 'packed_runtime_matrix', mediaType: 'application/gzip', schemaId: null },
  manifest_builder: { owner: 'admission_manifest_builder', mediaType: 'application/javascript', schemaId: null },
};

function validation(ok: boolean, ...errors: string[]): CalibrationAdmissionManifestContractValidationV1 {
  return { ok, errors: [...new Set(errors)] };
}

function relativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096
    || value.startsWith('/') || value.includes('\\') || value.includes('//')) return false;
  return value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..'
    && !/[\u0000-\u001f]/.test(segment));
}

function safeInteger(value: unknown, minimum = 1): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function manifestId(value: unknown): value is ManifestId {
  return typeof value === 'string' && MANIFEST_IDS.has(value as ManifestId);
}

function hashWithout(value: unknown, key: string): string {
  return calibrationAdmissionSha256(withoutJsonKey(value, key));
}

function exactKeysWithOptional(value: JsonObject, required: readonly string[], optional: readonly string[] = []): boolean {
  const presentOptional = optional.filter((key) => key in value);
  return exactKeys(value, [...required, ...presentOptional]);
}

function expectedCurrentState(value: unknown, kind: 'prerequisite' | 'manifest'): value is ExpectedCurrentState {
  if (!isJsonRecord(value)) return false;
  if (kind === 'prerequisite') {
    return value.kind === 'absent'
      ? exactKeys(value, ['kind'])
      : value.kind === 'existing'
        && exactKeys(value, ['kind', 'bundleSha256', 'currentSha256'])
        && isSha256(value.bundleSha256)
        && isSha256(value.currentSha256);
  }
  return value.kind === 'absent'
    ? exactKeys(value, ['kind'])
    : value.kind === 'existing'
      && exactKeys(value, ['kind', 'generationSha256'])
      && isSha256(value.generationSha256);
}

function operationState(operation: unknown, state: unknown): boolean {
  return operation === 'create' || operation === 'replace'
    ? isJsonRecord(state) && ((operation === 'create' && state.kind === 'absent') || (operation === 'replace' && state.kind === 'existing'))
    : false;
}

function artifactRule(value: JsonObject): ArtifactRule | undefined {
  return typeof value.kind === 'string' ? ARTIFACT_RULES[value.kind] : undefined;
}

function artifactShape(value: unknown, source = false): boolean {
  if (!isJsonRecord(value)) return false;
  const base = ['artifactId', 'relativePath', 'bytes', 'sha256', 'kind', 'owner', 'mediaType', 'schemaId'];
  const optional = ['packageTarballArtifactId', 'packageMemberRelativePath'];
  if (!exactKeysWithOptional(value, source ? [...base, 'source'] : base, optional)) return false;
  const rule = artifactRule(value);
  if (!rule || !isAdmissionId(value.artifactId) || !relativePath(value.relativePath)
    || !safeInteger(value.bytes) || !isSha256(value.sha256)
    || value.owner !== rule.owner || value.mediaType !== rule.mediaType || value.schemaId !== rule.schemaId) return false;
  if (value.kind === 'manifest_builder') {
    if (!isAdmissionId(value.packageTarballArtifactId) || !relativePath(value.packageMemberRelativePath)) return false;
  } else if ('packageTarballArtifactId' in value || 'packageMemberRelativePath' in value) return false;
  return true;
}

function artifactList(value: unknown): value is readonly JsonObject[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((entry) => artifactShape(entry))) return false;
  const entries = value as readonly JsonObject[];
  if (!sortedUniqueByPredicate(entries.map((entry) => entry.artifactId), isAdmissionId, false)) return false;
  if (new Set(entries.map((entry) => entry.sha256)).size !== entries.length) return false;
  if (new Set(entries.map((entry) => entry.relativePath)).size !== entries.length) return false;
  return true;
}

function sourceArtifact(value: unknown): boolean {
  if (!artifactShape(value, true) || !isJsonRecord(value)) return false;
  if (!isJsonRecord(value.source)) return false;
  if (value.source.sourceRoot === 'platform_commit') {
    return exactKeys(value.source, ['sourceRoot', 'normalizedRelativePath', 'approvedCommitSha'])
      && relativePath(value.source.normalizedRelativePath)
      && typeof value.source.approvedCommitSha === 'string'
      && /^[a-f0-9]{40}$/.test(value.source.approvedCommitSha);
  }
  return value.source.sourceRoot === 'prerequisite_staging'
    && exactKeys(value.source, ['sourceRoot', 'normalizedRelativePath', 'stagingSetSha256'])
    && relativePath(value.source.normalizedRelativePath)
    && isSha256(value.source.stagingSetSha256);
}

function artifactSetHashInput(value: unknown): unknown {
  if (isJsonRecord(value) && 'referencedArtifacts' in value) return value.referencedArtifacts;
  return value;
}

function stagingSetHashInput(value: unknown): unknown {
  if (isJsonRecord(value) && 'entries' in value) return value.entries;
  return value;
}

function stagingEntry(value: unknown): boolean {
  if (!isJsonRecord(value) || !exactKeys(value, ['artifactId', 'kind', 'mediaType', 'normalizedRelativePath', 'bytes', 'sha256'])) return false;
  const rule = artifactRule(value);
  return !!rule && isAdmissionId(value.artifactId) && value.mediaType === rule.mediaType
    && relativePath(value.normalizedRelativePath) && safeInteger(value.bytes) && isSha256(value.sha256);
}

function stagingEntries(value: unknown): value is readonly JsonObject[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(stagingEntry)) return false;
  const entries = value as readonly JsonObject[];
  const keys = entries.map((entry) => `${entry.normalizedRelativePath}\u0000${entry.artifactId}`);
  return sortedUniqueByPredicate(keys, (entry) => typeof entry === 'string', false);
}

function stateShape(value: unknown, kind: 'prerequisite' | 'manifest'): boolean {
  if (!isJsonRecord(value) || typeof value.phase !== 'string') return false;
  if (kind === 'prerequisite') {
    if (PREREQUISITE_PHASES.has(value.phase)) return exactKeys(value, ['phase']);
    if (value.phase === 'publication_tool_receipt_started') {
      return exactKeys(value, ['phase', 'nestedHandoffSha256', 'childTransactionId', 'childRecoveryNonce'])
        && isSha256(value.nestedHandoffSha256) && isAdmissionId(value.childTransactionId) && isSha256(value.childRecoveryNonce);
    }
    if (value.phase === 'publication_tool_receipt_indexed' || value.phase === 'completion_staged_fsynced'
      || value.phase === 'completion_promoted' || value.phase === 'completion_directory_fsynced'
      || value.phase === 'publication_current_staged_fsynced' || value.phase === 'publication_current_promoted'
      || value.phase === 'publication_current_directory_fsynced' || value.phase === 'complete') {
      return exactKeys(value, ['phase', 'nestedHandoffSha256', 'childTransactionId', 'childRecoveryNonce', 'publicationToolReceiptId', 'publicationToolReceiptSha256', 'toolAuthorityIndexSha256', 'completionSha256', 'completionFinalRelativePath', 'publicationCurrentSha256'])
        && isSha256(value.nestedHandoffSha256) && isAdmissionId(value.childTransactionId) && isSha256(value.childRecoveryNonce)
        && isAdmissionId(value.publicationToolReceiptId) && isSha256(value.publicationToolReceiptSha256)
        && isSha256(value.toolAuthorityIndexSha256) && isSha256(value.completionSha256)
        && relativePath(value.completionFinalRelativePath) && isSha256(value.publicationCurrentSha256);
    }
    return false;
  }
  if (MANIFEST_PHASES.has(value.phase)) return exactKeys(value, ['phase']);
  if (value.phase === 'tool_receipt_publication_started') {
    return exactKeys(value, ['phase', 'nestedHandoffSha256', 'childTransactionId', 'childRecoveryNonce'])
      && isSha256(value.nestedHandoffSha256) && isAdmissionId(value.childTransactionId) && isSha256(value.childRecoveryNonce);
  }
  if (value.phase === 'tool_receipt_indexed') {
    return exactKeys(value, ['phase', 'nestedHandoffSha256', 'childTransactionId', 'childRecoveryNonce', 'toolReceiptId', 'toolReceiptSha256', 'toolAuthorityIndexSha256'])
      && isSha256(value.nestedHandoffSha256) && isAdmissionId(value.childTransactionId) && isSha256(value.childRecoveryNonce)
      && isAdmissionId(value.toolReceiptId) && isSha256(value.toolReceiptSha256) && isSha256(value.toolAuthorityIndexSha256);
  }
  if (!MANIFEST_COMPLETION_PHASES.has(value.phase)) return false;
  return exactKeys(value, ['phase', 'toolReceiptId', 'toolReceiptSha256', 'toolAuthorityIndexSha256', 'nestedHandoffSha256', 'childTransactionId', 'childRecoveryNonce', 'buildReceiptId', 'buildReceiptSha256', 'generationSha256', 'generationDirectoryStagedRelativePath', 'generationDirectoryFinalRelativePath', 'currentTemporaryRelativePath', 'currentFinalRelativePath'])
    && isAdmissionId(value.toolReceiptId) && isSha256(value.toolReceiptSha256) && isSha256(value.toolAuthorityIndexSha256)
    && isSha256(value.nestedHandoffSha256) && isAdmissionId(value.childTransactionId) && isSha256(value.childRecoveryNonce)
    && isAdmissionId(value.buildReceiptId) && isSha256(value.buildReceiptSha256) && isSha256(value.generationSha256)
    && relativePath(value.generationDirectoryStagedRelativePath) && relativePath(value.generationDirectoryFinalRelativePath)
    && relativePath(value.currentTemporaryRelativePath) && relativePath(value.currentFinalRelativePath);
}

export function calibrationAdmissionManifestPrerequisiteArtifactSetSha256(value: unknown): string {
  return calibrationAdmissionSha256(artifactSetHashInput(value));
}

export function calibrationAdmissionManifestPrerequisiteBundleSha256(
  value: Omit<CalibrationAdmissionManifestPrerequisiteBundleV1, 'bundleSha256'> | JsonObject,
): string {
  return hashWithout(value, 'bundleSha256');
}

export function calibrationAdmissionManifestPrerequisiteStagingSetSha256(value: unknown): string {
  return calibrationAdmissionSha256(stagingSetHashInput(value));
}

export function calibrationAdmissionManifestPrerequisitePublicationRequestSha256(value: unknown): string {
  return hashWithout(value, 'requestSha256');
}

export function calibrationAdmissionManifestPrerequisitePublicationLockSha256(value: unknown): string {
  return hashWithout(value, 'lockSha256');
}

export function calibrationAdmissionManifestPrerequisitePublicationTransactionSha256(value: unknown): string {
  return hashWithout(value, 'transactionSha256');
}

export function calibrationAdmissionManifestPrerequisitePublicationCompletionSha256(value: unknown): string {
  return hashWithout(value, 'completionSha256');
}

export function calibrationAdmissionManifestPrerequisitePublicationCurrentSha256(value: unknown): string {
  return hashWithout(value, 'currentSha256');
}

export function calibrationAdmissionManifestBuildReceiptSha256(value: unknown): string {
  return hashWithout(value, 'receiptSha256');
}

export function calibrationAdmissionManifestGenerationSha256(value: unknown): string {
  return hashWithout(value, 'generationSha256');
}

export function calibrationAdmissionManifestCurrentSha256(value: unknown): string {
  return hashWithout(value, 'currentSha256');
}

export function calibrationAdmissionManifestPublicationLockSha256(value: unknown): string {
  return hashWithout(value, 'lockSha256');
}

export function calibrationAdmissionManifestPublicationTransactionSha256(value: unknown): string {
  return hashWithout(value, 'transactionSha256');
}

function isPrerequisiteBundle(value: unknown): value is CalibrationAdmissionManifestPrerequisiteBundleV1 {
  if (!isJsonRecord(value) || !exactKeys(value, ['version', 'bundleId', 'implementationCommitSha', 'manifestBuilder', 'releaseMaterializationTasks1To6', 'scoreWireClosure', 'runLifecycleVerification', 'packedRuntimes', 'referencedArtifacts', 'referencedArtifactSetSha256', 'bundleSha256'])) return false;
  if (value.version !== MANIFEST_PREREQUISITE_BUNDLE_VERSION || !isAdmissionId(value.bundleId)
    || typeof value.implementationCommitSha !== 'string' || !/^[a-f0-9]{40}$/.test(value.implementationCommitSha)
    || !isJsonRecord(value.manifestBuilder) || !exactKeys(value.manifestBuilder, ['behaviorSha256', 'artifactId'])
    || !isSha256(value.manifestBuilder.behaviorSha256) || !isAdmissionId(value.manifestBuilder.artifactId)
    || !isJsonRecord(value.releaseMaterializationTasks1To6) || !exactKeys(value.releaseMaterializationTasks1To6, ['approvedCommitSha', 'planArtifactId', 'approvalReceiptArtifactId'])
    || typeof value.releaseMaterializationTasks1To6.approvedCommitSha !== 'string' || !/^[a-f0-9]{40}$/.test(value.releaseMaterializationTasks1To6.approvedCommitSha)
    || !isAdmissionId(value.releaseMaterializationTasks1To6.planArtifactId) || !isAdmissionId(value.releaseMaterializationTasks1To6.approvalReceiptArtifactId)
    || !isJsonRecord(value.scoreWireClosure) || !exactKeys(value.scoreWireClosure, ['approvedCommitSha', 'closureReceiptArtifactId'])
    || typeof value.scoreWireClosure.approvedCommitSha !== 'string' || !/^[a-f0-9]{40}$/.test(value.scoreWireClosure.approvedCommitSha) || !isAdmissionId(value.scoreWireClosure.closureReceiptArtifactId)
    || !isJsonRecord(value.runLifecycleVerification) || !exactKeys(value.runLifecycleVerification, ['approvedCommitSha', 'runInitReceiptArtifactId', 'postScanReceiptArtifactId'])
    || typeof value.runLifecycleVerification.approvedCommitSha !== 'string' || !/^[a-f0-9]{40}$/.test(value.runLifecycleVerification.approvedCommitSha)
    || !isAdmissionId(value.runLifecycleVerification.runInitReceiptArtifactId) || !isAdmissionId(value.runLifecycleVerification.postScanReceiptArtifactId)
    || !Array.isArray(value.packedRuntimes) || value.packedRuntimes.length !== 2
    || !value.packedRuntimes.every((entry, index) => isJsonRecord(entry) && exactKeys(entry, ['nodeMajor', 'tarballArtifactId', 'receiptArtifactId'])
      && entry.nodeMajor === (index === 0 ? 22 : 24) && isAdmissionId(entry.tarballArtifactId) && isAdmissionId(entry.receiptArtifactId))
    || !artifactList(value.referencedArtifacts) || !isSha256(value.referencedArtifactSetSha256) || !isSha256(value.bundleSha256)) return false;
  try {
    return calibrationAdmissionManifestPrerequisiteArtifactSetSha256(value) === value.referencedArtifactSetSha256
      && calibrationAdmissionManifestPrerequisiteBundleSha256(value) === value.bundleSha256;
  } catch {
    return false;
  }
}

function isStagingSet(value: unknown): value is CalibrationAdmissionManifestPrerequisiteStagingSetV1 {
  return isJsonRecord(value) && exactKeys(value, ['version', 'entries', 'stagingSetSha256'])
    && value.version === STAGING_SET_VERSION && stagingEntries(value.entries) && isSha256(value.stagingSetSha256)
    && calibrationAdmissionManifestPrerequisiteStagingSetSha256(value) === value.stagingSetSha256;
}

function isPrerequisiteRequest(value: unknown): value is CalibrationAdmissionManifestPrerequisitePublicationRequestV1 {
  if (!isJsonRecord(value) || !exactKeys(value, ['version', 'requestId', 'operation', 'expectedCurrentState', 'sourceArtifacts', 'stagingSet', 'bundle', 'requestSha256'])) return false;
  if (value.version !== PREREQUISITE_REQUEST_VERSION || !isAdmissionId(value.requestId) || !expectedCurrentState(value.expectedCurrentState, 'prerequisite')
    || !operationState(value.operation, value.expectedCurrentState) || !Array.isArray(value.sourceArtifacts)
    || value.sourceArtifacts.length === 0 || !value.sourceArtifacts.every(sourceArtifact)
    || !sortedUniqueByPredicate(value.sourceArtifacts.map((entry) => (entry as JsonObject).artifactId), isAdmissionId, false)
    || !isStagingSet(value.stagingSet) || !isPrerequisiteBundle(value.bundle) || !isSha256(value.requestSha256)) return false;
  const sourceIds = new Set(value.sourceArtifacts.map((entry) => (entry as JsonObject).artifactId));
  const bundleIds = new Set((value.bundle.referencedArtifacts as readonly JsonObject[]).map((entry) => entry.artifactId));
  if (sourceIds.size !== bundleIds.size || [...sourceIds].some((id) => !bundleIds.has(id))) return false;
  try { return calibrationAdmissionManifestPrerequisitePublicationRequestSha256(value) === value.requestSha256; } catch { return false; }
}

function isPrerequisiteLock(value: unknown): value is CalibrationAdmissionManifestPrerequisitePublicationLockV1 {
  if (!isJsonRecord(value) || !exactKeys(value, ['version', 'lockId', 'intendedTransactionId', 'invocationIntentId', 'requestId', 'requestSha256', 'operation', 'expectedCurrentState', 'nextBundleSha256', 'artifactSetSha256', 'recoveryNonce', 'lockSha256'])) return false;
  if (value.version !== PREREQUISITE_LOCK_VERSION || !isAdmissionId(value.lockId) || !isAdmissionId(value.intendedTransactionId)
    || !isSha256(value.invocationIntentId) || !isAdmissionId(value.requestId) || !isSha256(value.requestSha256)
    || !expectedCurrentState(value.expectedCurrentState, 'prerequisite') || !operationState(value.operation, value.expectedCurrentState)
    || !isSha256(value.nextBundleSha256) || !isSha256(value.artifactSetSha256) || !isSha256(value.recoveryNonce) || !isSha256(value.lockSha256)) return false;
  try { return calibrationAdmissionManifestPrerequisitePublicationLockSha256(value) === value.lockSha256; } catch { return false; }
}

function isPrerequisiteTransaction(value: unknown): value is CalibrationAdmissionManifestPrerequisitePublicationTransactionV1 {
  if (!isJsonRecord(value) || !exactKeys(value, ['version', 'transactionId', 'lockSha256', 'invocationIntentId', 'requestId', 'requestSha256', 'operation', 'expectedCurrentState', 'nextBundleSha256', 'artifactSetSha256', 'requestTemporaryRelativePath', 'requestFinalRelativePath', 'artifacts', 'bundleTemporaryRelativePath', 'bundleFinalRelativePath', 'projectionTemporaryRelativePath', 'projectionFinalRelativePath', 'completionTemporaryRelativePath', 'publicationCurrentTemporaryRelativePath', 'publicationCurrentFinalRelativePath', 'recoveryNonce', 'state', 'transactionSha256'])) return false;
  if (value.version !== PREREQUISITE_TRANSACTION_VERSION || !isAdmissionId(value.transactionId) || !isSha256(value.lockSha256)
    || !isSha256(value.invocationIntentId) || !isAdmissionId(value.requestId) || !isSha256(value.requestSha256)
    || !expectedCurrentState(value.expectedCurrentState, 'prerequisite') || !operationState(value.operation, value.expectedCurrentState)
    || !isSha256(value.nextBundleSha256) || !isSha256(value.artifactSetSha256) || !relativePath(value.requestTemporaryRelativePath)
    || !relativePath(value.requestFinalRelativePath) || !Array.isArray(value.artifacts) || value.artifacts.length === 0
    || !value.artifacts.every((entry) => isJsonRecord(entry) && exactKeys(entry, ['artifactId', 'stagedRelativePath', 'finalRelativePath', 'bytes', 'sha256'])
      && isAdmissionId(entry.artifactId) && relativePath(entry.stagedRelativePath) && relativePath(entry.finalRelativePath)
      && entry.stagedRelativePath !== entry.finalRelativePath && safeInteger(entry.bytes) && isSha256(entry.sha256))
    || !sortedUniqueByPredicate(value.artifacts.map((entry) => (entry as JsonObject).artifactId), isAdmissionId, false)
    || !relativePath(value.bundleTemporaryRelativePath) || !relativePath(value.bundleFinalRelativePath)
    || !relativePath(value.projectionTemporaryRelativePath) || value.projectionFinalRelativePath !== PREREQUISITE_PROJECTION_FINAL
    || !relativePath(value.completionTemporaryRelativePath) || !relativePath(value.publicationCurrentTemporaryRelativePath)
    || value.publicationCurrentFinalRelativePath !== PREREQUISITE_CURRENT_FINAL || !isSha256(value.recoveryNonce)
    || !stateShape(value.state, 'prerequisite') || !isSha256(value.transactionSha256)) return false;
  try { return calibrationAdmissionManifestPrerequisitePublicationTransactionSha256(value) === value.transactionSha256; } catch { return false; }
}

function isPrerequisiteCompletion(value: unknown): value is CalibrationAdmissionManifestPrerequisitePublicationCompletionV1 {
  if (!isJsonRecord(value) || !exactKeys(value, ['version', 'requestId', 'requestSha256', 'requestRelativePath', 'transactionId', 'invocationIntentId', 'bundleRelativePath', 'bundleSha256', 'artifactSetSha256', 'namedPrimaryOutputProjectionSha256', 'publicationToolReceiptId', 'publicationToolReceiptSha256', 'toolAuthorityIndexSha256', 'nestedHandoff', 'completionSha256'])) return false;
  if (value.version !== PREREQUISITE_COMPLETION_VERSION || !isAdmissionId(value.requestId) || !isSha256(value.requestSha256)
    || !relativePath(value.requestRelativePath) || !isAdmissionId(value.transactionId) || !isSha256(value.invocationIntentId)
    || !relativePath(value.bundleRelativePath) || !isSha256(value.bundleSha256) || !isSha256(value.artifactSetSha256)
    || !isSha256(value.namedPrimaryOutputProjectionSha256) || !isAdmissionId(value.publicationToolReceiptId)
    || !isSha256(value.publicationToolReceiptSha256) || !isSha256(value.toolAuthorityIndexSha256)
    || !isCalibrationNestedPublicationHandoffV1(value.nestedHandoff) || !isSha256(value.completionSha256)) return false;
  try { return calibrationAdmissionManifestPrerequisitePublicationCompletionSha256(value) === value.completionSha256; } catch { return false; }
}

function isPrerequisiteCurrent(value: unknown): value is CalibrationAdmissionManifestPrerequisitePublicationCurrentV1 {
  if (!isJsonRecord(value) || !exactKeys(value, ['version', 'bundleRelativePath', 'bundleSha256', 'completionRelativePath', 'completionSha256', 'currentSha256'])) return false;
  if (value.version !== PREREQUISITE_CURRENT_VERSION || !relativePath(value.bundleRelativePath) || !isSha256(value.bundleSha256)
    || !relativePath(value.completionRelativePath) || !isSha256(value.completionSha256) || !isSha256(value.currentSha256)) return false;
  try { return calibrationAdmissionManifestPrerequisitePublicationCurrentSha256(value) === value.currentSha256; } catch { return false; }
}

function isBuildReceipt(value: unknown): value is CalibrationAdmissionManifestBuildReceiptV1 {
  if (!isJsonRecord(value) || !exactKeys(value, ['version', 'receiptId', 'manifestId', 'manifestSha256', 'manifestRelativePath', 'prerequisiteBundleSha256', 'prerequisiteBundleRelativePath', 'prerequisitePublicationCompletionSha256', 'prerequisitePublicationCompletionRelativePath', 'prerequisitePublicationRequestSha256', 'prerequisitePublicationRequestRelativePath', 'manifestBuilderBehaviorSha256', 'packedRuntimeReceiptSetSha256', 'readyCensusSha256', 'witnessReviewBundleSha256', 'invocationIntentId', 'toolReceiptSha256', 'nestedHandoff', 'expectedCurrentState', 'transactionId', 'receiptSha256'])) return false;
  if (value.version !== BUILD_RECEIPT_VERSION || !isAdmissionId(value.receiptId) || !manifestId(value.manifestId) || !isSha256(value.manifestSha256)
    || value.manifestRelativePath !== 'manifest.json' || !isSha256(value.prerequisiteBundleSha256) || !relativePath(value.prerequisiteBundleRelativePath)
    || !isSha256(value.prerequisitePublicationCompletionSha256) || !relativePath(value.prerequisitePublicationCompletionRelativePath)
    || !isSha256(value.prerequisitePublicationRequestSha256) || !relativePath(value.prerequisitePublicationRequestRelativePath)
    || !isSha256(value.manifestBuilderBehaviorSha256) || !isSha256(value.packedRuntimeReceiptSetSha256) || !isSha256(value.readyCensusSha256)
    || !isSha256(value.witnessReviewBundleSha256) || !isSha256(value.invocationIntentId) || !isSha256(value.toolReceiptSha256)
    || !isCalibrationNestedPublicationHandoffV1(value.nestedHandoff) || !expectedCurrentState(value.expectedCurrentState, 'manifest')
    || !isAdmissionId(value.transactionId) || !isSha256(value.receiptSha256)) return false;
  try { return calibrationAdmissionManifestBuildReceiptSha256(value) === value.receiptSha256; } catch { return false; }
}

function isGeneration(value: unknown): value is CalibrationAdmissionManifestGenerationV1 {
  if (!isJsonRecord(value) || !exactKeysWithOptional(value, ['version', 'manifestId', 'generation', 'manifestSha256', 'manifestRelativePath', 'buildReceiptSha256', 'buildReceiptRelativePath', 'generationSha256'], ['parentGenerationSha256'])) return false;
  if (value.version !== GENERATION_VERSION || !manifestId(value.manifestId) || !safeInteger(value.generation) || (value.parentGenerationSha256 !== undefined && !isSha256(value.parentGenerationSha256))
    || !isSha256(value.manifestSha256) || value.manifestRelativePath !== 'manifest.json' || !isSha256(value.buildReceiptSha256)
    || value.buildReceiptRelativePath !== 'build-receipt.json' || !isSha256(value.generationSha256)) return false;
  try { return calibrationAdmissionManifestGenerationSha256(value) === value.generationSha256; } catch { return false; }
}

function isManifestCurrent(value: unknown): value is CalibrationAdmissionManifestCurrentV1 {
  if (!isJsonRecord(value) || !exactKeys(value, ['version', 'manifestId', 'generation', 'generationSha256', 'generationRelativePath', 'currentSha256'])) return false;
  if (value.version !== MANIFEST_CURRENT_VERSION || !manifestId(value.manifestId) || !safeInteger(value.generation)
    || !isSha256(value.generationSha256) || !relativePath(value.generationRelativePath) || !isSha256(value.currentSha256)) return false;
  try { return calibrationAdmissionManifestCurrentSha256(value) === value.currentSha256; } catch { return false; }
}

function isManifestLock(value: unknown): value is CalibrationAdmissionManifestPublicationLockV1 {
  if (!isJsonRecord(value) || !exactKeys(value, ['version', 'lockId', 'intendedTransactionId', 'invocationIntentId', 'manifestId', 'operation', 'expectedCurrentState', 'manifestSha256', 'prerequisiteBundleSha256', 'recoveryNonce', 'lockSha256'])) return false;
  if (value.version !== MANIFEST_LOCK_VERSION || !isAdmissionId(value.lockId) || !isAdmissionId(value.intendedTransactionId)
    || !isSha256(value.invocationIntentId) || !manifestId(value.manifestId) || !operationState(value.operation, value.expectedCurrentState)
    || !expectedCurrentState(value.expectedCurrentState, 'manifest') || !isSha256(value.manifestSha256) || !isSha256(value.prerequisiteBundleSha256)
    || !isSha256(value.recoveryNonce) || !isSha256(value.lockSha256)) return false;
  try { return calibrationAdmissionManifestPublicationLockSha256(value) === value.lockSha256; } catch { return false; }
}

function isManifestTransaction(value: unknown): value is CalibrationAdmissionManifestPublicationTransactionV1 {
  if (!isJsonRecord(value) || !exactKeys(value, ['version', 'transactionId', 'lockSha256', 'invocationIntentId', 'manifestId', 'operation', 'expectedCurrentState', 'manifestSha256', 'prerequisiteBundleSha256', 'manifestStagingRelativePath', 'buildReceiptStagingRelativePath', 'generationLeafNames', 'recoveryNonce', 'state', 'transactionSha256'])) return false;
  if (value.version !== MANIFEST_TRANSACTION_VERSION || !isAdmissionId(value.transactionId) || !isSha256(value.lockSha256)
    || !isSha256(value.invocationIntentId) || !manifestId(value.manifestId) || !expectedCurrentState(value.expectedCurrentState, 'manifest')
    || !operationState(value.operation, value.expectedCurrentState) || !isSha256(value.manifestSha256) || !isSha256(value.prerequisiteBundleSha256)
    || !relativePath(value.manifestStagingRelativePath) || !relativePath(value.buildReceiptStagingRelativePath)
    || !Array.isArray(value.generationLeafNames) || value.generationLeafNames.length !== 3
    || value.generationLeafNames.some((name, index) => name !== MANIFEST_LEAF_NAMES[index]) || !isSha256(value.recoveryNonce)
    || !stateShape(value.state, 'manifest') || !isSha256(value.transactionSha256)) return false;
  try { return calibrationAdmissionManifestPublicationTransactionSha256(value) === value.transactionSha256; } catch { return false; }
}

function guard<T>(label: string, predicate: (value: unknown) => boolean, value: unknown): CalibrationAdmissionManifestContractValidationV1 {
  try { return predicate(value) ? validation(true) : validation(false, `${label} contract is invalid`); } catch { return validation(false, `${label} contract validation failed closed`); }
}

export function validateCalibrationAdmissionManifestPrerequisiteBundleV1(value: unknown): CalibrationAdmissionManifestContractValidationV1 { return guard('manifest prerequisite bundle', isPrerequisiteBundle, value); }
export function validateCalibrationAdmissionManifestPrerequisiteStagingSetV1(value: unknown): CalibrationAdmissionManifestContractValidationV1 { return guard('manifest prerequisite staging set', isStagingSet, value); }
export function validateCalibrationAdmissionManifestPrerequisitePublicationRequestV1(value: unknown): CalibrationAdmissionManifestContractValidationV1 { return guard('manifest prerequisite publication request', isPrerequisiteRequest, value); }
export function validateCalibrationAdmissionManifestPrerequisitePublicationLockV1(value: unknown): CalibrationAdmissionManifestContractValidationV1 { return guard('manifest prerequisite publication lock', isPrerequisiteLock, value); }
export function validateCalibrationAdmissionManifestPrerequisitePublicationTransactionV1(value: unknown): CalibrationAdmissionManifestContractValidationV1 { return guard('manifest prerequisite publication transaction', isPrerequisiteTransaction, value); }
export function validateCalibrationAdmissionManifestPrerequisitePublicationCompletionV1(value: unknown): CalibrationAdmissionManifestContractValidationV1 { return guard('manifest prerequisite publication completion', isPrerequisiteCompletion, value); }
export function validateCalibrationAdmissionManifestPrerequisitePublicationCurrentV1(value: unknown): CalibrationAdmissionManifestContractValidationV1 { return guard('manifest prerequisite publication current', isPrerequisiteCurrent, value); }
export function validateCalibrationAdmissionManifestBuildReceiptV1(value: unknown): CalibrationAdmissionManifestContractValidationV1 { return guard('manifest build receipt', isBuildReceipt, value); }
export function validateCalibrationAdmissionManifestGenerationV1(value: unknown): CalibrationAdmissionManifestContractValidationV1 { return guard('manifest generation', isGeneration, value); }
export function validateCalibrationAdmissionManifestCurrentV1(value: unknown): CalibrationAdmissionManifestContractValidationV1 { return guard('manifest current', isManifestCurrent, value); }
export function validateCalibrationAdmissionManifestPublicationLockV1(value: unknown): CalibrationAdmissionManifestContractValidationV1 { return guard('manifest publication lock', isManifestLock, value); }
export function validateCalibrationAdmissionManifestPublicationTransactionV1(value: unknown): CalibrationAdmissionManifestContractValidationV1 { return guard('manifest publication transaction', isManifestTransaction, value); }

export function isCalibrationAdmissionManifestPrerequisiteBundleV1(value: unknown): value is CalibrationAdmissionManifestPrerequisiteBundleV1 { return validateCalibrationAdmissionManifestPrerequisiteBundleV1(value).ok; }
export function isCalibrationAdmissionManifestPrerequisiteStagingSetV1(value: unknown): value is CalibrationAdmissionManifestPrerequisiteStagingSetV1 { return validateCalibrationAdmissionManifestPrerequisiteStagingSetV1(value).ok; }
export function isCalibrationAdmissionManifestPrerequisitePublicationRequestV1(value: unknown): value is CalibrationAdmissionManifestPrerequisitePublicationRequestV1 { return validateCalibrationAdmissionManifestPrerequisitePublicationRequestV1(value).ok; }
export function isCalibrationAdmissionManifestPrerequisitePublicationLockV1(value: unknown): value is CalibrationAdmissionManifestPrerequisitePublicationLockV1 { return validateCalibrationAdmissionManifestPrerequisitePublicationLockV1(value).ok; }
export function isCalibrationAdmissionManifestPrerequisitePublicationTransactionV1(value: unknown): value is CalibrationAdmissionManifestPrerequisitePublicationTransactionV1 { return validateCalibrationAdmissionManifestPrerequisitePublicationTransactionV1(value).ok; }
export function isCalibrationAdmissionManifestPrerequisitePublicationCompletionV1(value: unknown): value is CalibrationAdmissionManifestPrerequisitePublicationCompletionV1 { return validateCalibrationAdmissionManifestPrerequisitePublicationCompletionV1(value).ok; }
export function isCalibrationAdmissionManifestPrerequisitePublicationCurrentV1(value: unknown): value is CalibrationAdmissionManifestPrerequisitePublicationCurrentV1 { return validateCalibrationAdmissionManifestPrerequisitePublicationCurrentV1(value).ok; }
export function isCalibrationAdmissionManifestBuildReceiptV1(value: unknown): value is CalibrationAdmissionManifestBuildReceiptV1 { return validateCalibrationAdmissionManifestBuildReceiptV1(value).ok; }
export function isCalibrationAdmissionManifestGenerationV1(value: unknown): value is CalibrationAdmissionManifestGenerationV1 { return validateCalibrationAdmissionManifestGenerationV1(value).ok; }
export function isCalibrationAdmissionManifestCurrentV1(value: unknown): value is CalibrationAdmissionManifestCurrentV1 { return validateCalibrationAdmissionManifestCurrentV1(value).ok; }
export function isCalibrationAdmissionManifestPublicationLockV1(value: unknown): value is CalibrationAdmissionManifestPublicationLockV1 { return validateCalibrationAdmissionManifestPublicationLockV1(value).ok; }
export function isCalibrationAdmissionManifestPublicationTransactionV1(value: unknown): value is CalibrationAdmissionManifestPublicationTransactionV1 { return validateCalibrationAdmissionManifestPublicationTransactionV1(value).ok; }
