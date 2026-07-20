import { createHash } from 'node:crypto';

import { CAL001_FROZEN_INPUT_HASHES } from '../corpus-v1/calibration-inputs';
import {
  canonicalAuthorityRowsV2,
} from './authority';
import {
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  CAL002_LOCKED_RULE_IDS,
  assertCommitSha,
  assertSha256,
  canonicalArtifact,
  type CAL002EvidenceClass,
  type CAL002ValidationResult,
} from './contracts';
import {
  CAL002_PROTOCOL_VERSION_V2,
  assertCAL002AuthorityReceiptV2,
  type CAL002AIAssociationV2,
  type CAL002AuthorityReceiptV2,
  type CAL002AuthorityRowV2,
  type CAL002ClaimClass,
  type CAL002QualityDomain,
  type CAL002Readiness,
  type CAL002RuntimeOutcomeV2,
} from './contracts-v2';
import {
  CAL002_ORACLE_RECEIPT_VERSION_V2,
  CAL002_REAL_SOURCE_CONTROL_FAMILIES,
  type CAL002OracleReceiptRowV2,
  type CAL002OracleReceiptV2,
} from './oracles-v2';
import {
  assertCAL002OriginReceiptV2,
  type CAL002OriginReceiptV2,
  type CAL002OriginRowV2,
} from './origin-v2';
import {
  assertCAL002QualityDispositionV2,
  type CAL002QualityDispositionRowV2,
  type CAL002QualityDispositionV2,
} from './quality-disposition';
import {
  assertCAL002SupersessionReceiptV2,
  type CAL002SupersessionReceiptV2,
  type CAL002SupersessionRowV2,
} from './supersession';

export const CAL002_FINAL_MATRIX_VERSION_V2 = 'cal-002-final-matrix-v2' as const;
const REAL_SOURCE_CONTROL_FAMILY_SET = new Set<string>(CAL002_REAL_SOURCE_CONTROL_FAMILIES);

export type CAL002PolicyProvenanceV2 =
  | 'deterministic-finding-evidence'
  | 'current-quality-calibrated'
  | 'current-quality-advisory'
  | 'quality-candidate-unmeasured'
  | 'blocked-quality-candidate'
  | 'internal-origin-association'
  | 'current-quality-failed-claim-bar'
  | 'insufficient-evidence'
  | 'superseded-policy'
  | 'retired-policy';

export interface CAL002FinalRowV2 {
  readonly ruleId: string;
  readonly destination: 'quality' | 'research-origin' | 'superseded' | 'retired';
  readonly qualityDomain: CAL002QualityDomain;
  readonly claimClass: CAL002ClaimClass;
  readonly readiness: CAL002Readiness;
  readonly evidenceClass?: CAL002EvidenceClass;
  readonly measurementStatus: 'oracle-verified' | 'measured' | 'not-requested-owner-capacity' | 'not-applicable' | 'unavailable';
  readonly runtimeOutcome: CAL002RuntimeOutcomeV2;
  readonly enabledByDefault: boolean;
  readonly runnableByExplicitOptIn: boolean;
  readonly scoreEligible: boolean;
  readonly gateEligible: boolean;
  readonly repairSafety: 'finding-bound-only' | 'no-safe-repair' | 'not-applicable';
  readonly provenance: CAL002PolicyProvenanceV2;
  readonly evidenceSha256: string;
  readonly replacementRuleId?: string;
  readonly aiAssociation: CAL002AIAssociationV2;
  readonly admitted: false;
}

export interface CAL002FinalMatrixV2 {
  readonly version: typeof CAL002_FINAL_MATRIX_VERSION_V2;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION_V2;
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly authorityReceiptSha256: string;
  readonly oracleReceiptSha256: string;
  readonly qualityDispositionSha256: string;
  readonly originReceiptSha256: string;
  readonly supersessionReceiptSha256: string;
  readonly reducerImplementationCommitSha: string;
  readonly rows: readonly CAL002FinalRowV2[];
  readonly projectionCounts: {
    readonly startingQuality: 47;
    readonly transferred: 26;
    readonly blocked: 4;
    readonly superseded: 3;
    readonly retired: 7;
    readonly researchOrigin: 32;
  };
  readonly outcomeCounts: Readonly<Record<CAL002RuntimeOutcomeV2, number>>;
  readonly admitted: false;
  readonly applied: false;
}

export interface BuildCAL002FinalMatrixInputV2 {
  readonly authorityReceipt: CAL002AuthorityReceiptV2;
  readonly oracleReceipt: CAL002OracleReceiptV2;
  readonly qualityDisposition: CAL002QualityDispositionV2;
  readonly originReceipt: CAL002OriginReceiptV2;
  readonly supersessionReceipt: CAL002SupersessionReceiptV2;
  readonly reducerImplementationCommitSha: string;
}

export interface CAL002FinalMatrixResultV2 {
  readonly matrix: CAL002FinalMatrixV2;
  readonly matrixJson: string;
  readonly matrixSha256: string;
}

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT_SHA = /^[a-f0-9]{40}$/u;
const RUNTIME_OUTCOMES = [
  'default-on',
  'quality-advisory',
  'quality-candidate-default-off',
  'default-off',
  'insufficient-evidence',
  'superseded',
  'retired',
] as const satisfies readonly CAL002RuntimeOutcomeV2[];
const PROJECTION_COUNTS = Object.freeze({
  startingQuality: 47,
  transferred: 26,
  blocked: 4,
  superseded: 3,
  retired: 7,
  researchOrigin: 32,
} as const);

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], required = allowed): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
    && required.every((key) => Object.hasOwn(value, key));
}

function assertExactInput(input: unknown): asserts input is BuildCAL002FinalMatrixInputV2 {
  if (!isRecord(input) || !exactKeys(input, [
    'authorityReceipt',
    'oracleReceipt',
    'qualityDisposition',
    'originReceipt',
    'supersessionReceipt',
    'reducerImplementationCommitSha',
  ])) {
    throw new TypeError('CAL-002 v2 matrix input has unknown or missing fields');
  }
}

function assertArray(value: unknown, label: string): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
}

function assertOracleCaseIds(value: unknown, label: string): asserts value is readonly string[] {
  assertArray(value, label);
  if (value.length === 0
    || value.some((caseId) => typeof caseId !== 'string' || caseId.length === 0)
    || new Set(value).size !== value.length) {
    throw new TypeError(`${label} is invalid`);
  }
}

function assertOracleCase(value: unknown, label: string): void {
  if (!isRecord(value) || !exactKeys(value, ['caseId', 'expected', 'observed', 'sourceSha256'])) {
    throw new TypeError(`${label} has unknown or missing fields`);
  }
  if (typeof value.caseId !== 'string' || value.caseId.length === 0) throw new TypeError(`${label}.caseId is invalid`);
  if (!['finding', 'no-finding'].includes(value.expected as string)
    || !['finding', 'no-finding'].includes(value.observed as string)) {
    throw new TypeError(`${label} has an invalid observation`);
  }
  assertSha256(value.sourceSha256, `${label}.sourceSha256`);
}

function assertOracleControl(
  value: unknown,
  label: string,
  realSource: boolean,
  realContext?: { readonly ruleId: string; readonly sourceBindingReceiptSha256: string },
): void {
  const keys = realSource
    ? ['controlId', 'familyId', 'contentSha256', 'sourceBindingReceiptSha256', 'observed']
    : ['caseId', 'familyId', 'contentSha256', 'observed'];
  if (!isRecord(value) || !exactKeys(value, keys)) throw new TypeError(`${label} has unknown or missing fields`);
  const identityKey = realSource ? 'controlId' : 'caseId';
  if (typeof value[identityKey] !== 'string' || (value[identityKey] as string).length === 0
    || typeof value.familyId !== 'string' || value.familyId.length === 0) {
    throw new TypeError(`${label} has invalid identity fields`);
  }
  assertSha256(value.contentSha256, `${label}.contentSha256`);
  if (realSource) {
    assertSha256(value.sourceBindingReceiptSha256, `${label}.sourceBindingReceiptSha256`);
    if (realContext === undefined
      || value.sourceBindingReceiptSha256 !== realContext.sourceBindingReceiptSha256
      || !REAL_SOURCE_CONTROL_FAMILY_SET.has(value.familyId as string)) {
      throw new TypeError(`${label} has invalid closed source-binding provenance`);
    }
    const expectedControlId = createHash('sha256')
      .update(`${realContext.ruleId}\0${value.familyId}\0${value.contentSha256}`)
      .digest('hex');
    if (value.controlId !== expectedControlId) throw new TypeError(`${label}.controlId is not derived from its binding`);
  }
  if (value.observed !== 'no-finding') throw new TypeError(`${label}.observed must be no-finding`);
}

function assertOracleRow(
  value: unknown,
  authority: CAL002AuthorityRowV2,
  index: number,
  sourceBindingReceiptSha256: string,
): asserts value is CAL002OracleReceiptRowV2 {
  const label = `CAL-002 v2 oracle rows[${index}]`;
  if (!isRecord(value) || !exactKeys(value, [
    'ruleId', 'transferred', 'declaration', 'caseResults', 'fixtureControls', 'realSourceControls',
    'status', 'outcome', 'failures', 'admitted',
  ])) throw new TypeError(`${label} has unknown or missing fields`);
  if (value.ruleId !== authority.ruleId) throw new TypeError(`${label}.ruleId does not follow canonical oracle order`);
  if (value.transferred !== (authority.sourceClass === 'owner-batch')) {
    throw new TypeError(`${label}.transferred disagrees with authority`);
  }
  if (!isRecord(value.declaration) || !exactKeys(value.declaration, [
    'authority', 'reference', 'positiveCaseIds', 'negativeCaseIds',
  ])) throw new TypeError(`${label}.declaration has unknown or missing fields`);
  if (!['language-contract', 'security-contract', 'wcag-22', 'repository-contract'].includes(value.declaration.authority as string)
    || typeof value.declaration.reference !== 'string'
    || value.declaration.reference.length === 0) {
    throw new TypeError(`${label}.declaration is invalid`);
  }
  const positiveCaseIds = value.declaration.positiveCaseIds;
  const negativeCaseIds = value.declaration.negativeCaseIds;
  assertOracleCaseIds(positiveCaseIds, `${label}.declaration.positiveCaseIds`);
  assertOracleCaseIds(negativeCaseIds, `${label}.declaration.negativeCaseIds`);
  const positiveIds = new Set(positiveCaseIds);
  const negativeIds = new Set(negativeCaseIds);
  if ([...positiveIds].some((caseId) => negativeIds.has(caseId))) {
    throw new TypeError(`${label}.declaration case identities overlap`);
  }
  assertArray(value.caseResults, `${label}.caseResults`);
  assertArray(value.fixtureControls, `${label}.fixtureControls`);
  assertArray(value.realSourceControls, `${label}.realSourceControls`);
  assertArray(value.failures, `${label}.failures`);
  value.caseResults.forEach((item, itemIndex) => assertOracleCase(item, `${label}.caseResults[${itemIndex}]`));
  value.fixtureControls.forEach((item, itemIndex) => assertOracleControl(item, `${label}.fixtureControls[${itemIndex}]`, false));
  value.realSourceControls.forEach((item, itemIndex) => assertOracleControl(
    item,
    `${label}.realSourceControls[${itemIndex}]`,
    true,
    { ruleId: authority.ruleId, sourceBindingReceiptSha256 },
  ));
  const caseIds = value.caseResults.map((item) => isRecord(item) ? item.caseId : undefined);
  const declaredCaseIds = [...positiveIds, ...negativeIds];
  if (new Set(caseIds).size !== caseIds.length
    || caseIds.length !== declaredCaseIds.length
    || declaredCaseIds.some((caseId) => !caseIds.includes(caseId))) {
    throw new TypeError(`${label}.caseResults do not match the declaration`);
  }
  const unexpectedObservation = value.caseResults.some((item) => isRecord(item)
    && (item.expected !== item.observed
      || (typeof item.caseId === 'string' && positiveIds.has(item.caseId) && item.expected !== 'finding')
      || (typeof item.caseId === 'string' && negativeIds.has(item.caseId) && item.expected !== 'no-finding')));
  const fixtureCaseIds = value.fixtureControls.map((item) => isRecord(item) ? item.caseId : undefined);
  const fixtureFamilies = value.fixtureControls.map((item) => isRecord(item) ? item.familyId : undefined);
  const fixtureContentHashes = value.fixtureControls.map((item) => isRecord(item) ? item.contentSha256 : undefined);
  const completeFixtureControls = fixtureFamilies.length === CAL002_REAL_SOURCE_CONTROL_FAMILIES.length
    && new Set(fixtureCaseIds).size === CAL002_REAL_SOURCE_CONTROL_FAMILIES.length
    && new Set(fixtureFamilies).size === CAL002_REAL_SOURCE_CONTROL_FAMILIES.length
    && new Set(fixtureContentHashes).size === CAL002_REAL_SOURCE_CONTROL_FAMILIES.length
    && CAL002_REAL_SOURCE_CONTROL_FAMILIES.every((familyId, controlIndex) => fixtureFamilies[controlIndex] === familyId);
  if (!completeFixtureControls) {
    throw new TypeError(`${label}.fixtureControls must contain the exact five canonical controls`);
  }
  const realFamilies = value.realSourceControls.map((item) => isRecord(item) ? item.familyId : undefined);
  const realContentHashes = value.realSourceControls.map((item) => isRecord(item) ? item.contentSha256 : undefined);
  const completeRealControls = realFamilies.length === CAL002_REAL_SOURCE_CONTROL_FAMILIES.length
    && new Set(realFamilies).size === CAL002_REAL_SOURCE_CONTROL_FAMILIES.length
    && new Set(realContentHashes).size === CAL002_REAL_SOURCE_CONTROL_FAMILIES.length
    && CAL002_REAL_SOURCE_CONTROL_FAMILIES.every((familyId, index) => realFamilies[index] === familyId);
  if (value.failures.some((failure) => typeof failure !== 'string' || failure.length === 0)) {
    throw new TypeError(`${label}.failures is invalid`);
  }
  if (!['passed', 'failed'].includes(value.status as string)
    || value.outcome !== (value.status === 'passed' ? 'default-on' : 'default-off')
    || (value.status === 'passed' && (value.failures.length !== 0 || unexpectedObservation || !completeRealControls))
    || (value.status === 'failed' && value.failures.length === 0)
    || value.admitted !== false) {
    throw new TypeError(`${label} has inconsistent status, outcome, failures, or admission`);
  }
}

function assertOracleReceipt(
  value: unknown,
  authorityReceiptSha256: string,
): asserts value is CAL002OracleReceiptV2 {
  if (!isRecord(value) || !exactKeys(value, [
    'version', 'protocolVersion', 'authorityReceiptSha256', 'startingOracleReceiptSha256',
    'sourceBindingReceiptSha256', 'implementationCommitSha', 'rows', 'counts', 'admitted',
  ])) throw new TypeError('CAL-002 v2 oracle receipt has unknown or missing fields');
  if (value.version !== CAL002_ORACLE_RECEIPT_VERSION_V2
    || value.protocolVersion !== CAL002_PROTOCOL_VERSION_V2
    || value.authorityReceiptSha256 !== authorityReceiptSha256
    || value.admitted !== false) {
    throw new TypeError('CAL-002 v2 oracle receipt has protocol, authority, or admission drift');
  }
  assertSha256(value.startingOracleReceiptSha256, 'CAL-002 v2 oracle startingOracleReceiptSha256');
  assertSha256(value.sourceBindingReceiptSha256, 'CAL-002 v2 oracle sourceBindingReceiptSha256');
  if (value.sourceBindingReceiptSha256 !== CAL001_FROZEN_INPUT_HASHES.sourceBindingReceiptSha256) {
    throw new TypeError('CAL-002 v2 oracle receipt has non-frozen source-binding identity');
  }
  assertCommitSha(value.implementationCommitSha, 'CAL-002 v2 oracle implementationCommitSha');
  assertArray(value.rows, 'CAL-002 v2 oracle rows');
  const rows = value.rows;
  const expected = canonicalAuthorityRowsV2().filter((row) => (
    row.evidenceClass === 'deterministic-or-standards' && row.readiness === 'evidence-ready'
  ));
  if (rows.length !== 41 || expected.length !== 41) {
    throw new TypeError('CAL-002 v2 oracle receipt must contain exactly 41 evidence-ready rows');
  }
  expected.forEach((authority, index) => assertOracleRow(
    rows[index],
    authority,
    index,
    value.sourceBindingReceiptSha256 as string,
  ));
  if (!isRecord(value.counts) || !exactKeys(value.counts, ['starting', 'transferred', 'passed', 'failed'])) {
    throw new TypeError('CAL-002 v2 oracle counts are invalid');
  }
  const passed = rows.filter((row) => isRecord(row) && row.status === 'passed').length;
  if (value.counts.starting !== 32
    || value.counts.transferred !== 9
    || value.counts.passed !== passed
    || value.counts.failed !== 41 - passed) {
    throw new TypeError('CAL-002 v2 oracle counts disagree with rows');
  }
}

export function assertCAL002OracleReceiptV2ForMatrix(
  value: unknown,
  authorityReceiptSha256: string,
): asserts value is CAL002OracleReceiptV2 {
  assertSha256(authorityReceiptSha256, 'CAL-002 approved authority receipt SHA-256');
  assertOracleReceipt(value, authorityReceiptSha256);
}

function requireAuthorityBinding(value: string, expected: string, label: string): void {
  if (value !== expected) throw new TypeError(`${label} does not bind the exact approved authority receipt`);
}

function indexExact<T extends { readonly ruleId: string }>(
  rows: readonly T[],
  expectedRuleIds: readonly string[],
  label: string,
): ReadonlyMap<string, T> {
  if (rows.length !== expectedRuleIds.length) throw new TypeError(`${label} has missing or extra rows`);
  const byRuleId = new Map<string, T>();
  for (const row of rows) {
    if (byRuleId.has(row.ruleId)) throw new TypeError(`${label} duplicates ${row.ruleId}`);
    byRuleId.set(row.ruleId, row);
  }
  for (const ruleId of expectedRuleIds) if (!byRuleId.has(ruleId)) throw new TypeError(`${label} is missing ${ruleId}`);
  return byRuleId;
}

function baseRow(authority: CAL002AuthorityRowV2, evidenceSha256: string) {
  return {
    ruleId: authority.ruleId,
    destination: authority.destination,
    qualityDomain: authority.qualityDomain,
    claimClass: authority.claimClass,
    readiness: authority.readiness,
    evidenceSha256,
    aiAssociation: authority.aiAssociation,
    admitted: false as const,
  };
}

function blockedRow(authority: CAL002AuthorityRowV2, authorityReceiptSha256: string): CAL002FinalRowV2 {
  return {
    ...baseRow(authority, canonicalArtifact({
      artifact: 'cal-002-blocked-authority-row-v2', authorityReceiptSha256, row: authority,
    }).sha256),
    measurementStatus: 'unavailable',
    runtimeOutcome: 'default-off',
    enabledByDefault: false,
    runnableByExplicitOptIn: false,
    scoreEligible: false,
    gateEligible: false,
    repairSafety: 'no-safe-repair',
    provenance: 'blocked-quality-candidate',
  };
}

function supersededRow(authority: CAL002AuthorityRowV2, parity: CAL002SupersessionRowV2): CAL002FinalRowV2 {
  if (authority.replacementRuleId !== parity.replacementRuleId) {
    throw new TypeError(`CAL-002 supersession replacement disagrees for ${authority.ruleId}`);
  }
  return {
    ...baseRow(authority, parity.parityReceiptSha256),
    measurementStatus: 'not-applicable',
    runtimeOutcome: 'superseded',
    enabledByDefault: false,
    runnableByExplicitOptIn: false,
    scoreEligible: false,
    gateEligible: false,
    repairSafety: 'not-applicable',
    provenance: 'superseded-policy',
    replacementRuleId: parity.replacementRuleId,
  };
}

function retiredRow(authority: CAL002AuthorityRowV2, authorityReceiptSha256: string): CAL002FinalRowV2 {
  return {
    ...baseRow(authority, canonicalArtifact({
      artifact: 'cal-002-retired-authority-row-v2', authorityReceiptSha256, row: authority,
    }).sha256),
    measurementStatus: 'not-applicable',
    runtimeOutcome: 'retired',
    enabledByDefault: false,
    runnableByExplicitOptIn: false,
    scoreEligible: false,
    gateEligible: false,
    repairSafety: 'not-applicable',
    provenance: 'retired-policy',
  };
}

function originRow(authority: CAL002AuthorityRowV2, origin: CAL002OriginRowV2): CAL002FinalRowV2 {
  return {
    ...baseRow(authority, origin.evidenceSha256),
    measurementStatus: 'not-applicable',
    runtimeOutcome: 'default-off',
    enabledByDefault: false,
    runnableByExplicitOptIn: true,
    scoreEligible: false,
    gateEligible: false,
    repairSafety: 'not-applicable',
    provenance: 'internal-origin-association',
  };
}

function oracleRow(authority: CAL002AuthorityRowV2, oracle: CAL002OracleReceiptRowV2): CAL002FinalRowV2 {
  const passed = oracle.status === 'passed';
  return {
    ...baseRow(authority, canonicalArtifact(oracle).sha256),
    evidenceClass: 'deterministic-or-standards',
    measurementStatus: 'oracle-verified',
    runtimeOutcome: passed ? 'default-on' : 'default-off',
    enabledByDefault: passed,
    runnableByExplicitOptIn: true,
    scoreEligible: passed,
    gateEligible: passed,
    repairSafety: passed ? 'finding-bound-only' : 'no-safe-repair',
    provenance: passed ? 'deterministic-finding-evidence' : 'current-quality-failed-claim-bar',
  };
}

function qualityProvenance(row: CAL002QualityDispositionRowV2): CAL002PolicyProvenanceV2 {
  if (row.measurementStatus === 'not-requested-owner-capacity') return 'quality-candidate-unmeasured';
  if (row.runtimeOutcome === 'default-on') return 'current-quality-calibrated';
  if (row.runtimeOutcome === 'quality-advisory') return 'current-quality-advisory';
  if (row.runtimeOutcome === 'insufficient-evidence') return 'insufficient-evidence';
  if (row.runtimeOutcome === 'default-off') return 'current-quality-failed-claim-bar';
  throw new TypeError(`CAL-002 quality outcome is not projectable for ${row.ruleId}`);
}

function qualityRow(authority: CAL002AuthorityRowV2, quality: CAL002QualityDispositionRowV2): CAL002FinalRowV2 {
  if (authority.evidenceClass !== quality.evidenceClass) {
    throw new TypeError(`CAL-002 quality evidence class disagrees for ${authority.ruleId}`);
  }
  return {
    ...baseRow(authority, canonicalArtifact(quality).sha256),
    evidenceClass: quality.evidenceClass,
    measurementStatus: quality.measurementStatus,
    runtimeOutcome: quality.runtimeOutcome,
    enabledByDefault: quality.enabledByDefault,
    runnableByExplicitOptIn: true,
    scoreEligible: quality.scoreEligible,
    gateEligible: quality.gateEligible,
    repairSafety: quality.repairSafety,
    provenance: qualityProvenance(quality),
  };
}

function expectedProjectionCounts(rows: readonly CAL002AuthorityRowV2[]) {
  const counts = {
    startingQuality: rows.filter((row) => row.sourceClass === 'starting-quality').length,
    transferred: rows.filter((row) => row.action === 'transfer').length,
    blocked: rows.filter((row) => row.action === 'block').length,
    superseded: rows.filter((row) => row.action === 'supersede').length,
    retired: rows.filter((row) => row.action === 'retire').length,
    researchOrigin: rows.filter((row) => row.destination === 'research-origin').length,
  };
  if (canonicalArtifact(counts).json !== canonicalArtifact(PROJECTION_COUNTS).json) {
    throw new TypeError('CAL-002 authority projection counts have drifted');
  }
  return PROJECTION_COUNTS;
}

function countOutcomes(rows: readonly { readonly runtimeOutcome?: unknown }[]): Readonly<Record<CAL002RuntimeOutcomeV2, number>> {
  return Object.fromEntries(RUNTIME_OUTCOMES.map((outcome) => [
    outcome,
    rows.filter((row) => row.runtimeOutcome === outcome).length,
  ])) as Readonly<Record<CAL002RuntimeOutcomeV2, number>>;
}

export function buildCAL002FinalMatrixV2(input: BuildCAL002FinalMatrixInputV2): CAL002FinalMatrixResultV2 {
  assertExactInput(input);
  assertCommitSha(input.reducerImplementationCommitSha, 'CAL-002 v2 reducerImplementationCommitSha');
  assertCAL002AuthorityReceiptV2(input.authorityReceipt);
  const authorityReceiptSha256 = canonicalArtifact(input.authorityReceipt).sha256;
  assertOracleReceipt(input.oracleReceipt, authorityReceiptSha256);
  assertCAL002QualityDispositionV2(input.qualityDisposition);
  assertCAL002OriginReceiptV2(input.originReceipt);
  assertCAL002SupersessionReceiptV2(input.supersessionReceipt);
  requireAuthorityBinding(input.qualityDisposition.authorityReceiptSha256, authorityReceiptSha256, 'CAL-002 quality disposition');
  requireAuthorityBinding(input.originReceipt.authorityReceiptSha256, authorityReceiptSha256, 'CAL-002 origin receipt');
  requireAuthorityBinding(input.supersessionReceipt.authorityReceiptSha256, authorityReceiptSha256, 'CAL-002 supersession receipt');

  const authorityRows = input.authorityReceipt.rows;
  const oracleByRuleId = indexExact(
    input.oracleReceipt.rows,
    authorityRows.filter((row) => row.evidenceClass === 'deterministic-or-standards' && row.readiness === 'evidence-ready').map((row) => row.ruleId),
    'CAL-002 v2 oracle receipt',
  );
  const qualityByRuleId = indexExact(
    input.qualityDisposition.rows,
    authorityRows.filter((row) => row.evidenceClass === 'contextual-quality' || row.evidenceClass === 'statistical-review-utility').map((row) => row.ruleId),
    'CAL-002 quality disposition',
  );
  const originByRuleId = indexExact(
    input.originReceipt.rows,
    authorityRows.filter((row) => row.destination === 'research-origin').map((row) => row.ruleId),
    'CAL-002 origin receipt',
  );
  const supersessionByRuleId = indexExact(
    input.supersessionReceipt.rows,
    authorityRows.filter((row) => row.destination === 'superseded').map((row) => row.ruleId),
    'CAL-002 supersession receipt',
  );

  const rows = authorityRows.map((authority): CAL002FinalRowV2 => {
    if (authority.readiness === 'repair-required' || authority.readiness === 'project-contract-required') {
      return blockedRow(authority, authorityReceiptSha256);
    }
    if (authority.destination === 'superseded') {
      const parity = supersessionByRuleId.get(authority.ruleId);
      if (parity === undefined) throw new TypeError(`CAL-002 supersession is missing ${authority.ruleId}`);
      return supersededRow(authority, parity);
    }
    if (authority.destination === 'retired') return retiredRow(authority, authorityReceiptSha256);
    if (authority.destination === 'research-origin') {
      const origin = originByRuleId.get(authority.ruleId);
      if (origin === undefined) throw new TypeError(`CAL-002 origin evidence is missing ${authority.ruleId}`);
      return originRow(authority, origin);
    }
    if (authority.evidenceClass === 'deterministic-or-standards') {
      const oracle = oracleByRuleId.get(authority.ruleId);
      if (oracle === undefined) throw new TypeError(`CAL-002 oracle evidence is missing ${authority.ruleId}`);
      return oracleRow(authority, oracle);
    }
    const quality = qualityByRuleId.get(authority.ruleId);
    if (quality === undefined) throw new TypeError(`CAL-002 quality disposition is missing ${authority.ruleId}`);
    return qualityRow(authority, quality);
  });
  if (rows.length !== 119 || new Set(rows.map((row) => row.ruleId)).size !== 119) {
    throw new TypeError('CAL-002 v2 matrix must contain every canonical rule exactly once');
  }
  const matrix: CAL002FinalMatrixV2 = {
    version: CAL002_FINAL_MATRIX_VERSION_V2,
    protocolVersion: CAL002_PROTOCOL_VERSION_V2,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    authorityReceiptSha256,
    oracleReceiptSha256: canonicalArtifact(input.oracleReceipt).sha256,
    qualityDispositionSha256: canonicalArtifact(input.qualityDisposition).sha256,
    originReceiptSha256: canonicalArtifact(input.originReceipt).sha256,
    supersessionReceiptSha256: canonicalArtifact(input.supersessionReceipt).sha256,
    reducerImplementationCommitSha: input.reducerImplementationCommitSha,
    rows,
    projectionCounts: expectedProjectionCounts(authorityRows),
    outcomeCounts: countOutcomes(rows),
    admitted: false,
    applied: false,
  };
  assertCAL002FinalMatrixV2(matrix);
  const artifact = canonicalArtifact(matrix);
  return { matrix, matrixJson: artifact.json, matrixSha256: artifact.sha256 };
}

function expectedEffects(provenance: unknown): readonly [boolean, boolean, boolean, boolean] | undefined {
  if (provenance === 'deterministic-finding-evidence' || provenance === 'current-quality-calibrated') {
    return [true, true, true, true];
  }
  if (provenance === 'current-quality-advisory'
    || provenance === 'quality-candidate-unmeasured'
    || provenance === 'internal-origin-association'
    || provenance === 'current-quality-failed-claim-bar'
    || provenance === 'insufficient-evidence') return [false, true, false, false];
  if (provenance === 'blocked-quality-candidate'
    || provenance === 'superseded-policy'
    || provenance === 'retired-policy') return [false, false, false, false];
  return undefined;
}

function rowErrors(value: unknown, authority: CAL002AuthorityRowV2, index: number): string[] {
  const errors: string[] = [];
  const path = `artifact.rows[${index}]`;
  if (!isRecord(value)) return [`${path} must be an object`];
  const allowed = [
    'ruleId', 'destination', 'qualityDomain', 'claimClass', 'readiness', 'evidenceClass',
    'measurementStatus', 'runtimeOutcome', 'enabledByDefault', 'runnableByExplicitOptIn',
    'scoreEligible', 'gateEligible', 'repairSafety', 'provenance', 'evidenceSha256',
    'replacementRuleId', 'aiAssociation', 'admitted',
  ];
  const required = allowed.filter((key) => key !== 'evidenceClass' && key !== 'replacementRuleId');
  if (!exactKeys(value, allowed, required)) errors.push(`${path} has unknown or missing fields`);
  for (const key of ['ruleId', 'destination', 'qualityDomain', 'claimClass', 'readiness', 'aiAssociation'] as const) {
    if (canonicalArtifact(value[key]).json !== canonicalArtifact(authority[key]).json) {
      errors.push(`${path}.${key} disagrees with canonical authority`);
    }
  }
  if (typeof value.evidenceSha256 !== 'string' || !SHA256.test(value.evidenceSha256)) {
    errors.push(`${path}.evidenceSha256 must be a lowercase SHA-256`);
  }
  if (value.admitted !== false) errors.push(`${path}.admitted must be false`);
  const row = value;
  const effects = expectedEffects(row.provenance);
  if (effects === undefined || canonicalArtifact([
    row.enabledByDefault, row.runnableByExplicitOptIn, row.scoreEligible, row.gateEligible,
  ]).json !== canonicalArtifact(effects).json) errors.push(`${path} runtime effects disagree with provenance`);

  const blocked = authority.readiness === 'repair-required' || authority.readiness === 'project-contract-required';
  if (blocked) {
    if (row.provenance !== 'blocked-quality-candidate' || row.runtimeOutcome !== 'default-off'
      || row.measurementStatus !== 'unavailable' || row.repairSafety !== 'no-safe-repair'
      || Object.hasOwn(value, 'evidenceClass') || Object.hasOwn(value, 'replacementRuleId')) {
      errors.push(`${path} does not preserve blocked-quality policy`);
    }
    return errors;
  }
  if (authority.destination === 'superseded') {
    if (row.provenance !== 'superseded-policy' || row.runtimeOutcome !== 'superseded'
      || row.measurementStatus !== 'not-applicable' || row.repairSafety !== 'not-applicable'
      || row.replacementRuleId !== authority.replacementRuleId || Object.hasOwn(value, 'evidenceClass')) {
      errors.push(`${path} does not preserve superseded policy`);
    }
    return errors;
  }
  if (authority.destination === 'retired') {
    if (row.provenance !== 'retired-policy' || row.runtimeOutcome !== 'retired'
      || row.measurementStatus !== 'not-applicable' || row.repairSafety !== 'not-applicable'
      || Object.hasOwn(value, 'evidenceClass') || Object.hasOwn(value, 'replacementRuleId')) {
      errors.push(`${path} does not preserve retired policy`);
    }
    return errors;
  }
  if (authority.destination === 'research-origin') {
    if (row.provenance !== 'internal-origin-association' || row.runtimeOutcome !== 'default-off'
      || row.measurementStatus !== 'not-applicable' || row.repairSafety !== 'not-applicable'
      || Object.hasOwn(value, 'evidenceClass') || Object.hasOwn(value, 'replacementRuleId')) {
      errors.push(`${path} elevates research-origin association`);
    }
    return errors;
  }
  if (value.evidenceClass !== authority.evidenceClass || Object.hasOwn(value, 'replacementRuleId')) {
    errors.push(`${path} quality evidence class or replacement is invalid`);
  }
  if (authority.evidenceClass === 'deterministic-or-standards') {
    const passed = row.runtimeOutcome === 'default-on';
    if (row.measurementStatus !== 'oracle-verified'
      || (row.runtimeOutcome !== 'default-on' && row.runtimeOutcome !== 'default-off')
      || row.provenance !== (passed ? 'deterministic-finding-evidence' : 'current-quality-failed-claim-bar')
      || row.repairSafety !== (passed ? 'finding-bound-only' : 'no-safe-repair')) {
      errors.push(`${path} deterministic oracle projection is invalid`);
    }
    return errors;
  }
  if (row.measurementStatus === 'not-requested-owner-capacity') {
    if (row.runtimeOutcome !== 'quality-candidate-default-off'
      || row.provenance !== 'quality-candidate-unmeasured'
      || row.repairSafety !== 'no-safe-repair') errors.push(`${path} unmeasured quality projection is invalid`);
    return errors;
  }
  if (row.measurementStatus !== 'measured') errors.push(`${path}.measurementStatus is invalid for quality evidence`);
  if (authority.evidenceClass === 'statistical-review-utility' && row.runtimeOutcome === 'default-on') {
    errors.push(`${path} statistical evidence cannot be default-on`);
  }
  const expectedProvenance = row.runtimeOutcome === 'default-on' ? 'current-quality-calibrated'
    : row.runtimeOutcome === 'quality-advisory' ? 'current-quality-advisory'
      : row.runtimeOutcome === 'default-off' ? 'current-quality-failed-claim-bar'
        : row.runtimeOutcome === 'insufficient-evidence' ? 'insufficient-evidence' : undefined;
  if (expectedProvenance === undefined || row.provenance !== expectedProvenance) {
    errors.push(`${path} measured quality outcome/provenance is invalid`);
  }
  const expectedRepair = authority.evidenceClass === 'contextual-quality' ? 'finding-bound-only' : 'no-safe-repair';
  if (row.repairSafety !== expectedRepair) errors.push(`${path}.repairSafety disagrees with evidence class`);
  return errors;
}

export function validateCAL002FinalMatrixV2(value: unknown): CAL002ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['artifact must be an object'] };
  const keys = [
    'version', 'protocolVersion', 'catalogSha256', 'authorityReceiptSha256', 'oracleReceiptSha256',
    'qualityDispositionSha256', 'originReceiptSha256', 'supersessionReceiptSha256',
    'reducerImplementationCommitSha', 'rows', 'projectionCounts', 'outcomeCounts', 'admitted', 'applied',
  ];
  if (!exactKeys(value, keys)) errors.push('artifact has unknown or missing fields');
  if (value.version !== CAL002_FINAL_MATRIX_VERSION_V2) errors.push('artifact.version is invalid');
  if (value.protocolVersion !== CAL002_PROTOCOL_VERSION_V2) errors.push('artifact.protocolVersion is invalid');
  if (value.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256) errors.push('artifact.catalogSha256 is invalid');
  for (const key of [
    'authorityReceiptSha256', 'oracleReceiptSha256', 'qualityDispositionSha256',
    'originReceiptSha256', 'supersessionReceiptSha256',
  ]) if (typeof value[key] !== 'string' || !SHA256.test(value[key] as string)) errors.push(`artifact.${key} must be a lowercase SHA-256`);
  if (typeof value.reducerImplementationCommitSha !== 'string' || !COMMIT_SHA.test(value.reducerImplementationCommitSha)) {
    errors.push('artifact.reducerImplementationCommitSha must be a lowercase commit SHA');
  }
  if (value.admitted !== false) errors.push('artifact.admitted must be false');
  if (value.applied !== false) errors.push('artifact.applied must be false');
  const expectedAuthority = canonicalAuthorityRowsV2();
  const rows = Array.isArray(value.rows) ? value.rows : [];
  if (!Array.isArray(value.rows) || rows.length !== CAL002_LOCKED_RULE_IDS.length) {
    errors.push('artifact.rows must contain exactly 119 rows');
  }
  for (let index = 0; index < expectedAuthority.length; index += 1) {
    errors.push(...rowErrors(rows[index], expectedAuthority[index]!, index));
  }
  if (!isRecord(value.projectionCounts)
    || canonicalArtifact(value.projectionCounts).json !== canonicalArtifact(PROJECTION_COUNTS).json) {
    errors.push('artifact.projectionCounts must match the closed authority projection');
  }
  if (!isRecord(value.outcomeCounts) || !exactKeys(value.outcomeCounts, RUNTIME_OUTCOMES)) {
    errors.push('artifact.outcomeCounts must contain every closed runtime outcome');
  } else {
    const projected = countOutcomes(rows.filter(isRecord));
    if (canonicalArtifact(value.outcomeCounts).json !== canonicalArtifact(projected).json) {
      errors.push('artifact.outcomeCounts disagree with rows');
    }
  }
  return { ok: errors.length === 0, errors };
}

export function assertCAL002FinalMatrixV2(value: unknown): asserts value is CAL002FinalMatrixV2 {
  const result = validateCAL002FinalMatrixV2(value);
  if (!result.ok) throw new TypeError(`CAL-002 final matrix v2 validation failed: ${result.errors.join('; ')}`);
}
