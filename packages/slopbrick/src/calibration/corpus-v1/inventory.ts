import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

const MAX_METADATA_BYTES = 1024 * 1024;
const MAX_SOURCE_ARTIFACT_BYTES = 16 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

interface SourceAudit {
  readonly source: {
    readonly sourceId: string;
    readonly originUrl: string;
    readonly doi: string;
    readonly license: string;
  };
  readonly acquisition: {
    readonly archiveRelativePath: string;
    readonly archiveBytes: number;
    readonly archiveSha256: string;
    readonly materialization: {
      readonly primaryCsvRelativePath: string;
      readonly primaryCsvBytes: number;
      readonly primaryCsvSha256: string;
    };
  };
  readonly staticDatasetAudit: {
    readonly csvHeaders: readonly string[];
    readonly rows: number;
    readonly labels: { readonly AI: number; readonly Human: number };
  };
}

interface ProjectionReceipt {
  readonly source: {
    readonly sourceId: string;
    readonly doi: string;
    readonly archiveSha256: string;
    readonly inputCsvBytes: number;
    readonly inputCsvSha256: string;
  };
  readonly projection: {
    readonly manifestRelativePath: string;
    readonly manifestBytes: number;
    readonly manifestSha256: string;
    readonly records: number;
    readonly regularFiles: number;
    readonly bytes: number;
    readonly countsByPolarity: { readonly AI: number; readonly Human: number };
  };
}

export interface MendeleyCorpusV1Expectations {
  readonly sourceId: string;
  readonly sourceUri: string;
  readonly doi: string;
  readonly archiveSha256: string;
  readonly csvSha256: string;
  readonly manifestSha256: string;
  readonly dataCiteSha256: string;
  readonly fileMetadataSha256: string;
  readonly rawRows: number;
  readonly positiveRows: number;
  readonly negativeRows: number;
}

export const PINNED_MENDELEY_V1_EXPECTATIONS: MendeleyCorpusV1Expectations = {
  sourceId: 'humanvsai-code-dataset-mendeley-v1',
  sourceUri: 'https://data.mendeley.com/datasets/kjh95n54f8/1',
  doi: '10.17632/kjh95n54f8.1',
  archiveSha256: 'c6cb156a8fa627c9228b7798ea7d25be9327a4d1f72f40b16ddae3e6d807e0c4',
  csvSha256: '7f38972cbbd3f7f26988e77e3b9e8fce2fa92fb8bbc30911a51dc93cded4b192',
  manifestSha256: '588afb3fe94fdde5958ee4aeac9a5ce3b0680cff61d329ec91998819206c6eab',
  dataCiteSha256: '21226e033404641d2f55bbf711d7d3458129ba5125ff603bb554e61a71d99613',
  fileMetadataSha256: '0d14259a7cfdf15be8d44bda481e119839f36db39310d47202e8bbccd31cfcbc',
  rawRows: 10_000,
  positiveRows: 5_000,
  negativeRows: 5_000,
};

export interface MendeleyCorpusV1InventoryInput {
  readonly corpusRoot: string;
  readonly auditPath?: string;
  readonly projectionReceiptPath?: string;
  readonly expectations?: MendeleyCorpusV1Expectations;
}

export interface MendeleyCorpusV1Inventory {
  readonly version: 'corpus-v1-mendeley-inventory-v1';
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly sourceUri: string;
  readonly doi: string;
  readonly authorityTier: 'publisher_attested';
  readonly licenseId: 'CC-BY-4.0';
  readonly rightsDisposition: 'internal_analysis';
  readonly archive: { readonly bytes: number; readonly sha256: string };
  readonly csv: { readonly bytes: number; readonly sha256: string; readonly headers: readonly string[] };
  readonly projectionManifest: { readonly bytes: number; readonly sha256: string };
  readonly metadata: { readonly dataCiteSha256: string; readonly fileMetadataSha256: string };
  readonly projection: {
    readonly regularFiles: number;
    readonly orphanFiles: number;
    readonly bytes: number;
    readonly unitContentVerification: 'path_and_size_only';
  };
  readonly rows: { readonly raw: number; readonly positive: number; readonly negative: number; readonly malformed: number };
  readonly labelMapping: { readonly AI: 'positive'; readonly Human: 'negative' };
  readonly sourceClaims: Readonly<Record<string, number>>;
  readonly languages: Readonly<Record<string, number>>;
  readonly families: { readonly positive: number; readonly negative: number; readonly sharedAcrossLabels: number };
  readonly manifestExactContent: {
    readonly uniqueHashes: number;
    readonly duplicateRows: number;
    readonly crossLabelCollisions: number;
  };
  readonly reconciled: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseMetadata<T>(bytes: Buffer, name: string): T {
  if (bytes.byteLength > MAX_METADATA_BYTES) throw new Error(`${name} exceeds the metadata byte limit`);
  const value: unknown = JSON.parse(bytes.toString('utf8'));
  if (!isRecord(value)) throw new Error(`${name} must be a JSON object`);
  return value as T;
}

function assertPinnedNumber(value: unknown, name: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${name} must be a non-negative integer`);
}

function assertPinnedString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be a non-empty string`);
}

function assertSha256(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) throw new Error(`${name} must be a lowercase SHA-256`);
}

function assertAudit(audit: SourceAudit): void {
  assertPinnedString(audit.source?.sourceId, 'audit sourceId');
  assertPinnedString(audit.source?.originUrl, 'audit originUrl');
  assertPinnedString(audit.source?.doi, 'audit doi');
  assertPinnedString(audit.source?.license, 'audit license');
  assertPinnedString(audit.acquisition?.archiveRelativePath, 'archive relative path');
  assertPinnedNumber(audit.acquisition?.archiveBytes, 'archive bytes');
  assertSha256(audit.acquisition?.archiveSha256, 'archive SHA-256');
  assertPinnedString(audit.acquisition?.materialization?.primaryCsvRelativePath, 'CSV relative path');
  assertPinnedNumber(audit.acquisition?.materialization?.primaryCsvBytes, 'CSV bytes');
  assertSha256(audit.acquisition?.materialization?.primaryCsvSha256, 'CSV SHA-256');
  if (!Array.isArray(audit.staticDatasetAudit?.csvHeaders) || audit.staticDatasetAudit.csvHeaders.some((header) => typeof header !== 'string')) {
    throw new Error('audit CSV headers must be strings');
  }
  assertPinnedNumber(audit.staticDatasetAudit?.rows, 'audit rows');
  assertPinnedNumber(audit.staticDatasetAudit?.labels?.AI, 'audit AI rows');
  assertPinnedNumber(audit.staticDatasetAudit?.labels?.Human, 'audit Human rows');
}

function assertReceipt(receipt: ProjectionReceipt): void {
  assertPinnedString(receipt.source?.sourceId, 'receipt sourceId');
  assertPinnedString(receipt.source?.doi, 'receipt doi');
  assertSha256(receipt.source?.archiveSha256, 'receipt archive SHA-256');
  assertPinnedNumber(receipt.source?.inputCsvBytes, 'receipt CSV bytes');
  assertSha256(receipt.source?.inputCsvSha256, 'receipt CSV SHA-256');
  assertPinnedString(receipt.projection?.manifestRelativePath, 'manifest relative path');
  assertPinnedNumber(receipt.projection?.manifestBytes, 'manifest bytes');
  assertSha256(receipt.projection?.manifestSha256, 'manifest SHA-256');
  assertPinnedNumber(receipt.projection?.records, 'receipt records');
  assertPinnedNumber(receipt.projection?.regularFiles, 'receipt regular files');
  assertPinnedNumber(receipt.projection?.bytes, 'receipt projected bytes');
  assertPinnedNumber(receipt.projection?.countsByPolarity?.AI, 'receipt AI rows');
  assertPinnedNumber(receipt.projection?.countsByPolarity?.Human, 'receipt Human rows');
}

function assertRelativePath(path: string, name: string): void {
  if (isAbsolute(path) || path.split(/[\\/]/u).includes('..')) throw new Error(`${name} must stay inside the corpus root`);
}

async function resolveReadableFile(root: string, path: string, name: string): Promise<{ readonly path: string; readonly bytes: number }> {
  const candidate = isAbsolute(path) ? resolve(path) : resolve(root, path);
  const lexicalMetadata = await lstat(candidate);
  if (lexicalMetadata.isSymbolicLink() || !lexicalMetadata.isFile()) {
    throw new Error(`${name} must be a regular, non-symlink file`);
  }
  const canonical = await realpath(candidate);
  const fromRoot = relative(root, canonical);
  if (fromRoot === '..' || fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(fromRoot)) {
    throw new Error(`${name} resolves outside the corpus root`);
  }
  return { path: canonical, bytes: lexicalMetadata.size };
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function sortedRecord(counts: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

/**
 * Read and reconcile the already-materialized Mendeley v1 quarantine projection.
 * Historical `authoritativeLabel` fields are deliberately ignored: Corpus v1
 * maps only the publisher's `declaredPolarity` to positive/negative classes.
 * Unit files are checked for regular-file containment and declared size only;
 * per-unit content rehashing belongs to the next manifest-projection stage.
 */
export async function inventoryMendeleyCorpusV1(input: MendeleyCorpusV1InventoryInput): Promise<MendeleyCorpusV1Inventory> {
  const corpusRoot = await realpath(resolve(input.corpusRoot));
  const expectations = input.expectations ?? PINNED_MENDELEY_V1_EXPECTATIONS;
  const sourceRoot = 'sources/benchmarks/humanvsai-code-dataset';
  const auditFile = await resolveReadableFile(
    corpusRoot,
    input.auditPath ?? 'review/mendeley-humanvsai-audit-2026-07-14.json',
    'audit',
  );
  const receiptFile = await resolveReadableFile(
    corpusRoot,
    input.projectionReceiptPath ?? `${sourceRoot}/projection-v1/projection-receipt.json`,
    'projection receipt',
  );
  const dataCiteFile = await resolveReadableFile(corpusRoot, `${sourceRoot}/datacite-metadata.json`, 'DataCite metadata');
  const fileMetadataFile = await resolveReadableFile(corpusRoot, `${sourceRoot}/mendeley-file-metadata.json`, 'Mendeley file metadata');
  if ([auditFile, receiptFile, dataCiteFile, fileMetadataFile].some(({ bytes }) => bytes > MAX_METADATA_BYTES)) {
    throw new Error('Corpus v1 metadata exceeds the byte limit');
  }
  const audit = parseMetadata<SourceAudit>(await readFile(auditFile.path), 'audit');
  const receipt = parseMetadata<ProjectionReceipt>(await readFile(receiptFile.path), 'projection receipt');
  assertAudit(audit);
  assertReceipt(receipt);

  assertRelativePath(audit.acquisition.archiveRelativePath, 'archive path');
  assertRelativePath(audit.acquisition.materialization.primaryCsvRelativePath, 'CSV path');
  assertRelativePath(receipt.projection.manifestRelativePath, 'manifest path');
  const archive = await resolveReadableFile(corpusRoot, audit.acquisition.archiveRelativePath, 'archive');
  const csv = await resolveReadableFile(corpusRoot, audit.acquisition.materialization.primaryCsvRelativePath, 'CSV');
  const manifest = await resolveReadableFile(corpusRoot, receipt.projection.manifestRelativePath, 'projection manifest');
  for (const [name, file] of [['archive', archive], ['CSV', csv], ['projection manifest', manifest]] as const) {
    if (file.bytes > MAX_SOURCE_ARTIFACT_BYTES) throw new Error(`${name} exceeds the bounded inventory byte limit`);
  }
  const [archiveSha256, csvSha256, manifestSha256, dataCiteSha256, fileMetadataSha256] = await Promise.all([
    sha256File(archive.path),
    sha256File(csv.path),
    sha256File(manifest.path),
    sha256File(dataCiteFile.path),
    sha256File(fileMetadataFile.path),
  ]);
  if (archive.bytes !== audit.acquisition.archiveBytes || archiveSha256 !== audit.acquisition.archiveSha256 || archiveSha256 !== receipt.source.archiveSha256) {
    throw new Error('archive bytes do not match the pinned audit and projection receipt');
  }
  if (csv.bytes !== audit.acquisition.materialization.primaryCsvBytes || csv.bytes !== receipt.source.inputCsvBytes || csvSha256 !== audit.acquisition.materialization.primaryCsvSha256 || csvSha256 !== receipt.source.inputCsvSha256) {
    throw new Error('CSV bytes do not match the pinned audit and projection receipt');
  }
  if (manifest.bytes !== receipt.projection.manifestBytes || manifestSha256 !== receipt.projection.manifestSha256) {
    throw new Error('projection manifest bytes do not match the pinned receipt');
  }
  if (
    archiveSha256 !== expectations.archiveSha256
    || csvSha256 !== expectations.csvSha256
    || manifestSha256 !== expectations.manifestSha256
    || dataCiteSha256 !== expectations.dataCiteSha256
    || fileMetadataSha256 !== expectations.fileMetadataSha256
  ) {
    throw new Error('source bytes do not match the explicit Corpus v1 expectations');
  }
  if (
    audit.source.sourceId !== expectations.sourceId
    || receipt.source.sourceId !== expectations.sourceId
    || audit.source.originUrl !== expectations.sourceUri
    || audit.source.doi !== expectations.doi
    || receipt.source.doi !== expectations.doi
  ) {
    throw new Error('source identity does not match the explicit Corpus v1 expectations');
  }
  if (audit.source.license !== 'CC BY 4.0') throw new Error('Corpus v1 seed requires the pinned CC BY 4.0 declaration');
  const dataCite = parseMetadata<Record<string, unknown>>(await readFile(dataCiteFile.path), 'DataCite metadata');
  const dataAttributes = isRecord(dataCite.data) && isRecord(dataCite.data.attributes)
    ? dataCite.data.attributes
    : undefined;
  const rightsList = Array.isArray(dataAttributes?.rightsList) ? dataAttributes.rightsList : [];
  if (
    !isRecord(dataCite.data)
    || dataCite.data.id !== expectations.doi
    || !rightsList.some((right) => isRecord(right) && right.rightsIdentifier === 'cc-by-4.0')
  ) {
    throw new Error('DataCite metadata does not contain the pinned CC-BY-4.0 declaration');
  }
  const fileMetadataValue: unknown = JSON.parse((await readFile(fileMetadataFile.path)).toString('utf8'));
  const archiveMetadata = Array.isArray(fileMetadataValue)
    ? fileMetadataValue.find((entry) => isRecord(entry) && entry.filename === 'Code_Dataset.zip')
    : undefined;
  const contentDetails = isRecord(archiveMetadata) && isRecord(archiveMetadata.content_details)
    ? archiveMetadata.content_details
    : undefined;
  if (
    !isRecord(archiveMetadata)
    || archiveMetadata.status !== 'COMPLETED'
    || contentDetails?.sha256_hash !== archiveSha256
    || contentDetails.size !== archive.bytes
  ) {
    throw new Error('Mendeley file metadata does not bind the pinned archive bytes');
  }

  let raw = 0;
  let positive = 0;
  let negative = 0;
  let malformed = 0;
  let duplicateRows = 0;
  const sourceClaims: Record<string, number> = {};
  const languages: Record<string, number> = {};
  const positiveFamilies = new Set<string>();
  const negativeFamilies = new Set<string>();
  const contentLabels = new Map<string, Set<'positive' | 'negative'>>();
  const manifestPaths = new Set<string>();
  let projectedBytes = 0;
  let regularFiles = 0;
  const projectionRoot = dirname(manifest.path);
  const lines = createInterface({ input: createReadStream(manifest.path), crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.length === 0) continue;
    raw += 1;
    let record: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!isRecord(parsed)) throw new Error('not an object');
      record = parsed;
    } catch {
      malformed += 1;
      continue;
    }
    const polarity = record.declaredPolarity === 'AI' ? 'positive' : record.declaredPolarity === 'Human' ? 'negative' : undefined;
    const problemId = typeof record.problemId === 'string' && record.problemId.length > 0 ? record.problemId : undefined;
    const sourceClaim = typeof record.sourceClaim === 'string' && record.sourceClaim.length > 0 ? record.sourceClaim : undefined;
    const language = typeof record.language === 'string' && record.language.length > 0 ? record.language : undefined;
    const contentSha256 = typeof record.contentSha256 === 'string' && SHA256_PATTERN.test(record.contentSha256) ? record.contentSha256 : undefined;
    const relativePath = typeof record.relativePath === 'string' ? record.relativePath : undefined;
    const declaredBytes = Number.isSafeInteger(record.bytes) && (record.bytes as number) >= 0 ? record.bytes as number : undefined;
    const expectedPrefix = polarity === 'positive' ? 'units/ai/' : 'units/human/';
    if (
      polarity === undefined
      || problemId === undefined
      || sourceClaim === undefined
      || language === undefined
      || contentSha256 === undefined
      || relativePath === undefined
      || declaredBytes === undefined
      || !relativePath.startsWith(expectedPrefix)
      || manifestPaths.has(relativePath)
    ) {
      malformed += 1;
      continue;
    }
    let unit: { readonly path: string; readonly bytes: number };
    try {
      assertRelativePath(relativePath, 'projected unit path');
      unit = await resolveReadableFile(projectionRoot, relativePath, 'projected unit');
    } catch {
      malformed += 1;
      continue;
    }
    if (unit.bytes !== declaredBytes) {
      malformed += 1;
      continue;
    }
    manifestPaths.add(relativePath);
    projectedBytes += unit.bytes;
    regularFiles += 1;
    if (polarity === 'positive') {
      positive += 1;
      positiveFamilies.add(problemId);
    } else {
      negative += 1;
      negativeFamilies.add(problemId);
    }
    increment(sourceClaims, sourceClaim);
    increment(languages, language);
    const priorLabels = contentLabels.get(contentSha256);
    if (priorLabels !== undefined) {
      duplicateRows += 1;
      priorLabels.add(polarity);
    } else {
      contentLabels.set(contentSha256, new Set([polarity]));
    }
  }

  const sharedAcrossLabels = [...positiveFamilies].filter((family) => negativeFamilies.has(family)).length;
  const crossLabelCollisions = [...contentLabels.values()].filter((labels) => labels.size > 1).length;
  const diskPaths = (
    await Promise.all((['ai', 'human'] as const).map(async (polarity) =>
      (await readdir(resolve(projectionRoot, 'units', polarity))).map((name) => `units/${polarity}/${name}`),
    ))
  ).flat();
  const orphanFiles = diskPaths.filter((path) => !manifestPaths.has(path)).length;
  const reconciled = raw === audit.staticDatasetAudit.rows
    && raw === receipt.projection.records
    && positive === audit.staticDatasetAudit.labels.AI
    && positive === receipt.projection.countsByPolarity.AI
    && negative === audit.staticDatasetAudit.labels.Human
    && negative === receipt.projection.countsByPolarity.Human
    && raw === expectations.rawRows
    && positive === expectations.positiveRows
    && negative === expectations.negativeRows
    && regularFiles === receipt.projection.regularFiles
    && projectedBytes === receipt.projection.bytes
    && orphanFiles === 0
    && malformed === 0;
  if (!reconciled) throw new Error('Corpus v1 projection inventory did not reconcile');

  return {
    version: 'corpus-v1-mendeley-inventory-v1',
    sourceId: audit.source.sourceId,
    sourceVersion: audit.source.doi.split('.').at(-1) ?? '1',
    sourceUri: audit.source.originUrl,
    doi: audit.source.doi,
    authorityTier: 'publisher_attested',
    licenseId: 'CC-BY-4.0',
    rightsDisposition: 'internal_analysis',
    archive: { bytes: archive.bytes, sha256: archiveSha256 },
    csv: { bytes: csv.bytes, sha256: csvSha256, headers: audit.staticDatasetAudit.csvHeaders },
    projectionManifest: { bytes: manifest.bytes, sha256: manifestSha256 },
    metadata: { dataCiteSha256, fileMetadataSha256 },
    projection: {
      regularFiles,
      orphanFiles,
      bytes: projectedBytes,
      unitContentVerification: 'path_and_size_only',
    },
    rows: { raw, positive, negative, malformed },
    labelMapping: { AI: 'positive', Human: 'negative' },
    sourceClaims: sortedRecord(sourceClaims),
    languages: sortedRecord(languages),
    families: { positive: positiveFamilies.size, negative: negativeFamilies.size, sharedAcrossLabels },
    manifestExactContent: { uniqueHashes: contentLabels.size, duplicateRows, crossLabelCollisions },
    reconciled: true,
  };
}
