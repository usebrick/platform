/**
 * Byte-backed joins for the static-authority overlap stage.
 *
 * The prebuilt authority publisher intentionally accepts hash-only tool
 * metadata.  This module is the stricter, read-only boundary used by a later
 * context/rebuild caller: it requires the exact static and overlap generation
 * bytes, all three overlap envelopes and their bytes, and a resolver result
 * obtained from the indexed tool-authority chain.  It does not read or write
 * paths and it never treats a receipt's opaque output-set metadata as proof of
 * an overlap resource.
 */
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionSha256,
  calibrationAdmissionToolReceiptSha256,
  isCalibrationAdmissionInvocationIntentV1,
  isCalibrationAdmissionStaticAuthorityGenerationV1,
  isCalibrationAdmissionToolAuthorityIndexV1,
  isCalibrationAdmissionToolAuthoritySnapshotV1,
  isCalibrationAdmissionToolProfileV1,
  isCalibrationAdmissionToolReceiptV1,
  isCalibrationAdmissionOverlapGenerationV1,
  type CalibrationAdmissionToolAuthorityIndexV1,
  type CalibrationAdmissionInvocationIntentV1,
  type CalibrationAdmissionToolAuthoritySnapshotV1,
  type CalibrationAdmissionToolProfileV1,
  type CalibrationAdmissionToolReceiptV1,
} from '@usebrick/core';

import type { AdmissionToolAuthorityReceiptResolution } from './admission-publication';
import { verifyOverlapArtifactRelations } from './admission-overlap-publication';

const SHA256 = /^[a-f0-9]{64}$/u;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export interface PrebuiltAdmissionAuthorityEnvelopeBytes {
  /** Parsed envelope. The relation verifier applies the Core contract. */
  readonly value: unknown;
  /** Exact canonical UTF-8 bytes as persisted in the overlap generation. */
  readonly bytes: Uint8Array;
}

/**
 * Explicit, byte-backed authority input for the static-generation overlap
 * join.  All three envelope pairs are mandatory; there is no path discovery
 * or hash-only fallback in this contract.
 */
export interface PrebuiltAdmissionAuthorityOverlapJoinInput {
  readonly staticGeneration: unknown;
  readonly staticGenerationBytes: Uint8Array;
  readonly overlapGeneration: unknown;
  readonly overlapGenerationBytes: Uint8Array;
  readonly envelopes: {
    readonly index: PrebuiltAdmissionAuthorityEnvelopeBytes;
    readonly resource: PrebuiltAdmissionAuthorityEnvelopeBytes;
    readonly ledger: PrebuiltAdmissionAuthorityEnvelopeBytes;
  };
  /** The exact result returned by resolveAdmissionToolAuthorityReceipt. */
  readonly toolAuthority: AdmissionToolAuthorityReceiptResolution;
}

export interface PrebuiltAdmissionAuthorityOverlapJoinValidation {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function push(errors: string[], message: string): void {
  if (!errors.includes(message)) errors.push(message);
}

function bytes(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value: unknown): string {
  return calibrationAdmissionCanonicalJson(value);
}

function canonicalEquals(left: unknown, right: unknown): boolean {
  try { return canonical(left) === canonical(right); } catch { return false; }
}

function exactKeys(value: unknown, expected: readonly string[]): value is JsonRecord {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function verifyCanonicalBytes(
  value: unknown,
  supplied: unknown,
  label: string,
  errors: string[],
): boolean {
  if (!bytes(supplied)) {
    push(errors, `${label}_bytes_invalid`);
    return false;
  }
  let text: string;
  try {
    text = UTF8_DECODER.decode(supplied);
  } catch {
    push(errors, `${label}_bytes_invalid_utf8`);
    return false;
  }
  if (text.startsWith('\uFEFF')) {
    push(errors, `${label}_bytes_bom`);
    return false;
  }
  let expected: string;
  try { expected = canonical(value); } catch {
    push(errors, `${label}_value_not_canonicalizable`);
    return false;
  }
  if (text !== expected) {
    push(errors, `${label}_bytes_not_canonical`);
    return false;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (canonical(parsed) !== expected) push(errors, `${label}_bytes_not_canonical`);
  } catch {
    push(errors, `${label}_bytes_not_json`);
    return false;
  }
  // Keep this explicit even though canonical equality implies it.  It makes
  // the byte-backed boundary auditable and prevents accidental comparison of
  // a generation's self-hash with the hash of its full envelope bytes.
  if (sha256(supplied) !== sha256(Buffer.from(expected, 'utf8'))) {
    push(errors, `${label}_bytes_changed_during_validation`);
    return false;
  }
  return true;
}

function snapshotForIndex(index: CalibrationAdmissionToolAuthorityIndexV1): CalibrationAdmissionToolAuthoritySnapshotV1 {
  const body = {
    version: 'v10.3-admission-tool-authority-snapshot-v1' as const,
    indexGenerationSha256: index.indexSha256,
    profileIds: index.profiles.map((entry) => entry.profileId).sort(),
    invocationIntentIds: index.invocationIntents.map((entry) => entry.intentId).sort(),
    receiptIds: index.receipts.map((entry) => entry.receiptId).sort(),
  };
  return { ...body, snapshotSha256: calibrationAdmissionSha256(body) };
}

function validateIndexedToolAuthority(
  value: unknown,
  errors: string[],
): {
  readonly index?: CalibrationAdmissionToolAuthorityIndexV1;
  readonly profile?: CalibrationAdmissionToolProfileV1;
  readonly intent?: CalibrationAdmissionInvocationIntentV1;
  readonly receipt?: CalibrationAdmissionToolReceiptV1;
  readonly snapshot?: CalibrationAdmissionToolAuthoritySnapshotV1;
  readonly receiptSha256?: string;
  readonly authorityIndexSha256?: string;
} {
  if (!isRecord(value)) {
    push(errors, 'indexed_tool_authority_resolution_invalid');
    return {};
  }
  if (!exactKeys(value, ['authorityIndex', 'authorityIndexSha256', 'invocationIntent', 'profile', 'receipt', 'receiptSha256', 'snapshot'])) {
    push(errors, 'indexed_tool_authority_resolution_shape_invalid');
  }
  const index = value.authorityIndex;
  const profile = value.profile;
  const intent = value.invocationIntent;
  const receipt = value.receipt;
  const snapshot = value.snapshot;
  const receiptSha256 = value.receiptSha256;
  const authorityIndexSha256 = value.authorityIndexSha256;
  const validReceiptSha256 = typeof receiptSha256 === 'string' && SHA256.test(receiptSha256);
  const validAuthorityIndexSha256 = typeof authorityIndexSha256 === 'string' && SHA256.test(authorityIndexSha256);

  const validIndex = isCalibrationAdmissionToolAuthorityIndexV1(index);
  if (!validIndex) push(errors, 'indexed_tool_authority_index_invalid');
  if (!validAuthorityIndexSha256) push(errors, 'indexed_tool_authority_index_hash_invalid');
  if (validIndex && authorityIndexSha256 !== index.indexSha256) push(errors, 'indexed_tool_authority_index_hash_mismatch');

  const validProfile = isCalibrationAdmissionToolProfileV1(profile);
  if (!validProfile) push(errors, 'indexed_tool_profile_invalid');
  const validIntent = isCalibrationAdmissionInvocationIntentV1(intent, validProfile ? profile : undefined);
  if (!validIntent) push(errors, 'indexed_tool_invocation_invalid');
  const validReceipt = isCalibrationAdmissionToolReceiptV1(
    receipt,
    validProfile ? profile : undefined,
    validIntent ? intent : undefined,
  );
  if (!validReceipt) push(errors, 'indexed_tool_receipt_invalid');
  const validSnapshot = isCalibrationAdmissionToolAuthoritySnapshotV1(snapshot);
  if (!validSnapshot) push(errors, 'indexed_tool_snapshot_invalid');
  if (!validReceiptSha256) push(errors, 'indexed_tool_receipt_hash_invalid');
  if (validReceipt && validReceiptSha256 && calibrationAdmissionToolReceiptSha256(receipt) !== receiptSha256) {
    push(errors, 'indexed_tool_receipt_hash_mismatch');
  }

  if (validIndex) {
    if (validProfile && !index.profiles.some((entry) => entry.profileId === profile.profileId)) push(errors, 'indexed_tool_profile_not_member');
    if (validIntent && !index.invocationIntents.some((entry) => entry.intentId === intent.intentId)) push(errors, 'indexed_tool_invocation_not_member');
    if (validReceipt) {
      const reference = index.receipts.find((entry) => entry.receiptId === receipt.receiptId);
      if (reference === undefined) push(errors, 'indexed_tool_receipt_not_member');
      else if (reference.sha256 !== receiptSha256) push(errors, 'indexed_tool_receipt_reference_hash_mismatch');
    }
    if (validSnapshot) {
      const expected = snapshotForIndex(index);
      if (!canonicalEquals(snapshot, expected)) push(errors, 'indexed_tool_snapshot_membership_mismatch');
    }
  }
  if (validProfile && profile.profileId !== 'admission-static-ledgers-v1') push(errors, 'indexed_tool_profile_wrong_for_overlap');
  if (validIntent && intent.action !== 'authority:overlap') push(errors, 'indexed_tool_action_wrong_for_overlap');
  if (validReceipt) {
    if (receipt.action !== 'authority:overlap') push(errors, 'indexed_tool_receipt_action_wrong_for_overlap');
    if (receipt.exitCode !== 0) push(errors, 'indexed_tool_receipt_failed');
  }
  return {
    ...(validIndex ? { index } : {}),
    ...(validProfile ? { profile } : {}),
    ...(validIntent ? { intent } : {}),
    ...(validReceipt ? { receipt } : {}),
    ...(validSnapshot ? { snapshot } : {}),
    ...(validReceiptSha256 ? { receiptSha256 } : {}),
    ...(validAuthorityIndexSha256 ? { authorityIndexSha256 } : {}),
  };
}

/**
 * Validate the static-generation → overlap-generation → envelope joins and
 * the indexed, successful overlap-tool receipt.  This function is pure and
 * fail-closed: callers must provide every object and its raw bytes.  It does
 * not make `primaryOutputSetSha256` (or any other opaque output metadata) a
 * substitute for the resource receipt hash.
 */
export function validatePrebuiltAdmissionAuthorityOverlapJoin(
  input: PrebuiltAdmissionAuthorityOverlapJoinInput,
): PrebuiltAdmissionAuthorityOverlapJoinValidation {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ['static_overlap_join_input_invalid'] };
  if (!exactKeys(input, ['envelopes', 'overlapGeneration', 'overlapGenerationBytes', 'staticGeneration', 'staticGenerationBytes', 'toolAuthority'])) {
    push(errors, 'static_overlap_join_input_shape_invalid');
  }

  const staticGeneration = input.staticGeneration;
  const overlapGeneration = input.overlapGeneration;
  const staticValid = isCalibrationAdmissionStaticAuthorityGenerationV1(staticGeneration);
  const overlapValid = isCalibrationAdmissionOverlapGenerationV1(overlapGeneration);
  if (!staticValid) push(errors, 'static_generation_invalid');
  if (!overlapValid) push(errors, 'overlap_generation_invalid');
  verifyCanonicalBytes(staticGeneration, input.staticGenerationBytes, 'static_generation', errors);
  verifyCanonicalBytes(overlapGeneration, input.overlapGenerationBytes, 'overlap_generation', errors);
  if (staticValid && overlapValid && staticGeneration.overlapGenerationSha256 !== overlapGeneration.generationSha256) {
    push(errors, 'static_overlap_generation_hash_mismatch');
  }
  if (staticValid && overlapValid && staticGeneration.inputGenerationSha256 !== overlapGeneration.inputGenerationSha256) {
    push(errors, 'static_overlap_input_generation_hash_mismatch');
  }

  const envelopes = isRecord(input.envelopes) ? input.envelopes : undefined;
  if (envelopes !== undefined && !exactKeys(envelopes, ['index', 'ledger', 'resource'])) {
    push(errors, 'overlap_envelopes_shape_invalid');
  }
  const envelopeInputs: readonly [string, 'index' | 'resource' | 'ledger', unknown][] = [
    ['index', 'index', envelopes?.index],
    ['resource', 'resource', envelopes?.resource],
    ['ledger', 'ledger', envelopes?.ledger],
  ];
  let allEnvelopePairsSupplied = envelopes !== undefined;
  const envelopeValues: Partial<Record<'index' | 'resource' | 'ledger', unknown>> = {};
  for (const [label, key, entry] of envelopeInputs) {
    if (!isRecord(entry)) {
      push(errors, `overlap_${label}_envelope_missing`);
      allEnvelopePairsSupplied = false;
      continue;
    }
    if (!exactKeys(entry, ['bytes', 'value'])) push(errors, `overlap_${label}_envelope_shape_invalid`);
    if (!Object.prototype.hasOwnProperty.call(entry, 'value')) {
      push(errors, `overlap_${label}_envelope_object_missing`);
      allEnvelopePairsSupplied = false;
    } else {
      envelopeValues[key] = entry.value;
    }
    if (!Object.prototype.hasOwnProperty.call(entry, 'bytes')) {
      push(errors, `overlap_${label}_envelope_bytes_missing`);
      allEnvelopePairsSupplied = false;
    }
    const suppliedBytes = entry.bytes;
    if (Object.prototype.hasOwnProperty.call(entry, 'value') && Object.prototype.hasOwnProperty.call(entry, 'bytes')) {
      verifyCanonicalBytes(entry.value, suppliedBytes, `overlap_${label}_envelope`, errors);
    }
  }

  const tool = validateIndexedToolAuthority(input.toolAuthority, errors);
  if (staticValid && tool.snapshot !== undefined && !canonicalEquals(staticGeneration.toolAuthoritySnapshot, tool.snapshot)) {
    push(errors, 'static_tool_snapshot_mismatch');
  }
  if (overlapValid && tool.snapshot !== undefined && !canonicalEquals(overlapGeneration.toolAuthoritySnapshot, tool.snapshot)) {
    push(errors, 'overlap_tool_snapshot_mismatch');
  }

  const resource = envelopeValues.resource;
  if (isRecord(resource) && tool.receiptSha256 !== undefined && resource.toolReceiptSha256 !== tool.receiptSha256) {
    push(errors, 'overlap_resource_tool_receipt_mismatch');
  }

  // The relation helper itself checks all three Core envelopes and every
  // generation-local envelope receipt.  Do not call it for a partial input:
  // a missing envelope must remain a precise boundary error, not be mistaken
  // for a relation proof over undefined values.
  if (allEnvelopePairsSupplied && overlapValid) {
    const relation = verifyOverlapArtifactRelations({
      generation: overlapGeneration,
      index: envelopeValues.index,
      resource: envelopeValues.resource,
      ledger: envelopeValues.ledger,
    });
    for (const error of relation.errors) push(errors, error);
    const index = envelopeValues.index;
    const resourceValue = envelopeValues.resource;
    const ledger = envelopeValues.ledger;
    const complete = isRecord(index) && isRecord(resourceValue) && isRecord(ledger)
      && index.complete === true && resourceValue.coverageComplete === true
      && resourceValue.withinAllLimits === true && ledger.coverageComplete === true;
    if (isRecord(index) && isRecord(resourceValue) && isRecord(ledger) && !complete) {
      // The static-authority boundary may only consume a completed overlap
      // resource. Incomplete builder checkpoints remain resumable artifacts,
      // not admission authority.
      push(errors, 'overlap_resource_authority_incomplete');
    }
  }

  return { ok: errors.length === 0, errors };
}
