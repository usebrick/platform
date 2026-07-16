import { createHash } from 'node:crypto';
import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionSha256,
} from './calibration-admission-evidence';
import type { AdmissionNormalizerRegistryV1 } from './generated/calibration-admission-normalizer-registry';
import type { AdmissionOverlapUniverseRecordV1 } from './generated/calibration-admission-overlap-universe-record';
import type { AdmissionOverlapUniverseV1 } from './generated/calibration-admission-overlap-universe';
import type { AdmissionOverlapPolicyV1 } from './generated/calibration-admission-overlap-policy';
import {
  exactKeys,
  isAdmissionId,
  isJsonRecord,
  isSha256,
  sortedUniqueByPredicate,
  withoutJsonKey,
} from './calibration-admission-primitives';

/** Core-only contracts for the first bounded Task 2A slice.
 *
 * This module validates the immutable overlap inputs. It intentionally does
 * not read files, resolve bytes, build postings, or publish a generation.
 * Those are SlopBrick-owned runtime concerns in later Task 2A slices.
 */

export type {
  AdmissionNormalizerRegistryV1,
  AdmissionOverlapUniverseRecordV1,
  AdmissionOverlapUniverseV1,
  AdmissionOverlapPolicyV1,
};

export type AdmissionOverlapSideV1 = 'ai_side' | 'human_side' | 'unassigned';
export type AdmissionOverlapNormalizationStatusV1 = 'covered' | 'unsupported' | 'unreadable';

/**
 * Locator values cross filesystem, archive, and log boundaries. Keep them in
 * the printable ASCII range so control bytes cannot create ambiguous
 * selectors (including NUL, TAB, and DEL) in downstream resolvers.
 */
const SAFE_PRINTABLE = /^[\x20-\x7e]+$/;
const RELATIVE_PATH = /^(?=[\x20-\x7e]+$)(?!\/)(?!.*\\)(?!.*\/\/)(?!.*(?:^|\/)\.\.?(?:\/|$)).+$/;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const POLICY_VERSION = 'v10.3-admission-overlap-policy-v1';
const POLICY_METHOD = 'prefix-filter-exact-jaccard-0.80-v1';
const NORMALIZER_VERSION = 'v10.3-admission-normalizers-v1';
const RECORD_VERSION = 'v10.3-overlap-universe-record-v1';
const UNIVERSE_VERSION = 'v10.3-admission-overlap-universe-v1';
const LIMITS = Object.freeze({
  maxUnitBytes: 33_554_432,
  maxShardBytes: 67_108_864,
  maxOpenFiles: 64,
  maxHeapBytes: 4_294_967_296,
  maxRssBytes: 6_442_450_944,
  maxWorkBytes: 214_748_364_800,
  maxWallMilliseconds: 86_400_000,
});

export interface AdmissionOverlapContractValidationV1 {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

export interface AdmissionOverlapUniverseStreamValidationV1 extends AdmissionOverlapContractValidationV1 {
  readonly recordCount: number;
  readonly covered: number;
  readonly unsupported: number;
  readonly unreadable: number;
  readonly candidateUnitIds: readonly string[];
  readonly unresolvedCandidateUnitIds: readonly string[];
}

function result(ok: boolean, errors: readonly string[]): AdmissionOverlapContractValidationV1 {
  return { ok, errors };
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function safeInteger(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= MAX_SAFE;
}

function nonEmpty(value: unknown, maximum = 512): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function relativePath(value: unknown): value is string {
  return typeof value === 'string' && RELATIVE_PATH.test(value);
}

function safePrintableSelector(value: unknown, maximum: number): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maximum
    && SAFE_PRINTABLE.test(value);
}

function sortedUniqueIds(value: unknown, allowEmpty = false): value is readonly string[] {
  return sortedUniqueByPredicate(value, isAdmissionId, allowEmpty);
}

function sortedUniqueShas(value: unknown, allowEmpty = true): value is readonly string[] {
  return sortedUniqueByPredicate(value, isSha256, allowEmpty);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function selfHash(value: unknown, key: string): string {
  return calibrationAdmissionSha256(withoutJsonKey(value, key));
}

function expectedSide(
  intake: unknown,
  proposedLabel: unknown,
): AdmissionOverlapSideV1 | undefined {
  if (proposedLabel === 'verified_ai') return 'ai_side';
  if (proposedLabel === 'verified_human') return 'human_side';
  if (proposedLabel === 'mixed' || proposedLabel === 'quarantine') return 'unassigned';
  if (proposedLabel !== undefined) return undefined;
  if (intake === 'declared_ai') return 'ai_side';
  if (intake === 'declared_human') return 'human_side';
  if (intake === 'unassigned') return 'unassigned';
  return undefined;
}

function validateLocator(value: unknown, errors: string[]): boolean {
  if (!isJsonRecord(value) || typeof value.kind !== 'string') {
    errors.push('locator must be an object with a known kind');
    return false;
  }
  if (value.kind === 'materialized_file') {
    const shape = exactKeys(value, ['kind', 'materializationId', 'normalizedPath']);
    if (!shape || !isAdmissionId(value.materializationId) || !relativePath(value.normalizedPath)) {
      errors.push('materialized_file locator is invalid');
      return false;
    }
    return true;
  }
  if (value.kind === 'record_container') {
    const shape = exactKeys(value, ['kind', 'materializationId', 'containerSha256', 'rowKey', 'field']);
    if (!shape || !isAdmissionId(value.materializationId) || !isSha256(value.containerSha256)
      || !safePrintableSelector(value.rowKey, 512) || !safePrintableSelector(value.field, 128)) {
      errors.push('record_container locator is invalid');
      return false;
    }
    return true;
  }
  if (value.kind === 'local_inventory_file') {
    const shape = exactKeys(value, ['kind', 'localSourceId', 'normalizedPath']);
    if (!shape || !isAdmissionId(value.localSourceId) || !relativePath(value.normalizedPath)) {
      errors.push('local_inventory_file locator is invalid');
      return false;
    }
    return true;
  }
  errors.push('locator.kind is unsupported');
  return false;
}

function validateNormalizerEntry(value: unknown, errors: string[]): boolean {
  if (!isJsonRecord(value) || !exactKeys(value, [
    'language', 'normalizerId', 'implementationSha256', 'fixturesSha256', 'utf8Policy', 'shingleSize',
  ])) {
    errors.push('normalizer entry shape is invalid');
    return false;
  }
  const ok = nonEmpty(value.language, 128)
    && isAdmissionId(value.normalizerId)
    && isSha256(value.implementationSha256)
    && isSha256(value.fixturesSha256)
    && value.utf8Policy === 'strict'
    && value.shingleSize === 5;
  if (!ok) errors.push(`normalizer entry ${String(value.language)} is invalid`);
  return ok;
}

function normalizerShape(value: unknown, errors: string[]): value is AdmissionNormalizerRegistryV1 {
  if (!isJsonRecord(value) || !exactKeys(value, ['version', 'entries', 'registrySha256'])) {
    errors.push('normalizer registry shape is invalid');
    return false;
  }
  if (value.version !== NORMALIZER_VERSION) errors.push('normalizer registry version is invalid');
  if (!Array.isArray(value.entries) || value.entries.length === 0) {
    errors.push('normalizer registry entries must be non-empty');
    return false;
  }
  let previousLanguage = '';
  let entriesOk = true;
  for (const entry of value.entries) {
    if (!validateNormalizerEntry(entry, errors)) {
      entriesOk = false;
      continue;
    }
    const language = (entry as { language: string }).language;
    if (language <= previousLanguage) {
      errors.push('normalizer registry entries must be sorted and unique by language');
      entriesOk = false;
    }
    previousLanguage = language;
  }
  if (!isSha256(value.registrySha256)) errors.push('registrySha256 must be sha256');
  return value.version === NORMALIZER_VERSION && entriesOk && isSha256(value.registrySha256);
}

export function calibrationAdmissionNormalizerRegistrySha256(
  value: Omit<AdmissionNormalizerRegistryV1, 'registrySha256'> | Record<string, unknown>,
): string {
  return selfHash(value, 'registrySha256');
}

interface NormalizerRegistryInspection {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly registry?: AdmissionNormalizerRegistryV1;
  readonly canonicalSha256?: string;
}

/** Validate and hash a registry once so stream validation can reuse its map. */
function inspectNormalizerRegistry(value: unknown): NormalizerRegistryInspection {
  const errors: string[] = [];
  if (!normalizerShape(value, errors)) return { ok: false, errors };
  let canonicalSha256: string;
  try {
    canonicalSha256 = calibrationAdmissionNormalizerRegistrySha256(value as unknown as Record<string, unknown>);
  } catch {
    errors.push('registrySha256 cannot be recomputed');
    return { ok: false, errors };
  }
  if (canonicalSha256 !== value.registrySha256) {
    errors.push('registrySha256 does not match canonical registry bytes');
  }
  return {
    ok: errors.length === 0,
    errors,
    registry: value,
    canonicalSha256,
  };
}

export function validateCalibrationAdmissionNormalizerRegistryV1(value: unknown): AdmissionOverlapContractValidationV1 {
  const validation = inspectNormalizerRegistry(value);
  return result(validation.ok, validation.errors);
}

export function isCalibrationAdmissionNormalizerRegistryV1(value: unknown): value is AdmissionNormalizerRegistryV1 {
  return validateCalibrationAdmissionNormalizerRegistryV1(value).ok;
}

function polarityShape(value: unknown, errors: string[]): boolean {
  if (!isJsonRecord(value)) {
    errors.push('polarity must be an object');
    return false;
  }
  const optional = hasOwn(value, 'proposedLabel') ? ['proposedLabel'] : [];
  if (!exactKeys(value, ['intake', 'overlapSide', 'bindingAuthority', 'bindingSha256', ...optional])) {
    errors.push('polarity has unexpected or missing keys');
    return false;
  }
  const validIntake = value.intake === 'declared_ai' || value.intake === 'declared_human' || value.intake === 'unassigned';
  const validLabel = value.proposedLabel === undefined
    || value.proposedLabel === 'verified_ai'
    || value.proposedLabel === 'verified_human'
    || value.proposedLabel === 'mixed'
    || value.proposedLabel === 'quarantine';
  const validSide = value.overlapSide === 'ai_side' || value.overlapSide === 'human_side' || value.overlapSide === 'unassigned';
  const validAuthority = value.bindingAuthority === 'legacy-selected-inventory'
    || value.bindingAuthority === 'admission-record'
    || value.bindingAuthority === 'registered-unassigned-candidate';
  const valid = validIntake && validLabel && validSide && validAuthority && isSha256(value.bindingSha256);
  if (!valid) errors.push('polarity fields are invalid');
  if (validIntake && validLabel && validSide && value.overlapSide !== expectedSide(value.intake, value.proposedLabel)) {
    errors.push('overlapSide does not match the authoritative intake/label binding');
  }
  if (isSha256(value.bindingSha256)) {
    try {
      if (calibrationAdmissionSha256(withoutJsonKey(value, 'bindingSha256')) !== value.bindingSha256) {
        errors.push('bindingSha256 does not match polarity bytes');
      }
    } catch {
      errors.push('bindingSha256 cannot be recomputed');
    }
  }
  return valid && errors.length === 0;
}

function universeRecordShape(value: unknown, errors: string[]): value is AdmissionOverlapUniverseRecordV1 {
  if (!isJsonRecord(value)) {
    errors.push('overlap universe record must be an object');
    return false;
  }
  const optional = [
    ...(hasOwn(value, 'admissionRecordId') ? ['admissionRecordId'] : []),
    ...(hasOwn(value, 'shingleSetSha256') ? ['shingleSetSha256'] : []),
    ...(hasOwn(value, 'shingleCount') ? ['shingleCount'] : []),
  ];
  const shape = exactKeys(value, [
    'version', 'candidateUnitId', 'materialSourceId', 'aggregateSourceIds', 'locator', 'polarity',
    'contentSha256', 'contentBytes', 'language', 'normalizerId', 'normalizationStatus', 'recordSha256',
    ...optional,
  ]);
  if (!shape) errors.push('overlap universe record has unexpected or missing keys');
  const base = value.version === RECORD_VERSION
    && isAdmissionId(value.candidateUnitId)
    && isAdmissionId(value.materialSourceId)
    && sortedUniqueIds(value.aggregateSourceIds)
    && isSha256(value.contentSha256)
    && safeInteger(value.contentBytes)
    && nonEmpty(value.language, 128)
    && isAdmissionId(value.normalizerId)
    && (value.normalizationStatus === 'covered' || value.normalizationStatus === 'unsupported' || value.normalizationStatus === 'unreadable')
    && isSha256(value.recordSha256);
  if (!base) errors.push('overlap universe record scalar fields are invalid');
  const locatorOk = validateLocator(value.locator, errors);
  const polarityOk = polarityShape(value.polarity, errors);
  const admissionIdOk = !hasOwn(value, 'admissionRecordId') || isSha256(value.admissionRecordId);
  if (!admissionIdOk) errors.push('admissionRecordId must be sha256 when present');
  const shinglePair = hasOwn(value, 'shingleSetSha256') === hasOwn(value, 'shingleCount');
  if (!shinglePair) errors.push('shingleSetSha256 and shingleCount must be supplied together');
  const shingleTypes = !hasOwn(value, 'shingleSetSha256')
    || (isSha256(value.shingleSetSha256) && safeInteger(value.shingleCount));
  if (!shingleTypes) errors.push('shingle fields are invalid');
  if (value.normalizationStatus === 'covered' && (!hasOwn(value, 'shingleSetSha256') || !hasOwn(value, 'shingleCount'))) {
    errors.push('covered normalization requires a shingle hash and count');
  }
  if (value.normalizationStatus !== 'covered' && (hasOwn(value, 'shingleSetSha256') || hasOwn(value, 'shingleCount'))) {
    errors.push('unsupported/unreadable normalization cannot carry shingle output');
  }
  const authority = isJsonRecord(value.polarity) ? value.polarity.bindingAuthority : undefined;
  const admissionIdPresent = hasOwn(value, 'admissionRecordId');
  if (authority === 'admission-record' && !admissionIdPresent) errors.push('admission-record binding requires admissionRecordId');
  const proposedLabelPresent = isJsonRecord(value.polarity) && hasOwn(value.polarity, 'proposedLabel');
  if (authority === 'registered-unassigned-candidate'
    && (admissionIdPresent || proposedLabelPresent || (isJsonRecord(value.polarity) && value.polarity.intake !== 'unassigned'))) {
    errors.push('registered-unassigned-candidate must not bind an admission record or declared polarity');
  }
  if (authority === 'legacy-selected-inventory' && admissionIdPresent) errors.push('legacy binding cannot carry admissionRecordId');
  return shape && base && locatorOk && polarityOk && admissionIdOk && shinglePair && shingleTypes && errors.length === 0;
}

export function calibrationAdmissionOverlapUniverseRecordSha256(
  value: Omit<AdmissionOverlapUniverseRecordV1, 'recordSha256'> | Record<string, unknown>,
): string {
  return selfHash(value, 'recordSha256');
}

export function calibrationAdmissionOverlapPolarityBindingSha256(value: unknown): string {
  return selfHash(value, 'bindingSha256');
}

export function validateCalibrationAdmissionOverlapUniverseRecordV1(value: unknown): AdmissionOverlapContractValidationV1 {
  const errors: string[] = [];
  if (!universeRecordShape(value, errors)) return result(false, errors);
  try {
    if (calibrationAdmissionOverlapUniverseRecordSha256(value as unknown as Record<string, unknown>) !== value.recordSha256) {
      errors.push('recordSha256 does not match canonical record bytes');
    }
  } catch {
    errors.push('recordSha256 cannot be recomputed');
  }
  return result(errors.length === 0, errors);
}

export function isCalibrationAdmissionOverlapUniverseRecordV1(value: unknown): value is AdmissionOverlapUniverseRecordV1 {
  return validateCalibrationAdmissionOverlapUniverseRecordV1(value).ok;
}

function universeShape(value: unknown, errors: string[]): value is AdmissionOverlapUniverseV1 {
  if (!isJsonRecord(value) || !exactKeys(value, [
    'version', 'registerSha256', 'recordsJsonlSha256', 'selectedAggregateCoverage', 'baselineMaterialUnits',
    'repositoryMaterialUnits', 'newCandidateUnits', 'covered', 'unsupported', 'unreadable',
    'unresolvedCandidateUnitIds', 'normalizerRegistrySha256', 'universeSha256',
  ])) {
    errors.push('overlap universe summary shape is invalid');
    return false;
  }
  const scalar = value.version === UNIVERSE_VERSION
    && isSha256(value.registerSha256)
    && isSha256(value.recordsJsonlSha256)
    && safeInteger(value.selectedAggregateCoverage)
    && safeInteger(value.baselineMaterialUnits)
    && safeInteger(value.repositoryMaterialUnits)
    && safeInteger(value.newCandidateUnits)
    && safeInteger(value.covered)
    && safeInteger(value.unsupported)
    && safeInteger(value.unreadable)
    && sortedUniqueIds(value.unresolvedCandidateUnitIds, true)
    && isSha256(value.normalizerRegistrySha256)
    && isSha256(value.universeSha256);
  if (!scalar) errors.push('overlap universe summary scalar fields are invalid');
  const selectedAggregateCoverage = value.selectedAggregateCoverage as number;
  const baselineMaterialUnits = value.baselineMaterialUnits as number;
  const repositoryMaterialUnits = value.repositoryMaterialUnits as number;
  const newCandidateUnits = value.newCandidateUnits as number;
  const covered = value.covered as number;
  const unsupported = value.unsupported as number;
  const unreadable = value.unreadable as number;
  if (scalar && selectedAggregateCoverage !== baselineMaterialUnits + repositoryMaterialUnits) {
    errors.push('selectedAggregateCoverage must equal baselineMaterialUnits + repositoryMaterialUnits');
  }
  if (scalar && covered + unsupported + unreadable !== selectedAggregateCoverage + newCandidateUnits) {
    errors.push('covered + unsupported + unreadable must equal selected coverage + new candidates');
  }
  return scalar && errors.length === 0;
}

export function calibrationAdmissionOverlapUniverseSha256(
  value: Omit<AdmissionOverlapUniverseV1, 'universeSha256'> | Record<string, unknown>,
): string {
  return selfHash(value, 'universeSha256');
}

export function validateCalibrationAdmissionOverlapUniverseV1(value: unknown): AdmissionOverlapContractValidationV1 {
  const errors: string[] = [];
  if (!universeShape(value, errors)) return result(false, errors);
  try {
    if (calibrationAdmissionOverlapUniverseSha256(value as unknown as Record<string, unknown>) !== value.universeSha256) {
      errors.push('universeSha256 does not match canonical summary bytes');
    }
  } catch {
    errors.push('universeSha256 cannot be recomputed');
  }
  return result(errors.length === 0, errors);
}

export function isCalibrationAdmissionOverlapUniverseV1(value: unknown): value is AdmissionOverlapUniverseV1 {
  return validateCalibrationAdmissionOverlapUniverseV1(value).ok;
}

function policyShape(value: unknown, errors: string[]): value is AdmissionOverlapPolicyV1 {
  if (!isJsonRecord(value) || !exactKeys(value, [
    'version', 'method', 'maxUnitBytes', 'maxShardBytes', 'maxOpenFiles', 'maxHeapBytes', 'maxRssBytes', 'maxWorkBytes', 'maxWallMilliseconds', 'policySha256',
  ])) {
    errors.push('overlap policy shape is invalid');
    return false;
  }
  const constants = value.version === POLICY_VERSION
    && value.method === POLICY_METHOD
    && value.maxUnitBytes === LIMITS.maxUnitBytes
    && value.maxShardBytes === LIMITS.maxShardBytes
    && value.maxOpenFiles === LIMITS.maxOpenFiles
    && value.maxHeapBytes === LIMITS.maxHeapBytes
    && value.maxRssBytes === LIMITS.maxRssBytes
    && value.maxWorkBytes === LIMITS.maxWorkBytes
    && value.maxWallMilliseconds === LIMITS.maxWallMilliseconds
    && isSha256(value.policySha256);
  if (!constants) errors.push('overlap policy constants or policySha256 are invalid');
  return constants;
}

export function calibrationAdmissionOverlapPolicySha256(
  value: Omit<AdmissionOverlapPolicyV1, 'policySha256'> | Record<string, unknown>,
): string {
  return selfHash(value, 'policySha256');
}

export function validateCalibrationAdmissionOverlapPolicyV1(value: unknown): AdmissionOverlapContractValidationV1 {
  const errors: string[] = [];
  if (!policyShape(value, errors)) return result(false, errors);
  try {
    if (calibrationAdmissionOverlapPolicySha256(value as unknown as Record<string, unknown>) !== value.policySha256) {
      errors.push('policySha256 does not match canonical policy bytes');
    }
  } catch {
    errors.push('policySha256 cannot be recomputed');
  }
  return result(errors.length === 0, errors);
}

export function isCalibrationAdmissionOverlapPolicyV1(value: unknown): value is AdmissionOverlapPolicyV1 {
  return validateCalibrationAdmissionOverlapPolicyV1(value).ok;
}

/** Exact inclusive 4/5 Jaccard predicate. Never converts to a binary float. */
export function isAdmissionOverlapJaccardAtLeast80(intersection: unknown, union: unknown): boolean {
  if (!safeInteger(intersection) || !safeInteger(union) || union <= 0 || intersection > union) return false;
  return BigInt(intersection) * 5n >= BigInt(union) * 4n;
}

/** Return an exact decimal only for diagnostics; authority decisions use the rational predicate above. */
export function admissionOverlapJaccard(intersection: number, union: number): number {
  if (!safeInteger(intersection) || !safeInteger(union) || union <= 0 || intersection > union) return Number.NaN;
  return intersection / union;
}

/** Length filter for the inclusive 0.80 Jaccard threshold, using integer arithmetic. */
export function isAdmissionOverlapSizeCompatible(leftSize: unknown, rightSize: unknown): boolean {
  if (!safeInteger(leftSize, 1) || !safeInteger(rightSize, 1)) return false;
  const left = BigInt(leftSize);
  const right = BigInt(rightSize);
  const inLeftBounds = right * 5n >= left * 4n && right * 4n <= left * 5n;
  return inLeftBounds;
}

function canonicalJsonl(values: readonly unknown[]): Uint8Array {
  return Buffer.from(values.map((value) => calibrationAdmissionCanonicalJson(value)).join('\n') + (values.length > 0 ? '\n' : ''), 'utf8');
}

function bytesSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Validate the summary against its canonical ordered JSONL rows. `recordsJsonl`
 * is optional because Core's pure contract tests can derive canonical JSONL;
 * callers reading a file should pass the exact bytes and compare their digest
 * before invoking this function.
 */
export function validateCalibrationAdmissionOverlapUniverseStream(
  universe: unknown,
  records: readonly unknown[],
  normalizerRegistry: unknown,
  recordsJsonl?: Uint8Array,
): AdmissionOverlapUniverseStreamValidationV1 {
  const errors: string[] = [];
  let recordCount = 0;
  let covered = 0;
  let unsupported = 0;
  let unreadable = 0;
  const candidateUnitIds: string[] = [];
  const unresolvedCandidateUnitIds: string[] = [];
  const summary = universe as Partial<AdmissionOverlapUniverseV1>;
  const universeValid = validateCalibrationAdmissionOverlapUniverseV1(universe);
  if (!universeValid.ok) errors.push(...universeValid.errors.map((error) => `universe: ${error}`));
  if (!Array.isArray(records)) {
    errors.push('universe records must be an array');
    return { ok: false, errors, recordCount, covered, unsupported, unreadable, candidateUnitIds, unresolvedCandidateUnitIds };
  }
  if (normalizerRegistry === undefined) errors.push('normalizer registry is required for stream validation');
  const registryValidation = inspectNormalizerRegistry(normalizerRegistry);
  if (!registryValidation.ok) errors.push(...registryValidation.errors.map((error) => `registry: ${error}`));
  const registry = registryValidation.registry;
  const registryByLanguage = registryValidation.ok && registry
    ? new Map(registry.entries.map((entry) => [entry.language, entry.normalizerId]))
    : undefined;
  const registryNormalizerIds = registryValidation.ok && registry
    ? new Set(registry.entries.map((entry) => entry.normalizerId))
    : undefined;
  if (registryValidation.ok && registryValidation.canonicalSha256 !== summary.normalizerRegistrySha256) {
    errors.push('universe normalizerRegistrySha256 does not match registry');
  }
  let previousId = '';
  for (const row of records) {
    recordCount += 1;
    const rowValidation = validateCalibrationAdmissionOverlapUniverseRecordV1(row);
    if (!rowValidation.ok) {
      errors.push(...rowValidation.errors.map((error) => `record ${recordCount}: ${error}`));
      continue;
    }
    const record = row as AdmissionOverlapUniverseRecordV1;
    candidateUnitIds.push(record.candidateUnitId);
    if (record.candidateUnitId <= previousId) errors.push('universe records must be ordered by candidateUnitId');
    previousId = record.candidateUnitId;
    if (candidateUnitIds.length > 1 && candidateUnitIds[candidateUnitIds.length - 2] === record.candidateUnitId) errors.push('universe records contain duplicate candidateUnitId');
    if (record.normalizationStatus === 'covered') covered += 1;
    if (record.normalizationStatus === 'unsupported') { unsupported += 1; unresolvedCandidateUnitIds.push(record.candidateUnitId); }
    if (record.normalizationStatus === 'unreadable') { unreadable += 1; unresolvedCandidateUnitIds.push(record.candidateUnitId); }
    if (registryByLanguage) {
      const registryNormalizerId = registryByLanguage.get(record.language);
      if (record.normalizationStatus === 'covered' && registryNormalizerId !== record.normalizerId) errors.push(`record ${record.candidateUnitId}: covered row is not bound to the registry language/normalizer`);
      if (record.normalizationStatus === 'unsupported' && registryNormalizerIds?.has(record.normalizerId)) errors.push(`record ${record.candidateUnitId}: unsupported row names a covered registry normalizer`);
    }
  }
  const uniqueIds = new Set(candidateUnitIds);
  if (uniqueIds.size !== candidateUnitIds.length) errors.push('universe candidate IDs must be unique');
  if (universeValid.ok) {
    if (recordCount !== summary.selectedAggregateCoverage! + summary.newCandidateUnits!) errors.push('record count does not equal selected coverage plus new candidates');
    if (covered !== summary.covered || unsupported !== summary.unsupported || unreadable !== summary.unreadable) errors.push('summary status counts do not match stream rows');
    if (!sameStrings([...unresolvedCandidateUnitIds].sort(), summary.unresolvedCandidateUnitIds!)) errors.push('summary unresolved IDs do not match stream rows');
  }
  // Canonicalization is intentionally strict and throws for malformed
  // unknown rows (for example NaN or undefined values). A stream validator is
  // a trust boundary, so convert that failure into a normal invalid result
  // rather than allowing a caller to observe an exception.
  if (universeValid.ok) {
    try {
      const canonicalBytes = canonicalJsonl(records);
      const bytes = recordsJsonl ?? canonicalBytes;
      const canonicalHash = bytesSha256(canonicalBytes);
      if (summary.recordsJsonlSha256 !== canonicalHash) errors.push('recordsJsonlSha256 does not match canonical JSONL rows');
      if (recordsJsonl !== undefined && !Buffer.from(bytes).equals(Buffer.from(canonicalBytes))) {
        errors.push('supplied JSONL bytes do not match the canonical ordered rows');
      }
    } catch {
      errors.push('records cannot be serialized as canonical JSONL');
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    recordCount,
    covered,
    unsupported,
    unreadable,
    candidateUnitIds,
    unresolvedCandidateUnitIds: [...unresolvedCandidateUnitIds].sort(),
  };
}

export function validateCalibrationAdmissionOverlapUniverseRecords(
  universe: unknown,
  records: readonly unknown[],
  normalizerRegistry: unknown,
): AdmissionOverlapUniverseStreamValidationV1 {
  return validateCalibrationAdmissionOverlapUniverseStream(universe, records, normalizerRegistry);
}
