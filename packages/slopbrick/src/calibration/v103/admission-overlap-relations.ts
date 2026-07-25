import { createHash } from 'node:crypto';

import {
  calibrationAdmissionCanonicalJson,
  isCalibrationAdmissionOverlapGenerationV1,
  validateCalibrationAdmissionOverlapIndexReceiptV1,
  validateCalibrationAdmissionOverlapLedgerV1,
  validateCalibrationAdmissionOverlapResourceReceiptV1,
  type CalibrationAdmissionArtifactReceiptV1,
  type AdmissionOverlapIndexReceiptV1,
  type AdmissionOverlapLedgerV1,
  type AdmissionOverlapResourceReceiptV1,
} from '@usebrick/core';

export interface OverlapArtifactRelationInput {
  readonly generation: unknown;
  readonly index: unknown;
  readonly resource: unknown;
  readonly ledger: unknown;
}

export interface OverlapArtifactRelationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonical(value: unknown): Buffer {
  return Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8');
}

function sha(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Prove that the three overlap envelopes belong to one generation and bind
 * each parsed envelope to its generation-local artifact receipt.
 */
export function verifyOverlapArtifactRelations(
  input: OverlapArtifactRelationInput,
): OverlapArtifactRelationResult {
  const errors: string[] = [];
  const add = (error: string): void => {
    if (!errors.includes(error)) errors.push(error);
  };

  const required: readonly [string, 'index' | 'resource' | 'ledger'][] = [
    ['index.json', 'index'],
    ['overlap-resource-receipt.json', 'resource'],
    ['overlap-ledger.json', 'ledger'],
  ];
  const generationValid = isCalibrationAdmissionOverlapGenerationV1(input.generation);
  const candidateArtifacts = isRecord(input.generation) && Array.isArray(input.generation.artifacts)
    ? input.generation.artifacts
    : [];
  const artifactByPath = new Map<string, CalibrationAdmissionArtifactReceiptV1>();
  for (const candidate of candidateArtifacts) {
    if (isRecord(candidate) && typeof candidate.relativePath === 'string') {
      artifactByPath.set(
        candidate.relativePath,
        candidate as unknown as CalibrationAdmissionArtifactReceiptV1,
      );
    }
  }
  for (const [path] of required) {
    if (!artifactByPath.has(path)) add('overlap_relation_envelope_missing:' + path);
  }
  if (!generationValid) {
    add('overlap_relation_generation_invalid');
    return { ok: false, errors };
  }

  const indexValid = validateCalibrationAdmissionOverlapIndexReceiptV1(input.index).ok;
  const resourceValid = validateCalibrationAdmissionOverlapResourceReceiptV1(input.resource).ok;
  const ledgerValid = validateCalibrationAdmissionOverlapLedgerV1(input.ledger).ok;
  if (!indexValid) add('overlap_relation_index_invalid');
  if (!resourceValid) add('overlap_relation_resource_invalid');
  if (!ledgerValid) add('overlap_relation_ledger_invalid');
  if (!indexValid || !resourceValid || !ledgerValid) return { ok: false, errors };

  const index = input.index as AdmissionOverlapIndexReceiptV1;
  const resource = input.resource as AdmissionOverlapResourceReceiptV1;
  const ledger = input.ledger as AdmissionOverlapLedgerV1;
  const authorityHashes = [
    input.generation.universeSha256 === index.universeSha256,
    input.generation.universeSha256 === resource.universeSha256,
    input.generation.universeSha256 === ledger.universeSha256,
    input.generation.overlapPolicySha256 === index.overlapPolicySha256,
    input.generation.overlapPolicySha256 === resource.overlapPolicySha256,
    input.generation.overlapPolicySha256 === ledger.overlapPolicySha256,
    index.normalizerRegistrySha256 === ledger.normalizerRegistrySha256,
    index.toolReceiptSha256 === resource.toolReceiptSha256,
  ];
  if (authorityHashes.some((matches) => !matches)) add('overlap_relation_authority_hash_mismatch');
  if (ledger.indexReceiptSha256 !== index.receiptSha256) add('overlap_relation_index_ledger_mismatch');
  if (index.complete !== resource.coverageComplete || index.complete !== ledger.coverageComplete) {
    add('overlap_relation_coverage_mismatch');
  }
  if (index.coveredCandidateUnits !== resource.recordCount) add('overlap_relation_count_mismatch');
  if (index.complete && (!resource.withinAllLimits || !ledger.coverageComplete)) {
    add('overlap_relation_completion_mismatch');
  }

  const envelopeValues: readonly [string, unknown, string][] = [
    ['index.json', input.index, 'index'],
    ['overlap-resource-receipt.json', input.resource, 'receipt'],
    ['overlap-ledger.json', input.ledger, 'ledger'],
  ];
  for (const [path, value, kind] of envelopeValues) {
    const artifact = artifactByPath.get(path);
    if (artifact === undefined) continue;
    const bytes = canonical(value);
    if (
      artifact.kind !== kind
      || artifact.pathBase !== 'generation_local'
      || artifact.bytes !== bytes.byteLength
      || artifact.sha256 !== sha(bytes)
    ) {
      add('overlap_relation_envelope_binding:' + path);
    }
  }

  return { ok: errors.length === 0, errors };
}
