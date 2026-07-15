/**
 * Pure outer admission-authority assembler.
 *
 * This is deliberately an explicit-input boundary.  It does not discover a
 * corpus, resolve paths, read/write a filesystem, or publish a generation.
 * Callers must provide the byte-backed proposal/input/static graph, source
 * authorities, overlap envelopes, and the indexed tool-authority resolution.
 * The result is still pre-witness and diagnostic-only; durable publication is
 * owned by admission-authority-rebuild-publication.ts.
 */
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionPreWitnessBundleSha256,
  calibrationAdmissionSha256,
  calibrationAdmissionToolReceiptSha256,
  isCalibrationAdmissionOverlapUniverseRecordV1,
  isCalibrationAdmissionRecordV103,
  isCalibrationAdmissionInputGenerationV1,
  isCalibrationAdmissionPreWitnessBundleV1,
  isCalibrationAdmissionStaticAuthorityGenerationV1,
  validateCalibrationAdmissionLineageLedgerV1,
  validateCalibrationAdmissionPrivacyLedgerV1,
  validateCalibrationAdmissionQualityLedgerV1,
  validateCalibrationAdmissionPreWitnessBundleV1,
  type CalibrationAdmissionPreWitnessBundleV1,
} from '@usebrick/core';

import {
  validatePrebuiltAdmissionAuthorityGraph,
  type PrebuiltAdmissionAuthorityArtifactBytesInput,
  type PrebuiltAdmissionAuthorityGraphInput,
} from './admission-authority-rebuild';
import {
  validatePrebuiltAdmissionAuthorityOverlapJoin,
  type PrebuiltAdmissionAuthorityEnvelopeBytes,
} from './admission-authority-overlap-join';
import {
  validateRealScaleOverlapResourceReceipt,
  type RealScaleOverlapResourceExpectation,
} from './admission-real-scale-receipt';
import type { AdmissionToolAuthorityReceiptResolution } from './admission-publication';
import {
  validateAdmissionStaticLedgerStreamReceipt,
  type AdmissionStaticLedgerKind,
  type AdmissionStaticLedgerStreamReceiptV1,
} from './admission-static-ledger-stream';

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
export type PrebuiltAdmissionAuthorityMaterializerInput = Readonly<{
  /** Complete byte-backed graph. No field is discovered or inferred. */
  readonly graph: PrebuiltAdmissionAuthorityGraphInput;
  /** Exact canonical JSON bytes for the rich witness-free bundle. */
  readonly preWitnessBundle: unknown;
  readonly preWitnessBundleBytes: Uint8Array;
  /** Exact overlap generation and all three generation-local envelopes. */
  readonly overlap: Readonly<{
    readonly generation: unknown;
    readonly generationBytes: Uint8Array;
    /** Every generation-local overlap artifact, including all shards. */
    readonly artifactBytes: PrebuiltAdmissionAuthorityArtifactBytesInput;
    readonly index: PrebuiltAdmissionAuthorityEnvelopeBytes;
    readonly resourceReceipt: PrebuiltAdmissionAuthorityEnvelopeBytes;
    readonly ledger: PrebuiltAdmissionAuthorityEnvelopeBytes;
    /** Exact indexed profile/intent/receipt resolution for authority:overlap. */
    readonly toolAuthority: AdmissionToolAuthorityReceiptResolution;
  }>;
  /**
   * Caller-owned selected-stream identity.  This must be the policy/ledger
   * expectation for production; it is never inferred from the fixture bundle.
   */
  readonly realScaleExpectation: RealScaleOverlapResourceExpectation;
  /** Optional disk-backed static-ledger projections from the bounded adapter. */
  readonly staticLedgerStreams?: Readonly<Partial<Record<AdmissionStaticLedgerKind, AdmissionStaticLedgerStreamReceiptV1>>>;
}>;

export type PrebuiltAdmissionAuthorityMaterializedGraph = Readonly<{
  /** The validated, byte-backed proposal → source → static → current graph. */
  readonly graph: PrebuiltAdmissionAuthorityGraphInput;
  readonly bundle: CalibrationAdmissionPreWitnessBundleV1;
  readonly bundleBytes: Uint8Array;
  readonly overlapGeneration: unknown;
  readonly overlapGenerationBytes: Uint8Array;
  readonly overlapEnvelopes: Readonly<{
    readonly index: PrebuiltAdmissionAuthorityEnvelopeBytes;
    readonly resource: PrebuiltAdmissionAuthorityEnvelopeBytes;
    readonly ledger: PrebuiltAdmissionAuthorityEnvelopeBytes;
  }>;
  /** A deterministic proof over every object/byte boundary in this result. */
  readonly verificationSha256: string;
  readonly realScaleExpectation: RealScaleOverlapResourceExpectation;
  /** The caller-supplied expectation was bound to the selected receipt. */
  readonly materializerExpectationVerified: true;
  /** Full-scale authority remains unverified until witness/shard admission. */
  readonly realScaleReceiptVerified: false;
  /** This assembler cannot establish real-scale or witness authority. */
  readonly ready: false;
  readonly authorityEligible: false;
  readonly diagnosticOnly: true;
}>;

export type PrebuiltAdmissionAuthorityMaterializerResult =
  | Readonly<{ readonly ok: true; readonly value: PrebuiltAdmissionAuthorityMaterializedGraph }>
  | Readonly<{ readonly ok: false; readonly errors: readonly string[] }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bytes(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

function hashBytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function push(errors: string[], message: string): void {
  if (!errors.includes(message)) errors.push(message);
}

function canonicalBytes(value: unknown, supplied: unknown, label: string, errors: string[]): boolean {
  if (!bytes(supplied)) {
    push(errors, `${label} bytes are not supplied`);
    return false;
  }
  let text: string;
  try {
    text = UTF8_DECODER.decode(supplied);
  } catch {
    push(errors, `${label} bytes are not valid UTF-8`);
    return false;
  }
  if (text.startsWith('\uFEFF')) push(errors, `${label} bytes contain a BOM`);
  let expected: string;
  try {
    expected = calibrationAdmissionCanonicalJson(value);
  } catch {
    push(errors, `${label} value cannot be canonicalized`);
    return false;
  }
  if (text !== expected) push(errors, `${label} bytes are not exact canonical JSON`);
  try {
    const parsed = JSON.parse(text) as unknown;
    if (calibrationAdmissionCanonicalJson(parsed) !== expected) push(errors, `${label} bytes do not round-trip canonically`);
  } catch {
    push(errors, `${label} bytes are not valid JSON`);
  }
  return text === expected;
}

function artifactMap(value: PrebuiltAdmissionAuthorityArtifactBytesInput, label: string, errors: string[]): Map<string, Uint8Array> {
  const result = new Map<string, Uint8Array>();
  if (isRecord(value)) {
    for (const [path, raw] of Object.entries(value)) {
      if (!bytes(raw)) push(errors, `${label} artifact ${path} bytes are invalid`);
      else if (result.has(path)) push(errors, `${label} artifact ${path} is duplicated`);
      else result.set(path, raw);
    }
    return result;
  }
  if (!Array.isArray(value)) {
    push(errors, `${label} artifact bytes are not a path map or entry list`);
    return result;
  }
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.relativePath !== 'string' || !bytes(entry.bytes)) {
      push(errors, `${label} artifact byte entry is invalid`);
      continue;
    }
    if (result.has(entry.relativePath)) push(errors, `${label} artifact ${entry.relativePath} is duplicated`);
    else result.set(entry.relativePath, entry.bytes);
  }
  return result;
}

function exactArtifact(
  map: Map<string, Uint8Array>,
  artifacts: readonly { readonly relativePath: string; readonly bytes: number; readonly sha256: string }[],
  path: string,
  label: string,
  errors: string[],
): Uint8Array | undefined {
  const matches = artifacts.filter((artifact) => artifact.relativePath === path);
  if (matches.length !== 1) {
    push(errors, `${label} must contain exactly one ${path} artifact receipt`);
    return undefined;
  }
  const artifact = matches[0]!;
  const raw = map.get(path);
  if (raw === undefined) {
    push(errors, `${label} is missing ${path} bytes`);
    return undefined;
  }
  if (raw.byteLength !== artifact.bytes || hashBytes(raw) !== artifact.sha256) {
    push(errors, `${label} ${path} bytes do not match its receipt`);
  }
  return raw;
}

function sameCanonical(left: unknown, right: unknown): boolean {
  try {
    return calibrationAdmissionCanonicalJson(left) === calibrationAdmissionCanonicalJson(right);
  } catch {
    return false;
  }
}

function sourceReviewObjects(graph: PrebuiltAdmissionAuthorityGraphInput, errors: string[]): Map<string, unknown> {
  const reviews = new Map<string, unknown>();
  for (const source of graph.sources) {
    const generation = isRecord(source.sourceGeneration) ? source.sourceGeneration : undefined;
    const sourceId = typeof generation?.sourceId === 'string' ? generation.sourceId : undefined;
    if (sourceId === undefined) continue;
    try {
      const text = UTF8_DECODER.decode(source.sourceReviewBytes);
      if (!text.endsWith('\n') || text.endsWith('\n\n')) {
        push(errors, `source ${sourceId} source-review bytes must end with one LF`);
        continue;
      }
      const reviewText = text.slice(0, -1);
      const review = JSON.parse(reviewText) as unknown;
      if (calibrationAdmissionCanonicalJson(review) !== reviewText) push(errors, `source ${sourceId} source-review bytes are not canonical`);
      reviews.set(sourceId, review);
    } catch {
      push(errors, `source ${sourceId} source-review bytes cannot be parsed`);
    }
  }
  return reviews;
}

/** Visit canonical JSONL rows without retaining the corpus in memory. */
function visitCanonicalJsonl(
  rawBytes: Uint8Array,
  label: string,
  visitor: (value: unknown, lineNumber: number) => void,
  errors: string[],
): boolean {
  if (!bytes(rawBytes)) {
    push(errors, `${label} bytes are not supplied`);
    return false;
  }
  if (rawBytes.byteLength === 0 || rawBytes[rawBytes.byteLength - 1] !== 0x0a) {
    push(errors, `${label} must end with one LF`);
    return false;
  }
  let start = 0;
  let lineNumber = 0;
  let ok = true;
  for (let index = 0; index < rawBytes.byteLength; index += 1) {
    if (rawBytes[index] !== 0x0a) continue;
    lineNumber += 1;
    const lineBytes = rawBytes.subarray(start, index);
    start = index + 1;
    let line: string;
    try {
      line = UTF8_DECODER.decode(lineBytes);
    } catch {
      push(errors, `${label} line ${lineNumber} is not valid UTF-8`);
      ok = false;
      continue;
    }
    if (line.length === 0 || line.includes('\r')) {
      push(errors, `${label} line ${lineNumber} is blank or non-canonical`);
      ok = false;
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
      if (calibrationAdmissionCanonicalJson(value) !== line) {
        push(errors, `${label} line ${lineNumber} is not canonical JSON`);
        ok = false;
        continue;
      }
    } catch {
      push(errors, `${label} line ${lineNumber} is not valid canonical JSON`);
      ok = false;
      continue;
    }
    visitor(value, lineNumber);
  }
  if (start !== rawBytes.byteLength) {
    push(errors, `${label} has an unterminated final line`);
    ok = false;
  }
  return ok;
}

function admissionRecordStreamRelations(
  bundle: CalibrationAdmissionPreWitnessBundleV1,
  raw: Uint8Array | undefined,
  errors: string[],
): readonly string[] | undefined {
  if (raw === undefined) return undefined;
  const recordIds: string[] = [];
  const recordHashes: string[] = [];
  let previousId = '';
  visitCanonicalJsonl(raw, 'admission-records.jsonl', (value, lineNumber) => {
    if (!isCalibrationAdmissionRecordV103(value)) {
      push(errors, `admission-records.jsonl line ${lineNumber} is not a valid admission record`);
      return;
    }
    const record = value as { readonly recordId: string };
    if (record.recordId <= previousId) push(errors, 'admission records are not strictly ordered by recordId');
    previousId = record.recordId;
    recordIds.push(record.recordId);
    recordHashes.push(calibrationAdmissionSha256(value));
  }, errors);
  const stream = bundle.admissionRecordStream;
  if (hashBytes(raw) !== stream.recordsJsonlSha256) push(errors, 'admission record stream content hash does not match bundle');
  if (recordIds.length !== stream.recordCount) push(errors, 'admission record stream count does not match JSONL');
  if (calibrationAdmissionSha256(recordIds) !== stream.recordIdSetSha256) push(errors, 'admission record stream ID-set hash does not match JSONL');
  if (calibrationAdmissionSha256([...recordHashes].sort()) !== stream.canonicalRecordHashesSha256) push(errors, 'admission record stream canonical-hash set does not match JSONL');
  return recordIds;
}

function overlapUniverseStreamRelations(
  bundle: CalibrationAdmissionPreWitnessBundleV1,
  raw: Uint8Array | undefined,
  errors: string[],
): void {
  if (raw === undefined) return;
  const summary = bundle.overlapUniverse;
  const normalizers = new Map(bundle.normalizerRegistry.entries.map((entry) => [entry.language, entry.normalizerId]));
  let recordCount = 0;
  let covered = 0;
  let unsupported = 0;
  let unreadable = 0;
  let previousId = '';
  const unresolved: string[] = [];
  visitCanonicalJsonl(raw, 'overlap-universe-records.jsonl', (value, lineNumber) => {
    if (!isCalibrationAdmissionOverlapUniverseRecordV1(value)) {
      push(errors, `overlap universe line ${lineNumber} is not a valid universe record`);
      return;
    }
    const row = value as {
      readonly candidateUnitId: string;
      readonly language: string;
      readonly normalizerId: string;
      readonly normalizationStatus: 'covered' | 'unsupported' | 'unreadable';
    };
    if (row.candidateUnitId <= previousId) push(errors, 'overlap universe rows are not strictly ordered by candidateUnitId');
    previousId = row.candidateUnitId;
    const expectedNormalizer = normalizers.get(row.language);
    if (row.normalizationStatus === 'covered' && expectedNormalizer !== row.normalizerId) push(errors, `overlap universe row ${row.candidateUnitId} is not bound to its normalizer`);
    if (row.normalizationStatus === 'unsupported' && expectedNormalizer === row.normalizerId) push(errors, `overlap universe row ${row.candidateUnitId} names a covered normalizer while unsupported`);
    recordCount += 1;
    if (row.normalizationStatus === 'covered') covered += 1;
    if (row.normalizationStatus === 'unsupported') { unsupported += 1; unresolved.push(row.candidateUnitId); }
    if (row.normalizationStatus === 'unreadable') { unreadable += 1; unresolved.push(row.candidateUnitId); }
  }, errors);
  if (hashBytes(raw) !== summary.recordsJsonlSha256) push(errors, 'overlap universe summary recordsJsonlSha256 does not match JSONL');
  if (recordCount !== summary.selectedAggregateCoverage + summary.newCandidateUnits) push(errors, 'overlap universe row count does not match summary');
  if (covered !== summary.covered || unsupported !== summary.unsupported || unreadable !== summary.unreadable) push(errors, 'overlap universe status counts do not match summary');
  if (calibrationAdmissionCanonicalJson([...unresolved].sort()) !== calibrationAdmissionCanonicalJson(summary.unresolvedCandidateUnitIds)) push(errors, 'overlap universe unresolved IDs do not match summary');
}

function ledgerRecordRelations(
  bundle: CalibrationAdmissionPreWitnessBundleV1,
  recordIds: readonly string[] | undefined,
  errors: string[],
): void {
  if (recordIds === undefined) return;
  const checks: readonly [string, unknown, (value: unknown, ids: readonly string[]) => { readonly ok: boolean; readonly errors: readonly string[] }][] = [
    ['privacy', bundle.privacyLedger, validateCalibrationAdmissionPrivacyLedgerV1],
    ['quality', bundle.qualityLedger, validateCalibrationAdmissionQualityLedgerV1],
    ['lineage', bundle.lineageLedger, validateCalibrationAdmissionLineageLedgerV1],
  ];
  for (const [label, value, validate] of checks) {
    const validation = validate(value, recordIds);
    if (!validation.ok) for (const error of validation.errors) push(errors, `${label} ledger record join: ${error}`);
    if (isRecord(value) && value.admissionRecordSetSha256 !== bundle.admissionRecordStream.recordIdSetSha256) {
      push(errors, `${label} ledger record-set hash does not match admission stream`);
    }
  }
}

function overlapArtifactRelations(
  generation: unknown,
  supplied: PrebuiltAdmissionAuthorityArtifactBytesInput,
  envelopes: Readonly<{ index: PrebuiltAdmissionAuthorityEnvelopeBytes; resource: PrebuiltAdmissionAuthorityEnvelopeBytes; ledger: PrebuiltAdmissionAuthorityEnvelopeBytes }>,
  errors: string[],
): void {
  if (!isRecord(generation) || !Array.isArray(generation.artifacts)) return;
  const artifacts = generation.artifacts as readonly { readonly relativePath: string; readonly bytes: number; readonly sha256: string }[];
  const map = artifactMap(supplied, 'overlap generation', errors);
  if (map.size !== artifacts.length || artifacts.some((artifact) => !map.has(artifact.relativePath))) push(errors, 'overlap generation artifact bytes do not exactly cover generation receipts');
  for (const artifact of artifacts) {
    const raw = map.get(artifact.relativePath);
    if (raw === undefined) continue;
    if (raw.byteLength !== artifact.bytes || hashBytes(raw) !== artifact.sha256) push(errors, `overlap generation artifact bytes do not match ${artifact.relativePath}`);
  }
  const envelopeBytes = new Map([
    ['index.json', envelopes.index.bytes],
    ['overlap-resource-receipt.json', envelopes.resource.bytes],
    ['overlap-ledger.json', envelopes.ledger.bytes],
  ]);
  for (const [path, expected] of envelopeBytes) {
    const raw = map.get(path);
    if (raw !== undefined && !Buffer.from(raw).equals(Buffer.from(expected))) push(errors, `overlap generation ${path} bytes differ from selected envelope bytes`);
  }
}

function realScaleExpectationRelations(
  bundle: CalibrationAdmissionPreWitnessBundleV1,
  selected: RealScaleOverlapResourceExpectation,
  errors: string[],
): void {
  const derived: RealScaleOverlapResourceExpectation = {
    recordCount: bundle.admissionRecordStream.recordCount,
    universeSha256: bundle.overlapUniverse.universeSha256,
    recordsJsonlSha256: bundle.admissionRecordStream.recordsJsonlSha256,
  };
  if (selected.recordCount !== derived.recordCount) push(errors, 'real-scale record count selector does not match the bound admission stream');
  if (selected.universeSha256 !== derived.universeSha256) push(errors, 'real-scale universe selector does not match the bound overlap universe');
  if (selected.recordsJsonlSha256 !== derived.recordsJsonlSha256) push(errors, 'real-scale records selector does not match the bound admission stream');
}

function staticArtifactRelations(
  graph: PrebuiltAdmissionAuthorityGraphInput,
  bundle: CalibrationAdmissionPreWitnessBundleV1,
  bundleBytes: Uint8Array,
  streamReceipts: PrebuiltAdmissionAuthorityMaterializerInput['staticLedgerStreams'],
  errors: string[],
): void {
  if (!isCalibrationAdmissionStaticAuthorityGenerationV1(graph.staticGeneration)) return;
  const staticGeneration = graph.staticGeneration;
  const artifacts = artifactMap(graph.staticGenerationArtifactBytes, 'static generation', errors);
  const bundleArtifact = exactArtifact(artifacts, staticGeneration.artifacts, 'pre-witness-bundle.json', 'static generation', errors);
  if (bundleArtifact !== undefined && !Buffer.from(bundleArtifact).equals(Buffer.from(bundleBytes))) {
    push(errors, 'static pre-witness bundle artifact bytes differ from supplied bundle bytes');
  }
  if (streamReceipts !== undefined) {
    const streamExpectations: readonly [AdmissionStaticLedgerKind, string, string][] = [
      ['privacy', bundle.privacyLedger.ledgerSha256, staticGeneration.privacyLedgerSha256],
      ['quality', bundle.qualityLedger.ledgerSha256, staticGeneration.qualityLedgerSha256],
      ['lineage', bundle.lineageLedger.ledgerSha256, staticGeneration.lineageLedgerSha256],
    ];
    for (const [kind, bundleHash, generationHash] of streamExpectations) {
      const receipt = streamReceipts[kind];
      if (receipt === undefined) {
        push(errors, `static ${kind} stream receipt is missing`);
        continue;
      }
      for (const error of validateAdmissionStaticLedgerStreamReceipt(receipt, {
        kind,
        recordCount: bundle.admissionRecordStream.recordCount,
        recordSetSha256: bundle.admissionRecordStream.recordIdSetSha256,
        ledgerSha256: bundleHash,
      })) push(errors, `static ${kind} stream: ${error}`);
      if (generationHash !== bundleHash) push(errors, `static ${kind} ledger semantic hash does not match bundle`);
      if (typeof receipt.resultRelativePath !== 'string' || typeof receipt.coveredRelativePath !== 'string' || typeof receipt.unresolvedRelativePath !== 'string') continue;
      const projections: readonly [string, string, number][] = [
        [receipt.resultRelativePath, receipt.resultsJsonlSha256, receipt.resultBytes],
        [receipt.coveredRelativePath, receipt.coveredRecordIdsSha256, receipt.coveredRecordIdsBytes],
        [receipt.unresolvedRelativePath, receipt.unresolvedRecordIdsSha256, receipt.unresolvedRecordIdsBytes],
      ];
      for (const [path, expectedHash, expectedBytes] of projections) {
        const raw = exactArtifact(artifacts, staticGeneration.artifacts, path, 'static generation', errors);
        if (raw !== undefined && (raw.byteLength !== expectedBytes || hashBytes(raw) !== expectedHash)) {
          push(errors, `static ${kind} stream projection bytes do not match ${path}`);
        }
      }
    }
  } else {
    const ledgerChecks: readonly [string, unknown, string][] = [
      ['privacy-ledger.json', bundle.privacyLedger, bundle.privacyLedger.ledgerSha256],
      ['quality-ledger.json', bundle.qualityLedger, bundle.qualityLedger.ledgerSha256],
      ['lineage-ledger.json', bundle.lineageLedger, bundle.lineageLedger.ledgerSha256],
    ];
    for (const [path, ledger, semanticHash] of ledgerChecks) {
      const raw = exactArtifact(artifacts, staticGeneration.artifacts, path, 'static generation', errors);
      if (raw !== undefined && !Buffer.from(raw).equals(Buffer.from(calibrationAdmissionCanonicalJson(ledger), 'utf8'))) {
        push(errors, `static ${path} bytes differ from supplied bundle ledger`);
      }
      const receipt = staticGeneration.artifacts.find((artifact) => artifact.relativePath === path);
      if (receipt !== undefined && receipt.sha256 !== hashBytes(Buffer.from(calibrationAdmissionCanonicalJson(ledger), 'utf8'))) {
        push(errors, `static ${path} receipt hash does not match supplied bundle ledger bytes`);
      }
      if (path === 'privacy-ledger.json' && staticGeneration.privacyLedgerSha256 !== semanticHash) push(errors, 'static privacy ledger semantic hash does not match bundle');
      if (path === 'quality-ledger.json' && staticGeneration.qualityLedgerSha256 !== semanticHash) push(errors, 'static quality ledger semantic hash does not match bundle');
      if (path === 'lineage-ledger.json' && staticGeneration.lineageLedgerSha256 !== semanticHash) push(errors, 'static lineage ledger semantic hash does not match bundle');
    }
  }
  if (staticGeneration.preWitnessBundleSha256 !== bundle.preWitnessBundleSha256) push(errors, 'static generation does not bind supplied pre-witness bundle');
  if (!sameCanonical(staticGeneration.toolAuthoritySnapshot, bundle.toolAuthoritySnapshot)) push(errors, 'static generation tool snapshot does not match bundle');
}

function streamRelations(graph: PrebuiltAdmissionAuthorityGraphInput, bundle: CalibrationAdmissionPreWitnessBundleV1, errors: string[]): readonly string[] | undefined {
  if (!isCalibrationAdmissionInputGenerationV1(graph.inputGeneration)) return undefined;
  const generation = graph.inputGeneration;
  const artifacts = artifactMap(graph.inputGenerationArtifactBytes, 'input generation', errors);
  const recordStream = exactArtifact(artifacts, generation.artifacts, 'admission-records.jsonl', 'input generation', errors);
  const overlapUniverse = exactArtifact(artifacts, generation.artifacts, 'overlap-universe.json', 'input generation', errors);
  const overlapUniverseRecords = exactArtifact(artifacts, generation.artifacts, 'overlap-universe-records.jsonl', 'input generation', errors);
  let recordIds: readonly string[] | undefined;
  if (recordStream !== undefined) {
    recordIds = admissionRecordStreamRelations(bundle, recordStream, errors);
    if (generation.admissionRecordStreamSha256 !== hashBytes(recordStream)) push(errors, 'input-generation record-stream hash does not match bytes');
  }
  if (overlapUniverse !== undefined) {
    try {
      const parsed = JSON.parse(UTF8_DECODER.decode(overlapUniverse)) as unknown;
      if (!sameCanonical(parsed, bundle.overlapUniverse)) push(errors, 'input-generation overlap universe bytes differ from bundle');
    } catch {
      push(errors, 'input-generation overlap universe bytes are not canonical JSON');
    }
    if (generation.overlapUniverseSha256 !== hashBytes(overlapUniverse)) push(errors, 'input-generation overlap-universe hash does not match bytes');
  }
  if (overlapUniverseRecords !== undefined) {
    if (generation.overlapUniverseRecordsSha256 !== hashBytes(overlapUniverseRecords)) push(errors, 'input-generation overlap-universe-records hash does not match bytes');
    overlapUniverseStreamRelations(bundle, overlapUniverseRecords, errors);
  }
  return recordIds;
}

function sourceRelations(graph: PrebuiltAdmissionAuthorityGraphInput, bundle: CalibrationAdmissionPreWitnessBundleV1, errors: string[]): void {
  const graphReviews = sourceReviewObjects(graph, errors);
  const bundleReviews = new Map(bundle.sourceReviews.map((review) => [review.sourceId, review]));
  if (graphReviews.size !== bundleReviews.size) push(errors, 'source authority and bundle review counts differ');
  for (const [sourceId, review] of graphReviews) {
    const bundleReview = bundleReviews.get(sourceId);
    if (bundleReview === undefined || !sameCanonical(review, bundleReview)) push(errors, `source ${sourceId} review differs between authority and bundle`);
  }
  for (const sourceId of bundleReviews.keys()) if (!graphReviews.has(sourceId)) push(errors, `bundle source review ${sourceId} has no byte-backed authority`);
}

function proof(input: PrebuiltAdmissionAuthorityMaterializerInput, bundle: CalibrationAdmissionPreWitnessBundleV1, bundleBytes: Uint8Array): string {
  const graph = input.graph;
  const sourceArtifacts = graph.sources.map((source) => [...artifactMap(source.artifactBytes, 'source', [])].sort(([a], [b]) => a.localeCompare(b)).map(([path, raw]) => ({ path, sha256: hashBytes(raw), bytes: raw.byteLength })));
  return calibrationAdmissionSha256({
    bundle: hashBytes(bundleBytes),
    proposal: hashBytes(graph.proposalBytes),
    inputGeneration: hashBytes(graph.inputGenerationBytes),
    staticGeneration: hashBytes(graph.staticGenerationBytes),
    current: hashBytes(graph.currentBytes),
    ...(graph.priorCurrentBytes === undefined ? {} : { priorCurrent: hashBytes(graph.priorCurrentBytes) }),
    inputArtifacts: [...artifactMap(graph.inputGenerationArtifactBytes, 'input', [])].sort(([a], [b]) => a.localeCompare(b)).map(([path, raw]) => ({ path, sha256: hashBytes(raw), bytes: raw.byteLength })),
    staticArtifacts: [...artifactMap(graph.staticGenerationArtifactBytes, 'static', [])].sort(([a], [b]) => a.localeCompare(b)).map(([path, raw]) => ({ path, sha256: hashBytes(raw), bytes: raw.byteLength })),
    sources: graph.sources.map((source, index) => ({
      sourceId: isRecord(source.sourceGeneration) ? source.sourceGeneration.sourceId : `source-${index}`,
      generation: hashBytes(source.sourceGenerationBytes),
      current: hashBytes(source.currentBytes),
      review: hashBytes(source.sourceReviewBytes),
      artifacts: sourceArtifacts[index],
    })),
    overlap: {
      generation: hashBytes(input.overlap.generationBytes),
      index: hashBytes(input.overlap.index.bytes),
      resource: hashBytes(input.overlap.resourceReceipt.bytes),
      ledger: hashBytes(input.overlap.ledger.bytes),
      toolReceipt: calibrationAdmissionToolReceiptSha256(input.overlap.toolAuthority.receipt),
    },
    ...(input.staticLedgerStreams === undefined ? {} : {
      staticLedgerStreams: Object.entries(input.staticLedgerStreams)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([kind, receipt]) => ({ kind, receipt })),
    }),
    realScaleExpectation: {
      recordCount: bundle.admissionRecordStream.recordCount,
      universeSha256: bundle.overlapUniverse.universeSha256,
      recordsJsonlSha256: bundle.admissionRecordStream.recordsJsonlSha256,
    },
  });
}

/**
 * Assemble and verify a complete pre-witness graph from explicit bytes.
 *
 * A failed result is diagnostic only.  No caller-provided object is mutated,
 * and this function has no filesystem/network dependencies.
 */
function materializePrebuiltAdmissionAuthorityUnchecked(
  input: PrebuiltAdmissionAuthorityMaterializerInput,
): PrebuiltAdmissionAuthorityMaterializerResult {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ['materializer input is not an object'] };
  const graphValidation = validatePrebuiltAdmissionAuthorityGraph(input.graph);
  if (!graphValidation.ok) errors.push(...graphValidation.errors.map((error) => `graph: ${error}`));
  if (!isCalibrationAdmissionPreWitnessBundleV1(input.preWitnessBundle)) {
    const validation = validateCalibrationAdmissionPreWitnessBundleV1(input.preWitnessBundle);
    errors.push(...(validation.ok ? ['pre-witness bundle failed Core validation'] : validation.errors.map((error) => `bundle: ${error}`)));
  }
  const bundle = isCalibrationAdmissionPreWitnessBundleV1(input.preWitnessBundle)
    ? input.preWitnessBundle
    : undefined;
  const bundleBytesValid = canonicalBytes(input.preWitnessBundle, input.preWitnessBundleBytes, 'pre-witness bundle', errors);
  if (bundle !== undefined && bundle.preWitnessBundleSha256 !== calibrationAdmissionPreWitnessBundleSha256(bundle)) {
    push(errors, 'pre-witness bundle self-hash does not match canonical object');
  }

  if (bundle !== undefined) {
    staticArtifactRelations(input.graph, bundle, input.preWitnessBundleBytes, input.staticLedgerStreams, errors);
    const recordIds = streamRelations(input.graph, bundle, errors);
    ledgerRecordRelations(bundle, recordIds, errors);
    sourceRelations(input.graph, bundle, errors);
    overlapArtifactRelations(input.overlap.generation, input.overlap.artifactBytes, {
      index: input.overlap.index,
      resource: input.overlap.resourceReceipt,
      ledger: input.overlap.ledger,
    }, errors);
    const overlapJoin = validatePrebuiltAdmissionAuthorityOverlapJoin({
      staticGeneration: input.graph.staticGeneration,
      staticGenerationBytes: input.graph.staticGenerationBytes,
      overlapGeneration: input.overlap.generation,
      overlapGenerationBytes: input.overlap.generationBytes,
      envelopes: {
        index: input.overlap.index,
        resource: input.overlap.resourceReceipt,
        ledger: input.overlap.ledger,
      },
      toolAuthority: input.overlap.toolAuthority,
    });
    if (!overlapJoin.ok) errors.push(...overlapJoin.errors.map((error) => `overlap: ${error}`));
    realScaleExpectationRelations(bundle, input.realScaleExpectation, errors);
    const boundRealScaleExpectation: RealScaleOverlapResourceExpectation = {
      recordCount: bundle.admissionRecordStream.recordCount,
      universeSha256: bundle.overlapUniverse.universeSha256,
      recordsJsonlSha256: bundle.admissionRecordStream.recordsJsonlSha256,
    };
    const resourceValidation = validateRealScaleOverlapResourceReceipt(
      input.overlap.resourceReceipt.value,
      boundRealScaleExpectation,
    );
    if (!resourceValidation.ok) errors.push(...resourceValidation.errors.map((error) => `real-scale: ${error}`));
    for (const [label, envelope, expected] of [
      ['index', input.overlap.index, bundle.overlapIndexReceipt],
      ['resource', input.overlap.resourceReceipt, bundle.overlapResourceReceipt],
      ['ledger', input.overlap.ledger, bundle.overlapLedger],
    ] as const) {
      if (!canonicalBytes(envelope.value, envelope.bytes, `overlap ${label} envelope`, errors)) continue;
      if (!sameCanonical(envelope.value, expected)) push(errors, `overlap ${label} envelope differs from bundle`);
    }
  }
  if (!bundleBytesValid) push(errors, 'pre-witness bundle bytes are not usable');
  if (errors.length > 0 || bundle === undefined) return { ok: false, errors: [...new Set(errors)] };

  const value: PrebuiltAdmissionAuthorityMaterializedGraph = {
    graph: input.graph,
    bundle,
    bundleBytes: new Uint8Array(input.preWitnessBundleBytes),
    overlapGeneration: input.overlap.generation,
    overlapGenerationBytes: new Uint8Array(input.overlap.generationBytes),
    overlapEnvelopes: {
      index: { value: input.overlap.index.value, bytes: new Uint8Array(input.overlap.index.bytes) },
      resource: { value: input.overlap.resourceReceipt.value, bytes: new Uint8Array(input.overlap.resourceReceipt.bytes) },
      ledger: { value: input.overlap.ledger.value, bytes: new Uint8Array(input.overlap.ledger.bytes) },
    },
    realScaleExpectation: input.realScaleExpectation,
    materializerExpectationVerified: true,
    realScaleReceiptVerified: false,
    verificationSha256: proof(input, bundle, input.preWitnessBundleBytes),
    ready: false,
    authorityEligible: false,
    diagnosticOnly: true,
  };
  return { ok: true, value };
}

/** Public fail-closed wrapper for hostile/deserialized caller input. */
export function materializePrebuiltAdmissionAuthority(
  input: PrebuiltAdmissionAuthorityMaterializerInput,
): PrebuiltAdmissionAuthorityMaterializerResult {
  try {
    return materializePrebuiltAdmissionAuthorityUnchecked(input);
  } catch {
    return { ok: false, errors: ['prebuilt admission authority materializer failed closed'] };
  }
}
