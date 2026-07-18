import {
  canonicalJson,
  canonicalSha256,
} from '../v103/canonical';

export const CAL002_PROTOCOL_VERSION = 'CAL-002-v1' as const;
export const CAL002_CATALOG_VERSION = 'cal-002-catalog-v1' as const;
export const CAL002_ASSIGNMENT_VERSION = 'cal-002-assignment-v1' as const;
export const CAL002_REVIEW_RECEIPT_VERSION = 'cal-002-review-receipt-v1' as const;
export const CAL002_QUALITY_METRICS_VERSION = 'cal-002-quality-metrics-v1' as const;
export const CAL002_ORIGIN_RECEIPT_VERSION = 'cal-002-origin-receipt-v1' as const;
export const CAL002_FINAL_MATRIX_VERSION = 'cal-002-final-matrix-v1' as const;
export const CAL002_MATRIX_APPROVAL_VERSION = 'cal-002-matrix-approval-v1' as const;
export const SLOPBRICK_RULE_EVIDENCE_POLICY_VERSION = 'slopbrick-rule-evidence-policy-v1' as const;

export type CAL002Lane = 'quality' | 'origin';
export type CAL002EvidenceClass = 'deterministic-or-standards' | 'contextual-quality' | 'statistical-review-utility';
export type CAL002ReviewLabel = 'actionable-defect' | 'useful-no-safe-fix' | 'not-useful' | 'cannot-determine';
export type CAL002OriginDisposition = 'hold-origin-default-off' | 'transfer-to-quality' | 'retire';
export type CAL002PolicyOutcome = 'default-on' | 'default-off' | 'quality-advisory' | 'insufficient-evidence' | 'retired';
export type CAL002ClaimCeiling =
  | 'deterministic-defect'
  | 'quality-usefulness'
  | 'review-target-utility'
  | 'internal-origin-association'
  | 'insufficient-evidence'
  | 'retired';
export type CAL002TransferReason =
  | 'standards-or-contract-quality-claim'
  | 'contextual-defect-quality-claim'
  | 'statistical-review-utility-claim';

export interface CAL002ValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

export interface CAL002CatalogQualityRow {
  readonly ruleId: string;
  readonly category: string;
  readonly aiSpecific: boolean;
  readonly existingDefaultOff: boolean;
  readonly cal001Decision: 'quality-only';
  readonly ownerReviewRequired: boolean;
  readonly lane: 'quality';
  readonly evidenceClass: CAL002EvidenceClass;
}

export interface CAL002CatalogOriginRow {
  readonly ruleId: string;
  readonly category: string;
  readonly aiSpecific: boolean;
  readonly existingDefaultOff: boolean;
  readonly cal001Decision: 'default-off' | 'recalibrate';
  readonly ownerReviewRequired: boolean;
  readonly lane: 'origin';
}

export type CAL002CatalogRow = CAL002CatalogQualityRow | CAL002CatalogOriginRow;

export interface CAL002Catalog {
  readonly version: typeof CAL002_CATALOG_VERSION;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION;
  readonly cal001MatrixSha256: string;
  readonly ruleCatalogSha256: string;
  readonly rows: readonly CAL002CatalogRow[];
  readonly counts: {
    readonly total: number;
    readonly startingQuality: number;
    readonly startingOrigin: number;
    readonly ownerReviewRequired: number;
    readonly deterministic: number;
    readonly contextual: number;
    readonly statistical: number;
  };
  readonly admitted: false;
  readonly applied: false;
}

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT_SHA = /^[a-f0-9]{40}$/u;
const RULE_ID = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/u;

type RecordValue = Record<string, unknown>;

class ValidationContext {
  readonly errors: string[] = [];

  add(path: string, message: string): void {
    this.errors.push(`${path} ${message}`);
  }

  finish(): CAL002ValidationResult {
    return { ok: this.errors.length === 0, errors: this.errors };
  }
}

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function objectAt(value: unknown, path: string, context: ValidationContext): RecordValue | undefined {
  if (!isRecord(value)) {
    context.add(path, 'must be an object');
    return undefined;
  }
  return value;
}

function exactKeys(record: RecordValue, allowed: readonly string[], required: readonly string[], path: string, context: ValidationContext): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) context.add(`${path}.${key}`, 'is an unknown key');
  }
  for (const key of required) {
    if (!Object.hasOwn(record, key)) context.add(`${path}.${key}`, 'is required');
  }
}

function literal(value: unknown, expected: string | boolean, path: string, context: ValidationContext): void {
  if (value !== expected) context.add(path, `must equal ${JSON.stringify(expected)}`);
}

function stringValue(value: unknown, path: string, context: ValidationContext): value is string {
  if (typeof value !== 'string' || value.length === 0) {
    context.add(path, 'must be a non-empty string');
    return false;
  }
  return true;
}

function enumValue<T extends string>(value: unknown, values: readonly T[], path: string, context: ValidationContext): value is T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    context.add(path, `must be one of ${values.join(', ')}`);
    return false;
  }
  return true;
}

function booleanValue(value: unknown, path: string, context: ValidationContext): value is boolean {
  if (typeof value !== 'boolean') {
    context.add(path, 'must be a boolean');
    return false;
  }
  return true;
}

function integer(value: unknown, path: string, context: ValidationContext, minimum = 0): value is number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    context.add(path, `must be an integer >= ${minimum}`);
    return false;
  }
  return true;
}

function assertSha256Value(value: unknown, path: string, context: ValidationContext): value is string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    context.add(path, 'must be a lowercase SHA-256');
    return false;
  }
  return true;
}

function assertCommitShaValue(value: unknown, path: string, context: ValidationContext): value is string {
  if (typeof value !== 'string' || !COMMIT_SHA.test(value)) {
    context.add(path, 'must be a lowercase 40-character commit SHA');
    return false;
  }
  return true;
}

export function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new TypeError(`${label} must be a lowercase SHA-256`);
}

export function assertCommitSha(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !COMMIT_SHA.test(value)) throw new TypeError(`${label} must be a lowercase 40-character commit SHA`);
}

export function canonicalArtifact(value: unknown): { readonly json: string; readonly sha256: string } {
  return { json: canonicalJson(value), sha256: canonicalSha256(value) };
}

function arrayRows(value: unknown, path: string, context: ValidationContext): unknown[] | undefined {
  if (!Array.isArray(value)) {
    context.add(path, 'must be an array');
    return undefined;
  }
  return value;
}

function uniqueRows(rows: readonly unknown[], key: string, path: string, context: ValidationContext): void {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    if (!isRecord(row) || typeof row[key] !== 'string') return;
    const value = row[key] as string;
    if (seen.has(value)) context.add(`${path}[${index}].${key}`, `is a duplicate ${key}`);
    seen.add(value);
  });
}

function validateHeader(record: RecordValue, version: string, context: ValidationContext): void {
  literal(record.version, version, 'artifact.version', context);
  literal(record.protocolVersion, CAL002_PROTOCOL_VERSION, 'artifact.protocolVersion', context);
}

function validateRuleId(value: unknown, path: string, context: ValidationContext): void {
  if (typeof value !== 'string' || !RULE_ID.test(value)) context.add(path, 'must be a canonical rule ID');
}

const EVIDENCE_CLASSES = ['deterministic-or-standards', 'contextual-quality', 'statistical-review-utility'] as const;
const REVIEW_CLASSES = ['contextual-quality', 'statistical-review-utility'] as const;
const REVIEW_LABELS = ['actionable-defect', 'useful-no-safe-fix', 'not-useful', 'cannot-determine'] as const;
const POLICY_OUTCOMES = ['default-on', 'default-off', 'quality-advisory', 'insufficient-evidence', 'retired'] as const;
const CLAIM_CEILINGS = ['deterministic-defect', 'quality-usefulness', 'review-target-utility', 'internal-origin-association', 'insufficient-evidence', 'retired'] as const;

function validateCatalogRow(value: unknown, index: number, context: ValidationContext): void {
  const path = `artifact.rows[${index}]`;
  const row = objectAt(value, path, context);
  if (!row) return;
  const quality = row.lane === 'quality';
  const allowed = ['ruleId', 'category', 'aiSpecific', 'existingDefaultOff', 'cal001Decision', 'ownerReviewRequired', 'lane', ...(quality ? ['evidenceClass'] : [])];
  exactKeys(row, allowed, allowed, path, context);
  validateRuleId(row.ruleId, `${path}.ruleId`, context);
  stringValue(row.category, `${path}.category`, context);
  booleanValue(row.aiSpecific, `${path}.aiSpecific`, context);
  booleanValue(row.existingDefaultOff, `${path}.existingDefaultOff`, context);
  booleanValue(row.ownerReviewRequired, `${path}.ownerReviewRequired`, context);
  if (!enumValue(row.lane, ['quality', 'origin'], `${path}.lane`, context)) return;
  if (row.lane === 'quality') {
    literal(row.cal001Decision, 'quality-only', `${path}.cal001Decision`, context);
    enumValue(row.evidenceClass, EVIDENCE_CLASSES, `${path}.evidenceClass`, context);
    if (row.aiSpecific !== false) context.add(`${path}.aiSpecific`, 'must be false for the quality lane');
  } else {
    enumValue(row.cal001Decision, ['default-off', 'recalibrate'], `${path}.cal001Decision`, context);
    if (row.aiSpecific !== true) context.add(`${path}.aiSpecific`, 'must be true for the origin lane');
  }
}

export function validateCAL002Catalog(value: unknown): CAL002ValidationResult {
  const context = new ValidationContext();
  const artifact = objectAt(value, 'artifact', context);
  if (!artifact) return context.finish();
  const keys = ['version', 'protocolVersion', 'cal001MatrixSha256', 'ruleCatalogSha256', 'rows', 'counts', 'admitted', 'applied'];
  exactKeys(artifact, keys, keys, 'artifact', context);
  validateHeader(artifact, CAL002_CATALOG_VERSION, context);
  assertSha256Value(artifact.cal001MatrixSha256, 'artifact.cal001MatrixSha256', context);
  assertSha256Value(artifact.ruleCatalogSha256, 'artifact.ruleCatalogSha256', context);
  const rows = arrayRows(artifact.rows, 'artifact.rows', context);
  rows?.forEach((row, index) => validateCatalogRow(row, index, context));
  if (rows) uniqueRows(rows, 'ruleId', 'artifact.rows', context);
  const counts = objectAt(artifact.counts, 'artifact.counts', context);
  const countKeys = ['total', 'startingQuality', 'startingOrigin', 'ownerReviewRequired', 'deterministic', 'contextual', 'statistical'];
  if (counts) {
    exactKeys(counts, countKeys, countKeys, 'artifact.counts', context);
    countKeys.forEach((key) => integer(counts[key], `artifact.counts.${key}`, context));
    if (rows) {
      const expected = {
        total: rows.length,
        startingQuality: rows.filter((row) => isRecord(row) && row.lane === 'quality').length,
        startingOrigin: rows.filter((row) => isRecord(row) && row.lane === 'origin').length,
        ownerReviewRequired: rows.filter((row) => isRecord(row) && row.ownerReviewRequired === true).length,
        deterministic: rows.filter((row) => isRecord(row) && row.evidenceClass === 'deterministic-or-standards').length,
        contextual: rows.filter((row) => isRecord(row) && row.evidenceClass === 'contextual-quality').length,
        statistical: rows.filter((row) => isRecord(row) && row.evidenceClass === 'statistical-review-utility').length,
      };
      for (const key of countKeys) if (counts[key] !== expected[key as keyof typeof expected]) context.add(`artifact.counts.${key}`, 'does not match rows');
    }
  }
  literal(artifact.admitted, false, 'artifact.admitted', context);
  literal(artifact.applied, false, 'artifact.applied', context);
  return context.finish();
}

function validateAssignmentRow(value: unknown, index: number, context: ValidationContext): void {
  const path = `artifact.rows[${index}]`;
  const row = objectAt(value, path, context);
  if (!row) return;
  const keys = ['assignmentRowId', 'ruleId', 'evidenceClass', 'arm', 'unitId', 'blindedUnitId'];
  exactKeys(row, keys, keys, path, context);
  stringValue(row.assignmentRowId, `${path}.assignmentRowId`, context);
  validateRuleId(row.ruleId, `${path}.ruleId`, context);
  enumValue(row.evidenceClass, REVIEW_CLASSES, `${path}.evidenceClass`, context);
  enumValue(row.arm, ['finding', 'control'], `${path}.arm`, context);
  stringValue(row.unitId, `${path}.unitId`, context);
  stringValue(row.blindedUnitId, `${path}.blindedUnitId`, context);
}

export function validateCAL002Assignment(value: unknown): CAL002ValidationResult {
  const context = new ValidationContext();
  const artifact = objectAt(value, 'artifact', context);
  if (!artifact) return context.finish();
  const keys = ['version', 'protocolVersion', 'catalogSha256', 'assignmentImplementationCommitSha', 'assignmentId', 'round', 'rows', 'admitted'];
  exactKeys(artifact, keys, keys, 'artifact', context);
  validateHeader(artifact, CAL002_ASSIGNMENT_VERSION, context);
  assertSha256Value(artifact.catalogSha256, 'artifact.catalogSha256', context);
  assertCommitShaValue(artifact.assignmentImplementationCommitSha, 'artifact.assignmentImplementationCommitSha', context);
  stringValue(artifact.assignmentId, 'artifact.assignmentId', context);
  integer(artifact.round, 'artifact.round', context, 1);
  const rows = arrayRows(artifact.rows, 'artifact.rows', context);
  rows?.forEach((row, index) => validateAssignmentRow(row, index, context));
  if (rows) {
    uniqueRows(rows, 'assignmentRowId', 'artifact.rows', context);
    uniqueRows(rows, 'blindedUnitId', 'artifact.rows', context);
  }
  literal(artifact.admitted, false, 'artifact.admitted', context);
  return context.finish();
}

function validateReviewRow(value: unknown, index: number, context: ValidationContext): void {
  const path = `artifact.rows[${index}]`;
  const row = objectAt(value, path, context);
  if (!row) return;
  const keys = ['assignmentRowId', 'ruleId', 'label'];
  exactKeys(row, keys, keys, path, context);
  stringValue(row.assignmentRowId, `${path}.assignmentRowId`, context);
  validateRuleId(row.ruleId, `${path}.ruleId`, context);
  enumValue(row.label, REVIEW_LABELS, `${path}.label`, context);
}

export function validateCAL002ReviewReceipt(value: unknown): CAL002ValidationResult {
  const context = new ValidationContext();
  const artifact = objectAt(value, 'artifact', context);
  if (!artifact) return context.finish();
  const keys = ['version', 'protocolVersion', 'catalogSha256', 'assignmentSha256', 'reviewImplementationCommitSha', 'reviewerId', 'rows', 'admitted'];
  exactKeys(artifact, keys, keys, 'artifact', context);
  validateHeader(artifact, CAL002_REVIEW_RECEIPT_VERSION, context);
  assertSha256Value(artifact.catalogSha256, 'artifact.catalogSha256', context);
  assertSha256Value(artifact.assignmentSha256, 'artifact.assignmentSha256', context);
  assertCommitShaValue(artifact.reviewImplementationCommitSha, 'artifact.reviewImplementationCommitSha', context);
  stringValue(artifact.reviewerId, 'artifact.reviewerId', context);
  const rows = arrayRows(artifact.rows, 'artifact.rows', context);
  rows?.forEach((row, index) => validateReviewRow(row, index, context));
  if (rows) uniqueRows(rows, 'assignmentRowId', 'artifact.rows', context);
  literal(artifact.admitted, false, 'artifact.admitted', context);
  return context.finish();
}

function validateLabelCounts(value: unknown, path: string, context: ValidationContext): void {
  const counts = objectAt(value, path, context);
  if (!counts) return;
  const keys = ['actionableDefect', 'usefulNoSafeFix', 'notUseful', 'cannotDetermine'];
  exactKeys(counts, keys, keys, path, context);
  keys.forEach((key) => integer(counts[key], `${path}.${key}`, context));
}

function validateQualityOutcome(row: RecordValue, path: string, context: ValidationContext): void {
  const evidenceClass = row.evidenceClass;
  const outcome = row.outcome;
  const claim = row.claimCeiling;
  if (evidenceClass === 'statistical-review-utility' && outcome === 'default-on') {
    context.add(path, 'statistical evidence cannot produce default-on');
  }
  const validClaim = outcome === 'quality-advisory'
    ? claim === 'review-target-utility'
    : outcome === 'insufficient-evidence'
      ? claim === 'insufficient-evidence'
      : outcome === 'default-on' || outcome === 'default-off'
        ? claim === 'quality-usefulness'
        : false;
  if (!validClaim) context.add(`${path}.claimCeiling`, 'is incompatible with the quality outcome');
}

function validateQualityMetricsRow(value: unknown, index: number, context: ValidationContext): void {
  const path = `artifact.rows[${index}]`;
  const row = objectAt(value, path, context);
  if (!row) return;
  const keys = ['ruleId', 'evidenceClass', 'requestedPerArm', 'finding', 'control', 'outcome', 'claimCeiling'];
  exactKeys(row, keys, keys, path, context);
  validateRuleId(row.ruleId, `${path}.ruleId`, context);
  enumValue(row.evidenceClass, REVIEW_CLASSES, `${path}.evidenceClass`, context);
  integer(row.requestedPerArm, `${path}.requestedPerArm`, context, 1);
  validateLabelCounts(row.finding, `${path}.finding`, context);
  validateLabelCounts(row.control, `${path}.control`, context);
  enumValue(row.outcome, ['default-on', 'default-off', 'quality-advisory', 'insufficient-evidence'], `${path}.outcome`, context);
  enumValue(row.claimCeiling, ['quality-usefulness', 'review-target-utility', 'insufficient-evidence'], `${path}.claimCeiling`, context);
  validateQualityOutcome(row, path, context);
}

export function validateCAL002QualityMetrics(value: unknown): CAL002ValidationResult {
  const context = new ValidationContext();
  const artifact = objectAt(value, 'artifact', context);
  if (!artifact) return context.finish();
  const keys = ['version', 'protocolVersion', 'catalogSha256', 'assignmentSha256', 'reviewReceiptSha256', 'reducerImplementationCommitSha', 'rows', 'admitted'];
  exactKeys(artifact, keys, keys, 'artifact', context);
  validateHeader(artifact, CAL002_QUALITY_METRICS_VERSION, context);
  ['catalogSha256', 'assignmentSha256', 'reviewReceiptSha256'].forEach((key) => assertSha256Value(artifact[key], `artifact.${key}`, context));
  assertCommitShaValue(artifact.reducerImplementationCommitSha, 'artifact.reducerImplementationCommitSha', context);
  const rows = arrayRows(artifact.rows, 'artifact.rows', context);
  rows?.forEach((row, index) => validateQualityMetricsRow(row, index, context));
  if (rows) uniqueRows(rows, 'ruleId', 'artifact.rows', context);
  literal(artifact.admitted, false, 'artifact.admitted', context);
  return context.finish();
}

const TRANSFER_REASONS = ['standards-or-contract-quality-claim', 'contextual-defect-quality-claim', 'statistical-review-utility-claim'] as const;

function validateOriginRow(value: unknown, index: number, context: ValidationContext): void {
  const path = `artifact.rows[${index}]`;
  const row = objectAt(value, path, context);
  if (!row) return;
  const transfer = row.disposition === 'transfer-to-quality';
  const allowed = ['ruleId', 'disposition', ...(transfer ? ['transferReason'] : [])];
  exactKeys(row, allowed, allowed, path, context);
  validateRuleId(row.ruleId, `${path}.ruleId`, context);
  enumValue(row.disposition, ['hold-origin-default-off', 'transfer-to-quality', 'retire'], `${path}.disposition`, context);
  if (transfer) enumValue(row.transferReason, TRANSFER_REASONS, `${path}.transferReason`, context);
  else if (Object.hasOwn(row, 'transferReason')) context.add(`${path}.transferReason`, 'is only valid for transfer-to-quality');
}

export function validateCAL002OriginReceipt(value: unknown): CAL002ValidationResult {
  const context = new ValidationContext();
  const artifact = objectAt(value, 'artifact', context);
  if (!artifact) return context.finish();
  const keys = ['version', 'protocolVersion', 'catalogSha256', 'cal001MatrixSha256', 'originImplementationCommitSha', 'evidence', 'rows', 'admitted'];
  exactKeys(artifact, keys, keys, 'artifact', context);
  validateHeader(artifact, CAL002_ORIGIN_RECEIPT_VERSION, context);
  assertSha256Value(artifact.catalogSha256, 'artifact.catalogSha256', context);
  assertSha256Value(artifact.cal001MatrixSha256, 'artifact.cal001MatrixSha256', context);
  assertCommitShaValue(artifact.originImplementationCommitSha, 'artifact.originImplementationCommitSha', context);
  const evidence = objectAt(artifact.evidence, 'artifact.evidence', context);
  const evidenceKeys = ['mode', 'sourceProtocolVersion', 'sourceSha256', 'splitSha256', 'scannerSha256', 'configSha256', 'sourceCatalogSha256', 'receiptSha256', 'metricsSha256', 'reducerSha256'];
  if (evidence) {
    exactKeys(evidence, evidenceKeys, evidenceKeys, 'artifact.evidence', context);
    literal(evidence.mode, 'reuse', 'artifact.evidence.mode', context);
    literal(evidence.sourceProtocolVersion, 'CAL-001-v1', 'artifact.evidence.sourceProtocolVersion', context);
    evidenceKeys.slice(2).forEach((key) => assertSha256Value(evidence[key], `artifact.evidence.${key}`, context));
  }
  const rows = arrayRows(artifact.rows, 'artifact.rows', context);
  rows?.forEach((row, index) => validateOriginRow(row, index, context));
  if (rows) uniqueRows(rows, 'ruleId', 'artifact.rows', context);
  literal(artifact.admitted, false, 'artifact.admitted', context);
  return context.finish();
}

function validateMatrixRow(value: unknown, index: number, context: ValidationContext): void {
  const path = `artifact.rows[${index}]`;
  const row = objectAt(value, path, context);
  if (!row) return;
  const quality = row.lane === 'quality';
  const allowed = ['ruleId', 'lane', ...(quality ? ['evidenceClass'] : []), 'outcome', 'claimCeiling'];
  exactKeys(row, allowed, allowed, path, context);
  validateRuleId(row.ruleId, `${path}.ruleId`, context);
  if (!enumValue(row.lane, ['quality', 'origin'], `${path}.lane`, context)) return;
  enumValue(row.outcome, POLICY_OUTCOMES, `${path}.outcome`, context);
  enumValue(row.claimCeiling, CLAIM_CEILINGS, `${path}.claimCeiling`, context);
  if (row.lane === 'quality') {
    enumValue(row.evidenceClass, EVIDENCE_CLASSES, `${path}.evidenceClass`, context);
    if (row.evidenceClass === 'deterministic-or-standards') {
      if (!['default-on', 'default-off'].includes(row.outcome as string) || row.claimCeiling !== 'deterministic-defect') context.add(path, 'deterministic evidence requires a deterministic default outcome');
    } else {
      validateQualityOutcome(row, path, context);
    }
  } else {
    const valid = (row.outcome === 'default-off' && row.claimCeiling === 'internal-origin-association')
      || (row.outcome === 'retired' && row.claimCeiling === 'retired');
    if (!valid) context.add(path, 'origin lane outcome and claim ceiling are incompatible');
  }
}

export function validateCAL002FinalMatrix(value: unknown): CAL002ValidationResult {
  const context = new ValidationContext();
  const artifact = objectAt(value, 'artifact', context);
  if (!artifact) return context.finish();
  const keys = ['version', 'protocolVersion', 'catalogSha256', 'oracleReceiptSha256', 'qualityMetricsSha256', 'originReceiptSha256', 'reducerImplementationCommitSha', 'rows', 'counts', 'admitted', 'applied'];
  exactKeys(artifact, keys, keys, 'artifact', context);
  validateHeader(artifact, CAL002_FINAL_MATRIX_VERSION, context);
  ['catalogSha256', 'oracleReceiptSha256', 'qualityMetricsSha256', 'originReceiptSha256'].forEach((key) => assertSha256Value(artifact[key], `artifact.${key}`, context));
  assertCommitShaValue(artifact.reducerImplementationCommitSha, 'artifact.reducerImplementationCommitSha', context);
  const rows = arrayRows(artifact.rows, 'artifact.rows', context);
  rows?.forEach((row, index) => validateMatrixRow(row, index, context));
  if (rows) uniqueRows(rows, 'ruleId', 'artifact.rows', context);
  const counts = objectAt(artifact.counts, 'artifact.counts', context);
  const countKeys = ['total', 'defaultOn', 'defaultOff', 'qualityAdvisory', 'insufficientEvidence', 'retired'];
  if (counts) {
    exactKeys(counts, countKeys, countKeys, 'artifact.counts', context);
    countKeys.forEach((key) => integer(counts[key], `artifact.counts.${key}`, context));
    if (rows) {
      const expected = {
        total: rows.length,
        defaultOn: rows.filter((row) => isRecord(row) && row.outcome === 'default-on').length,
        defaultOff: rows.filter((row) => isRecord(row) && row.outcome === 'default-off').length,
        qualityAdvisory: rows.filter((row) => isRecord(row) && row.outcome === 'quality-advisory').length,
        insufficientEvidence: rows.filter((row) => isRecord(row) && row.outcome === 'insufficient-evidence').length,
        retired: rows.filter((row) => isRecord(row) && row.outcome === 'retired').length,
      };
      for (const key of countKeys) if (counts[key] !== expected[key as keyof typeof expected]) context.add(`artifact.counts.${key}`, 'does not match rows');
    }
  }
  literal(artifact.admitted, false, 'artifact.admitted', context);
  literal(artifact.applied, false, 'artifact.applied', context);
  return context.finish();
}

export function validateCAL002MatrixApproval(value: unknown): CAL002ValidationResult {
  const context = new ValidationContext();
  const artifact = objectAt(value, 'artifact', context);
  if (!artifact) return context.finish();
  const keys = ['version', 'protocolVersion', 'catalogSha256', 'finalMatrixSha256', 'approvalCommitSha', 'reviewerId', 'decision', 'concerns', 'admitted', 'applied'];
  exactKeys(artifact, keys, keys, 'artifact', context);
  validateHeader(artifact, CAL002_MATRIX_APPROVAL_VERSION, context);
  assertSha256Value(artifact.catalogSha256, 'artifact.catalogSha256', context);
  assertSha256Value(artifact.finalMatrixSha256, 'artifact.finalMatrixSha256', context);
  assertCommitShaValue(artifact.approvalCommitSha, 'artifact.approvalCommitSha', context);
  stringValue(artifact.reviewerId, 'artifact.reviewerId', context);
  enumValue(artifact.decision, ['approved', 'rejected'], 'artifact.decision', context);
  const concerns = arrayRows(artifact.concerns, 'artifact.concerns', context);
  concerns?.forEach((concern, index) => stringValue(concern, `artifact.concerns[${index}]`, context));
  if (artifact.decision === 'rejected' && concerns?.length === 0) context.add('artifact.concerns', 'must contain a concern when decision is rejected');
  literal(artifact.admitted, false, 'artifact.admitted', context);
  literal(artifact.applied, false, 'artifact.applied', context);
  return context.finish();
}

const PROVENANCE = ['deterministic-finding-evidence', 'current-quality-calibrated', 'advisory-review-utility', 'internal-origin-calibrated', 'current-quality-failed-claim-bar', 'insufficient-evidence', 'retired-policy'] as const;

function validPolicyCombination(row: RecordValue): boolean {
  switch (row.outcome) {
    case 'default-on':
      return row.enabledByDefault === true && row.scoreEligible === true
        && ((row.claimCeiling === 'deterministic-defect' && row.provenance === 'deterministic-finding-evidence')
          || (row.claimCeiling === 'quality-usefulness' && row.provenance === 'current-quality-calibrated'));
    case 'default-off':
      return row.enabledByDefault === false && row.scoreEligible === false
        && ((row.claimCeiling === 'internal-origin-association' && row.provenance === 'internal-origin-calibrated')
          || (row.claimCeiling === 'quality-usefulness' && row.provenance === 'current-quality-failed-claim-bar'));
    case 'quality-advisory':
      return row.claimCeiling === 'review-target-utility' && row.enabledByDefault === true && row.scoreEligible === false && row.provenance === 'advisory-review-utility';
    case 'insufficient-evidence':
      return row.claimCeiling === 'insufficient-evidence' && row.enabledByDefault === false && row.scoreEligible === false && row.provenance === 'insufficient-evidence';
    case 'retired':
      return row.claimCeiling === 'retired' && row.enabledByDefault === false && row.scoreEligible === false && row.provenance === 'retired-policy';
    default:
      return false;
  }
}

function validatePolicyRow(value: unknown, index: number, context: ValidationContext): void {
  const path = `artifact.rows[${index}]`;
  const row = objectAt(value, path, context);
  if (!row) return;
  const keys = ['ruleId', 'outcome', 'claimCeiling', 'enabledByDefault', 'scoreEligible', 'provenance'];
  exactKeys(row, keys, keys, path, context);
  validateRuleId(row.ruleId, `${path}.ruleId`, context);
  enumValue(row.outcome, POLICY_OUTCOMES, `${path}.outcome`, context);
  enumValue(row.claimCeiling, CLAIM_CEILINGS, `${path}.claimCeiling`, context);
  booleanValue(row.enabledByDefault, `${path}.enabledByDefault`, context);
  booleanValue(row.scoreEligible, `${path}.scoreEligible`, context);
  enumValue(row.provenance, PROVENANCE, `${path}.provenance`, context);
  if (!validPolicyCombination(row)) context.add(path, `${String(row.outcome)} policy flags, claim ceiling, and score eligibility are incompatible`);
}

export function validateSlopbrickRuleEvidencePolicy(value: unknown): CAL002ValidationResult {
  const context = new ValidationContext();
  const artifact = objectAt(value, 'artifact', context);
  if (!artifact) return context.finish();
  const keys = ['version', 'protocolVersion', 'catalogSha256', 'finalMatrixSha256', 'matrixApprovalSha256', 'applicationImplementationCommitSha', 'rows', 'admitted', 'applied'];
  exactKeys(artifact, keys, keys, 'artifact', context);
  validateHeader(artifact, SLOPBRICK_RULE_EVIDENCE_POLICY_VERSION, context);
  ['catalogSha256', 'finalMatrixSha256', 'matrixApprovalSha256'].forEach((key) => assertSha256Value(artifact[key], `artifact.${key}`, context));
  assertCommitShaValue(artifact.applicationImplementationCommitSha, 'artifact.applicationImplementationCommitSha', context);
  const rows = arrayRows(artifact.rows, 'artifact.rows', context);
  rows?.forEach((row, index) => validatePolicyRow(row, index, context));
  if (rows) uniqueRows(rows, 'ruleId', 'artifact.rows', context);
  literal(artifact.admitted, false, 'artifact.admitted', context);
  literal(artifact.applied, false, 'artifact.applied', context);
  return context.finish();
}
