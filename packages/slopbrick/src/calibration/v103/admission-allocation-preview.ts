import { createHash, type Hash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import {
  calibrationAdmissionCanonicalJson,
  isCalibrationAdmissionSourceRegisterV1,
  validateCalibrationAdmissionSourceRegisterReviewSet,
  type CalibrationAdmissionSourceRegisterV1,
  type CalibrationSourceReviewV103,
} from '@usebrick/core';

/** The frozen selected denominator; raw discovery stays outside this preview. */
export const V103_ALLOCATION_COUNTS = Object.freeze({
  positive: 224903,
  negative: 227479,
  selected: 452382,
  baseline: 58089,
  repository: 394293,
  rawDiscovery: 1478350,
});

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT_SHA = /^[a-f0-9]{40,64}$/u;
const REGISTER_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const HTTPS_URL = /^https:\/\/[^\s]+$/u;
const LOCAL_ORIGIN = /^local:[^\r\n]+$/u;
const UNPINNED_COMMIT = /^(?:not_available_local_extract|unavailable|unbound|unknown)$/u;
/** Hard v10.3 per-unit bound shared with materialization/overlap readers. */
export const MAX_ALLOCATION_UNIT_BYTES = 32 * 1024 * 1024;

export type AdmissionAllocationStreamChunk = Uint8Array | string;
export type AdmissionAllocationInventoryStream =
  | AdmissionAllocationStreamChunk
  | AsyncIterable<AdmissionAllocationStreamChunk>;

/** The row shape produced by the existing v10.3 inventory normalizer. */
export interface AdmissionAllocationInventoryRowV1 {
  readonly sourceId: string;
  readonly declaredPolarity: 'declared_ai' | 'declared_human';
  readonly repositoryId: string | null;
  readonly originUrl: string | null;
  readonly commitSha: string | null;
  readonly normalizedPath: string;
  readonly contentSha256: string;
  readonly language: string;
  readonly stratum: string;
  readonly sizeBytes: number;
  readonly status: string;
}

export type AdmissionAllocationMaterialPartition =
  | 'aggregate'
  | 'baseline'
  | 'repository'
  | 'non_selected';

export type AdmissionAllocationDisposition =
  | 'allocated'
  | 'quarantine'
  | 'unrepresented';

/** A canonical, diagnostic-only row. It carries no verified label. */
export interface AdmissionAllocationRowV1 {
  readonly version: 'v10.3-admission-allocation-preview-row-v1';
  readonly sourceId: string;
  readonly normalizedPath: string;
  readonly owningMaterialSourceId: string | null;
  readonly materialPartition: AdmissionAllocationMaterialPartition;
  readonly declaredPolarity: 'declared_ai' | 'declared_human';
  readonly originUrl: string | null;
  readonly pinnedCommitSha: string | null;
  readonly contentSha256: string;
  readonly language: string;
  readonly byteSize: number;
  readonly disposition: AdmissionAllocationDisposition;
  readonly reasonCodes: readonly string[];
}

export interface AdmissionAllocationPreviewRequestV1 {
  readonly sourceRegister: unknown;
  readonly sourceReviews: readonly unknown[];
  readonly positiveInventory: AdmissionAllocationInventoryStream;
  readonly negativeInventory: AdmissionAllocationInventoryStream;
}

export interface AdmissionAllocationPreviewSummaryV1 {
  readonly version: 'v10.3-admission-allocation-preview-v1';
  readonly ok: boolean;
  readonly ready: false;
  readonly authorityEligible: false;
  readonly diagnosticOnly: true;
  readonly rowCount: number;
  readonly allocated: number;
  readonly quarantine: number;
  readonly unrepresented: number;
  readonly duplicate: number;
  readonly positiveRowCount: number;
  readonly negativeRowCount: number;
  readonly baselineRowCount: number;
  readonly repositoryRowCount: number;
  readonly reasonCodeCounts: Readonly<Record<string, number>>;
  readonly streamSha256: string;
  readonly sourceRegisterSha256: string;
  readonly errors: readonly string[];
  /** The raw 1,478,350-file discovery denominator is intentionally excluded. */
  readonly rawDiscoveryDenominatorExcluded: true;
}

export interface AdmissionAllocationPreviewStreamV1 {
  /** Single consumer; rows are not retained by the producer. */
  readonly records: AsyncIterable<AdmissionAllocationRowV1>;
  /** Resolves only after both explicit inventory streams are exhausted/fail closed. */
  readonly complete: Promise<AdmissionAllocationPreviewSummaryV1>;
}

export class AdmissionAllocationPreviewValidationError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    const unique = [...new Set(errors)];
    super(`allocation preview authority inputs are invalid: ${unique.join('; ')}`);
    this.name = 'AdmissionAllocationPreviewValidationError';
    this.errors = unique;
  }
}

interface AuthorityContext {
  readonly register: CalibrationAdmissionSourceRegisterV1;
  readonly reviews: ReadonlyMap<string, CalibrationSourceReviewV103>;
  readonly entries: ReadonlyMap<string, CalibrationAdmissionSourceRegisterV1['entries'][number]>;
}

interface MutableSummary {
  rowCount: number;
  allocated: number;
  quarantine: number;
  unrepresented: number;
  duplicate: number;
  positiveRowCount: number;
  negativeRowCount: number;
  baselineRowCount: number;
  repositoryRowCount: number;
  readonly materialSourceRowCounts: Map<string, number>;
  readonly reasonCodeCounts: Map<string, number>;
  readonly errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function validPath(value: unknown): value is string {
  if (!nonEmptyString(value) || value.includes('\\') || /[\u0000-\u001f\u007f\r\n]/u.test(value) || value.startsWith('/')) return false;
  const parts = value.split('/');
  return parts.every((part) => part.length > 0 && part !== '.' && part !== '..');
}

function validHttps(value: unknown): value is string {
  return typeof value === 'string' && HTTPS_URL.test(value);
}

function validOrigin(value: unknown): value is string {
  return validHttps(value) || (typeof value === 'string' && LOCAL_ORIGIN.test(value));
}

function validCommit(value: unknown): value is string {
  return typeof value === 'string' && (COMMIT_SHA.test(value) || UNPINNED_COMMIT.test(value));
}

function validInventorySourceId(value: unknown): value is string {
  // Inventory IDs append a manifest-relative path and may therefore contain
  // spaces, Unicode, and punctuation from real repository filenames. Only
  // control/newline bytes are forbidden because they would corrupt JSONL.
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 512
    && !/[\u0000-\u001f\u007f\r\n]/u.test(value);
}

function validRegisterId(value: unknown): value is string {
  return typeof value === 'string' && REGISTER_ID.test(value);
}

function inputChunks(input: AdmissionAllocationInventoryStream): AsyncIterable<Uint8Array> {
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
      else throw new TypeError('allocation inventory chunks must be strings or Uint8Array values');
    }
  }());
}

function authorityContext(request: AdmissionAllocationPreviewRequestV1): AuthorityContext {
  const validation = validateCalibrationAdmissionSourceRegisterReviewSet(request.sourceRegister, request.sourceReviews);
  if (!validation.ok || !isCalibrationAdmissionSourceRegisterV1(request.sourceRegister)) {
    throw new AdmissionAllocationPreviewValidationError(validation.errors.length > 0
      ? validation.errors
      : ['source register failed shape, hash, generation, or conservation validation']);
  }
  const register = request.sourceRegister;
  const reviews = request.sourceReviews.filter((value): value is CalibrationSourceReviewV103 => isRecord(value)
    && typeof value.sourceId === 'string') as readonly CalibrationSourceReviewV103[];
  const entries = new Map(register.entries.map((entry) => [entry.sourceId, entry]));
  return {
    register,
    reviews: new Map(reviews.map((review) => [review.sourceId, review])),
    entries,
  };
}

function reasonCodes(value: readonly string[]): readonly string[] {
  return [...new Set(value)].sort(compareCodePoints);
}

function compareCodePoints(left: string, right: string): number {
  if (left === right) return 0;
  const leftPoints = Array.from(left, (value) => value.codePointAt(0)!);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0)!);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const leftPoint = leftPoints[index]!;
    const rightPoint = rightPoints[index]!;
    if (leftPoint !== rightPoint) return leftPoint < rightPoint ? -1 : 1;
  }
  return leftPoints.length < rightPoints.length ? -1 : 1;
}

function addReason(summary: MutableSummary, reason: string): void {
  summary.reasonCodeCounts.set(reason, (summary.reasonCodeCounts.get(reason) ?? 0) + 1);
}

function addError(summary: MutableSummary, error: string, reason?: string): void {
  summary.errors.push(error);
  if (reason !== undefined) addReason(summary, reason);
}

function outputRow(
  row: AdmissionAllocationInventoryRowV1,
  owningMaterialSourceId: string | null,
  materialPartition: AdmissionAllocationMaterialPartition,
  disposition: AdmissionAllocationDisposition,
  reasons: readonly string[],
): AdmissionAllocationRowV1 {
  return {
    version: 'v10.3-admission-allocation-preview-row-v1',
    sourceId: row.sourceId,
    normalizedPath: row.normalizedPath,
    owningMaterialSourceId,
    materialPartition,
    declaredPolarity: row.declaredPolarity,
    originUrl: row.originUrl,
    pinnedCommitSha: row.commitSha !== null && COMMIT_SHA.test(row.commitSha) ? row.commitSha : null,
    contentSha256: row.contentSha256,
    language: row.language,
    byteSize: row.sizeBytes,
    disposition,
    reasonCodes: reasonCodes(reasons),
  };
}

function parseInventoryRow(value: unknown, label: string): AdmissionAllocationInventoryRowV1 {
  const keys = [
    'sourceId', 'declaredPolarity', 'repositoryId', 'originUrl', 'commitSha',
    'normalizedPath', 'contentSha256', 'language', 'stratum', 'sizeBytes', 'status',
  ] as const;
  if (!isRecord(value) || !hasExactKeys(value, keys)) throw new Error(`${label}: malformed_inventory_row`);
  if (!validInventorySourceId(value.sourceId)) throw new Error(`${label}: malformed_source_id`);
  if (value.declaredPolarity !== 'declared_ai' && value.declaredPolarity !== 'declared_human') throw new Error(`${label}: malformed_declared_polarity`);
  if (value.repositoryId !== null && !validRegisterId(value.repositoryId)) throw new Error(`${label}: malformed_repository_id`);
  if (value.originUrl !== null && !validOrigin(value.originUrl)) throw new Error(`${label}: malformed_origin_url`);
  if (value.commitSha !== null && !validCommit(value.commitSha)) throw new Error(`${label}: malformed_commit_sha`);
  if (!validPath(value.normalizedPath)) throw new Error(`${label}: malformed_path`);
  if (typeof value.contentSha256 !== 'string' || !SHA256.test(value.contentSha256)) throw new Error(`${label}: malformed_content_sha256`);
  if (!nonEmptyString(value.language) || !nonEmptyString(value.stratum) || !nonEmptyString(value.status)) throw new Error(`${label}: malformed_inventory_metadata`);
  if (typeof value.sizeBytes !== 'number' || !Number.isSafeInteger(value.sizeBytes) || value.sizeBytes < 0) throw new Error(`${label}: malformed_size_bytes`);
  return value as unknown as AdmissionAllocationInventoryRowV1;
}

function reviewIsStructurallyBound(
  row: AdmissionAllocationInventoryRowV1,
  review: CalibrationSourceReviewV103,
  ownerId: string,
): readonly string[] {
  const reasons: string[] = [];
  if (review.decision !== 'candidate') {
    reasons.push('source_review_quarantined', ...review.reasons);
    return reasons;
  }
  if (review.origin.kind !== 'https' || row.originUrl === null) reasons.push('origin_unbound');
  else if (row.originUrl !== review.origin.url) reasons.push('origin_binding_mismatch');
  const materialization = review.materialization;
  if (materialization.kind === 'git') {
    if (materialization.repositoryId !== ownerId) reasons.push('materialization_owner_mismatch');
    if (row.commitSha === null || materialization.commitSha !== row.commitSha) reasons.push('commit_binding_mismatch');
  } else if (materialization.kind === 'record_container') {
    const container = materialization.containers.find((candidate) => candidate.normalizedPath === row.normalizedPath);
    if (!container || container.bytes !== row.sizeBytes || container.sha256 !== row.contentSha256) reasons.push('materialization_row_unbound');
  } else if (materialization.kind === 'release_archive_set') {
    if (row.commitSha === null || materialization.upstreamCommitSha !== row.commitSha) reasons.push('commit_binding_mismatch');
    if (!materialization.assets.some((asset) => asset.repositoryId === ownerId)) reasons.push('materialization_owner_mismatch');
  } else {
    reasons.push('materialization_unbound');
  }
  return reasons;
}

function materialSourceForRow(
  row: AdmissionAllocationInventoryRowV1,
  authority: AuthorityContext,
): string | undefined {
  const owner = row.repositoryId === null
    ? authority.entries.get('legacy-ai-slop-baseline')
    : authority.entries.get(row.repositoryId);
  return owner?.kind === 'material_source' ? owner.sourceId : undefined;
}

function materialPartitionForRow(
  row: AdmissionAllocationInventoryRowV1,
  authority: AuthorityContext,
): AdmissionAllocationMaterialPartition | undefined {
  const owner = row.repositoryId === null
    ? authority.entries.get('legacy-ai-slop-baseline')
    : authority.entries.get(row.repositoryId);
  return owner?.kind === 'material_source' ? owner.materialPartition : undefined;
}

function classifyRow(
  row: AdmissionAllocationInventoryRowV1,
  expectedPolarity: AdmissionAllocationInventoryRowV1['declaredPolarity'],
  authority: AuthorityContext,
  seenSourceIds: Set<string>,
  summary: MutableSummary,
): AdmissionAllocationRowV1 {
  if (row.declaredPolarity !== expectedPolarity) {
    throw new Error('declared_polarity_mismatch');
  }
  let ownerId: string | null = null;
  let ownerEntry: CalibrationAdmissionSourceRegisterV1['entries'][number] | undefined;
  const reasons: string[] = [];
  if (row.repositoryId === null) {
    ownerEntry = authority.entries.get('legacy-ai-slop-baseline');
    ownerId = ownerEntry?.kind === 'material_source' ? ownerEntry.sourceId : null;
    if (!ownerEntry || ownerEntry.kind !== 'material_source' || ownerEntry.materialPartition !== 'baseline') reasons.push('baseline_owner_missing');
    else if (!row.sourceId.startsWith(`${ownerEntry.sourceId}:`)) reasons.push('inventory_source_owner_mismatch');
  } else {
    ownerEntry = authority.entries.get(row.repositoryId);
    if (!ownerEntry) {
      summary.errors.push('unknown_repository_id');
      reasons.push('unknown_repository_id');
    } else if (ownerEntry.kind === 'aggregate_inventory') {
      summary.errors.push('aggregate_owner_forbidden');
      reasons.push('aggregate_owner_forbidden');
    } else {
      ownerId = ownerEntry.sourceId;
      if (ownerEntry.materialPartition !== 'repository') reasons.push('non_selected_source');
      if (!row.sourceId.startsWith(`${ownerEntry.sourceId}:`)) reasons.push('inventory_source_owner_mismatch');
    }
  }
  const duplicate = seenSourceIds.has(row.sourceId);
  if (duplicate) {
    summary.duplicate += 1;
    summary.errors.push('duplicate_inventory_row_id');
    reasons.push('duplicate_inventory_row_id');
  } else {
    seenSourceIds.add(row.sourceId);
  }
  if (reasons.length > 0) {
    const partition = ownerEntry?.materialPartition
      ?? (row.repositoryId === null ? 'baseline' : 'repository');
    const disposition = duplicate && reasons.length === 1 ? 'quarantine' : 'unrepresented';
    return outputRow(row, ownerId, partition, disposition, reasons);
  }

  const review = authority.reviews.get(ownerId!);
  if (!review || review.sourceId !== ownerId) {
    return outputRow(row, ownerId, ownerEntry!.materialPartition, 'quarantine', ['source_review_missing']);
  }
  const bindingReasons = reviewIsStructurallyBound(row, review, ownerId!);
  if (bindingReasons.length > 0) return outputRow(row, ownerId, ownerEntry!.materialPartition, 'quarantine', bindingReasons);
  return outputRow(row, ownerId, ownerEntry!.materialPartition, 'allocated', []);
}

function finishSummary(
  hash: Hash,
  summary: MutableSummary,
  authority: AuthorityContext,
  errors: readonly string[] = [],
): AdmissionAllocationPreviewSummaryV1 {
  const digest = hash.digest('hex');
  const mergedErrors = [...new Set([...summary.errors, ...errors])];
  const reasonCodeCounts = Object.fromEntries(
    [...summary.reasonCodeCounts.entries()].sort(([left], [right]) => compareCodePoints(left, right)),
  );
  return {
    version: 'v10.3-admission-allocation-preview-v1',
    ok: mergedErrors.length === 0,
    ready: false,
    authorityEligible: false,
    diagnosticOnly: true,
    rowCount: summary.rowCount,
    allocated: summary.allocated,
    quarantine: summary.quarantine,
    unrepresented: summary.unrepresented,
    duplicate: summary.duplicate,
    positiveRowCount: summary.positiveRowCount,
    negativeRowCount: summary.negativeRowCount,
    baselineRowCount: summary.baselineRowCount,
    repositoryRowCount: summary.repositoryRowCount,
    reasonCodeCounts,
    streamSha256: digest,
    sourceRegisterSha256: authority.register.registerSha256,
    errors: mergedErrors,
    rawDiscoveryDenominatorExcluded: true,
  };
}

/**
 * Open a single-consumer, bounded-memory allocation preview. Register/review
 * validation happens synchronously; inventory bytes are consumed exactly once
 * only after that authority boundary succeeds.
 */
export function openAdmissionAllocationPreviewStream(
  request: AdmissionAllocationPreviewRequestV1,
): AdmissionAllocationPreviewStreamV1 {
  const authority = authorityContext(request);
  let resolveComplete!: (summary: AdmissionAllocationPreviewSummaryV1) => void;
  const complete = new Promise<AdmissionAllocationPreviewSummaryV1>((resolve) => { resolveComplete = resolve; });
  const producer = (async function* (): AsyncGenerator<AdmissionAllocationRowV1> {
    const hash = createHash('sha256');
    const summary: MutableSummary = {
      rowCount: 0,
      allocated: 0,
      quarantine: 0,
      unrepresented: 0,
      duplicate: 0,
      positiveRowCount: 0,
      negativeRowCount: 0,
      baselineRowCount: 0,
      repositoryRowCount: 0,
      materialSourceRowCounts: new Map(),
      reasonCodeCounts: new Map(),
      errors: [],
    };
    const seenSourceIds = new Set<string>();
    let finished = false;
    let allInputsExhausted = false;
    const emit = (row: AdmissionAllocationRowV1): AdmissionAllocationRowV1 => {
      const bytes = Buffer.from(`${calibrationAdmissionCanonicalJson(row)}\n`, 'utf8');
      hash.update(bytes);
      summary.rowCount += 1;
      if (row.disposition === 'allocated') summary.allocated += 1;
      else if (row.disposition === 'quarantine') summary.quarantine += 1;
      else summary.unrepresented += 1;
      for (const reason of row.reasonCodes) addReason(summary, reason);
      return row;
    };
    const finish = (): void => {
      if (finished) return;
      finished = true;
      if (summary.positiveRowCount !== V103_ALLOCATION_COUNTS.positive) addError(summary, 'positive_row_count_conservation_failed');
      if (summary.negativeRowCount !== V103_ALLOCATION_COUNTS.negative) addError(summary, 'negative_row_count_conservation_failed');
      if (summary.rowCount !== V103_ALLOCATION_COUNTS.selected) addError(summary, 'selected_row_count_conservation_failed');
      if (summary.baselineRowCount !== V103_ALLOCATION_COUNTS.baseline) addError(summary, 'baseline_row_count_conservation_failed');
      if (summary.repositoryRowCount !== V103_ALLOCATION_COUNTS.repository) addError(summary, 'repository_row_count_conservation_failed');
      for (const entry of authority.register.entries) {
        if (entry.kind !== 'material_source') continue;
        const sourceId = entry.sourceId;
        const represented = summary.materialSourceRowCounts.get(sourceId) ?? 0;
        const review = authority.reviews.get(sourceId);
        const reviewCount = review?.inventory.candidateCodeUnitCount;
        if (represented !== entry.inventoryCandidateUnits || (reviewCount !== undefined && represented !== reviewCount)) {
          const reason = `source_inventory_conservation_failed:${sourceId}`;
          addError(summary, reason, reason);
        }
      }
      resolveComplete(finishSummary(hash, summary, authority));
    };
    const consumeArm = async function* (
      input: AdmissionAllocationInventoryStream,
      expectedPolarity: AdmissionAllocationInventoryRowV1['declaredPolarity'],
    ): AsyncGenerator<AdmissionAllocationRowV1> {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let pending = '';
      let sawNewline = false;
      let lineNumber = 0;
      let bytesRead = 0;
      try {
        for await (const bytes of inputChunks(input)) {
          bytesRead += bytes.byteLength;
          try {
            pending += decoder.decode(bytes, { stream: true });
          } catch {
            throw new Error(`${expectedPolarity}:inventory_jsonl_utf8_invalid`);
          }
          let newline = pending.indexOf('\n');
          while (newline >= 0) {
            const line = pending.slice(0, newline);
            pending = pending.slice(newline + 1);
            lineNumber += 1;
            sawNewline = true;
            if (line.length === 0 || line.includes('\r')) throw new Error(`${expectedPolarity}:${lineNumber}:malformed_inventory_row`);
            if (Buffer.byteLength(line, 'utf8') + 1 > MAX_ALLOCATION_UNIT_BYTES) {
              throw new Error(`${expectedPolarity}:${lineNumber}:inventory_jsonl_unit_limit`);
            }
            let parsed: unknown;
            try { parsed = JSON.parse(line) as unknown; } catch { throw new Error(`${expectedPolarity}:${lineNumber}:malformed_inventory_row`); }
            let row: AdmissionAllocationInventoryRowV1;
            try { row = parseInventoryRow(parsed, `${expectedPolarity}:${lineNumber}`); } catch (error) {
              const reason = error instanceof Error ? error.message.split(':').pop()!.trim() : 'malformed_inventory_row';
              throw new Error(`${expectedPolarity}:${lineNumber}:${reason}`);
            }
            if (expectedPolarity === 'declared_ai') summary.positiveRowCount += 1;
            else summary.negativeRowCount += 1;
            const materialPartition = materialPartitionForRow(row, authority);
            if (materialPartition === 'baseline') summary.baselineRowCount += 1;
            else if (materialPartition === 'repository') summary.repositoryRowCount += 1;
            const materialSourceId = materialSourceForRow(row, authority);
            if (materialSourceId !== undefined) {
              summary.materialSourceRowCounts.set(materialSourceId, (summary.materialSourceRowCounts.get(materialSourceId) ?? 0) + 1);
            }
            const allocated = classifyRow(row, expectedPolarity, authority, seenSourceIds, summary);
            yield emit(allocated);
            newline = pending.indexOf('\n');
          }
        }
        if (Buffer.byteLength(pending, 'utf8') > MAX_ALLOCATION_UNIT_BYTES) {
          throw new Error(`${expectedPolarity}:inventory_jsonl_unit_limit`);
        }
        try { pending += decoder.decode(); } catch { throw new Error(`${expectedPolarity}:inventory_jsonl_utf8_invalid`); }
        if (Buffer.byteLength(pending, 'utf8') > MAX_ALLOCATION_UNIT_BYTES) {
          throw new Error(`${expectedPolarity}:inventory_jsonl_unit_limit`);
        }
        if (pending.length > 0 || !sawNewline) throw new Error(`${expectedPolarity}:inventory_jsonl_final_newline_required`);
        if (bytesRead === 0) throw new Error(`${expectedPolarity}:inventory_jsonl_empty`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const reason = message.split(':').pop()!.trim();
        addError(summary, message, reason);
        throw error;
      }
    };
    try {
      for await (const row of consumeArm(request.positiveInventory, 'declared_ai')) yield row;
      for await (const row of consumeArm(request.negativeInventory, 'declared_human')) yield row;
      allInputsExhausted = true;
    } catch (error) {
      // The complete summary is resolved in finally and intentionally carries
      // no success claim after a malformed or rejected late row.
      if (summary.errors.length === 0) addError(summary, error instanceof Error ? error.message : String(error));
    } finally {
      if (!allInputsExhausted && summary.errors.length === 0) addError(summary, 'stream_not_fully_consumed');
      finish();
    }
  }());
  let recordsConsumed = false;
  const records: AsyncIterable<AdmissionAllocationRowV1> = {
    [Symbol.asyncIterator](): AsyncIterator<AdmissionAllocationRowV1> {
      if (recordsConsumed) throw new Error('allocation_preview_stream_already_consumed');
      recordsConsumed = true;
      return producer[Symbol.asyncIterator]();
    },
  };
  return { records, complete };
}

export const openAdmissionAllocationPreview = openAdmissionAllocationPreviewStream;
