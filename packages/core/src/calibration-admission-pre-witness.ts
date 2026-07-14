import { calibrationAdmissionSha256 } from './calibration-admission-evidence';
import type { AdmissionPreWitnessBoundaryV1 } from './generated/calibration-admission-pre-witness-boundary';
import {
  exactKeys,
  isJsonRecord,
  isSha256,
  withoutJsonKey,
} from './calibration-admission-primitives';

export type { AdmissionPreWitnessBoundaryV1 };
export type AdmissionPreWitnessArtifactV1 = AdmissionPreWitnessBoundaryV1['artifacts'][number];

export interface CalibrationAdmissionPreWitnessBoundaryValidationV1 {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

type JsonObject = Record<string, unknown>;
type ArtifactKind = AdmissionPreWitnessArtifactV1['kind'];

const ARTIFACT_KINDS = [
  'lineage_ledger',
  'overlap_generation',
  'privacy_ledger',
  'quality_ledger',
  'record_stream',
] as const satisfies readonly ArtifactKind[];
const ARTIFACT_PATHS: Readonly<Record<ArtifactKind, string>> = {
  lineage_ledger: 'static/lineage.json',
  overlap_generation: 'static/overlap.json',
  privacy_ledger: 'static/privacy.json',
  quality_ledger: 'static/quality.json',
  record_stream: 'static/records.jsonl',
};
const ARTIFACT_HASH_KEYS: Readonly<Record<ArtifactKind, string>> = {
  lineage_ledger: 'lineageLedgerSha256',
  overlap_generation: 'overlapGenerationSha256',
  privacy_ledger: 'privacyLedgerSha256',
  quality_ledger: 'qualityLedgerSha256',
  record_stream: 'recordStreamSha256',
};

function validation(errors: string[]): CalibrationAdmissionPreWitnessBoundaryValidationV1 {
  return { ok: errors.length === 0, errors };
}

function isSafeRelativeStaticPath(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 256
    && /^[a-z0-9][a-z0-9._/-]*$/.test(value)
    && value.startsWith('static/')
    && !value.includes('//')
    && !value.split('/').includes('..')
    && !value.endsWith('/');
}

export function calibrationAdmissionPreWitnessBoundarySha256(
  value: Omit<AdmissionPreWitnessBoundaryV1, 'preWitnessSha256'> | JsonObject,
): string {
  return calibrationAdmissionSha256(withoutJsonKey(value, 'preWitnessSha256'));
}

export function validateCalibrationAdmissionPreWitnessBoundaryV1(
  value: unknown,
): CalibrationAdmissionPreWitnessBoundaryValidationV1 {
  const errors: string[] = [];
  if (!isJsonRecord(value) || !exactKeys(value, [
    'version',
    'admissionRecordSetSha256',
    'recordStreamSha256',
    'privacyLedgerSha256',
    'qualityLedgerSha256',
    'lineageLedgerSha256',
    'overlapGenerationSha256',
    'toolReceiptSha256',
    'artifacts',
    'preWitnessSha256',
  ])) return validation(['pre-witness boundary shape is invalid']);

  if (value.version !== 'v10.3-admission-pre-witness-boundary-v1') errors.push('pre-witness boundary version is invalid');
  for (const key of [
    'admissionRecordSetSha256',
    'recordStreamSha256',
    'privacyLedgerSha256',
    'qualityLedgerSha256',
    'lineageLedgerSha256',
    'overlapGenerationSha256',
    'toolReceiptSha256',
    'preWitnessSha256',
  ]) {
    if (!isSha256(value[key])) errors.push(`pre-witness ${key} is invalid`);
  }

  const artifacts = value.artifacts;
  if (!Array.isArray(artifacts) || artifacts.length !== ARTIFACT_KINDS.length) {
    errors.push('pre-witness artifacts must contain exactly five entries');
  } else {
    const seen = new Set<string>();
    let previous = '';
    for (const entry of artifacts) {
      if (!isJsonRecord(entry) || !exactKeys(entry, ['kind', 'relativePath', 'sha256'])) {
        errors.push('pre-witness artifact shape is invalid');
        continue;
      }
      const kind = entry.kind;
      const relativePath = entry.relativePath;
      const artifactHash = entry.sha256;
      if (!ARTIFACT_KINDS.includes(kind as ArtifactKind)) {
        errors.push(`pre-witness artifact kind ${String(kind)} is not allowed; witness targets are forbidden`);
        continue;
      }
      const parsedKind = kind as ArtifactKind;
      if (!isSafeRelativeStaticPath(relativePath)) {
        errors.push(`pre-witness artifact path ${String(relativePath)} is not a safe static path; witness paths are forbidden`);
      }
      if (!isSha256(artifactHash)) errors.push(`pre-witness artifact ${kind} hash is invalid`);
      const order = `${String(kind)}\u0000${String(relativePath)}`;
      if (order <= previous) errors.push('pre-witness artifacts must be sorted and unique');
      previous = order;
      if (seen.has(String(kind))) errors.push(`pre-witness artifact kind ${kind} is duplicated`);
      seen.add(String(kind));
      if (relativePath !== ARTIFACT_PATHS[parsedKind]) {
        errors.push(`pre-witness artifact ${kind} path is not canonical`);
      }
      const hashKey = ARTIFACT_HASH_KEYS[parsedKind];
      if (hashKey && artifactHash !== value[hashKey]) {
        errors.push(`pre-witness artifact ${kind} hash does not match ${hashKey}`);
      }
    }
    for (const kind of ARTIFACT_KINDS) if (!seen.has(kind)) errors.push(`pre-witness artifact ${kind} is missing`);
  }

  try {
    if (isSha256(value.preWitnessSha256)
      && calibrationAdmissionPreWitnessBoundarySha256(value) !== value.preWitnessSha256) {
      errors.push('pre-witness boundary self-hash does not match canonical bytes');
    }
  } catch {
    errors.push('pre-witness boundary cannot be canonicalized');
  }
  return validation(errors);
}

export function isCalibrationAdmissionPreWitnessBoundaryV1(value: unknown): value is AdmissionPreWitnessBoundaryV1 {
  return validateCalibrationAdmissionPreWitnessBoundaryV1(value).ok;
}
