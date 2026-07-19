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

export const CAL002_LOCKED_COUNTS = {
  total: 119,
  startingQuality: 47,
  startingOrigin: 72,
  ownerReviewRequired: 40,
  deterministic: 32,
  contextual: 11,
  statistical: 4,
} as const;

export const CAL002_LOCKED_RULE_CATALOG_SHA256 = 'd6d17e252b71e4918375c526c5c209a7550cb089a12f9d82281bb99883a1f506' as const;

export const CAL002_STATISTICAL_RULE_IDS = [
  'logic/heaps-deviation',
  'logic/math-variable-name-entropy',
  'logic/zipf-slope-anomaly',
  'typo/math-button-label-uniformity',
] as const;

export const CAL002_CONTEXTUAL_RULE_IDS = [
  'component/multiple-components-per-file',
  'java/suspicious-implementation',
  'layout/gap-monopoly',
  'layout/spacing-grid',
  'logic/boundary-violation',
  'perf/css-bloat',
  'product/terminology-drift',
  'rb/n-plus-one-query',
  'visual/inline-style-dominance',
  'visual/radius-scale-violation',
  'visual/spacing-scale-violation',
] as const;

export const CAL002_DETERMINISTIC_RULE_IDS = [
  'context/import-path-mismatch',
  'cs/async-without-await',
  'cs/empty-catch-block',
  'cs/sql-string-interpolation',
  'docs/broken-link',
  'docs/stale-function-reference',
  'docs/stale-package-reference',
  'dup/identical-block',
  'java/lost-stack-trace',
  'java/sql-string-concat',
  'java/thread-sleep-in-loop',
  'kt/coroutine-cancellation-missing',
  'kt/force-unwrap',
  'kt/global-coroutine-scope',
  'kt/string-template-injection',
  'logic/key-prop-missing',
  'perf/cls-image',
  'php/empty-catch',
  'php/sql-injection',
  'rb/exception-swallowing',
  'rb/sql-string-concat',
  'security/eval',
  'security/exposed-env-var',
  'security/localstorage-token',
  'security/missing-auth-check',
  'security/public-admin-route',
  'security/target-blank-no-noopener',
  'security/unsafe-html-render',
  'typo/placeholder-text',
  'wcag/focus-appearance',
  'wcag/focus-obscured',
  'wcag/missing-alt',
] as const;

export const CAL002_LOCKED_RULE_IDS = [
  'ai/any-density', 'ai/comment-ratio', 'ai/compression-profile', 'ai/console-debug-storm',
  'ai/default-react-stack', 'ai/errors-near-eof', 'ai/fetch-default-overuse', 'ai/library-reinvention',
  'ai/markdown-leakage', 'ai/renyi-profile', 'ai/segment-surprisal-cv', 'ai/state-default-overuse',
  'ai/tailwind-color-overuse', 'ai/text-like-ratio', 'ai/whitespace-regularity', 'component/giant-component',
  'component/multiple-components-per-file', 'component/shadcn-prop-mismatch', 'context/import-path-mismatch',
  'cpp/c-style-cast', 'cpp/magic-numbers', 'cpp/printf-debug', 'cpp/raw-new-delete', 'cs/async-without-await',
  'cs/empty-catch-block', 'cs/sql-string-interpolation', 'dart/dynamic-call', 'dart/missing-dispose',
  'dart/print-debug', 'dart/unwrapped-futures', 'db/sql-concat', 'dead/dead-branch', 'dead/unreachable',
  'dead/unused-import', 'dead/unused-local', 'dead/unused-parameter', 'docs/broken-link',
  'docs/stale-function-reference', 'docs/stale-package-reference', 'dup/identical-block', 'dup/near-duplicate',
  'dup/structural-clone', 'go/nil-slice-vs-empty', 'go/struct-tag-inconsistency', 'java/lost-stack-trace',
  'java/sql-string-concat', 'java/suspicious-implementation', 'java/thread-sleep-in-loop',
  'kt/coroutine-cancellation-missing', 'kt/force-unwrap', 'kt/global-coroutine-scope',
  'kt/string-template-injection', 'layout/gap-monopoly', 'layout/math-element-uniformity',
  'layout/math-grid-uniformity', 'layout/spacing-grid', 'logic/boundary-violation', 'logic/ghost-defensive',
  'logic/heaps-deviation', 'logic/key-prop-missing', 'logic/math-any-density', 'logic/math-console-log-storm',
  'logic/math-gini-class-usage', 'logic/math-variable-name-entropy', 'logic/optimistic-no-rollback',
  'logic/reactive-hook-soup', 'logic/zipf-slope-anomaly', 'logic/zombie-state', 'perf/cls-image',
  'perf/css-bloat', 'php/empty-catch', 'php/sql-injection', 'product/terminology-drift',
  'product/ux-pattern-fragmentation', 'rb/exception-swallowing', 'rb/n-plus-one-query', 'rb/sql-string-concat',
  'rust/stringly-typed', 'rust/todo-macro', 'rust/unused-pub-fn', 'rust/unwrap-in-production',
  'security/dangerous-cors', 'security/eval', 'security/exposed-env-var', 'security/fail-open-auth',
  'security/hardcoded-secret', 'security/localstorage-token', 'security/missing-auth-check',
  'security/public-admin-route', 'security/sql-construction', 'security/target-blank-no-noopener',
  'security/unsafe-html-render', 'swift/fatal-error-thrown', 'swift/force-unwrap',
  'swift/implicitly-unwrapped-optional', 'swift/print-debug', 'swift/strong-self-capture',
  'test/duplicate-setup', 'test/fake-placeholder', 'test/weak-assertion', 'ts/enum-vs-as-const',
  'ts/excessive-type-assertion', 'ts/import-type-misuse', 'ts/never-vs-unknown',
  'typo/math-button-label-uniformity', 'typo/placeholder-text', 'visual/arbitrary-escape',
  'visual/inline-style-dominance', 'visual/math-color-cluster', 'visual/math-default-font',
  'visual/math-font-entropy', 'visual/math-rounded-entropy', 'visual/math-spacing-entropy',
  'visual/naturalness-anomaly', 'visual/radius-scale-violation', 'visual/spacing-scale-violation',
  'wcag/focus-appearance', 'wcag/focus-obscured', 'wcag/missing-alt',
] as const;

export const CAL002_OWNER_REVIEW_RULE_IDS = [
  'ai/any-density', 'ai/console-debug-storm', 'ai/fetch-default-overuse', 'ai/renyi-profile',
  'ai/state-default-overuse', 'ai/tailwind-color-overuse', 'component/giant-component',
  'component/shadcn-prop-mismatch', 'cpp/c-style-cast', 'cpp/magic-numbers', 'cpp/printf-debug',
  'cpp/raw-new-delete', 'db/sql-concat', 'dead/dead-branch', 'dead/unreachable', 'dead/unused-import',
  'dead/unused-local', 'dead/unused-parameter', 'layout/math-element-uniformity', 'logic/ghost-defensive',
  'logic/math-any-density', 'logic/math-console-log-storm', 'logic/math-gini-class-usage',
  'logic/optimistic-no-rollback', 'logic/reactive-hook-soup', 'logic/zombie-state',
  'product/ux-pattern-fragmentation', 'rust/stringly-typed', 'rust/todo-macro', 'rust/unused-pub-fn',
  'rust/unwrap-in-production', 'security/dangerous-cors', 'security/fail-open-auth',
  'security/hardcoded-secret', 'security/sql-construction', 'test/duplicate-setup', 'test/fake-placeholder',
  'test/weak-assertion', 'visual/arbitrary-escape', 'visual/naturalness-anomaly',
] as const;

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

export interface CAL002Interval {
  readonly lower: number;
  readonly upper: number;
}

export interface CAL002FinalRow {
  readonly ruleId: string;
  readonly lane: CAL002Lane;
  readonly priorAiSpecific: boolean;
  readonly transferred: boolean;
  readonly evidenceClass?: CAL002EvidenceClass;
  readonly measurementStatus: 'measured' | 'oracle-verified' | 'unavailable';
  readonly claimCeiling: CAL002ClaimCeiling;
  readonly authority: 'standards-contract' | 'repository-owner' | 'publisher-attested-internal';
  readonly sampleCounts: { readonly findings: number; readonly controls: number; readonly cannotDetermine: number };
  readonly uncertainty?: { readonly findingUseful: CAL002Interval; readonly controlUseful: CAL002Interval };
  readonly usefulness: 'passed' | 'failed' | 'advisory' | 'not-applicable' | 'insufficient';
  readonly outcome: CAL002PolicyOutcome;
  readonly enabledByDefault: boolean;
  readonly scoreEligibleByDefault: boolean;
  readonly repairSafety: 'finding-bound-only' | 'no-safe-repair' | 'not-applicable';
  readonly evidenceSha256: string;
  readonly admitted: false;
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
const DETERMINISTIC_IDS = new Set<string>(CAL002_DETERMINISTIC_RULE_IDS);
const CONTEXTUAL_IDS = new Set<string>(CAL002_CONTEXTUAL_RULE_IDS);
const STATISTICAL_IDS = new Set<string>(CAL002_STATISTICAL_RULE_IDS);
const QUALITY_IDS = new Set<string>([
  ...CAL002_DETERMINISTIC_RULE_IDS,
  ...CAL002_CONTEXTUAL_RULE_IDS,
  ...CAL002_STATISTICAL_RULE_IDS,
]);
const OWNER_REVIEW_IDS = new Set<string>(CAL002_OWNER_REVIEW_RULE_IDS);

function duplicateCompositeRows(rows: readonly unknown[], keys: readonly string[], path: string, context: ValidationContext): void {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    if (!isRecord(row) || keys.some((key) => typeof row[key] !== 'string')) return;
    const value = keys.map((key) => row[key]).join('\0');
    if (seen.has(value)) context.add(`${path}[${index}]`, `has a duplicate (${keys.join(', ')}) identity`);
    seen.add(value);
  });
}

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
  if (typeof row.ruleId === 'string') {
    const expectedQuality = QUALITY_IDS.has(row.ruleId);
    if ((row.lane === 'quality') !== expectedQuality) context.add(`${path}.lane`, 'does not match the locked CAL-002 lane');
    if (row.ownerReviewRequired !== OWNER_REVIEW_IDS.has(row.ruleId)) context.add(`${path}.ownerReviewRequired`, 'does not match the locked CAL-001 owner-review set');
    const expectedClass = DETERMINISTIC_IDS.has(row.ruleId)
      ? 'deterministic-or-standards'
      : CONTEXTUAL_IDS.has(row.ruleId)
        ? 'contextual-quality'
        : STATISTICAL_IDS.has(row.ruleId)
          ? 'statistical-review-utility'
          : undefined;
    if (expectedClass !== undefined && row.evidenceClass !== expectedClass) context.add(`${path}.evidenceClass`, 'does not match the locked evidence-class set');
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
  if (rows) {
    uniqueRows(rows, 'ruleId', 'artifact.rows', context);
    if (rows.length !== CAL002_LOCKED_COUNTS.total) context.add('artifact.rows', `must contain exactly ${CAL002_LOCKED_COUNTS.total} locked rows`);
    rows.forEach((row, index) => {
      if (isRecord(row) && row.ruleId !== CAL002_LOCKED_RULE_IDS[index]) context.add(`artifact.rows[${index}].ruleId`, 'does not match the locked code-point order');
    });
    const projection = rows.map((row) => isRecord(row) ? {
      ruleId: row.ruleId,
      category: row.category,
      aiSpecific: row.aiSpecific,
      existingDefaultOff: row.existingDefaultOff,
    } : row);
    if (canonicalArtifact(projection).sha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256) context.add('artifact.rows', 'does not match the canonical rule-catalog identity');
  }
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
      for (const key of countKeys) if (counts[key] !== CAL002_LOCKED_COUNTS[key as keyof typeof CAL002_LOCKED_COUNTS]) context.add(`artifact.counts.${key}`, 'does not match the locked CAL-002 count');
    }
  }
  if (artifact.ruleCatalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256) context.add('artifact.ruleCatalogSha256', 'must equal the canonical locked rule-catalog identity');
  literal(artifact.admitted, false, 'artifact.admitted', context);
  literal(artifact.applied, false, 'artifact.applied', context);
  return context.finish();
}

function validateAssignmentRow(value: unknown, index: number, context: ValidationContext): void {
  const path = `artifact.rows[${index}]`;
  const row = objectAt(value, path, context);
  if (!row) return;
  const keys = ['reviewId', 'ruleId', 'evidenceClass', 'role', 'unitId'];
  exactKeys(row, keys, keys, path, context);
  stringValue(row.reviewId, `${path}.reviewId`, context);
  validateRuleId(row.ruleId, `${path}.ruleId`, context);
  enumValue(row.evidenceClass, REVIEW_CLASSES, `${path}.evidenceClass`, context);
  enumValue(row.role, ['finding', 'control'], `${path}.role`, context);
  stringValue(row.unitId, `${path}.unitId`, context);
}

function validateBlindedRow(value: unknown, index: number, context: ValidationContext): void {
  const path = `artifact.blindedRows[${index}]`;
  const row = objectAt(value, path, context);
  if (!row) return;
  const keys = ['reviewId', 'ruleId', 'evidenceClass', 'sourceIdentitySha256', 'lineWindowLocator'];
  exactKeys(row, keys, keys, path, context);
  stringValue(row.reviewId, `${path}.reviewId`, context);
  validateRuleId(row.ruleId, `${path}.ruleId`, context);
  enumValue(row.evidenceClass, REVIEW_CLASSES, `${path}.evidenceClass`, context);
  assertSha256Value(row.sourceIdentitySha256, `${path}.sourceIdentitySha256`, context);
  stringValue(row.lineWindowLocator, `${path}.lineWindowLocator`, context);
}

export function validateCAL002Assignment(value: unknown): CAL002ValidationResult {
  const context = new ValidationContext();
  const artifact = objectAt(value, 'artifact', context);
  if (!artifact) return context.finish();
  const keys = ['version', 'protocolVersion', 'catalogSha256', 'assignmentImplementationCommitSha', 'assignmentId', 'assignmentSha256', 'selectionManifestSha256', 'blindedBatchSha256', 'round', 'targetPerArm', 'rows', 'blindedRows', 'admitted'];
  exactKeys(artifact, keys, keys, 'artifact', context);
  validateHeader(artifact, CAL002_ASSIGNMENT_VERSION, context);
  assertSha256Value(artifact.catalogSha256, 'artifact.catalogSha256', context);
  assertCommitShaValue(artifact.assignmentImplementationCommitSha, 'artifact.assignmentImplementationCommitSha', context);
  stringValue(artifact.assignmentId, 'artifact.assignmentId', context);
  ['assignmentSha256', 'selectionManifestSha256', 'blindedBatchSha256'].forEach((key) => assertSha256Value(artifact[key], `artifact.${key}`, context));
  const round = enumValue(artifact.round, ['initial', 'final'], 'artifact.round', context);
  integer(artifact.targetPerArm, 'artifact.targetPerArm', context, 1);
  if (round && ((artifact.round === 'initial' && artifact.targetPerArm !== 30) || (artifact.round === 'final' && artifact.targetPerArm !== 100))) {
    context.add('artifact.targetPerArm', 'must be 30 for initial round and 100 for final round');
  }
  const rows = arrayRows(artifact.rows, 'artifact.rows', context);
  rows?.forEach((row, index) => validateAssignmentRow(row, index, context));
  const blindedRows = arrayRows(artifact.blindedRows, 'artifact.blindedRows', context);
  blindedRows?.forEach((row, index) => validateBlindedRow(row, index, context));
  if (rows) {
    uniqueRows(rows, 'reviewId', 'artifact.rows', context);
    duplicateCompositeRows(rows, ['ruleId', 'unitId'], 'artifact.rows', context);
  }
  if (blindedRows) uniqueRows(blindedRows, 'reviewId', 'artifact.blindedRows', context);
  if (rows && blindedRows) {
    const privateByReviewId = new Map(rows.filter(isRecord).map((row) => [row.reviewId, row]));
    const blindedByReviewId = new Map(blindedRows.filter(isRecord).map((row) => [row.reviewId, row]));
    if (privateByReviewId.size !== blindedByReviewId.size || [...privateByReviewId.keys()].some((id) => !blindedByReviewId.has(id))) {
      context.add('artifact.blindedRows', 'must exactly project the private assignment review IDs');
    }
    for (const [id, row] of privateByReviewId) {
      const blinded = blindedByReviewId.get(id);
      if (blinded && (blinded.ruleId !== row.ruleId || blinded.evidenceClass !== row.evidenceClass)) context.add('artifact.blindedRows', `reviewId ${String(id)} does not match its private assignment`);
    }
  }
  literal(artifact.admitted, false, 'artifact.admitted', context);
  return context.finish();
}

function validateReviewRow(value: unknown, index: number, context: ValidationContext): void {
  const path = `artifact.rows[${index}]`;
  const row = objectAt(value, path, context);
  if (!row) return;
  const keys = ['reviewId', 'label'];
  exactKeys(row, keys, keys, path, context);
  stringValue(row.reviewId, `${path}.reviewId`, context);
  enumValue(row.label, REVIEW_LABELS, `${path}.label`, context);
}

export function validateCAL002ReviewReceipt(value: unknown): CAL002ValidationResult {
  const context = new ValidationContext();
  const artifact = objectAt(value, 'artifact', context);
  if (!artifact) return context.finish();
  const keys = ['version', 'protocolVersion', 'catalogSha256', 'assignmentSha256', 'blindedBatchSha256', 'stateSha256', 'reviewImplementationCommitSha', 'reviewerAuthority', 'rows', 'admitted'];
  exactKeys(artifact, keys, keys, 'artifact', context);
  validateHeader(artifact, CAL002_REVIEW_RECEIPT_VERSION, context);
  ['catalogSha256', 'assignmentSha256', 'blindedBatchSha256', 'stateSha256'].forEach((key) => assertSha256Value(artifact[key], `artifact.${key}`, context));
  assertCommitShaValue(artifact.reviewImplementationCommitSha, 'artifact.reviewImplementationCommitSha', context);
  literal(artifact.reviewerAuthority, 'repository-owner', 'artifact.reviewerAuthority', context);
  const rows = arrayRows(artifact.rows, 'artifact.rows', context);
  rows?.forEach((row, index) => validateReviewRow(row, index, context));
  if (rows) uniqueRows(rows, 'reviewId', 'artifact.rows', context);
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
      : outcome === 'default-on'
        ? evidenceClass === 'contextual-quality' && claim === 'quality-usefulness'
        : outcome === 'default-off'
          ? (evidenceClass === 'contextual-quality' && claim === 'quality-usefulness')
            || (evidenceClass === 'statistical-review-utility' && claim === 'review-target-utility')
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
  const reasonRequired = row.disposition === 'transfer-to-quality' || row.disposition === 'retire';
  const allowed = ['ruleId', 'disposition', ...(reasonRequired ? ['reason'] : [])];
  exactKeys(row, allowed, allowed, path, context);
  validateRuleId(row.ruleId, `${path}.ruleId`, context);
  enumValue(row.disposition, ['hold-origin-default-off', 'transfer-to-quality', 'retire'], `${path}.disposition`, context);
  if (row.disposition === 'transfer-to-quality') enumValue(row.reason, TRANSFER_REASONS, `${path}.reason`, context);
  else if (row.disposition === 'retire') literal(row.reason, 'duplicate-or-obsolete', `${path}.reason`, context);
  else if (Object.hasOwn(row, 'reason')) context.add(`${path}.reason`, 'is only valid for transfer or retirement');
}

export function validateCAL002OriginReceipt(value: unknown): CAL002ValidationResult {
  const context = new ValidationContext();
  const artifact = objectAt(value, 'artifact', context);
  if (!artifact) return context.finish();
  const keys = ['version', 'protocolVersion', 'catalogSha256', 'originImplementationCommitSha', 'status', 'governingHashes', 'rows', 'admitted'];
  exactKeys(artifact, keys, keys, 'artifact', context);
  validateHeader(artifact, CAL002_ORIGIN_RECEIPT_VERSION, context);
  assertSha256Value(artifact.catalogSha256, 'artifact.catalogSha256', context);
  assertCommitShaValue(artifact.originImplementationCommitSha, 'artifact.originImplementationCommitSha', context);
  enumValue(artifact.status, ['reused', 'rerun-required', 'rerun-completed'], 'artifact.status', context);
  const governingHashes = objectAt(artifact.governingHashes, 'artifact.governingHashes', context);
  const hashKeys = ['protocolSha256', 'sourceBindingReceiptSha256', 'splitPlanSha256', 'scannerCommitSha', 'configSha256', 'catalogSha256', 'holdoutReceiptSha256', 'metricsSha256', 'cal001MatrixSha256', 'reducerSha256'];
  if (governingHashes) {
    exactKeys(governingHashes, hashKeys, hashKeys, 'artifact.governingHashes', context);
    hashKeys.filter((key) => key !== 'scannerCommitSha').forEach((key) => assertSha256Value(governingHashes[key], `artifact.governingHashes.${key}`, context));
    assertCommitShaValue(governingHashes.scannerCommitSha, 'artifact.governingHashes.scannerCommitSha', context);
    if (governingHashes.catalogSha256 !== artifact.catalogSha256) context.add('artifact.governingHashes.catalogSha256', 'must match artifact.catalogSha256');
  }
  const rows = arrayRows(artifact.rows, 'artifact.rows', context);
  rows?.forEach((row, index) => validateOriginRow(row, index, context));
  if (rows) uniqueRows(rows, 'ruleId', 'artifact.rows', context);
  literal(artifact.admitted, false, 'artifact.admitted', context);
  return context.finish();
}

function finiteNumber(value: unknown, path: string, context: ValidationContext): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    context.add(path, 'must be a finite number');
    return false;
  }
  return true;
}

function validateInterval(value: unknown, path: string, context: ValidationContext): void {
  const interval = objectAt(value, path, context);
  if (!interval) return;
  const keys = ['lower', 'upper'];
  exactKeys(interval, keys, keys, path, context);
  const lower = finiteNumber(interval.lower, `${path}.lower`, context);
  const upper = finiteNumber(interval.upper, `${path}.upper`, context);
  if (lower && ((interval.lower as number) < 0 || (interval.lower as number) > 1)) context.add(`${path}.lower`, 'must be between 0 and 1');
  if (upper && ((interval.upper as number) < 0 || (interval.upper as number) > 1)) context.add(`${path}.upper`, 'must be between 0 and 1');
  if (lower && upper && (interval.lower as number) > (interval.upper as number)) context.add(path, 'lower must not exceed upper');
}

function validateSampleCounts(value: unknown, path: string, context: ValidationContext): void {
  const counts = objectAt(value, path, context);
  if (!counts) return;
  const keys = ['findings', 'controls', 'cannotDetermine'];
  exactKeys(counts, keys, keys, path, context);
  keys.forEach((key) => integer(counts[key], `${path}.${key}`, context));
}

function validateMatrixCombination(row: RecordValue, path: string, context: ValidationContext): void {
  const quality = row.lane === 'quality';
  if (quality && !EVIDENCE_CLASSES.includes(row.evidenceClass as CAL002EvidenceClass)) return;
  if (!quality && Object.hasOwn(row, 'evidenceClass')) context.add(`${path}.evidenceClass`, 'is only valid for the quality lane');
  if (row.transferred === true && (row.priorAiSpecific !== true || !quality)) context.add(path, 'transferred rows must be prior AI-specific quality rows');
  if (row.priorAiSpecific === true && quality && row.transferred !== true) context.add(path, 'prior AI-specific quality rows must be marked transferred');
  if (row.lane === 'origin' && (row.priorAiSpecific !== true || row.transferred !== false)) context.add(path, 'origin rows must retain prior AI-specific ownership without transfer');
  if (row.priorAiSpecific === false && row.transferred !== false) context.add(path, 'starting quality rows cannot be transferred');

  const expectedFlags = row.outcome === 'default-on'
    ? [true, true]
    : row.outcome === 'quality-advisory'
      ? [true, false]
      : [false, false];
  if (row.enabledByDefault !== expectedFlags[0] || row.scoreEligibleByDefault !== expectedFlags[1]) context.add(path, `${String(row.outcome)} default and score flags are incompatible`);

  let valid = false;
  if (row.outcome === 'default-on') {
    valid = quality && row.usefulness === 'passed'
      && ((row.evidenceClass === 'deterministic-or-standards' && row.claimCeiling === 'deterministic-defect')
        || (row.evidenceClass === 'contextual-quality' && row.claimCeiling === 'quality-usefulness'));
  } else if (row.outcome === 'default-off') {
    valid = row.lane === 'origin'
      ? row.claimCeiling === 'internal-origin-association' && row.usefulness === 'not-applicable'
      : row.usefulness === 'failed' && ((row.evidenceClass === 'deterministic-or-standards' && row.claimCeiling === 'deterministic-defect')
        || (row.evidenceClass === 'contextual-quality' && row.claimCeiling === 'quality-usefulness')
        || (row.evidenceClass === 'statistical-review-utility' && row.claimCeiling === 'review-target-utility'));
  } else if (row.outcome === 'quality-advisory') {
    valid = quality && row.evidenceClass !== 'deterministic-or-standards' && row.claimCeiling === 'review-target-utility' && row.usefulness === 'advisory';
  } else if (row.outcome === 'insufficient-evidence') {
    valid = quality && row.claimCeiling === 'insufficient-evidence' && row.usefulness === 'insufficient' && row.measurementStatus === 'unavailable';
  } else if (row.outcome === 'retired') {
    valid = row.lane === 'origin' && row.claimCeiling === 'retired' && row.usefulness === 'not-applicable' && row.measurementStatus === 'unavailable';
  }
  if (!valid) context.add(path, 'lane, evidence class, outcome, claim ceiling, measurement, and usefulness are incompatible');

  if (row.evidenceClass === 'deterministic-or-standards' && (row.measurementStatus !== 'oracle-verified' || row.authority !== 'standards-contract')) context.add(path, 'deterministic evidence requires oracle verification and standards authority');
  if (row.evidenceClass === 'contextual-quality' || row.evidenceClass === 'statistical-review-utility') {
    if (row.authority !== 'repository-owner' || (row.outcome !== 'insufficient-evidence' && row.measurementStatus !== 'measured')) context.add(path, 'review evidence requires repository-owner authority and a measured result when available');
  }
  if (row.lane === 'origin' && row.authority !== 'publisher-attested-internal') context.add(path, 'origin evidence requires publisher-attested internal authority');
  if (row.lane === 'origin' && row.outcome === 'default-off' && row.measurementStatus !== 'measured') context.add(path, 'held origin evidence must be measured');
  if (row.evidenceClass === 'statistical-review-utility' && row.outcome === 'default-on') context.add(path, 'statistical evidence cannot produce default-on');
  if (row.evidenceClass === 'statistical-review-utility' && row.repairSafety !== 'no-safe-repair') context.add(`${path}.repairSafety`, 'statistical evidence has no safe bounded repair');
  if (row.lane === 'origin' && row.repairSafety !== 'not-applicable') context.add(`${path}.repairSafety`, 'origin rows have no quality repair contract');
}

function validateMatrixRow(value: unknown, index: number, context: ValidationContext): void {
  const path = `artifact.rows[${index}]`;
  const row = objectAt(value, path, context);
  if (!row) return;
  const quality = row.lane === 'quality';
  const required = ['ruleId', 'lane', 'priorAiSpecific', 'transferred', ...(quality ? ['evidenceClass'] : []), 'measurementStatus', 'claimCeiling', 'authority', 'sampleCounts', 'usefulness', 'outcome', 'enabledByDefault', 'scoreEligibleByDefault', 'repairSafety', 'evidenceSha256', 'admitted'];
  const allowed = [...required, 'uncertainty'];
  exactKeys(row, allowed, required, path, context);
  validateRuleId(row.ruleId, `${path}.ruleId`, context);
  enumValue(row.lane, ['quality', 'origin'], `${path}.lane`, context);
  booleanValue(row.priorAiSpecific, `${path}.priorAiSpecific`, context);
  booleanValue(row.transferred, `${path}.transferred`, context);
  if (quality) enumValue(row.evidenceClass, EVIDENCE_CLASSES, `${path}.evidenceClass`, context);
  enumValue(row.measurementStatus, ['measured', 'oracle-verified', 'unavailable'], `${path}.measurementStatus`, context);
  enumValue(row.claimCeiling, CLAIM_CEILINGS, `${path}.claimCeiling`, context);
  enumValue(row.authority, ['standards-contract', 'repository-owner', 'publisher-attested-internal'], `${path}.authority`, context);
  validateSampleCounts(row.sampleCounts, `${path}.sampleCounts`, context);
  if (Object.hasOwn(row, 'uncertainty')) {
    const uncertainty = objectAt(row.uncertainty, `${path}.uncertainty`, context);
    if (uncertainty) {
      const keys = ['findingUseful', 'controlUseful'];
      exactKeys(uncertainty, keys, keys, `${path}.uncertainty`, context);
      validateInterval(uncertainty.findingUseful, `${path}.uncertainty.findingUseful`, context);
      validateInterval(uncertainty.controlUseful, `${path}.uncertainty.controlUseful`, context);
    }
  }
  enumValue(row.usefulness, ['passed', 'failed', 'advisory', 'not-applicable', 'insufficient'], `${path}.usefulness`, context);
  enumValue(row.outcome, POLICY_OUTCOMES, `${path}.outcome`, context);
  booleanValue(row.enabledByDefault, `${path}.enabledByDefault`, context);
  booleanValue(row.scoreEligibleByDefault, `${path}.scoreEligibleByDefault`, context);
  enumValue(row.repairSafety, ['finding-bound-only', 'no-safe-repair', 'not-applicable'], `${path}.repairSafety`, context);
  assertSha256Value(row.evidenceSha256, `${path}.evidenceSha256`, context);
  literal(row.admitted, false, `${path}.admitted`, context);
  validateMatrixCombination(row, path, context);
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
  const keys = ['version', 'protocolVersion', 'catalogSha256', 'finalMatrixSha256', 'approvalCommitSha', 'reviewerAuthority', 'decision', 'admitted', 'applied'];
  exactKeys(artifact, keys, keys, 'artifact', context);
  validateHeader(artifact, CAL002_MATRIX_APPROVAL_VERSION, context);
  assertSha256Value(artifact.catalogSha256, 'artifact.catalogSha256', context);
  assertSha256Value(artifact.finalMatrixSha256, 'artifact.finalMatrixSha256', context);
  assertCommitShaValue(artifact.approvalCommitSha, 'artifact.approvalCommitSha', context);
  literal(artifact.reviewerAuthority, 'repository-owner', 'artifact.reviewerAuthority', context);
  literal(artifact.decision, 'approved', 'artifact.decision', context);
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
          || ((row.claimCeiling === 'deterministic-defect' || row.claimCeiling === 'quality-usefulness' || row.claimCeiling === 'review-target-utility') && row.provenance === 'current-quality-failed-claim-bar'));
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
  booleanValue(artifact.applied, 'artifact.applied', context);
  return context.finish();
}
