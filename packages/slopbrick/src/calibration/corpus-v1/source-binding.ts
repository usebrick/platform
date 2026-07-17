import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { TextDecoder } from 'node:util';
import { canonicalJson } from '../v103/canonical';
import {
  inventoryMendeleyCorpusV1,
  type MendeleyCorpusV1Expectations,
} from './inventory';

const SOURCE_ROOT = 'sources/benchmarks/humanvsai-code-dataset';
const CSV_PATH = `${SOURCE_ROOT}/extracted/Code_Dataset/HumanVsAI_CodeDataset.csv`;
const PROJECTION_MANIFEST_PATH = `${SOURCE_ROOT}/projection-v1/projection-manifest.jsonl`;
const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
const CSV_HEADERS = ['problem_id', 'Sample_Code', 'Generated', 'Language', 'Source'] as const;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const UTF8 = new TextDecoder('utf-8', { fatal: true });

export const CORPUS_V1_SOURCE_BINDING_VERSION = 'corpus-v1-source-binding-v1' as const;

export interface ReconcileCorpusV1SourceRowsInput {
  readonly sourceId: string;
  readonly csvBytes: Uint8Array;
  readonly projectionManifestBytes: Uint8Array;
}

export interface CorpusV1SourceBindingReceipt {
  readonly version: typeof CORPUS_V1_SOURCE_BINDING_VERSION;
  readonly sourceId: string;
  readonly authorityTier: 'publisher_attested';
  readonly rightsDisposition: 'internal_analysis';
  readonly csvSha256: string;
  readonly projectionManifestSha256: string;
  readonly rowBindingSha256: string;
  readonly rows: {
    readonly matched: number;
    readonly positive: number;
    readonly negative: number;
  };
  readonly sourceClaims: Readonly<Record<string, number>>;
  readonly languages: Readonly<Record<string, number>>;
}

export interface CorpusV1SourceBindingResult {
  readonly receipt: CorpusV1SourceBindingReceipt;
  readonly receiptJson: string;
  readonly receiptSha256: string;
}

export interface BindMendeleyCorpusV1SourceRowsInput {
  readonly corpusRoot: string;
  readonly expectations?: MendeleyCorpusV1Expectations;
}

interface ProjectionBindingRow {
  readonly recordId: string;
  readonly rowOrdinal: number;
  readonly problemId: string;
  readonly declaredPolarity: 'AI' | 'Human';
  readonly language: string;
  readonly sourceClaim: string;
  readonly bytes: number;
  readonly contentSha256: string;
  readonly materializedSha256: string;
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function decodeUtf8(bytes: Uint8Array, name: string): string {
  try {
    return UTF8.decode(bytes);
  } catch {
    throw new Error(`${name} must be valid UTF-8`);
  }
}

function parseCsvRecords(bytes: Uint8Array): readonly (readonly string[])[] {
  const source = decodeUtf8(bytes, 'publisher CSV');
  if (!source.endsWith('\n')) throw new Error('publisher CSV has a trailing partial record');
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  let closedQuote = false;

  const endField = (): void => {
    record.push(field);
    field = '';
    closedQuote = false;
  };
  const endRecord = (): void => {
    endField();
    records.push(record);
    record = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (inQuotes) {
      if (character !== '"') {
        field += character;
      } else if (source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = false;
        closedQuote = true;
      }
      continue;
    }
    if (closedQuote && character !== ',' && character !== '\r' && character !== '\n') {
      throw new Error('publisher CSV has characters after a closing quote');
    }
    if (character === '"') {
      if (field.length > 0 || closedQuote) throw new Error('publisher CSV has a stray quote');
      inQuotes = true;
    } else if (character === ',') {
      endField();
    } else if (character === '\n') {
      endRecord();
    } else if (character === '\r') {
      if (source[index + 1] !== '\n') throw new Error('publisher CSV has a bare carriage return');
      endRecord();
      index += 1;
    } else {
      field += character;
    }
  }
  if (inQuotes) throw new Error('publisher CSV has an unterminated quote');
  if (record.length > 0 || field.length > 0 || closedQuote) {
    throw new Error('publisher CSV has a trailing partial record');
  }
  return records;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string, row: number): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`projection row ${row} requires ${key}`);
  return value;
}

function requiredInteger(record: Record<string, unknown>, key: string, row: number): number {
  const value = record[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`projection row ${row} requires ${key}`);
  }
  return value as number;
}

function parseProjectionRow(line: string, row: number): ProjectionBindingRow {
  const value: unknown = JSON.parse(line);
  if (!isRecord(value)) throw new Error(`projection row ${row} must be an object`);
  const declaredPolarity = value.declaredPolarity;
  if (declaredPolarity !== 'AI' && declaredPolarity !== 'Human') {
    throw new Error(`projection row ${row} requires declaredPolarity`);
  }
  const contentSha256 = requiredString(value, 'contentSha256', row);
  const materializedSha256 = requiredString(value, 'materializedSha256', row);
  if (!SHA256_PATTERN.test(contentSha256) || !SHA256_PATTERN.test(materializedSha256)) {
    throw new Error(`projection row ${row} has an invalid content hash`);
  }
  return {
    recordId: requiredString(value, 'recordId', row),
    rowOrdinal: requiredInteger(value, 'rowOrdinal', row),
    problemId: requiredString(value, 'problemId', row),
    declaredPolarity,
    language: requiredString(value, 'language', row),
    sourceClaim: requiredString(value, 'sourceClaim', row),
    bytes: requiredInteger(value, 'bytes', row),
    contentSha256,
    materializedSha256,
  };
}

function parseProjectionRows(bytes: Uint8Array): readonly ProjectionBindingRow[] {
  const source = decodeUtf8(bytes, 'projection manifest');
  if (!source.endsWith('\n')) throw new Error('projection manifest has a trailing partial row');
  const lines = source.slice(0, -1).split('\n');
  if (lines.some((line) => line.length === 0)) throw new Error('projection manifest contains an empty row');
  return lines.map((line, index) => parseProjectionRow(line, index + 1));
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function sortedRecord(counts: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function assertEqual(actual: unknown, expected: unknown, row: number, field: string): void {
  if (actual !== expected) throw new Error(`row ${row} ${field} mismatch`);
}

export function reconcileCorpusV1SourceRows(
  input: ReconcileCorpusV1SourceRowsInput,
): CorpusV1SourceBindingResult {
  if (input.sourceId.length === 0) throw new Error('sourceId must be non-empty');
  const csv = parseCsvRecords(input.csvBytes);
  const header = csv[0];
  if (header === undefined || canonicalJson(header) !== canonicalJson(CSV_HEADERS)) {
    throw new Error('publisher CSV header does not match the pinned five-column contract');
  }
  const csvRows = csv.slice(1);
  const projectionRows = parseProjectionRows(input.projectionManifestBytes);
  if (csvRows.length !== projectionRows.length) throw new Error('publisher CSV and projection row count mismatch');

  const sourceClaims: Record<string, number> = {};
  const languages: Record<string, number> = {};
  const bindingHash = createHash('sha256');
  let positive = 0;
  for (let index = 0; index < csvRows.length; index += 1) {
    const ordinal = index + 1;
    const fields = csvRows[index]!;
    if (fields.length !== CSV_HEADERS.length) throw new Error(`publisher CSV row ${ordinal} must have five fields`);
    const [problemId, sampleCode, polarity, language, sourceClaim] = fields;
    if (!problemId || !sampleCode || !language || !sourceClaim || (polarity !== 'AI' && polarity !== 'Human')) {
      throw new Error(`publisher CSV row ${ordinal} contains an invalid required field`);
    }
    const projection = projectionRows[index]!;
    const expectedRecordId = `${input.sourceId}:${String(ordinal).padStart(5, '0')}`;
    const contentSha256 = sha256(sampleCode);
    assertEqual(projection.rowOrdinal, ordinal, ordinal, 'rowOrdinal');
    assertEqual(projection.recordId, expectedRecordId, ordinal, 'recordId');
    assertEqual(projection.problemId, problemId, ordinal, 'problemId');
    assertEqual(projection.declaredPolarity, polarity, ordinal, 'declaredPolarity');
    assertEqual(projection.language, language, ordinal, 'language');
    assertEqual(projection.sourceClaim, sourceClaim, ordinal, 'sourceClaim');
    assertEqual(projection.bytes, Buffer.byteLength(sampleCode), ordinal, 'bytes');
    assertEqual(projection.contentSha256, contentSha256, ordinal, 'contentSha256');
    assertEqual(projection.materializedSha256, contentSha256, ordinal, 'materializedSha256');
    if (polarity === 'AI') positive += 1;
    increment(sourceClaims, sourceClaim);
    increment(languages, language);
    bindingHash.update(`${canonicalJson({
      recordId: projection.recordId,
      rowOrdinal: ordinal,
      problemId,
      declaredPolarity: polarity,
      language,
      sourceClaim,
      contentSha256,
    })}\n`);
  }

  const receipt: CorpusV1SourceBindingReceipt = {
    version: CORPUS_V1_SOURCE_BINDING_VERSION,
    sourceId: input.sourceId,
    authorityTier: 'publisher_attested',
    rightsDisposition: 'internal_analysis',
    csvSha256: sha256(input.csvBytes),
    projectionManifestSha256: sha256(input.projectionManifestBytes),
    rowBindingSha256: bindingHash.digest('hex'),
    rows: { matched: csvRows.length, positive, negative: csvRows.length - positive },
    sourceClaims: sortedRecord(sourceClaims),
    languages: sortedRecord(languages),
  };
  const receiptJson = canonicalJson(receipt);
  return { receipt, receiptJson, receiptSha256: sha256(receiptJson) };
}

function isContained(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return fromRoot !== '..'
    && !fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
    && !isAbsolute(fromRoot);
}

async function readBoundedFile(root: string, relativePath: string, name: string): Promise<Buffer> {
  const candidate = resolve(root, relativePath);
  const lexicalMetadata = await lstat(candidate);
  if (lexicalMetadata.isSymbolicLink() || !lexicalMetadata.isFile()) {
    throw new Error(`${name} must be a regular, non-symlink file`);
  }
  const canonical = await realpath(candidate);
  if (!isContained(root, canonical)) throw new Error(`${name} resolves outside the corpus root`);
  const handle = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error(`${name} must remain a regular file`);
    if (metadata.size > MAX_SOURCE_BYTES) throw new Error(`${name} exceeds the source-binding byte limit`);
    const bytes = Buffer.alloc(metadata.size);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.byteLength - offset, offset);
      if (bytesRead === 0) throw new Error(`${name} changed while it was being read`);
      offset += bytesRead;
    }
    const probe = Buffer.alloc(1);
    if ((await handle.read(probe, 0, 1, offset)).bytesRead !== 0) {
      throw new Error(`${name} changed while it was being read`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

/** Bind raw publisher columns to the pinned projection without writing data. */
export async function bindMendeleyCorpusV1SourceRows(
  input: BindMendeleyCorpusV1SourceRowsInput,
): Promise<CorpusV1SourceBindingResult> {
  const inventory = await inventoryMendeleyCorpusV1(input);
  const root = await realpath(resolve(input.corpusRoot));
  const [csvBytes, projectionManifestBytes] = await Promise.all([
    readBoundedFile(root, CSV_PATH, 'publisher CSV'),
    readBoundedFile(root, PROJECTION_MANIFEST_PATH, 'projection manifest'),
  ]);
  const result = reconcileCorpusV1SourceRows({
    sourceId: inventory.sourceId,
    csvBytes,
    projectionManifestBytes,
  });
  if (
    result.receipt.csvSha256 !== inventory.csv.sha256
    || result.receipt.projectionManifestSha256 !== inventory.projectionManifest.sha256
  ) {
    throw new Error('source-binding bytes changed after the pinned inventory preflight');
  }
  if (
    result.receipt.rows.matched !== inventory.rows.raw
    || result.receipt.rows.positive !== inventory.rows.positive
    || result.receipt.rows.negative !== inventory.rows.negative
    || canonicalJson(result.receipt.sourceClaims) !== canonicalJson(inventory.sourceClaims)
    || canonicalJson(result.receipt.languages) !== canonicalJson(inventory.languages)
  ) {
    throw new Error('source-binding receipt does not reconcile with the pinned inventory');
  }
  return result;
}
