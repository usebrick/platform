import {
  calibrationAdmissionLineageLedgerSha256,
  calibrationAdmissionLineageResultSha256,
  calibrationAdmissionPrivacyLedgerSha256,
  calibrationAdmissionPrivacyResultSha256,
  calibrationAdmissionQualityLedgerSha256,
  calibrationAdmissionQualityResultSha256,
  calibrationAdmissionSha256,
  isCalibrationAdmissionRecordV103,
  validateCalibrationAdmissionLineageLedgerV1,
  validateCalibrationAdmissionLineageResultV1 as lineageResultValidator,
  validateCalibrationAdmissionPrivacyLedgerV1,
  validateCalibrationAdmissionPrivacyResultV1 as privacyResultValidator,
  validateCalibrationAdmissionQualityLedgerV1,
  validateCalibrationAdmissionQualityResultV1 as qualityResultValidator,
  type AdmissionLineageLedgerV1,
  type AdmissionLineageResultV1,
  type AdmissionPrivacyLedgerV1,
  type AdmissionPrivacyResultV1,
  type AdmissionQualityLedgerV1,
  type AdmissionQualityResultV1,
  type CalibrationAdmissionRecordV103,
} from '@usebrick/core';

/**
 * The maximum number of selected records in v10.3.  The builders are pure
 * and intentionally bounded: they may receive an already-verified stream
 * projection, but they never discover files, read bytes, or silently grow a
 * new denominator.
 */
export const MAX_STATIC_LEDGER_RECORDS = 452_382 as const;

const SHA256 = /^[a-f0-9]{64}$/u;

/**
 * A record identity emitted by the byte-backed admission context.  The
 * canonical hash is retained so a caller cannot pass a structurally valid
 * record whose bytes were changed after verification.
 */
export interface AdmissionVerifiedRecordInputV1 {
  readonly record: CalibrationAdmissionRecordV103;
  readonly canonicalSha256: string;
}

export type AdmissionPrivacyResultInputV1 = Omit<AdmissionPrivacyResultV1, 'resultSha256'>;
export type AdmissionQualityResultInputV1 = Omit<AdmissionQualityResultV1, 'resultSha256'>;
export type AdmissionLineageResultInputV1 = Omit<AdmissionLineageResultV1, 'lineageSha256'>;

export interface AdmissionPrivacyLedgerInputV1 {
  readonly records: readonly AdmissionVerifiedRecordInputV1[];
  readonly results: readonly AdmissionPrivacyResultInputV1[];
  readonly unresolvedRecordIds: readonly string[];
}

export interface AdmissionQualityLedgerInputV1 {
  readonly records: readonly AdmissionVerifiedRecordInputV1[];
  readonly results: readonly AdmissionQualityResultInputV1[];
  readonly unresolvedRecordIds: readonly string[];
}

export interface AdmissionLineageLedgerInputV1 {
  readonly records: readonly AdmissionVerifiedRecordInputV1[];
  readonly results: readonly AdmissionLineageResultInputV1[];
  readonly unresolvedRecordIds: readonly string[];
}

export interface AdmissionStaticLedgersInputV1 {
  readonly records: readonly AdmissionVerifiedRecordInputV1[];
  readonly privacy: Readonly<{
    readonly results: readonly AdmissionPrivacyResultInputV1[];
    readonly unresolvedRecordIds: readonly string[];
  }>;
  readonly quality: Readonly<{
    readonly results: readonly AdmissionQualityResultInputV1[];
    readonly unresolvedRecordIds: readonly string[];
  }>;
  readonly lineage: Readonly<{
    readonly results: readonly AdmissionLineageResultInputV1[];
    readonly unresolvedRecordIds: readonly string[];
  }>;
}

export type AdmissionStaticLedgerBuildResult<T> =
  | { readonly ok: true; readonly ledger: T; readonly errors: readonly [] }
  | { readonly ok: false; readonly errors: readonly string[] };

export type AdmissionStaticLedgersBuildResult =
  | {
    readonly ok: true;
    readonly privacyLedger: AdmissionPrivacyLedgerV1;
    readonly qualityLedger: AdmissionQualityLedgerV1;
    readonly lineageLedger: AdmissionLineageLedgerV1;
    readonly errors: readonly [];
  }
  | { readonly ok: false; readonly errors: readonly string[] };

type RecordById = ReadonlyMap<string, AdmissionVerifiedRecordInputV1>;

function failure<T>(errors: readonly string[]): AdmissionStaticLedgerBuildResult<T> {
  return { ok: false, errors: [...new Set(errors)] };
}

function success<T>(ledger: T): AdmissionStaticLedgerBuildResult<T> {
  return { ok: true, ledger, errors: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: readonly string[]): { readonly values: readonly string[]; readonly duplicate: boolean } {
  const sorted = [...values].sort(compareStrings);
  return { values: sorted, duplicate: new Set(sorted).size !== sorted.length };
}

function prepareRecords(
  input: unknown,
): { readonly ok: true; readonly ids: readonly string[]; readonly records: RecordById } | { readonly ok: false; readonly errors: readonly string[] } {
  if (!Array.isArray(input)) return { ok: false, errors: ['verified record inputs must be an array'] };
  if (input.length > MAX_STATIC_LEDGER_RECORDS) return { ok: false, errors: ['verified record inputs exceed the v10.3 bound'] };

  const errors: string[] = [];
  const records = new Map<string, AdmissionVerifiedRecordInputV1>();
  for (const [index, raw] of input.entries()) {
    if (!isRecord(raw) || !exactKeys(raw, ['record', 'canonicalSha256'])) {
      errors.push(`verified record input ${index} has an invalid shape`);
      continue;
    }
    const recordInput = raw.record;
    const canonicalSha256 = raw.canonicalSha256;
    let record: CalibrationAdmissionRecordV103 | undefined;
    try {
      if (isCalibrationAdmissionRecordV103(recordInput)) record = recordInput as unknown as CalibrationAdmissionRecordV103;
    } catch {
      record = undefined;
    }
    if (record === undefined) {
      errors.push(`verified record input ${index} contains an invalid admission record`);
      continue;
    }
    if (!isSha256(canonicalSha256)) {
      errors.push(`verified record ${record.recordId} canonical hash is invalid`);
      continue;
    }
    let expectedSha256 = '';
    try {
      expectedSha256 = calibrationAdmissionSha256(record);
    } catch {
      errors.push(`verified record ${record.recordId} cannot be canonicalized`);
      continue;
    }
    if (canonicalSha256 !== expectedSha256) {
      errors.push('verified record canonical hash does not match the record');
      continue;
    }
    if (records.has(record.recordId)) {
      errors.push(`verified record ${record.recordId} is duplicated`);
      continue;
    }
    records.set(record.recordId, { record, canonicalSha256 });
  }
  if (errors.length > 0) return { ok: false, errors };
  const ids = [...records.keys()].sort(compareStrings);
  return { ok: true, ids, records };
}

function resultShape(
  raw: unknown,
  expectedKeys: readonly string[],
  label: string,
): { readonly value: Record<string, unknown> } | { readonly errors: readonly string[] } {
  if (!isRecord(raw) || !exactKeys(raw, expectedKeys)) return { errors: [`${label} has an invalid shape`] };
  return { value: raw };
}

function resultIdsAndPartition(
  recordIds: readonly string[],
  resultIds: readonly string[],
  unresolvedInput: unknown,
  label: string,
): { readonly ok: true; readonly covered: readonly string[]; readonly unresolved: readonly string[] } | { readonly ok: false; readonly errors: readonly string[] } {
  if (!Array.isArray(unresolvedInput) || unresolvedInput.some((entry) => typeof entry !== 'string')) {
    return { ok: false, errors: [`${label} unresolvedRecordIds must be an array of IDs`] };
  }
  const unresolved = uniqueSorted(unresolvedInput);
  if (unresolved.duplicate) return { ok: false, errors: [`${label} unresolvedRecordIds must be unique`] };
  const covered = uniqueSorted(resultIds);
  if (covered.duplicate) return { ok: false, errors: [`${label} results must be unique by record ID`] };
  const known = new Set(recordIds);
  const unknownResult = covered.values.find((id) => !known.has(id));
  if (unknownResult !== undefined) return { ok: false, errors: [`${label} result record ID is not in the verified record set`] };
  const unknownUnresolved = unresolved.values.find((id) => !known.has(id));
  if (unknownUnresolved !== undefined) return { ok: false, errors: [`${label} unresolved record ID is not in the verified record set`] };
  const unresolvedSet = new Set(unresolved.values);
  if (covered.values.some((id) => unresolvedSet.has(id))) {
    return { ok: false, errors: [`${label} covered and unresolved record IDs overlap`] };
  }
  const partition = [...covered.values, ...unresolved.values].sort(compareStrings);
  if (partition.length !== recordIds.length || partition.some((id, index) => id !== recordIds[index])) {
    return { ok: false, errors: [`${label} record partition does not equal the verified record set`] };
  }
  return { ok: true, covered: covered.values, unresolved: unresolved.values };
}

function buildPrivacyResult(
  raw: unknown,
  records: RecordById,
): { readonly ok: true; readonly result: AdmissionPrivacyResultV1 } | { readonly ok: false; readonly errors: readonly string[] } {
  const shaped = resultShape(raw, ['version', 'recordId', 'contentSha256', 'privacyStatus', 'secretStatus', 'findings', 'reviewerDecisionIds', 'toolReceiptSha256'], 'privacy result');
  if ('errors' in shaped) return { ok: false, errors: shaped.errors };
  const value = shaped.value;
  const recordId = value.recordId;
  if (typeof recordId !== 'string' || !records.has(recordId)) return { ok: false, errors: ['privacy result record ID is not in the verified record set'] };
  const record = records.get(recordId)!;
  if (value.contentSha256 !== record.record.contentSha256) return { ok: false, errors: ['privacy result content hash does not match the verified record'] };
  if (!Array.isArray(value.findings) || !Array.isArray(value.reviewerDecisionIds)) return { ok: false, errors: ['privacy result findings or reviewer IDs are invalid'] };
  const findings = value.findings.map((finding) => finding);
  findings.sort((left, right) => {
    if (!isRecord(left) || !isRecord(right)) return 0;
    return compareStrings(
      `${String(left.kind)}\u0000${String(left.findingFingerprintSha256)}`,
      `${String(right.kind)}\u0000${String(right.findingFingerprintSha256)}`,
    );
  });
  const reviewerDecisionIds = [...value.reviewerDecisionIds].filter((entry): entry is string => typeof entry === 'string').sort(compareStrings);
  if (reviewerDecisionIds.length !== value.reviewerDecisionIds.length) return { ok: false, errors: ['privacy reviewerDecisionIds must contain strings'] };
  const body = {
    version: value.version,
    recordId,
    contentSha256: value.contentSha256,
    privacyStatus: value.privacyStatus,
    secretStatus: value.secretStatus,
    findings,
    reviewerDecisionIds,
    toolReceiptSha256: value.toolReceiptSha256,
  } as Omit<AdmissionPrivacyResultV1, 'resultSha256'>;
  const result = { ...body, resultSha256: calibrationAdmissionPrivacyResultSha256(body) };
  const validation = privacyResultValidator(result);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  return { ok: true, result };
}

function buildQualityResult(
  raw: unknown,
  records: RecordById,
): { readonly ok: true; readonly result: AdmissionQualityResultV1 } | { readonly ok: false; readonly errors: readonly string[] } {
  const shaped = resultShape(raw, ['version', 'recordId', 'contentSha256', 'syntaxStatus', 'scaffoldStatus', 'scaffoldByteShare', 'trivialStatus', 'toolReceiptSha256'], 'quality result');
  if ('errors' in shaped) return { ok: false, errors: shaped.errors };
  const value = shaped.value;
  const recordId = value.recordId;
  if (typeof recordId !== 'string' || !records.has(recordId)) return { ok: false, errors: ['quality result record ID is not in the verified record set'] };
  const record = records.get(recordId)!;
  if (value.contentSha256 !== record.record.contentSha256) return { ok: false, errors: ['quality result content hash does not match the verified record'] };
  const body = {
    version: value.version,
    recordId,
    contentSha256: value.contentSha256,
    syntaxStatus: value.syntaxStatus,
    scaffoldStatus: value.scaffoldStatus,
    scaffoldByteShare: value.scaffoldByteShare,
    trivialStatus: value.trivialStatus,
    toolReceiptSha256: value.toolReceiptSha256,
  } as Omit<AdmissionQualityResultV1, 'resultSha256'>;
  const result = { ...body, resultSha256: calibrationAdmissionQualityResultSha256(body) };
  const validation = qualityResultValidator(result);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  return { ok: true, result };
}

function buildLineageResult(
  raw: unknown,
  records: RecordById,
): { readonly ok: true; readonly result: AdmissionLineageResultV1 } | { readonly ok: false; readonly errors: readonly string[] } {
  const shaped = resultShape(raw, ['version', 'recordId', 'contentSha256', 'polarity', 'familyId', 'pairGroupId', 'split', 'exactClusterId', 'nearClusterId', 'toolReceiptSha256'], 'lineage result');
  if ('errors' in shaped) return { ok: false, errors: shaped.errors };
  const value = shaped.value;
  const recordId = value.recordId;
  if (typeof recordId !== 'string' || !records.has(recordId)) return { ok: false, errors: ['lineage result record ID is not in the verified record set'] };
  const record = records.get(recordId)!;
  if (value.contentSha256 !== record.record.contentSha256) return { ok: false, errors: ['lineage result content hash does not match the verified record'] };
  const body = {
    version: value.version,
    recordId,
    contentSha256: value.contentSha256,
    polarity: value.polarity,
    familyId: value.familyId,
    pairGroupId: value.pairGroupId,
    split: value.split,
    exactClusterId: value.exactClusterId,
    nearClusterId: value.nearClusterId,
    toolReceiptSha256: value.toolReceiptSha256,
  } as Omit<AdmissionLineageResultV1, 'lineageSha256'>;
  const result = { ...body, lineageSha256: calibrationAdmissionLineageResultSha256(body) };
  const validation = lineageResultValidator(result);
  if (!validation.ok) return { ok: false, errors: validation.errors };
  return { ok: true, result };
}

function buildLedger<R, L>(
  input: unknown,
  label: string,
  resultBuilder: (raw: unknown, records: RecordById) => { readonly ok: true; readonly result: R } | { readonly ok: false; readonly errors: readonly string[] },
  version: string,
  ledgerHash: (value: Record<string, unknown>) => string,
  ledgerValidator: (value: unknown, recordIds: readonly string[]) => { readonly ok: boolean; readonly errors: readonly string[] },
): AdmissionStaticLedgerBuildResult<L> {
  if (!isRecord(input)) return failure([`${label} ledger input is invalid`]);
  const prepared = prepareRecords(input.records);
  if (!prepared.ok) return failure(prepared.errors);
  if (!Array.isArray(input.results)) return failure([`${label} results must be an array`]);
  if (input.results.length > MAX_STATIC_LEDGER_RECORDS) return failure([`${label} results exceed the v10.3 bound`]);

  const errors: string[] = [];
  const built = input.results.map((raw) => resultBuilder(raw, prepared.records));
  for (const result of built) if (!result.ok) errors.push(...result.errors);
  if (errors.length > 0) return failure(errors);
  const results = built.filter((result): result is { readonly ok: true; readonly result: R } => result.ok).map((result) => result.result);
  const resultIds = results.map((result) => String((result as Record<string, unknown>).recordId));
  const partition = resultIdsAndPartition(prepared.ids, resultIds, input.unresolvedRecordIds, label);
  if (!partition.ok) return failure(partition.errors);
  const sortedResults = [...results].sort((left, right) => compareStrings(String((left as Record<string, unknown>).recordId), String((right as Record<string, unknown>).recordId)));
  const body = {
    version,
    admissionRecordSetSha256: calibrationAdmissionSha256(prepared.ids),
    results: sortedResults,
    coveredRecordIds: partition.covered,
    unresolvedRecordIds: partition.unresolved,
  } as Record<string, unknown>;
  const ledger = { ...body, ledgerSha256: ledgerHash(body) } as L;
  const validation = ledgerValidator(ledger, prepared.ids);
  if (!validation.ok) return failure(validation.errors);
  return success(ledger);
}

/** Build a hash-bound privacy/secret ledger from already verified records. */
export function buildAdmissionPrivacyLedger(input: AdmissionPrivacyLedgerInputV1): AdmissionStaticLedgerBuildResult<AdmissionPrivacyLedgerV1> {
  try {
    return buildLedger(
      input,
      'privacy',
      buildPrivacyResult,
      'v10.3-admission-privacy-ledger-v1',
      calibrationAdmissionPrivacyLedgerSha256,
      validateCalibrationAdmissionPrivacyLedgerV1,
    );
  } catch {
    return failure(['privacy ledger build failed closed']);
  }
}

/** Build a hash-bound syntax/scaffold/triviality ledger from verified records. */
export function buildAdmissionQualityLedger(input: AdmissionQualityLedgerInputV1): AdmissionStaticLedgerBuildResult<AdmissionQualityLedgerV1> {
  try {
    return buildLedger(
      input,
      'quality',
      buildQualityResult,
      'v10.3-admission-quality-ledger-v1',
      calibrationAdmissionQualityLedgerSha256,
      validateCalibrationAdmissionQualityLedgerV1,
    );
  } catch {
    return failure(['quality ledger build failed closed']);
  }
}

/** Build a hash-bound family/pair/split/cluster lineage ledger. */
export function buildAdmissionLineageLedger(input: AdmissionLineageLedgerInputV1): AdmissionStaticLedgerBuildResult<AdmissionLineageLedgerV1> {
  try {
    return buildLedger(
      input,
      'lineage',
      buildLineageResult,
      'v10.3-admission-lineage-ledger-v1',
      calibrationAdmissionLineageLedgerSha256,
      validateCalibrationAdmissionLineageLedgerV1,
    );
  } catch {
    return failure(['lineage ledger build failed closed']);
  }
}

/** Compose all three pure builders against one immutable verified record set. */
export function buildAdmissionStaticLedgers(input: AdmissionStaticLedgersInputV1): AdmissionStaticLedgersBuildResult {
  try {
    if (!isRecord(input)) return { ok: false, errors: ['static ledgers input is invalid'] };
    const privacy = buildAdmissionPrivacyLedger({ records: input.records, ...input.privacy });
    const quality = buildAdmissionQualityLedger({ records: input.records, ...input.quality });
    const lineage = buildAdmissionLineageLedger({ records: input.records, ...input.lineage });
    const errors = [
      ...(privacy.ok ? [] : privacy.errors),
      ...(quality.ok ? [] : quality.errors),
      ...(lineage.ok ? [] : lineage.errors),
    ];
    if (errors.length > 0 || !privacy.ok || !quality.ok || !lineage.ok) return { ok: false, errors: [...new Set(errors)] };
    return {
      ok: true,
      privacyLedger: privacy.ledger,
      qualityLedger: quality.ledger,
      lineageLedger: lineage.ledger,
      errors: [],
    };
  } catch {
    return { ok: false, errors: ['static ledgers build failed closed'] };
  }
}
