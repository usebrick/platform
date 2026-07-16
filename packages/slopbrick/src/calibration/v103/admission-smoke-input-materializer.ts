import { createHash } from 'node:crypto';
import { lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionInputGenerationProposalSha256,
  calibrationAdmissionInputGenerationSha256,
  validateCalibrationAdmissionOverlapUniverseStream,
  calibrationAdmissionRegisterDeltaSha256,
  calibrationAdmissionSourceReviewSha256,
  isCalibrationAdmissionInputGenerationProposalV1,
  isCalibrationAdmissionInputGenerationV1,
  isCalibrationAdmissionRecordV103,
  isCalibrationAdmissionRegisterDeltaV1,
  isCalibrationAdmissionSourceGenerationProposalV1,
  isCalibrationAdmissionSourceGenerationV1,
  isCalibrationSourceReviewV103,
  validateCalibrationAdmissionInputGenerationV1,
  validateCalibrationAdmissionInputGenerationProposalV1,
  type CalibrationAdmissionInputGenerationProposalV1,
  type CalibrationAdmissionInputGenerationV1,
  type CalibrationAdmissionRecordV103,
  type CalibrationAdmissionSourceGenerationProposalV1,
  type CalibrationAdmissionSourceGenerationV1,
} from '@usebrick/core';
import { calibrationAdmissionSourceSemanticAuthoritySha256 } from './admission-authority-rebuild';

/**
 * Explicit, disk-backed diagnostic input materialization for the first smoke.
 *
 * This boundary deliberately does not discover files, infer labels, or read
 * the corpus. All authority objects and bytes are supplied by the caller. It
 * only writes a transaction-owned diagnostic bundle after every input and
 * policy check succeeds. The resulting bundle is never authority-eligible.
 */

const SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_RECORDS = 200 as const;
const ARM_SIZE = 100 as const;

export type SmokeJsonlInput = Uint8Array | string | AsyncIterable<Uint8Array | string>;

export interface AdmissionSmokeSourceInputV1 {
  readonly sourceId: string;
  readonly sourceGeneration: unknown;
  readonly sourceGenerationBytes: Uint8Array;
  readonly sourceProposal: unknown;
  readonly sourceProposalBytes: Uint8Array;
  /** Canonical source-review JSON followed by exactly one LF. */
  readonly sourceReviewBytes: Uint8Array;
  readonly semanticAuthority: unknown;
  readonly semanticAuthorityBytes: Uint8Array;
}

export interface AdmissionSmokeInputMaterializerRequestV1 {
  /** Explicit output directory; no path is discovered from the corpus. */
  readonly outputDirectory: string;
  /** Stable transaction identifier used for the staging directory. */
  readonly transactionId: string;
  readonly proposalId: string;
  readonly evidenceBundleSha256: string;
  readonly registerDelta: unknown;
  readonly registerDeltaBytes: Uint8Array;
  readonly sources: readonly AdmissionSmokeSourceInputV1[];
  /** Canonical admission records, one JSON object per LF-terminated line. */
  readonly records: SmokeJsonlInput;
  readonly overlapUniverse: unknown;
  /** Core-validated registry bound to the supplied overlap universe. */
  readonly normalizerRegistry: unknown;
  /** Canonical overlap-universe records, one JSON object per LF-terminated line. */
  readonly overlapUniverseRecords: SmokeJsonlInput;
}

export interface AdmissionSmokeInputMaterializationReceiptV1 {
  readonly version: 'v10.3-admission-smoke-input-materialization-receipt-v1';
  readonly transactionId: string;
  readonly proposalId: string;
  readonly generationSha256: string;
  readonly proposalSha256: string;
  readonly recordCount: 200;
  readonly positiveCount: 100;
  readonly negativeCount: 100;
  readonly recordStreamSha256: string;
  readonly overlapUniverseSha256: string;
  readonly overlapUniverseRecordsSha256: string;
  readonly normalizerRegistrySha256: string;
  readonly registerDeltaSha256: string;
  readonly sourceIds: readonly string[];
  readonly finalRelativePath: string;
  readonly diagnosticOnly: true;
  readonly authorityEligible: false;
}

export interface AdmissionSmokeInputMaterialization {
  readonly proposal: CalibrationAdmissionInputGenerationProposalV1;
  readonly inputGeneration: CalibrationAdmissionInputGenerationV1;
  readonly receipt: AdmissionSmokeInputMaterializationReceiptV1;
  readonly finalDirectory: string;
}

export type AdmissionSmokeInputMaterializationResult =
  | Readonly<{ readonly ok: true; readonly value: AdmissionSmokeInputMaterialization }>
  | Readonly<{ readonly ok: false; readonly errors: readonly string[] }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256Bytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function unique(errors: readonly string[]): readonly string[] {
  return [...new Set(errors)];
}

function canonicalFile(value: unknown): Buffer {
  return Buffer.from(`${calibrationAdmissionCanonicalJson(value)}\n`, 'utf8');
}

function canonicalObjectBytes(value: unknown): Buffer {
  return Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8');
}

function isCanonicalJsonBytes(value: unknown, bytes: unknown, label: string, errors: string[], trailingLf: boolean): void {
  if (!(bytes instanceof Uint8Array)) {
    errors.push(`${label}:bytes_missing`);
    return;
  }
  let text: string;
  try {
    text = Buffer.from(bytes).toString('utf8');
    const parsed = JSON.parse(trailingLf ? text.slice(-1) === '\n' ? text.slice(0, -1) : text : text) as unknown;
    const expected = calibrationAdmissionCanonicalJson(value);
    const actual = trailingLf ? `${expected}\n` : expected;
    if (text !== actual || calibrationAdmissionCanonicalJson(parsed) !== expected) errors.push(`${label}:bytes_not_canonical`);
  } catch {
    errors.push(`${label}:invalid_json`);
  }
}

async function* chunks(input: SmokeJsonlInput): AsyncIterable<Uint8Array> {
  if (typeof input === 'string') {
    yield Buffer.from(input, 'utf8');
    return;
  }
  if (input instanceof Uint8Array) {
    yield input;
    return;
  }
  for await (const chunk of input) {
    if (typeof chunk === 'string') yield Buffer.from(chunk, 'utf8');
    else if (chunk instanceof Uint8Array) yield chunk;
    else throw new Error('jsonl_chunk_invalid');
  }
}

async function readJsonl(input: SmokeJsonlInput, label: string): Promise<{ readonly values: readonly unknown[]; readonly bytes: Buffer }> {
  const pieces: Buffer[] = [];
  for await (const chunk of chunks(input)) pieces.push(Buffer.from(chunk));
  const bytes = Buffer.concat(pieces);
  const text = bytes.toString('utf8');
  if (text.length === 0 || !text.endsWith('\n')) throw new Error(`${label}:final_newline_required`);
  const values: unknown[] = [];
  const lines = text.split('\n');
  lines.pop();
  for (const [index, line] of lines.entries()) {
    if (line.length === 0) throw new Error(`${label}:${index + 1}:empty_line`);
    let value: unknown;
    try { value = JSON.parse(line) as unknown; } catch { throw new Error(`${label}:${index + 1}:invalid_json`); }
    if (calibrationAdmissionCanonicalJson(value) !== line) throw new Error(`${label}:${index + 1}:non_canonical_json`);
    values.push(value);
  }
  return { values, bytes };
}

function sourceId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

function sha(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && ISO.test(value) && new Date(value).toISOString() === value;
}

function assertSafeTransaction(value: string, errors: string[]): void {
  if (!ID.test(value) || value.includes('/') || value.includes('..')) errors.push('transaction_id_invalid');
}

function validateSource(input: AdmissionSmokeSourceInputV1, errors: string[]): void {
  if (!sourceId(input.sourceId)) {
    errors.push('source_id_invalid');
    return;
  }
  if (!isCalibrationAdmissionSourceGenerationV1(input.sourceGeneration)) errors.push(`source:${input.sourceId}:generation_invalid`);
  if (!isCalibrationAdmissionSourceGenerationProposalV1(input.sourceProposal)) errors.push(`source:${input.sourceId}:proposal_invalid`);
  if (isCalibrationAdmissionSourceGenerationV1(input.sourceGeneration)
      && input.sourceGeneration.sourceId !== input.sourceId) errors.push(`source:${input.sourceId}:generation_id_mismatch`);
  if (isCalibrationAdmissionSourceGenerationProposalV1(input.sourceProposal)
      && input.sourceProposal.sourceId !== input.sourceId) errors.push(`source:${input.sourceId}:proposal_id_mismatch`);
  isCanonicalJsonBytes(input.sourceGeneration, input.sourceGenerationBytes, `source:${input.sourceId}:generation`, errors, false);
  isCanonicalJsonBytes(input.sourceProposal, input.sourceProposalBytes, `source:${input.sourceId}:proposal`, errors, false);
  let sourceReviewSha256: string | undefined;
  if (!(input.sourceReviewBytes instanceof Uint8Array)) {
    errors.push(`source:${input.sourceId}:review_bytes_missing`);
  } else {
    const text = Buffer.from(input.sourceReviewBytes).toString('utf8');
    if (!text.endsWith('\n') || text.endsWith('\n\n')) errors.push(`source:${input.sourceId}:review_newline_invalid`);
    try {
      const review = JSON.parse(text.slice(0, -1)) as unknown;
      if (!isCalibrationSourceReviewV103(review) || review.sourceId !== input.sourceId) errors.push(`source:${input.sourceId}:review_invalid`);
      else {
        const expectedReviewBytes = Buffer.from(`${calibrationAdmissionCanonicalJson(review)}\n`, 'utf8');
        if (!Buffer.from(input.sourceReviewBytes).equals(expectedReviewBytes)) errors.push(`source:${input.sourceId}:review_bytes_not_canonical`);
        sourceReviewSha256 = calibrationAdmissionSourceReviewSha256(review);
        if (sourceReviewSha256 !== (input.sourceGeneration as { sourceReviewSha256?: string }).sourceReviewSha256) errors.push(`source:${input.sourceId}:review_hash_unbound`);
      }
    } catch {
      errors.push(`source:${input.sourceId}:review_invalid_json`);
    }
  }
  if (!(input.semanticAuthorityBytes instanceof Uint8Array) || !isRecord(input.semanticAuthority)) {
    errors.push(`source:${input.sourceId}:semantic_authority_missing`);
  } else {
    isCanonicalJsonBytes(input.semanticAuthority, input.semanticAuthorityBytes, `source:${input.sourceId}:semantic_authority`, errors, false);
    const authority = input.semanticAuthority;
    if (authority.version !== 'v10.3-admission-source-semantic-authority-v1'
      || authority.sourceId !== input.sourceId
      || authority.proposalId !== (input.sourceProposal as { proposalId?: unknown }).proposalId
      || !Array.isArray(authority.decisions) || authority.decisions.length !== 2
      || typeof authority.proposalId !== 'string'
      || calibrationAdmissionSourceSemanticAuthoritySha256(authority) !== authority.authoritySha256) {
      errors.push(`source:${input.sourceId}:semantic_authority_invalid`);
    }
  }
  const generation = input.sourceGeneration as { approval?: { kind?: unknown }; generationSha256?: unknown };
  if (generation.approval?.kind !== 'independent_review') errors.push(`source:${input.sourceId}:independent_review_required`);
  if (!sha(generation.generationSha256)) errors.push(`source:${input.sourceId}:generation_hash_invalid`);
  const proposal = input.sourceProposal as { proposalId?: unknown; proposalSha256?: unknown; sourceReviewSha256?: unknown };
  if (proposal.proposalId !== (generation as { proposalId?: unknown }).proposalId || proposal.proposalSha256 !== (generation as { proposalSha256?: unknown }).proposalSha256) errors.push(`source:${input.sourceId}:generation_proposal_unbound`);
  if (sourceReviewSha256 !== undefined && proposal.sourceReviewSha256 !== sourceReviewSha256) errors.push(`source:${input.sourceId}:proposal_review_unbound`);
  const sourceArtifacts = (generation as { artifacts?: readonly { relativePath?: unknown; bytes?: unknown; sha256?: unknown }[] }).artifacts;
  const sourceReviewArtifact = sourceArtifacts?.find((entry) => entry.relativePath === 'source-review.json');
  if (sourceReviewArtifact === undefined || sourceReviewArtifact.bytes !== input.sourceReviewBytes.byteLength || sourceReviewArtifact.sha256 !== sha256Bytes(input.sourceReviewBytes)) errors.push(`source:${input.sourceId}:review_artifact_unbound`);
}

function labelOf(value: CalibrationAdmissionRecordV103): 'positive' | 'negative' | undefined {
  if (value.proposedLabel === 'verified_ai') return 'positive';
  if (value.proposedLabel === 'verified_human') return 'negative';
  return undefined;
}

function validateCohort(values: readonly unknown[], sourceIds: ReadonlySet<string>, sourceReviewById: ReadonlyMap<string, string>, errors: string[]): values is readonly CalibrationAdmissionRecordV103[] {
  if (values.length !== MAX_RECORDS) errors.push('cohort:expected_200_records');
  const records: CalibrationAdmissionRecordV103[] = [];
  const recordIds = new Set<string>();
  const contentByLabel = new Map<string, string>();
  const pairGroups = new Map<string, CalibrationAdmissionRecordV103[]>();
  const sourceFamily = new Map<string, number>();
  const observedSourceIds = new Set<string>();
  const languageByLabel = new Map<'positive' | 'negative', Map<string, number>>([
    ['positive', new Map()], ['negative', new Map()],
  ]);
  const families = new Set<string>();
  let positive = 0;
  let negative = 0;
  for (const [index, raw] of values.entries()) {
    if (!isCalibrationAdmissionRecordV103(raw)) {
      errors.push(`cohort:record_${index}_invalid`);
      continue;
    }
    const record = raw as CalibrationAdmissionRecordV103;
    const label = labelOf(record);
    if (label === undefined) {
      errors.push(`cohort:record_${index}_polarity_invalid`);
      continue;
    }
    if (!sourceIds.has(record.materialSourceId)) errors.push(`cohort:record_${index}_source_unprovided`);
    else observedSourceIds.add(record.materialSourceId);
    const expectedReview = sourceReviewById.get(record.materialSourceId);
    if (expectedReview !== undefined && record.sourceReviewSha256 !== expectedReview) errors.push(`cohort:record_${index}_source_review_unbound`);
    if (record.claimedLineage.pairGroupId === undefined) errors.push(`cohort:record_${index}_pair_group_missing`);
    if (recordIds.has(record.recordId)) errors.push(`cohort:duplicate_record_id:${record.recordId}`);
    recordIds.add(record.recordId);
    records.push(record);
    if (label === 'positive') positive += 1; else negative += 1;
    const labels = languageByLabel.get(label)!;
    labels.set(record.language, (labels.get(record.language) ?? 0) + 1);
    families.add(record.claimedLineage.familyId);
    const key = `${record.materialSourceId}\u0000${record.claimedLineage.familyId}`;
    sourceFamily.set(key, (sourceFamily.get(key) ?? 0) + 1);
    if (record.claimedLineage.pairGroupId !== undefined) {
      const group = pairGroups.get(record.claimedLineage.pairGroupId) ?? [];
      group.push(record);
      pairGroups.set(record.claimedLineage.pairGroupId, group);
    }
    const prior = contentByLabel.get(record.contentSha256);
    if (prior !== undefined && prior !== label) errors.push(`cohort:cross_polarity_duplicate:${record.contentSha256}`);
    contentByLabel.set(record.contentSha256, label);
  }
  if (positive !== ARM_SIZE) errors.push('cohort:positive_count_must_be_100');
  if (negative !== ARM_SIZE) errors.push('cohort:negative_count_must_be_100');
  for (const sourceIdValue of sourceIds) {
    if (!observedSourceIds.has(sourceIdValue)) errors.push(`cohort:source_unrepresented:${sourceIdValue}`);
  }
  if (families.size < 3) errors.push('cohort:at_least_3_families_required');
  for (const label of ['positive', 'negative'] as const) {
    const languages = languageByLabel.get(label)!;
    if (languages.size < 2) errors.push(`cohort:${label}:at_least_2_languages_required`);
    for (const [language, count] of languages) if (count < 20) errors.push(`cohort:${label}:language_under_20:${language}`);
  }
  for (const [key, count] of sourceFamily) if (count > 50) errors.push(`cohort:source_family_over_50:${key}`);
  for (const [pairGroupId, group] of pairGroups) {
    if (group.length !== 2 || new Set(group.map((entry) => labelOf(entry))).size !== 2) errors.push(`cohort:pair_group_invalid:${pairGroupId}`);
  }
  return records.length === values.length && errors.length === 0;
}

function sameStringArray(left: readonly unknown[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Require every diagnostic overlap row to bind exactly one smoke admission record. */
function validateOverlapAdmissionRecordJoin(
  admissionValues: readonly unknown[],
  overlapValues: readonly unknown[],
  errors: string[],
): void {
  const admissions = admissionValues.filter(isCalibrationAdmissionRecordV103);
  const byId = new Map(admissions.map((entry) => [entry.recordId, entry]));
  const seen = new Set<string>();
  if (overlapValues.length !== admissions.length) errors.push('overlap:admission_record_join_count_mismatch');
  for (const [index, raw] of overlapValues.entries()) {
    if (!isRecord(raw)) continue;
    const admissionRecordId = raw.admissionRecordId;
    if (typeof admissionRecordId !== 'string') {
      errors.push(`overlap:row_${index}_admission_record_binding_missing`);
      continue;
    }
    const admission = byId.get(admissionRecordId);
    if (admission === undefined) {
      errors.push(`overlap:row_${index}_admission_record_unknown`);
      continue;
    }
    if (seen.has(admissionRecordId)) errors.push(`overlap:duplicate_admission_record_binding:${admissionRecordId}`);
    seen.add(admissionRecordId);
    if (raw.polarity && isRecord(raw.polarity) && raw.polarity.bindingAuthority !== 'admission-record') {
      errors.push(`overlap:row_${index}_binding_authority_mismatch`);
    }
    if (raw.materialSourceId !== admission.materialSourceId) errors.push(`overlap:row_${index}_source_mismatch`);
    if (raw.contentSha256 !== admission.contentSha256) errors.push(`overlap:row_${index}_content_hash_mismatch`);
    if (raw.contentBytes !== admission.contentBytes) errors.push(`overlap:row_${index}_content_bytes_mismatch`);
    if (raw.language !== admission.language) errors.push(`overlap:row_${index}_language_mismatch`);
    if (!isRecord(raw.polarity) || raw.polarity.proposedLabel !== admission.proposedLabel) {
      errors.push(`overlap:row_${index}_polarity_mismatch`);
    }
    if (!Array.isArray(raw.aggregateSourceIds) || !sameStringArray(raw.aggregateSourceIds, admission.aggregateSourceIds)) {
      errors.push(`overlap:row_${index}_aggregate_sources_mismatch`);
    }
  }
  if (seen.size !== admissions.length) errors.push('overlap:admission_record_join_incomplete');
}

function artifact(path: string, kind: 'record_stream' | 'overlap_universe' | 'overlap_universe_stream', bytes: Uint8Array): { readonly pathBase: 'generation_local'; readonly relativePath: string; readonly kind: typeof kind; readonly bytes: number; readonly sha256: string } {
  return { pathBase: 'generation_local', relativePath: path, kind, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
}

function sortedArtifacts(value: readonly ReturnType<typeof artifact>[]): readonly ReturnType<typeof artifact>[] {
  return [...value].sort((left, right) => `${left.pathBase}\u0000${left.relativePath}\u0000${left.kind}\u0000${left.sha256}`.localeCompare(`${right.pathBase}\u0000${right.relativePath}\u0000${right.kind}\u0000${right.sha256}`));
}

function containment(root: string, candidate: string): boolean {
  const child = relative(resolve(root), resolve(candidate));
  return child !== '..' && !child.startsWith(`..${sep}`) && !child.startsWith('/') && !child.includes('\\');
}

/** Materialize a strict, diagnostic-only 100+100 input bundle. */
async function materializeAdmissionSmokeInputGenerationUnchecked(
  request: AdmissionSmokeInputMaterializerRequestV1,
): Promise<AdmissionSmokeInputMaterializationResult> {
  const errors: string[] = [];
  if (typeof request.outputDirectory !== 'string' || request.outputDirectory.length === 0) errors.push('output_directory_invalid');
  if (typeof request.transactionId !== 'string') errors.push('transaction_id_invalid'); else assertSafeTransaction(request.transactionId, errors);
  if (typeof request.proposalId !== 'string' || !ID.test(request.proposalId)) errors.push('proposal_id_invalid');
  if (!sha(request.evidenceBundleSha256)) errors.push('evidence_bundle_hash_invalid');
  if (!isCalibrationAdmissionRegisterDeltaV1(request.registerDelta)
      || calibrationAdmissionRegisterDeltaSha256(request.registerDelta) !== (request.registerDelta as { deltaSha256?: string }).deltaSha256) errors.push('register_delta_invalid');
  isCanonicalJsonBytes(request.registerDelta, request.registerDeltaBytes, 'register_delta', errors, false);
  if (!Array.isArray(request.sources) || request.sources.length !== 2) errors.push('exactly_two_sources_required');
  const sourceIds = new Set<string>();
  const sourceReviewById = new Map<string, string>();
  for (const source of request.sources ?? []) {
    validateSource(source, errors);
    if (sourceIds.has(source.sourceId)) errors.push(`duplicate_source_id:${source.sourceId}`);
    sourceIds.add(source.sourceId);
    const generationReview = source.sourceGeneration as { sourceReviewSha256?: unknown };
    if (typeof generationReview.sourceReviewSha256 === 'string') sourceReviewById.set(source.sourceId, generationReview.sourceReviewSha256);
  }
  const registerDelta = request.registerDelta as { addedSources?: readonly { sourceId: string; sourceGenerationSha256: string }[] };
  if (Array.isArray(registerDelta.addedSources)) {
    const added = registerDelta.addedSources.map((source) => source.sourceId).sort();
    const supplied = [...sourceIds].sort();
    if (added.length !== supplied.length || added.some((id, index) => id !== supplied[index])) errors.push('register_delta_sources_mismatch');
    for (const source of request.sources ?? []) {
      const ref = registerDelta.addedSources.find((entry) => entry.sourceId === source.sourceId);
      const generation = source.sourceGeneration as { generationSha256?: string };
      if (ref?.sourceGenerationSha256 !== generation.generationSha256) errors.push(`register_delta_generation_mismatch:${source.sourceId}`);
    }
  }
  let records: readonly unknown[] = [];
  let recordBytes: Uint8Array = new Uint8Array();
  let overlapRecords: readonly unknown[] = [];
  let overlapRecordBytes: Uint8Array = new Uint8Array();
  try {
    const parsed = await readJsonl(request.records, 'records');
    records = parsed.values;
    recordBytes = parsed.bytes;
  } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  try {
    const parsed = await readJsonl(request.overlapUniverseRecords, 'overlap_universe_records');
    overlapRecords = parsed.values;
    overlapRecordBytes = parsed.bytes;
  } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  validateCohort(records, sourceIds, sourceReviewById, errors);
  let overlapUniverseBytes: Uint8Array = new Uint8Array();
  if (request.overlapUniverse === undefined) errors.push('overlap_universe_missing');
  else {
    try { overlapUniverseBytes = canonicalFile(request.overlapUniverse); }
    catch { errors.push('overlap_universe_invalid'); }
  }
  if (request.overlapUniverse !== undefined) {
    const overlapValidation = validateCalibrationAdmissionOverlapUniverseStream(
      request.overlapUniverse,
      overlapRecords,
      request.normalizerRegistry,
      overlapRecordBytes,
    );
    if (!overlapValidation.ok) errors.push(...overlapValidation.errors.map((error) => `overlap:${error}`));
    else validateOverlapAdmissionRecordJoin(records, overlapRecords, errors);
  }
  if (records.length > 0 && recordBytes.byteLength === 0) errors.push('records_bytes_missing');
  if (errors.length > 0) return { ok: false, errors: unique(errors) };
  const normalizerRegistrySha256 = (request.normalizerRegistry as { registrySha256: string }).registrySha256;

  const sourceGenerationProposals = request.sources.map((source) => {
    const proposal = source.sourceProposal as CalibrationAdmissionSourceGenerationProposalV1;
    return {
      sourceId: source.sourceId,
      proposalId: proposal.proposalId,
      proposalRelativePath: `review/admission/sources/${source.sourceId}/proposals/${proposal.proposalId}.json`,
      proposalSha256: proposal.proposalSha256,
    };
  }).sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const inputArtifacts = sortedArtifacts([
    artifact('admission-records.jsonl', 'record_stream', recordBytes),
    artifact('overlap-universe.json', 'overlap_universe', overlapUniverseBytes),
    artifact('overlap-universe-records.jsonl', 'overlap_universe_stream', overlapRecordBytes),
  ]);
  const proposalBody = {
    version: 'v10.3-admission-input-generation-proposal-v1' as const,
    proposalId: request.proposalId,
    operation: 'create' as const,
    expectedCurrentState: { kind: 'absent' as const },
    evidenceBundleSha256: request.evidenceBundleSha256,
    sourceGenerationProposals,
    admissionRecordStream: inputArtifacts.find((entry) => entry.kind === 'record_stream')!,
    overlapUniverse: inputArtifacts.find((entry) => entry.kind === 'overlap_universe')!,
    overlapUniverseRecords: inputArtifacts.find((entry) => entry.kind === 'overlap_universe_stream')!,
  };
  const proposal = { ...proposalBody, proposalSha256: calibrationAdmissionInputGenerationProposalSha256(proposalBody) } as unknown as CalibrationAdmissionInputGenerationProposalV1;
  const generationBody = {
    version: 'v10.3-admission-input-generation-v1' as const,
    generation: 0,
    evidenceBundleSha256: request.evidenceBundleSha256,
    sourceGenerations: request.sources.map((source) => {
      const generation = source.sourceGeneration as CalibrationAdmissionSourceGenerationV1;
      return {
        sourceId: source.sourceId,
        generationSha256: generation.generationSha256,
        relativePath: `review/admission/sources/${source.sourceId}/generations/${generation.generationSha256}`,
        artifactSetSha256: generation.artifactSetSha256,
      };
    }).sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
    admissionRecordStreamSha256: inputArtifacts.find((entry) => entry.kind === 'record_stream')!.sha256,
    overlapUniverseSha256: inputArtifacts.find((entry) => entry.kind === 'overlap_universe')!.sha256,
    overlapUniverseRecordsSha256: inputArtifacts.find((entry) => entry.kind === 'overlap_universe_stream')!.sha256,
    artifacts: inputArtifacts,
  };
  const inputGeneration = { ...generationBody, generationSha256: calibrationAdmissionInputGenerationSha256(generationBody) } as unknown as CalibrationAdmissionInputGenerationV1;
  if (!isCalibrationAdmissionInputGenerationProposalV1(proposal)) return { ok: false, errors: ['materialized_proposal_invalid'] };
  if (!isCalibrationAdmissionInputGenerationV1(inputGeneration)) return { ok: false, errors: ['materialized_generation_invalid'] };
  if (!validateCalibrationAdmissionInputGenerationProposalV1(proposal).ok || !validateCalibrationAdmissionInputGenerationV1(inputGeneration).ok) return { ok: false, errors: ['materialized_generation_semantic_invalid'] };

  const root = resolve(request.outputDirectory);
  try {
    const metadata = await lstat(root);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) return { ok: false, errors: ['output_directory_not_regular'] };
  } catch {
    return { ok: false, errors: ['output_directory_unavailable'] };
  }
  const finalDirectory = join(root, `generation-${inputGeneration.generationSha256}`);
  const stagingDirectory = join(root, `.staging-${request.transactionId}`);
  if (!containment(root, finalDirectory) || !containment(root, stagingDirectory)) return { ok: false, errors: ['output_path_escape'] };
  const relativeFinalPath = relative(root, finalDirectory).replaceAll(sep, '/');
  const receipt: AdmissionSmokeInputMaterializationReceiptV1 = {
    version: 'v10.3-admission-smoke-input-materialization-receipt-v1',
    transactionId: request.transactionId,
    proposalId: request.proposalId,
    generationSha256: inputGeneration.generationSha256,
    proposalSha256: proposal.proposalSha256,
    recordCount: MAX_RECORDS,
    positiveCount: ARM_SIZE,
    negativeCount: ARM_SIZE,
    recordStreamSha256: sha256Bytes(recordBytes),
    overlapUniverseSha256: sha256Bytes(overlapUniverseBytes),
    overlapUniverseRecordsSha256: sha256Bytes(overlapRecordBytes),
    normalizerRegistrySha256,
    registerDeltaSha256: (request.registerDelta as { deltaSha256: string }).deltaSha256,
    sourceIds: [...sourceIds].sort(),
    finalRelativePath: relativeFinalPath,
    diagnosticOnly: true,
    authorityEligible: false,
  };
  // Only remove a staging directory after this invocation has successfully
  // created it.  A transaction id is caller-supplied, so an EEXIST from a
  // concurrent/replayed invocation must never give us ownership of (or
  // permission to delete) another transaction's staging bytes.
  let stagingOwned = false;
  try {
    await mkdir(stagingDirectory, { recursive: false });
    stagingOwned = true;
    await writeFile(join(stagingDirectory, 'proposal.json'), canonicalObjectBytes(proposal));
    await writeFile(join(stagingDirectory, 'generation.json'), canonicalObjectBytes(inputGeneration));
    await writeFile(join(stagingDirectory, 'admission-records.jsonl'), recordBytes);
    await writeFile(join(stagingDirectory, 'overlap-universe.json'), overlapUniverseBytes);
    await writeFile(join(stagingDirectory, 'overlap-universe-records.jsonl'), overlapRecordBytes);
    await writeFile(join(stagingDirectory, 'register-delta.json'), canonicalObjectBytes(request.registerDelta));
    for (const source of request.sources) {
      const sourceRoot = join(stagingDirectory, 'sources', source.sourceId);
      await mkdir(sourceRoot, { recursive: true });
      await writeFile(join(sourceRoot, 'source-generation.json'), source.sourceGenerationBytes);
      await writeFile(join(sourceRoot, 'source-generation-proposal.json'), source.sourceProposalBytes);
      await writeFile(join(sourceRoot, 'source-review.json'), source.sourceReviewBytes);
      await writeFile(join(sourceRoot, 'source-semantic-authority.json'), source.semanticAuthorityBytes);
    }
    await writeFile(join(stagingDirectory, 'receipt.json'), canonicalObjectBytes(receipt));
    await rename(stagingDirectory, finalDirectory);
  } catch (error) {
    if (stagingOwned) await rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
    return { ok: false, errors: [`materialization_write_failed:${error instanceof Error ? error.message : String(error)}`] };
  }
  return { ok: true, value: { proposal, inputGeneration, receipt, finalDirectory } };
}

/**
 * Public boundary: malformed JavaScript callers must receive a deterministic
 * diagnostic failure rather than an uncaught exception. The unchecked body
 * still performs all semantic and filesystem cleanup checks; this wrapper is
 * only for hostile runtime shapes that TypeScript callers cannot express.
 */
export async function materializeAdmissionSmokeInputGeneration(
  request: AdmissionSmokeInputMaterializerRequestV1,
): Promise<AdmissionSmokeInputMaterializationResult> {
  try {
    return await materializeAdmissionSmokeInputGenerationUnchecked(request);
  } catch {
    return { ok: false, errors: ['smoke_input_materializer_failed_closed'] };
  }
}
