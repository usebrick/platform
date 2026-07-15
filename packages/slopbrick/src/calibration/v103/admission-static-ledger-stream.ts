import { createHash, type Hash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, open, rename, rm, type FileHandle } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { basename, join, relative, resolve, sep } from 'node:path';
import { TextDecoder } from 'node:util';

import {
  calibrationAdmissionCanonicalJson,
  isCalibrationAdmissionLineageResultV1,
  isCalibrationAdmissionPrivacyResultV1,
  isCalibrationAdmissionQualityResultV1,
  isCalibrationAdmissionRecordV103,
  validateCalibrationAdmissionLineageResultV1,
  validateCalibrationAdmissionPrivacyResultV1,
  validateCalibrationAdmissionQualityResultV1,
  validateCalibrationAdmissionRecordV103,
} from '@usebrick/core';

/**
 * Disk-backed static-ledger intake for the real-scale boundary.
 *
 * This adapter deliberately emits JSONL projections and a semantic receipt,
 * rather than constructing Core's array-shaped ledger object in memory.  The
 * outer authority publisher may consume the projections later; this function
 * is diagnostic-only and never promotes labels or writes to the corpus.
 */

export type AdmissionStaticLedgerKind = 'privacy' | 'quality' | 'lineage';
export type AdmissionStaticLedgerStreamChunk = Uint8Array | string;
export type AdmissionStaticLedgerJsonlInput =
  | AdmissionStaticLedgerStreamChunk
  | AsyncIterable<AdmissionStaticLedgerStreamChunk>;

export const MAX_STATIC_LEDGER_RECORDS = 452_382 as const;
export const MAX_STATIC_LEDGER_ROW_BYTES = 32 * 1024 * 1024;
export const DEFAULT_STATIC_LEDGER_OUTPUT_BYTES = 5 * 1024 * 1024 * 1024;

const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const VERSION_BY_KIND: Readonly<Record<AdmissionStaticLedgerKind, string>> = Object.freeze({
  privacy: 'v10.3-admission-privacy-ledger-v1',
  quality: 'v10.3-admission-quality-ledger-v1',
  lineage: 'v10.3-admission-lineage-ledger-v1',
});

export interface AdmissionStaticLedgerStreamRequestV1 {
  readonly kind: AdmissionStaticLedgerKind;
  readonly records: AdmissionStaticLedgerJsonlInput;
  readonly results: AdmissionStaticLedgerJsonlInput;
  /** One canonical JSON string ID per line. */
  readonly unresolvedRecordIds: AdmissionStaticLedgerJsonlInput;
  /** Caller-owned staging root; no corpus discovery is performed. */
  readonly outputDirectory: string;
  readonly maxRecords?: number;
  readonly maxOutputBytes?: number;
  /** The real authority path is intentionally single-worker. */
  readonly workerCount?: number;
}

export interface AdmissionStaticLedgerStreamReceiptV1 {
  readonly version: 'v10.3-admission-static-ledger-stream-receipt-v1';
  readonly kind: AdmissionStaticLedgerKind;
  readonly ledgerVersion: string;
  readonly recordCount: number;
  readonly coveredCount: number;
  readonly unresolvedCount: number;
  readonly recordSetSha256: string;
  readonly recordsInputSha256: string;
  readonly resultsInputSha256: string;
  readonly unresolvedInputSha256: string;
  readonly resultsJsonlSha256: string;
  readonly coveredRecordIdsSha256: string;
  readonly unresolvedRecordIdsSha256: string;
  readonly ledgerSha256: string | null;
  readonly outputBytes: number;
  readonly resultBytes: number;
  readonly coveredRecordIdsBytes: number;
  readonly unresolvedRecordIdsBytes: number;
  readonly outputDirectory: string | null;
  readonly resultRelativePath: string | null;
  readonly coveredRelativePath: string | null;
  readonly unresolvedRelativePath: string | null;
  readonly maxRecords: number;
  readonly maxOutputBytes: number;
  readonly workerCount: 1;
  readonly complete: boolean;
  readonly diagnosticOnly: true;
  readonly authorityEligible: false;
  readonly errors: readonly string[];
}

export type AdmissionStaticLedgerStreamResultV1 =
  | Readonly<{ readonly ok: true; readonly receipt: AdmissionStaticLedgerStreamReceiptV1 }>
  | Readonly<{ readonly ok: false; readonly receipt: AdmissionStaticLedgerStreamReceiptV1 }>;

interface ParsedLine {
  readonly value: unknown;
  readonly canonicalLine: string;
  readonly bytes: Buffer;
  readonly lineNumber: number;
}

interface MutableFile {
  readonly handle: FileHandle;
  readonly path: string;
  readonly hash: Hash;
  bytes: number;
}

function uniqueErrors(errors: readonly string[]): readonly string[] {
  return [...new Set(errors)];
}

function isKind(value: unknown): value is AdmissionStaticLedgerKind {
  return value === 'privacy' || value === 'quality' || value === 'lineage';
}

function asChunks(input: AdmissionStaticLedgerJsonlInput): AsyncIterable<Uint8Array> {
  if (typeof input === 'string') {
    const bytes = Buffer.from(input, 'utf8');
    return (async function* (): AsyncGenerator<Uint8Array> { yield bytes; }());
  }
  if (input instanceof Uint8Array) {
    return (async function* (): AsyncGenerator<Uint8Array> { yield input; }());
  }
  return (async function* (): AsyncGenerator<Uint8Array> {
    for await (const chunk of input) {
      if (typeof chunk === 'string') yield Buffer.from(chunk, 'utf8');
      else if (chunk instanceof Uint8Array) yield chunk;
      else throw new TypeError('static ledger JSONL chunks must be strings or Uint8Array values');
    }
  }());
}

async function* jsonLines(input: AdmissionStaticLedgerJsonlInput, label: string, allowEmpty = false): AsyncGenerator<ParsedLine> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let pending = '';
  let lineNumber = 0;
  let sawBytes = false;
  let sawNewline = false;
  for await (const chunk of asChunks(input)) {
    sawBytes = sawBytes || chunk.byteLength > 0;
    try {
      pending += decoder.decode(chunk, { stream: true });
    } catch {
      throw new Error(`${label}:invalid_utf8`);
    }
    let newline = pending.indexOf('\n');
    while (newline >= 0) {
      const line = pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      lineNumber += 1;
      sawNewline = true;
      const bytes = Buffer.from(`${line}\n`, 'utf8');
      if (line.length === 0 || line.includes('\r')) throw new Error(`${label}:${lineNumber}:malformed_line`);
      if (bytes.byteLength > MAX_STATIC_LEDGER_ROW_BYTES) throw new Error(`${label}:${lineNumber}:row_too_large`);
      let value: unknown;
      try {
        value = JSON.parse(line) as unknown;
      } catch {
        throw new Error(`${label}:${lineNumber}:invalid_json`);
      }
      let canonicalLine: string;
      try {
        canonicalLine = calibrationAdmissionCanonicalJson(value);
      } catch {
        throw new Error(`${label}:${lineNumber}:non_canonical_value`);
      }
      if (canonicalLine !== line) throw new Error(`${label}:${lineNumber}:non_canonical_json`);
      yield { value, canonicalLine, bytes, lineNumber };
      newline = pending.indexOf('\n');
    }
    if (Buffer.byteLength(pending, 'utf8') > MAX_STATIC_LEDGER_ROW_BYTES) {
      throw new Error(`${label}:row_too_large`);
    }
  }
  try {
    pending += decoder.decode();
  } catch {
    throw new Error(`${label}:invalid_utf8`);
  }
  if (pending.length > 0 || (!sawNewline && sawBytes)) throw new Error(`${label}:final_newline_required`);
  if (!sawBytes && !allowEmpty) throw new Error(`${label}:empty`);
}

function idHash(): Hash {
  const hash = createHash('sha256');
  hash.update('[');
  return hash;
}

function updateArrayHash(hash: Hash, value: unknown, state: { first: boolean }): void {
  if (!state.first) hash.update(',');
  state.first = false;
  hash.update(calibrationAdmissionCanonicalJson(value), 'utf8');
}

function finishArrayHash(hash: Hash): string {
  hash.update(']');
  return hash.digest('hex');
}

function inputHash(): Hash {
  return createHash('sha256');
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function validationError(label: string, errors: readonly string[]): Error {
  return new Error(`${label}:${uniqueErrors(errors).join('|') || 'invalid'}`);
}

function validateRecord(value: unknown, label: string): { readonly recordId: string; readonly contentSha256: string } {
  const validation = validateCalibrationAdmissionRecordV103(value);
  if (!validation.ok || !isCalibrationAdmissionRecordV103(value)) throw validationError(label, validation.errors);
  const record = value as { readonly recordId: string; readonly contentSha256: string };
  if (!validId(record.recordId)) throw new Error(`${label}:record_id_invalid`);
  return record;
}

function validateResult(kind: AdmissionStaticLedgerKind, value: unknown, label: string): { readonly recordId: string; readonly contentSha256: string } {
  const validation = kind === 'privacy'
    ? validateCalibrationAdmissionPrivacyResultV1(value)
    : kind === 'quality'
      ? validateCalibrationAdmissionQualityResultV1(value)
      : validateCalibrationAdmissionLineageResultV1(value);
  const valid = kind === 'privacy'
    ? isCalibrationAdmissionPrivacyResultV1(value)
    : kind === 'quality'
      ? isCalibrationAdmissionQualityResultV1(value)
      : isCalibrationAdmissionLineageResultV1(value);
  if (!validation.ok || !valid) throw validationError(label, validation.errors);
  const result = value as { readonly recordId: string; readonly contentSha256: string };
  if (!validId(result.recordId)) throw new Error(`${label}:record_id_invalid`);
  return result;
}

async function assertSafeRoot(root: string): Promise<void> {
  const resolved = resolve(root);
  try {
    if ((await lstat(resolved)).isSymbolicLink()) throw new Error('output_root_symlink');
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
  }
  const parent = resolve(resolved, '..');
  const parentRelative = relative(parent, resolved);
  if (parentRelative === '..' || parentRelative.startsWith(`..${sep}`)) throw new Error('output_root_containment');
}

async function publishDirectory(stage: string, destination: string): Promise<void> {
  try {
    await lstat(destination);
    throw new Error('output_directory_exists');
  } catch (error) {
    if ((error as { code?: string }).code !== 'ENOENT') throw error;
  }
  await assertSafeRoot(destination);
  await rename(stage, destination);
}

async function openOutput(path: string): Promise<MutableFile> {
  const handle = await open(path, 'wx', 0o600);
  return { handle, path, hash: createHash('sha256'), bytes: 0 };
}

async function writeLine(file: MutableFile, line: string): Promise<number> {
  const bytes = Buffer.from(`${line}\n`, 'utf8');
  await file.handle.write(bytes);
  file.hash.update(bytes);
  file.bytes += bytes.byteLength;
  return bytes.byteLength;
}

async function closeFile(file: MutableFile): Promise<void> {
  await file.handle.sync();
  await file.handle.close();
}

async function appendArrayFile(path: string, hash: Hash): Promise<void> {
  const reader = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  let first = true;
  try {
    for await (const line of reader) {
      if (line.length === 0 || line.includes('\r')) throw new Error('output_jsonl_invalid');
      if (!first) hash.update(',');
      first = false;
      hash.update(line, 'utf8');
    }
  } finally {
    reader.close();
  }
  hash.update(']');
}

async function hashArrayFile(path: string, hash: Hash): Promise<string> {
  await appendArrayFile(path, hash);
  return hash.digest('hex');
}

async function semanticLedgerHash(
  kind: AdmissionStaticLedgerKind,
  recordSetSha256: string,
  coveredPath: string,
  resultsPath: string,
  unresolvedPath: string,
): Promise<string> {
  const hash = createHash('sha256');
  hash.update('{"admissionRecordSetSha256":');
  hash.update(calibrationAdmissionCanonicalJson(recordSetSha256), 'utf8');
  hash.update(',"coveredRecordIds":[');
  await appendArrayFile(coveredPath, hash);
  hash.update(',"results":[');
  await appendArrayFile(resultsPath, hash);
  hash.update(',"unresolvedRecordIds":[');
  await appendArrayFile(unresolvedPath, hash);
  hash.update(',"version":');
  hash.update(calibrationAdmissionCanonicalJson(VERSION_BY_KIND[kind]), 'utf8');
  hash.update('}');
  return hash.digest('hex');
}

function emptyReceipt(
  request: AdmissionStaticLedgerStreamRequestV1,
  maxRecords: number,
  maxOutputBytes: number,
  errors: readonly string[],
  counters?: Partial<Pick<AdmissionStaticLedgerStreamReceiptV1, 'recordCount' | 'coveredCount' | 'unresolvedCount' | 'outputBytes' | 'resultBytes' | 'coveredRecordIdsBytes' | 'unresolvedRecordIdsBytes'>>,
): AdmissionStaticLedgerStreamReceiptV1 {
  return {
    version: 'v10.3-admission-static-ledger-stream-receipt-v1',
    kind: request.kind,
    ledgerVersion: VERSION_BY_KIND[request.kind],
    recordCount: counters?.recordCount ?? 0,
    coveredCount: counters?.coveredCount ?? 0,
    unresolvedCount: counters?.unresolvedCount ?? 0,
    recordSetSha256: '',
    recordsInputSha256: '',
    resultsInputSha256: '',
    unresolvedInputSha256: '',
    resultsJsonlSha256: '',
    coveredRecordIdsSha256: '',
    unresolvedRecordIdsSha256: '',
    ledgerSha256: null,
    outputBytes: counters?.outputBytes ?? 0,
    resultBytes: counters?.resultBytes ?? 0,
    coveredRecordIdsBytes: counters?.coveredRecordIdsBytes ?? 0,
    unresolvedRecordIdsBytes: counters?.unresolvedRecordIdsBytes ?? 0,
    outputDirectory: null,
    resultRelativePath: null,
    coveredRelativePath: null,
    unresolvedRelativePath: null,
    maxRecords,
    maxOutputBytes,
    workerCount: 1,
    complete: false,
    diagnosticOnly: true,
    authorityEligible: false,
    errors: uniqueErrors(errors),
  };
}

/** Stream, validate, and persist one static-ledger projection without a row-sized array. */
export async function materializeAdmissionStaticLedgerStream(
  request: AdmissionStaticLedgerStreamRequestV1,
): Promise<AdmissionStaticLedgerStreamResultV1> {
  const maxRecords = request.maxRecords ?? MAX_STATIC_LEDGER_RECORDS;
  const maxOutputBytes = request.maxOutputBytes ?? DEFAULT_STATIC_LEDGER_OUTPUT_BYTES;
  if (!isKind(request.kind)) return { ok: false, receipt: emptyReceipt(request, maxRecords, maxOutputBytes, ['kind_invalid']) };
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > MAX_STATIC_LEDGER_RECORDS) {
    return { ok: false, receipt: emptyReceipt(request, maxRecords, maxOutputBytes, ['max_records_invalid']) };
  }
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1) {
    return { ok: false, receipt: emptyReceipt(request, maxRecords, maxOutputBytes, ['max_output_bytes_invalid']) };
  }
  if (request.workerCount !== undefined && request.workerCount !== 1) {
    return { ok: false, receipt: emptyReceipt(request, maxRecords, maxOutputBytes, ['fixture_requires_one_worker']) };
  }

  const root = resolve(request.outputDirectory);
  const finalDirectory = join(root, `${request.kind}-ledger-v1`);
  const stage = join(root, `.${request.kind}-ledger-v1.${randomUUID()}.tmp`);
  const errors: string[] = [];
  let recordsFile: MutableFile | undefined;
  let resultsFile: MutableFile | undefined;
  let coveredFile: MutableFile | undefined;
  let unresolvedFile: MutableFile | undefined;
  let stageCreated = false;
  let recordCount = 0;
  let coveredCount = 0;
  let unresolvedCount = 0;
  let outputBytes = 0;
  const recordIds = idHash();
  const recordIdState = { first: true };
  const recordsInput = inputHash();
  const resultsInput = inputHash();
  const unresolvedInput = inputHash();
  let recordSetSha256 = '';
  let resultRelativePath: string | null = null;
  let coveredRelativePath: string | null = null;
  let unresolvedRelativePath: string | null = null;

  try {
    await mkdir(root, { recursive: true });
    await assertSafeRoot(root);
    await mkdir(stage, { recursive: true });
    stageCreated = true;
    recordsFile = await openOutput(join(stage, 'records.jsonl'));
    resultsFile = await openOutput(join(stage, 'results.jsonl'));
    coveredFile = await openOutput(join(stage, 'covered-record-ids.jsonl'));
    unresolvedFile = await openOutput(join(stage, 'unresolved-record-ids.jsonl'));

    const recordsIterator = jsonLines(request.records, 'records')[Symbol.asyncIterator]();
    const resultsIterator = jsonLines(request.results, 'results', true)[Symbol.asyncIterator]();
    const unresolvedIterator = jsonLines(request.unresolvedRecordIds, 'unresolved', true)[Symbol.asyncIterator]();
    let recordNext = await recordsIterator.next();
    let resultNext = await resultsIterator.next();
    let unresolvedNext = await unresolvedIterator.next();
    let previousRecordId = '';
    let previousResultId = '';
    let previousUnresolvedId = '';

    while (!recordNext.done) {
      const parsedRecord = recordNext.value;
      const record = validateRecord(parsedRecord.value, `records:${parsedRecord.lineNumber}`);
      if (record.recordId <= previousRecordId) throw new Error('records:not_strictly_sorted');
      previousRecordId = record.recordId;
      recordCount += 1;
      if (recordCount > maxRecords) throw new Error('records:max_records_exceeded');
      updateArrayHash(recordIds, record.recordId, recordIdState);
      recordsInput.update(parsedRecord.bytes);
      outputBytes += await writeLine(recordsFile!, parsedRecord.canonicalLine);

      const resultValue = resultNext.done ? undefined : resultNext.value;
      const unresolvedValue = unresolvedNext.done ? undefined : unresolvedNext.value;
      const resultRecordId = resultValue && typeof resultValue.value === 'object' && resultValue.value !== null
        && !Array.isArray(resultValue.value) && typeof (resultValue.value as { recordId?: unknown }).recordId === 'string'
        ? (resultValue.value as { recordId: string }).recordId
        : undefined;
      const unresolvedId = unresolvedValue?.value;
      if (resultRecordId !== undefined && resultRecordId <= previousResultId) throw new Error('results:not_strictly_sorted');
      if (resultRecordId !== undefined && !validId(resultRecordId)) throw new Error('results:record_id_invalid');
      if (unresolvedId !== undefined && (!validId(unresolvedId) || unresolvedId <= previousUnresolvedId)) throw new Error('unresolved:not_strictly_sorted_or_invalid');

      if (resultRecordId !== undefined && resultRecordId < record.recordId) throw new Error('results:unknown_record_id');
      if (typeof unresolvedId === 'string' && unresolvedId < record.recordId) throw new Error('unresolved:unknown_record_id');
      if (resultRecordId === record.recordId && unresolvedId === record.recordId) throw new Error('partition:covered_and_unresolved_overlap');

      if (resultRecordId === record.recordId) {
        const result = validateResult(request.kind, resultValue!.value, `results:${resultValue!.lineNumber}`);
        if (result.contentSha256 !== record.contentSha256) throw new Error('results:content_hash_mismatch');
        previousResultId = result.recordId;
        resultsInput.update(resultValue!.bytes);
        outputBytes += await writeLine(resultsFile!, resultValue!.canonicalLine);
        outputBytes += await writeLine(coveredFile!, calibrationAdmissionCanonicalJson(record.recordId));
        coveredCount += 1;
      } else if (unresolvedId === record.recordId) {
        previousUnresolvedId = unresolvedId;
        unresolvedInput.update(unresolvedValue!.bytes);
        outputBytes += await writeLine(unresolvedFile!, calibrationAdmissionCanonicalJson(record.recordId));
        unresolvedCount += 1;
      } else {
        throw new Error('partition:record_not_covered_or_unresolved');
      }
      if (outputBytes > maxOutputBytes) throw new Error('output:max_bytes_exceeded');
      recordNext = await recordsIterator.next();
      if (resultRecordId === record.recordId) resultNext = await resultsIterator.next();
      if (unresolvedId === record.recordId) unresolvedNext = await unresolvedIterator.next();
    }

    if (!resultNext.done) throw new Error('results:extra_record');
    if (!unresolvedNext.done) throw new Error('unresolved:extra_record');
    recordSetSha256 = finishArrayHash(recordIds);
    await closeFile(recordsFile!);
    await closeFile(resultsFile!);
    await closeFile(coveredFile!);
    await closeFile(unresolvedFile!);
    const resultsJsonlSha256 = resultsFile.hash.digest('hex');
    const resultBytes = resultsFile.bytes;
    const coveredRecordIdsBytes = coveredFile.bytes;
    const unresolvedRecordIdsBytes = unresolvedFile.bytes;
    recordsFile = undefined;
    resultsFile = undefined;
    coveredFile = undefined;
    unresolvedFile = undefined;

    const resultPath = join(stage, 'results.jsonl');
    const coveredPath = join(stage, 'covered-record-ids.jsonl');
    const unresolvedPath = join(stage, 'unresolved-record-ids.jsonl');
    const coveredHash = await hashArrayFile(coveredPath, idHash());
    const unresolvedHash = await hashArrayFile(unresolvedPath, idHash());
    const ledgerSha256 = await semanticLedgerHash(request.kind, recordSetSha256, coveredPath, resultPath, unresolvedPath);
    await publishDirectory(stage, finalDirectory);
    stageCreated = false;
    resultRelativePath = `${basename(finalDirectory)}/results.jsonl`;
    coveredRelativePath = `${basename(finalDirectory)}/covered-record-ids.jsonl`;
    unresolvedRelativePath = `${basename(finalDirectory)}/unresolved-record-ids.jsonl`;
    const receipt: AdmissionStaticLedgerStreamReceiptV1 = {
      version: 'v10.3-admission-static-ledger-stream-receipt-v1',
      kind: request.kind,
      ledgerVersion: VERSION_BY_KIND[request.kind],
      recordCount,
      coveredCount,
      unresolvedCount,
      recordSetSha256,
      recordsInputSha256: recordsInput.digest('hex'),
      resultsInputSha256: resultsInput.digest('hex'),
      unresolvedInputSha256: unresolvedInput.digest('hex'),
      resultsJsonlSha256,
      coveredRecordIdsSha256: coveredHash,
      unresolvedRecordIdsSha256: unresolvedHash,
      ledgerSha256,
      outputBytes,
      resultBytes,
      coveredRecordIdsBytes,
      unresolvedRecordIdsBytes,
      outputDirectory: finalDirectory,
      resultRelativePath,
      coveredRelativePath,
      unresolvedRelativePath,
      maxRecords,
      maxOutputBytes,
      workerCount: 1,
      complete: true,
      diagnosticOnly: true,
      authorityEligible: false,
      errors: [],
    };
    return { ok: true, receipt };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    for (const file of [recordsFile, resultsFile, coveredFile, unresolvedFile]) {
      if (file !== undefined) await file.handle.close().catch(() => undefined);
    }
    if (stageCreated) await rm(stage, { recursive: true, force: true }).catch(() => undefined);
  }
  return {
    ok: false,
    receipt: emptyReceipt(request, maxRecords, maxOutputBytes, errors, {
      recordCount,
      coveredCount,
      unresolvedCount,
      outputBytes,
      resultBytes: resultsFile?.bytes ?? 0,
      coveredRecordIdsBytes: coveredFile?.bytes ?? 0,
      unresolvedRecordIdsBytes: unresolvedFile?.bytes ?? 0,
    }),
  };
}

export const streamAdmissionStaticLedger = materializeAdmissionStaticLedgerStream;
