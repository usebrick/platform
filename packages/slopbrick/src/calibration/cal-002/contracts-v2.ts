import {
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  CAL002_LOCKED_RULE_IDS,
  canonicalArtifact,
  type CAL002ValidationResult,
} from './contracts';
import { canonicalAuthorityRowsV2 } from './authority';

export const CAL002_PROTOCOL_VERSION_V2 = 'CAL-002-v2' as const;
export const CAL002_AUTHORITY_PROPOSAL_VERSION = 'cal-002-authority-proposal-v2' as const;
export const CAL002_AUTHORITY_STATE_VERSION = 'cal-002-authority-state-v2' as const;
export const CAL002_AUTHORITY_RECEIPT_VERSION = 'cal-002-authority-receipt-v2' as const;

export type CAL002QualityDomain =
  | 'security'
  | 'accessibility'
  | 'correctness'
  | 'reliability'
  | 'performance'
  | 'maintainability'
  | 'documentation-quality'
  | 'type-safety'
  | 'resource-safety'
  | 'test-confidence'
  | 'architecture-consistency'
  | 'observability'
  | 'design-system-coherence'
  | 'completeness'
  | 'none';

export type CAL002ClaimClass =
  | 'language-or-security-contract'
  | 'accessibility-standard'
  | 'repository-contract'
  | 'deterministic-syntax-or-dataflow'
  | 'contextual-heuristic'
  | 'statistical-review-signal'
  | 'no-valid-quality-claim';

export type CAL002Readiness =
  | 'evidence-ready'
  | 'repair-required'
  | 'project-contract-required'
  | 'parity-required'
  | 'research-only'
  | 'obsolete';

export type CAL002RuntimeOutcomeV2 =
  | 'default-on'
  | 'quality-advisory'
  | 'quality-candidate-default-off'
  | 'default-off'
  | 'insufficient-evidence'
  | 'superseded'
  | 'retired';

export interface CAL002AIAssociationV2 {
  readonly source: 'cal-001-internal-origin' | 'legacy-signal-strength' | 'none-recorded';
  readonly claimCeiling: 'association-only' | 'none';
  readonly evidenceSha256?: string;
  readonly lift?: number;
  readonly measuredAt?: string;
  readonly protocol?: string;
}

export interface CAL002AuthorityRowV2 {
  readonly ruleId: string;
  readonly sourceClass: 'starting-quality' | 'owner-batch' | 'research-origin';
  readonly destination: 'quality' | 'research-origin' | 'superseded' | 'retired';
  readonly action: 'preserve' | 'transfer' | 'block' | 'supersede' | 'retire' | 'hold';
  readonly qualityDomain: CAL002QualityDomain;
  readonly claimClass: CAL002ClaimClass;
  readonly readiness: CAL002Readiness;
  readonly evidenceClass?: 'deterministic-or-standards' | 'contextual-quality' | 'statistical-review-utility';
  readonly assignmentEligible: boolean;
  readonly replacementRuleId?: string;
  readonly reasonCode: string;
  readonly aiAssociation: CAL002AIAssociationV2;
}

export interface CAL002AuthorityProposalV2 {
  readonly version: typeof CAL002_AUTHORITY_PROPOSAL_VERSION;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION_V2;
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly priorStateSha256: string;
  readonly rows: readonly CAL002AuthorityRowV2[];
  readonly counts: {
    readonly total: 119;
    readonly startingQuality: 47;
    readonly transferred: 26;
    readonly blocked: 4;
    readonly superseded: 3;
    readonly retired: 7;
    readonly researchOrigin: 32;
  };
  readonly admitted: false;
  readonly applied: false;
}

export interface CAL002AuthorityProposalResultV2 {
  readonly proposal: CAL002AuthorityProposalV2;
  readonly proposalJson: string;
  readonly proposalSha256: string;
}

export interface CAL002AuthorityStateV2 {
  readonly version: typeof CAL002_AUTHORITY_STATE_VERSION;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION_V2;
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly proposalSha256: string;
  readonly priorStateSha256: string;
  readonly revision: 2;
  readonly reviewerAuthority: 'repository-owner';
  readonly decision: 'pending' | 'approved' | 'rejected';
  readonly admitted: false;
  readonly applied: false;
}

export interface CAL002AuthorityReceiptV2 {
  readonly version: typeof CAL002_AUTHORITY_RECEIPT_VERSION;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION_V2;
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly proposalSha256: string;
  readonly priorStateSha256: string;
  readonly revision: 2;
  readonly reviewerAuthority: 'repository-owner';
  readonly decision: 'approved';
  readonly rows: readonly CAL002AuthorityRowV2[];
  readonly authorityRowsSha256: string;
  readonly admitted: false;
  readonly applied: false;
}

const SHA256 = /^[a-f0-9]{64}$/u;
const RULE_ID = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/u;
const ASSOCIATION_SOURCES = ['cal-001-internal-origin', 'legacy-signal-strength', 'none-recorded'] as const;
const ASSOCIATION_CEILINGS = ['association-only', 'none'] as const;
const SOURCE_CLASSES = ['starting-quality', 'owner-batch', 'research-origin'] as const;
const DESTINATIONS = ['quality', 'research-origin', 'superseded', 'retired'] as const;
const ACTIONS = ['preserve', 'transfer', 'block', 'supersede', 'retire', 'hold'] as const;
const QUALITY_DOMAINS = [
  'security', 'accessibility', 'correctness', 'reliability', 'performance', 'maintainability',
  'documentation-quality', 'type-safety', 'resource-safety', 'test-confidence',
  'architecture-consistency', 'observability', 'design-system-coherence', 'completeness', 'none',
] as const;
const CLAIM_CLASSES = [
  'language-or-security-contract', 'accessibility-standard', 'repository-contract',
  'deterministic-syntax-or-dataflow', 'contextual-heuristic', 'statistical-review-signal',
  'no-valid-quality-claim',
] as const;
const READINESS = [
  'evidence-ready', 'repair-required', 'project-contract-required', 'parity-required',
  'research-only', 'obsolete',
] as const;
const EVIDENCE_CLASSES = [
  'deterministic-or-standards', 'contextual-quality', 'statistical-review-utility',
] as const;

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

function exactKeys(
  record: RecordValue,
  allowed: readonly string[],
  required: readonly string[],
  path: string,
  context: ValidationContext,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) context.add(`${path}.${key}`, 'is an unknown key');
  }
  for (const key of required) {
    if (!Object.hasOwn(record, key)) context.add(`${path}.${key}`, 'is required');
  }
}

function literal(value: unknown, expected: string | number | boolean, path: string, context: ValidationContext): void {
  if (value !== expected) context.add(path, `must equal ${JSON.stringify(expected)}`);
}

function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
  path: string,
  context: ValidationContext,
): value is T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    context.add(path, `must be one of ${values.join(', ')}`);
    return false;
  }
  return true;
}

function nonEmptyString(value: unknown, path: string, context: ValidationContext): value is string {
  if (typeof value !== 'string' || value.length === 0) {
    context.add(path, 'must be a non-empty string');
    return false;
  }
  return true;
}

function sha256(value: unknown, path: string, context: ValidationContext): value is string {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    context.add(path, 'must be a lowercase SHA-256');
    return false;
  }
  return true;
}

function validateHeaderV2(
  record: RecordValue,
  version: string,
  context: ValidationContext,
): void {
  literal(record.version, version, 'artifact.version', context);
  literal(record.protocolVersion, CAL002_PROTOCOL_VERSION_V2, 'artifact.protocolVersion', context);
}

function validateAssociation(value: unknown, path: string, context: ValidationContext): void {
  const association = objectAt(value, path, context);
  if (!association) return;
  const allowed = ['source', 'claimCeiling', 'evidenceSha256', 'lift', 'measuredAt', 'protocol'];
  exactKeys(association, allowed, ['source', 'claimCeiling'], path, context);
  const validSource = enumValue(association.source, ASSOCIATION_SOURCES, `${path}.source`, context);
  const validCeiling = enumValue(association.claimCeiling, ASSOCIATION_CEILINGS, `${path}.claimCeiling`, context);
  if (Object.hasOwn(association, 'evidenceSha256')) sha256(association.evidenceSha256, `${path}.evidenceSha256`, context);
  if (Object.hasOwn(association, 'lift')
    && (typeof association.lift !== 'number' || !Number.isFinite(association.lift) || association.lift < 0)) {
    context.add(`${path}.lift`, 'must be a finite non-negative number');
  }
  if (Object.hasOwn(association, 'measuredAt')) nonEmptyString(association.measuredAt, `${path}.measuredAt`, context);
  if (Object.hasOwn(association, 'protocol')) nonEmptyString(association.protocol, `${path}.protocol`, context);
  if (validSource && validCeiling) {
    if (association.source === 'none-recorded' && association.claimCeiling !== 'none') {
      context.add(`${path}.claimCeiling`, 'must be none when source is none-recorded');
    }
    if (association.source === 'none-recorded'
      && ['evidenceSha256', 'lift', 'measuredAt', 'protocol'].some((key) => Object.hasOwn(association, key))) {
      context.add(path, 'must not include evidence metadata when source is none-recorded');
    }
    if (association.source !== 'none-recorded' && association.claimCeiling !== 'association-only') {
      context.add(`${path}.claimCeiling`, 'must be association-only for a named evidence source');
    }
  }
}

function validateAuthorityRow(value: unknown, index: number, context: ValidationContext): void {
  const path = `artifact.rows[${index}]`;
  const row = objectAt(value, path, context);
  if (!row) return;
  const allowed = [
    'ruleId', 'sourceClass', 'destination', 'action', 'qualityDomain', 'claimClass', 'readiness',
    'evidenceClass', 'assignmentEligible', 'replacementRuleId', 'reasonCode', 'aiAssociation',
  ];
  const required = allowed.filter((key) => key !== 'evidenceClass' && key !== 'replacementRuleId');
  exactKeys(row, allowed, required, path, context);
  if (typeof row.ruleId !== 'string' || !RULE_ID.test(row.ruleId)) context.add(`${path}.ruleId`, 'must be a canonical rule ID');
  enumValue(row.sourceClass, SOURCE_CLASSES, `${path}.sourceClass`, context);
  enumValue(row.destination, DESTINATIONS, `${path}.destination`, context);
  enumValue(row.action, ACTIONS, `${path}.action`, context);
  enumValue(row.qualityDomain, QUALITY_DOMAINS, `${path}.qualityDomain`, context);
  enumValue(row.claimClass, CLAIM_CLASSES, `${path}.claimClass`, context);
  enumValue(row.readiness, READINESS, `${path}.readiness`, context);
  if (Object.hasOwn(row, 'evidenceClass')) enumValue(row.evidenceClass, EVIDENCE_CLASSES, `${path}.evidenceClass`, context);
  if (typeof row.assignmentEligible !== 'boolean') context.add(`${path}.assignmentEligible`, 'must be a boolean');
  if (Object.hasOwn(row, 'replacementRuleId')
    && (typeof row.replacementRuleId !== 'string' || !RULE_ID.test(row.replacementRuleId))) {
    context.add(`${path}.replacementRuleId`, 'must be a canonical rule ID');
  }
  nonEmptyString(row.reasonCode, `${path}.reasonCode`, context);
  validateAssociation(row.aiAssociation, `${path}.aiAssociation`, context);
}

function validateCanonicalRows(value: unknown, context: ValidationContext): readonly unknown[] | undefined {
  if (!Array.isArray(value)) {
    context.add('artifact.rows', 'must be an array');
    return undefined;
  }
  const expected = canonicalAuthorityRowsV2();
  if (value.length !== CAL002_LOCKED_RULE_IDS.length) {
    context.add('artifact.rows', `must contain exactly ${CAL002_LOCKED_RULE_IDS.length} rows`);
  }
  const seen = new Set<string>();
  value.forEach((row, index) => {
    const errorCountBeforeRow = context.errors.length;
    validateAuthorityRow(row, index, context);
    if (!isRecord(row) || typeof row.ruleId !== 'string') return;
    if (seen.has(row.ruleId)) context.add(`artifact.rows[${index}].ruleId`, 'is a duplicate rule ID');
    seen.add(row.ruleId);
    const expectedRow = expected[index];
    if (!expectedRow || row.ruleId !== expectedRow.ruleId) {
      context.add(`artifact.rows[${index}].ruleId`, 'must follow canonical locked rule-ID order');
      return;
    }
    if (context.errors.length === errorCountBeforeRow
      && canonicalArtifact(row).json !== canonicalArtifact(expectedRow).json) {
      context.add(`artifact.rows[${index}]`, 'authority metadata must match the canonical rule-ID projection');
    }
  });
  return value;
}

function validateCounts(value: unknown, context: ValidationContext): void {
  const counts = objectAt(value, 'artifact.counts', context);
  if (!counts) return;
  const keys = ['total', 'startingQuality', 'transferred', 'blocked', 'superseded', 'retired', 'researchOrigin'];
  exactKeys(counts, keys, keys, 'artifact.counts', context);
  const expected = {
    total: 119,
    startingQuality: 47,
    transferred: 26,
    blocked: 4,
    superseded: 3,
    retired: 7,
    researchOrigin: 32,
  } as const;
  for (const [key, count] of Object.entries(expected)) {
    literal(counts[key], count, `artifact.counts.${key}`, context);
  }
}

export function validateCAL002AIAssociationV2(value: unknown): CAL002ValidationResult {
  const context = new ValidationContext();
  validateAssociation(value, 'artifact', context);
  return context.finish();
}

export function validateCAL002AuthorityProposalV2(value: unknown): CAL002ValidationResult {
  const context = new ValidationContext();
  const artifact = objectAt(value, 'artifact', context);
  if (!artifact) return context.finish();
  const keys = ['version', 'protocolVersion', 'catalogSha256', 'priorStateSha256', 'rows', 'counts', 'admitted', 'applied'];
  exactKeys(artifact, keys, keys, 'artifact', context);
  validateHeaderV2(artifact, CAL002_AUTHORITY_PROPOSAL_VERSION, context);
  literal(artifact.catalogSha256, CAL002_LOCKED_RULE_CATALOG_SHA256, 'artifact.catalogSha256', context);
  sha256(artifact.priorStateSha256, 'artifact.priorStateSha256', context);
  validateCanonicalRows(artifact.rows, context);
  validateCounts(artifact.counts, context);
  literal(artifact.admitted, false, 'artifact.admitted', context);
  literal(artifact.applied, false, 'artifact.applied', context);
  return context.finish();
}

export function validateCAL002AuthorityStateV2(value: unknown): CAL002ValidationResult {
  const context = new ValidationContext();
  const artifact = objectAt(value, 'artifact', context);
  if (!artifact) return context.finish();
  const keys = [
    'version', 'protocolVersion', 'catalogSha256', 'proposalSha256', 'priorStateSha256',
    'revision', 'reviewerAuthority', 'decision', 'admitted', 'applied',
  ];
  exactKeys(artifact, keys, keys, 'artifact', context);
  validateHeaderV2(artifact, CAL002_AUTHORITY_STATE_VERSION, context);
  literal(artifact.catalogSha256, CAL002_LOCKED_RULE_CATALOG_SHA256, 'artifact.catalogSha256', context);
  sha256(artifact.proposalSha256, 'artifact.proposalSha256', context);
  sha256(artifact.priorStateSha256, 'artifact.priorStateSha256', context);
  literal(artifact.revision, 2, 'artifact.revision', context);
  literal(artifact.reviewerAuthority, 'repository-owner', 'artifact.reviewerAuthority', context);
  enumValue(artifact.decision, ['pending', 'approved', 'rejected'] as const, 'artifact.decision', context);
  literal(artifact.admitted, false, 'artifact.admitted', context);
  literal(artifact.applied, false, 'artifact.applied', context);
  return context.finish();
}

export function validateCAL002AuthorityReceiptV2(value: unknown): CAL002ValidationResult {
  const context = new ValidationContext();
  const artifact = objectAt(value, 'artifact', context);
  if (!artifact) return context.finish();
  const keys = [
    'version', 'protocolVersion', 'catalogSha256', 'proposalSha256', 'priorStateSha256',
    'revision', 'reviewerAuthority', 'decision', 'rows', 'authorityRowsSha256', 'admitted', 'applied',
  ];
  exactKeys(artifact, keys, keys, 'artifact', context);
  validateHeaderV2(artifact, CAL002_AUTHORITY_RECEIPT_VERSION, context);
  literal(artifact.catalogSha256, CAL002_LOCKED_RULE_CATALOG_SHA256, 'artifact.catalogSha256', context);
  sha256(artifact.proposalSha256, 'artifact.proposalSha256', context);
  sha256(artifact.priorStateSha256, 'artifact.priorStateSha256', context);
  literal(artifact.revision, 2, 'artifact.revision', context);
  literal(artifact.reviewerAuthority, 'repository-owner', 'artifact.reviewerAuthority', context);
  literal(artifact.decision, 'approved', 'artifact.decision', context);
  const rows = validateCanonicalRows(artifact.rows, context);
  if (sha256(artifact.authorityRowsSha256, 'artifact.authorityRowsSha256', context) && rows
    && artifact.authorityRowsSha256 !== canonicalArtifact(rows).sha256) {
    context.add('artifact.authorityRowsSha256', 'must bind the canonical rows hash');
  }
  literal(artifact.admitted, false, 'artifact.admitted', context);
  literal(artifact.applied, false, 'artifact.applied', context);
  return context.finish();
}

function assertValid<T>(value: unknown, result: CAL002ValidationResult, label: string): asserts value is T {
  if (!result.ok) throw new TypeError(`${label} validation failed: ${result.errors.join('; ')}`);
}

export function assertCAL002AIAssociationV2(value: unknown): asserts value is CAL002AIAssociationV2 {
  assertValid<CAL002AIAssociationV2>(value, validateCAL002AIAssociationV2(value), 'CAL-002 v2 AI association');
}

export function assertCAL002AuthorityProposalV2(value: unknown): asserts value is CAL002AuthorityProposalV2 {
  assertValid<CAL002AuthorityProposalV2>(value, validateCAL002AuthorityProposalV2(value), 'CAL-002 v2 authority proposal');
}

export function assertCAL002AuthorityStateV2(value: unknown): asserts value is CAL002AuthorityStateV2 {
  assertValid<CAL002AuthorityStateV2>(value, validateCAL002AuthorityStateV2(value), 'CAL-002 v2 authority state');
}

export function assertCAL002AuthorityReceiptV2(value: unknown): asserts value is CAL002AuthorityReceiptV2 {
  assertValid<CAL002AuthorityReceiptV2>(value, validateCAL002AuthorityReceiptV2(value), 'CAL-002 v2 authority receipt');
}
