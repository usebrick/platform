import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import {
  calibrationAdmissionCanonicalJson,
  isCalibrationAdmissionNormalizerRegistryV1,
  isCalibrationAdmissionOverlapUniverseRecordV1,
  type AdmissionNormalizerRegistryV1,
  type AdmissionOverlapUniverseRecordV1,
  type AdmissionOverlapUniverseV1,
  validateCalibrationAdmissionOverlapUniverseStream,
} from '@usebrick/core';

export type AdmissionUniverseJsonlChunk = Uint8Array | string;
export type AdmissionUniverseJsonlInput = AdmissionUniverseJsonlChunk | AsyncIterable<AdmissionUniverseJsonlChunk>;

export interface AdmissionOverlapUniverseReadResult {
  readonly ok: boolean;
  readonly records: readonly AdmissionOverlapUniverseRecordV1[];
  readonly bytes: Uint8Array;
  readonly recordsJsonlSha256: string;
  readonly validation: ReturnType<typeof validateCalibrationAdmissionOverlapUniverseStream>;
  readonly errors: readonly string[];
}

const UTF8 = new TextDecoder('utf-8', { fatal: true });

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function collectBytes(input: AdmissionUniverseJsonlInput): Promise<Uint8Array> {
  if (typeof input === 'string') return Buffer.from(input, 'utf8');
  if (input instanceof Uint8Array) return new Uint8Array(input);
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    if (typeof chunk === 'string') chunks.push(Buffer.from(chunk, 'utf8'));
    else if (chunk instanceof Uint8Array) chunks.push(Buffer.from(chunk));
    else throw new TypeError('JSONL chunks must be strings or Uint8Array values');
  }
  return Buffer.concat(chunks);
}

function failure(
  bytes: Uint8Array,
  errors: readonly string[],
  records: readonly AdmissionOverlapUniverseRecordV1[] = [],
  validation = validateCalibrationAdmissionOverlapUniverseStream({}, [], undefined),
): AdmissionOverlapUniverseReadResult {
  return {
    ok: false,
    records,
    bytes,
    recordsJsonlSha256: sha256(bytes),
    validation,
    errors,
  };
}

/**
 * Read the exact canonical universe JSONL bytes. The returned rows are safe
 * to pass to the later disk-bounded authority only when `ok` is true; raw
 * bytes and their digest are retained so the authority cannot substitute a
 * reserialized stream.
 */
export async function readAdmissionOverlapUniverseJsonl(
  input: AdmissionUniverseJsonlInput,
  universe: AdmissionOverlapUniverseV1,
  normalizerRegistry: AdmissionNormalizerRegistryV1,
): Promise<AdmissionOverlapUniverseReadResult> {
  let bytes: Uint8Array;
  try {
    bytes = await collectBytes(input);
  } catch (error) {
    return failure(new Uint8Array(), [error instanceof Error ? error.message : String(error)]);
  }
  if (bytes.byteLength === 0) return failure(bytes, ['universe_jsonl_empty']);
  if (bytes[bytes.byteLength - 1] !== 0x0a) return failure(bytes, ['universe_jsonl_final_newline_required']);

  let text: string;
  try {
    text = UTF8.decode(bytes);
  } catch {
    return failure(bytes, ['universe_jsonl_utf8_invalid']);
  }
  const lines = text.split('\n');
  if (lines.at(-1) !== '') return failure(bytes, ['universe_jsonl_final_newline_required']);
  lines.pop();
  if (lines.length === 0) return failure(bytes, ['universe_jsonl_empty']);

  const errors: string[] = [];
  const records: AdmissionOverlapUniverseRecordV1[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line.length === 0) {
      errors.push(`line ${index + 1}: blank_line`);
      continue;
    }
    if (line.includes('\r')) {
      errors.push(`line ${index + 1}: carriage_return_not_canonical`);
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      errors.push(`line ${index + 1}: invalid_json`);
      continue;
    }
    if (!isCalibrationAdmissionOverlapUniverseRecordV1(value)) {
      errors.push(`line ${index + 1}: invalid_overlap_record`);
      continue;
    }
    try {
      if (calibrationAdmissionCanonicalJson(value) !== line) {
        errors.push(`line ${index + 1}: noncanonical_json`);
        continue;
      }
    } catch {
      errors.push(`line ${index + 1}: canonical_json_error`);
      continue;
    }
    records.push(value);
  }

  if (!isCalibrationAdmissionNormalizerRegistryV1(normalizerRegistry)) {
    errors.push('normalizer_registry_invalid');
  }
  const validation = validateCalibrationAdmissionOverlapUniverseStream(
    universe,
    records,
    normalizerRegistry,
    bytes,
  );
  errors.push(...validation.errors);
  return {
    ok: errors.length === 0 && validation.ok,
    records,
    bytes,
    recordsJsonlSha256: sha256(bytes),
    validation,
    errors: [...new Set(errors)],
  };
}

/** Async view for the required future ledger interface without re-reading bytes. */
export async function* asAdmissionOverlapRecordStream(
  records: readonly AdmissionOverlapUniverseRecordV1[],
): AsyncIterable<AdmissionOverlapUniverseRecordV1> {
  for (const record of records) yield record;
}
