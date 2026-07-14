import { createHash, type Hash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import {
  calibrationAdmissionCanonicalJson,
  isCalibrationAdmissionNormalizerRegistryV1,
  isCalibrationAdmissionOverlapUniverseRecordV1,
  isCalibrationAdmissionOverlapUniverseV1,
  type AdmissionNormalizerRegistryV1,
  type AdmissionOverlapUniverseRecordV1,
  type AdmissionOverlapUniverseV1,
} from '@usebrick/core';

export type AdmissionOverlapStreamChunk = Uint8Array | string;
export type AdmissionOverlapStreamInput = AdmissionOverlapStreamChunk | AsyncIterable<AdmissionOverlapStreamChunk>;

export interface AdmissionOverlapIncrementalStats {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly bytesRead: number;
  readonly recordsJsonlSha256: string;
  readonly recordCount: number;
  readonly covered: number;
  readonly unsupported: number;
  readonly unreadable: number;
  readonly unresolvedCandidateUnitIds: readonly string[];
}

export interface AdmissionOverlapIncrementalStream {
  /** Single-consumer stream; records are never retained after yielding. */
  readonly records: AsyncIterable<AdmissionOverlapUniverseRecordV1>;
  /** Resolves only after the record stream is exhausted or fails closed. */
  readonly complete: Promise<AdmissionOverlapIncrementalStats>;
}

export interface AdmissionOverlapIncrementalOptions {
  /** Frozen production default; tests may lower it but never raise it. */
  readonly maxUnitBytes?: number;
}

const DEFAULT_MAX_UNIT_BYTES = 33_554_432;
const SHA256 = /^[a-f0-9]{64}$/;

function sourceChunks(input: AdmissionOverlapStreamInput): AsyncIterable<Uint8Array> {
  if (typeof input === 'string') {
    const bytes = Buffer.from(input, 'utf8');
    return (async function* (): AsyncIterable<Uint8Array> { yield bytes; }());
  }
  if (input instanceof Uint8Array) {
    return (async function* (): AsyncIterable<Uint8Array> { yield input; }());
  }
  return (async function* (): AsyncIterable<Uint8Array> {
    for await (const chunk of input) {
      if (typeof chunk === 'string') yield Buffer.from(chunk, 'utf8');
      else if (chunk instanceof Uint8Array) yield chunk;
      else throw new TypeError('overlap stream chunks must be strings or Uint8Array values');
    }
  }());
}

function uniqueErrors(errors: readonly string[]): readonly string[] { return [...new Set(errors)]; }

function safeLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MAX_UNIT_BYTES;
  if (!Number.isSafeInteger(value) || value < 1 || value > DEFAULT_MAX_UNIT_BYTES) throw new RangeError('maxUnitBytes must be a positive value no greater than 32 MiB');
  return value;
}

function completeStats(
  hash: Hash,
  errors: readonly string[],
  bytesRead: number,
  recordCount: number,
  covered: number,
  unsupported: number,
  unreadable: number,
  unresolved: readonly string[],
): AdmissionOverlapIncrementalStats {
  let digest: string;
  try { digest = hash.digest('hex'); } catch { digest = ''; }
  return {
    ok: errors.length === 0 && SHA256.test(digest),
    errors: uniqueErrors(errors),
    bytesRead,
    recordsJsonlSha256: digest,
    recordCount,
    covered,
    unsupported,
    unreadable,
    unresolvedCandidateUnitIds: [...unresolved].sort(),
  };
}

/**
 * Open a single-consumer, bounded-memory reader for the canonical universe
 * JSONL stream. It hashes the exact incoming bytes and only retains the
 * current line plus scalar counters; callers must consume `records` to drive
 * the source. Any malformed line, limit breach, summary mismatch, or early
 * iterator termination resolves `complete` with `ok:false`.
 */
export function openAdmissionOverlapUniverseStream(
  input: AdmissionOverlapStreamInput,
  universe: AdmissionOverlapUniverseV1,
  normalizerRegistry: AdmissionNormalizerRegistryV1,
  options: AdmissionOverlapIncrementalOptions = {},
): AdmissionOverlapIncrementalStream {
  let resolveComplete!: (stats: AdmissionOverlapIncrementalStats) => void;
  const complete = new Promise<AdmissionOverlapIncrementalStats>((resolve) => { resolveComplete = resolve; });
  const records = (async function* (): AsyncGenerator<AdmissionOverlapUniverseRecordV1> {
    const hash = createHash('sha256');
    const errors: string[] = [];
    let bytesRead = 0;
    let recordCount = 0;
    let covered = 0;
    let unsupported = 0;
    let unreadable = 0;
    const unresolved: string[] = [];
    let previousCandidateUnitId = '';
    let pending = '';
    let sawNewline = false;
    let completed = false;
    let sourceExhausted = false;
    let maxUnitBytes: number;

    const finish = (): AdmissionOverlapIncrementalStats => {
      if (completed) return completeStats(hash, errors, bytesRead, recordCount, covered, unsupported, unreadable, unresolved);
      completed = true;
      if (bytesRead === 0) errors.push('universe_jsonl_empty');
      if (!sawNewline) errors.push('universe_jsonl_final_newline_required');
      if (pending.length > 0) errors.push('universe_jsonl_final_newline_required');
      if (recordCount === 0 && errors.length === 0) errors.push('universe_jsonl_empty');
      if (errors.length === 0) {
        if (recordCount !== universe.selectedAggregateCoverage + universe.newCandidateUnits) errors.push('record_count_summary_mismatch');
        if (covered !== universe.covered || unsupported !== universe.unsupported || unreadable !== universe.unreadable) errors.push('status_count_summary_mismatch');
        if (JSON.stringify([...unresolved].sort()) !== JSON.stringify(universe.unresolvedCandidateUnitIds)) errors.push('unresolved_summary_mismatch');
        const digest = hash.copy().digest('hex');
        if (digest !== universe.recordsJsonlSha256) errors.push('records_jsonl_hash_mismatch');
      }
      const stats = completeStats(hash, errors, bytesRead, recordCount, covered, unsupported, unreadable, unresolved);
      resolveComplete(stats);
      return stats;
    };

    try {
      try { maxUnitBytes = safeLimit(options.maxUnitBytes); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); finish(); return; }
      if (!isCalibrationAdmissionOverlapUniverseV1(universe)) errors.push('overlap_universe_invalid');
      if (!isCalibrationAdmissionNormalizerRegistryV1(normalizerRegistry)) errors.push('normalizer_registry_invalid');
      if (isCalibrationAdmissionNormalizerRegistryV1(normalizerRegistry) && normalizerRegistry.registrySha256 !== universe.normalizerRegistrySha256) errors.push('normalizer_registry_hash_mismatch');
      const registryByLanguage = isCalibrationAdmissionNormalizerRegistryV1(normalizerRegistry)
        ? new Map(normalizerRegistry.entries.map((entry) => [entry.language, entry.normalizerId])) : undefined;
      if (errors.length > 0) { finish(); return; }

      const decoder = new TextDecoder('utf-8', { fatal: true });
      const consumeLine = async function* (line: string, lineNumber: number): AsyncGenerator<AdmissionOverlapUniverseRecordV1> {
        const lineBytes = Buffer.byteLength(line, 'utf8') + 1;
        if (lineBytes > maxUnitBytes) { errors.push(`line ${lineNumber}: unit_bytes_limit`); return; }
        if (line.length === 0) { errors.push(`line ${lineNumber}: blank_line`); return; }
        if (line.includes('\r')) { errors.push(`line ${lineNumber}: carriage_return_not_canonical`); return; }
        let value: unknown;
        try { value = JSON.parse(line) as unknown; } catch { errors.push(`line ${lineNumber}: invalid_json`); return; }
        if (!isCalibrationAdmissionOverlapUniverseRecordV1(value)) { errors.push(`line ${lineNumber}: invalid_overlap_record`); return; }
        const record = value as AdmissionOverlapUniverseRecordV1;
        if (record.contentBytes > maxUnitBytes) { errors.push(`line ${lineNumber}: content_bytes_limit`); return; }
        try {
          if (calibrationAdmissionCanonicalJson(record) !== line) { errors.push(`line ${lineNumber}: noncanonical_json`); return; }
        } catch { errors.push(`line ${lineNumber}: canonical_json_error`); return; }
        if (record.candidateUnitId <= previousCandidateUnitId) { errors.push(`line ${lineNumber}: candidate_order_or_duplicate`); return; }
        previousCandidateUnitId = record.candidateUnitId;
        if (registryByLanguage) {
          const expected = registryByLanguage.get(record.language);
          if (record.normalizationStatus === 'covered' && expected !== record.normalizerId) { errors.push(`line ${lineNumber}: covered_normalizer_binding`); return; }
          // A known normalizer can still produce an intentionally unresolved
          // row (for example strict UTF-8 decoding may fail after language
          // dispatch). Only an unsupported language is contradictory when it
          // carries a registered normalizer binding.
          if (record.normalizationStatus === 'unsupported' && expected === record.normalizerId) { errors.push(`line ${lineNumber}: unresolved_normalizer_binding`); return; }
        }
        recordCount += 1;
        if (record.normalizationStatus === 'covered') covered += 1;
        else if (record.normalizationStatus === 'unsupported') { unsupported += 1; unresolved.push(record.candidateUnitId); }
        else { unreadable += 1; unresolved.push(record.candidateUnitId); }
        yield record;
      };

      let lineNumber = 0;
      for await (const bytes of sourceChunks(input)) {
        if (errors.length > 0) break;
        bytesRead += bytes.byteLength;
        hash.update(bytes);
        try { pending += decoder.decode(bytes, { stream: true }); } catch { errors.push('universe_jsonl_utf8_invalid'); break; }
        let newline = pending.indexOf('\n');
        while (newline >= 0) {
          const line = pending.slice(0, newline);
          pending = pending.slice(newline + 1);
          lineNumber += 1;
          sawNewline = true;
          for await (const record of consumeLine(line, lineNumber)) yield record;
          if (errors.length > 0) break;
          newline = pending.indexOf('\n');
        }
        // Only the unterminated suffix is retained. A large chunk may contain
        // many valid lines, so checking the whole decoded chunk here would
        // reject a valid stream merely because its producer chose a large
        // read size.
        if (errors.length === 0 && Buffer.byteLength(pending, 'utf8') > maxUnitBytes) { errors.push('universe_jsonl_unit_limit'); break; }
      }
      sourceExhausted = errors.length === 0;
      if (errors.length === 0) {
        try { pending += decoder.decode(); } catch { errors.push('universe_jsonl_utf8_invalid'); }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    } finally {
      if (!sourceExhausted && errors.length === 0) errors.push('stream_not_fully_consumed');
      if (!completed) finish();
    }
  }());
  return { records, complete };
}
