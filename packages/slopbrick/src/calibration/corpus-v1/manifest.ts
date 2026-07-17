import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { TextDecoder } from 'node:util';
import { createInterface } from 'node:readline';
import { isAbsolute, relative, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { canonicalJson, canonicalSha256 } from '../v103/canonical';
import { tokenizeAdmissionSource } from '../v103/admission-normalizers';
import {
  inventoryMendeleyCorpusV1,
  type MendeleyCorpusV1Expectations,
  type MendeleyCorpusV1Inventory,
} from './inventory';

const SOURCE_ROOT = 'sources/benchmarks/humanvsai-code-dataset';
const PROJECTION_ROOT = `${SOURCE_ROOT}/projection-v1`;
const PROJECTION_MANIFEST = `${PROJECTION_ROOT}/projection-manifest.jsonl`;
const MAX_UNIT_BYTES = 32 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const UTF8 = new TextDecoder('utf-8', { fatal: true });

export const CORPUS_V1_MANIFEST_BUILDER_VERSION = 'corpus-v1-manifest-builder-v1' as const;
export const CORPUS_V1_NORMALIZER_ID = 'corpus-v1-lexical-tokens-v1' as const;

export type CorpusV1Label = 'positive' | 'negative';
export type CorpusV1CandidateStatus = 'candidate' | 'quarantined';
export type CorpusV1QuarantineReason =
  | 'cross_label_exact_collision'
  | 'cross_label_normalized_collision'
  | 'family_member_quarantined'
  | 'invalid_utf8'
  | 'source_content_hash_mismatch';

export interface CorpusV1CandidateManifestRow {
  readonly corpusVersion: 'v1';
  readonly unitId: string;
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly sourceUri: string;
  readonly sourceArchiveSha256: string;
  readonly sourceRecordId: string;
  readonly contentSha256: string;
  readonly sourceDeclaredContentSha256: string;
  readonly sourceMaterializedContentSha256: string;
  readonly normalizedSha256: string | null;
  readonly normalizerId: typeof CORPUS_V1_NORMALIZER_ID;
  readonly label: CorpusV1Label;
  readonly authorityTier: 'publisher_attested';
  readonly authorityEvidenceRef: 'review/mendeley-humanvsai-audit-2026-07-14.json';
  readonly language: string;
  readonly familyKey: string;
  readonly split: 'unassigned';
  readonly licenseId: 'CC-BY-4.0';
  readonly licenseEvidenceRef: 'sources/benchmarks/humanvsai-code-dataset/datacite-metadata.json';
  readonly rightsDisposition: 'internal_analysis';
  readonly byteCount: number;
  readonly status: CorpusV1CandidateStatus;
  readonly quarantineReasons: readonly CorpusV1QuarantineReason[];
}

export interface CorpusV1CandidateManifestResult {
  readonly version: 'corpus-v1-candidate-manifest-v1';
  readonly builderVersion: typeof CORPUS_V1_MANIFEST_BUILDER_VERSION;
  readonly normalizerId: typeof CORPUS_V1_NORMALIZER_ID;
  readonly rows: readonly CorpusV1CandidateManifestRow[];
  readonly manifestJsonl: string;
  readonly manifestSha256: string;
  readonly counts: {
    readonly raw: number;
    readonly candidate: number;
    readonly quarantined: number;
    readonly positive: number;
    readonly negative: number;
  };
}

export interface ProjectMendeleyCorpusV1CandidateManifestInput {
  readonly corpusRoot: string;
  readonly expectations?: MendeleyCorpusV1Expectations;
}

interface SourceProjectionRow {
  readonly recordId: string;
  readonly problemId: string;
  readonly declaredPolarity: 'AI' | 'Human';
  readonly language: string;
  readonly relativePath: string;
  readonly contentSha256: string;
  readonly materializedSha256: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string, rowNumber: number): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`projection manifest row ${rowNumber} requires ${key}`);
  }
  return value;
}

function parseSourceProjectionRow(line: string, rowNumber: number): SourceProjectionRow {
  const value: unknown = JSON.parse(line);
  if (!isRecord(value)) throw new Error(`projection manifest row ${rowNumber} must be an object`);
  const declaredPolarity = value.declaredPolarity;
  if (declaredPolarity !== 'AI' && declaredPolarity !== 'Human') {
    throw new Error(`projection manifest row ${rowNumber} has an invalid declaredPolarity`);
  }
  const contentSha256 = requiredString(value, 'contentSha256', rowNumber);
  const materializedSha256 = requiredString(value, 'materializedSha256', rowNumber);
  if (!SHA256_PATTERN.test(contentSha256) || !SHA256_PATTERN.test(materializedSha256)) {
    throw new Error(`projection manifest row ${rowNumber} has an invalid source hash`);
  }
  return {
    recordId: requiredString(value, 'recordId', rowNumber),
    problemId: requiredString(value, 'problemId', rowNumber),
    declaredPolarity,
    language: requiredString(value, 'language', rowNumber),
    relativePath: requiredString(value, 'relativePath', rowNumber),
    contentSha256,
    materializedSha256,
  };
}

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizedSha256(bytes: Buffer): string | null {
  let source: string;
  try {
    source = UTF8.decode(bytes).replace(/\r\n?/gu, '\n');
  } catch {
    return null;
  }
  return canonicalSha256({
    normalizerId: CORPUS_V1_NORMALIZER_ID,
    tokens: tokenizeAdmissionSource(source),
  });
}

function isContained(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return fromRoot !== '..'
    && !fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
    && !isAbsolute(fromRoot);
}

async function readContainedUnit(projectionRoot: string, relativePath: string): Promise<Buffer> {
  if (isAbsolute(relativePath) || relativePath.split(/[\\/]/u).includes('..')) {
    throw new Error('projected unit path must stay inside the projection root');
  }
  const path = resolve(projectionRoot, relativePath);
  const lexicalMetadata = await lstat(path);
  if (lexicalMetadata.isSymbolicLink() || !lexicalMetadata.isFile()) {
    throw new Error('projected unit must be a regular, non-symlink file');
  }
  const canonical = await realpath(path);
  if (!isContained(projectionRoot, canonical)) throw new Error('projected unit resolves outside the projection root');
  const handle = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error('projected unit must remain a regular file');
    if (metadata.size > MAX_UNIT_BYTES) throw new Error('projected unit exceeds the byte limit');
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

function unitId(inventory: MendeleyCorpusV1Inventory, sourceRecordId: string): string {
  return `sbv1_${canonicalSha256({
    sourceId: inventory.sourceId,
    sourceVersion: inventory.sourceVersion,
    sourceRecordId,
  })}`;
}

function buildRow(
  inventory: MendeleyCorpusV1Inventory,
  source: SourceProjectionRow,
  bytes: Buffer,
): CorpusV1CandidateManifestRow {
  const contentSha256 = sha256(bytes);
  const normalized = normalizedSha256(bytes);
  const reasons: CorpusV1QuarantineReason[] = [];
  if (contentSha256 !== source.contentSha256 || contentSha256 !== source.materializedSha256) {
    reasons.push('source_content_hash_mismatch');
  }
  if (normalized === null) reasons.push('invalid_utf8');
  reasons.sort();
  const label = source.declaredPolarity === 'AI' ? 'positive' : 'negative';
  return {
    corpusVersion: 'v1',
    unitId: unitId(inventory, source.recordId),
    sourceId: inventory.sourceId,
    sourceVersion: inventory.sourceVersion,
    sourceUri: inventory.sourceUri,
    sourceArchiveSha256: inventory.archive.sha256,
    sourceRecordId: source.recordId,
    contentSha256,
    sourceDeclaredContentSha256: source.contentSha256,
    sourceMaterializedContentSha256: source.materializedSha256,
    normalizedSha256: normalized,
    normalizerId: CORPUS_V1_NORMALIZER_ID,
    label,
    authorityTier: 'publisher_attested',
    authorityEvidenceRef: 'review/mendeley-humanvsai-audit-2026-07-14.json',
    language: source.language,
    familyKey: `${inventory.sourceId}:${source.problemId}`,
    split: 'unassigned',
    licenseId: 'CC-BY-4.0',
    licenseEvidenceRef: 'sources/benchmarks/humanvsai-code-dataset/datacite-metadata.json',
    rightsDisposition: 'internal_analysis',
    byteCount: bytes.byteLength,
    status: reasons.length === 0 ? 'candidate' : 'quarantined',
    quarantineReasons: reasons,
  };
}

/**
 * Project a deterministic candidate manifest from the pinned Mendeley source.
 * This stage verifies actual unit bytes and local quarantine reasons only. It
 * deliberately leaves collision quarantine, split assignment, and admission
 * to later reviewed stages.
 */
export async function projectMendeleyCorpusV1CandidateManifest(
  input: ProjectMendeleyCorpusV1CandidateManifestInput,
): Promise<CorpusV1CandidateManifestResult> {
  const inventory = await inventoryMendeleyCorpusV1(input);
  const corpusRoot = await realpath(resolve(input.corpusRoot));
  const projectionRoot = await realpath(resolve(corpusRoot, PROJECTION_ROOT));
  const manifestPath = await realpath(resolve(corpusRoot, PROJECTION_MANIFEST));
  if (!isContained(corpusRoot, projectionRoot) || !isContained(corpusRoot, manifestPath)) {
    throw new Error('Corpus v1 projection resolves outside the corpus root');
  }

  const rows: CorpusV1CandidateManifestRow[] = [];
  const sourceManifestHash = createHash('sha256');
  const hashedManifestStream = createReadStream(manifestPath).pipe(new Transform({
    transform(chunk: Buffer, _encoding, callback): void {
      sourceManifestHash.update(chunk);
      callback(null, chunk);
    },
  }));
  const lines = createInterface({ input: hashedManifestStream, crlfDelay: Infinity });
  let rowNumber = 0;
  for await (const line of lines) {
    if (line.length === 0) continue;
    rowNumber += 1;
    const source = parseSourceProjectionRow(line, rowNumber);
    const bytes = await readContainedUnit(projectionRoot, source.relativePath);
    rows.push(buildRow(inventory, source, bytes));
  }
  const sourceManifestSha256 = sourceManifestHash.digest('hex');
  if (sourceManifestSha256 !== inventory.projectionManifest.sha256) {
    throw new Error('projection manifest changed after the pinned inventory preflight');
  }
  rows.sort((left, right) => left.sourceRecordId < right.sourceRecordId
    ? -1
    : left.sourceRecordId > right.sourceRecordId ? 1 : 0);

  const manifestJsonl = rows.length === 0
    ? ''
    : `${rows.map((row) => canonicalJson(row)).join('\n')}\n`;
  const candidate = rows.filter((row) => row.status === 'candidate').length;
  const positive = rows.filter((row) => row.label === 'positive').length;
  if (
    rows.length !== inventory.rows.raw
    || positive !== inventory.rows.positive
    || rows.length - positive !== inventory.rows.negative
  ) {
    throw new Error('candidate manifest rows do not reconcile with the pinned source inventory');
  }
  return {
    version: 'corpus-v1-candidate-manifest-v1',
    builderVersion: CORPUS_V1_MANIFEST_BUILDER_VERSION,
    normalizerId: CORPUS_V1_NORMALIZER_ID,
    rows,
    manifestJsonl,
    manifestSha256: sha256(manifestJsonl),
    counts: {
      raw: rows.length,
      candidate,
      quarantined: rows.length - candidate,
      positive,
      negative: rows.length - positive,
    },
  };
}
