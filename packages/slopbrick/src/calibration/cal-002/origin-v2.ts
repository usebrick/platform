import { canonicalAuthorityRowsV2 } from './authority';
import {
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  assertCommitSha,
  assertSha256,
  canonicalArtifact,
  type CAL002ValidationResult,
} from './contracts';
import {
  CAL002_PROTOCOL_VERSION_V2,
  assertCAL002AuthorityReceiptV2,
  type CAL002AuthorityReceiptV2,
  type CAL002AuthorityRowV2,
} from './contracts-v2';
import {
  assessCAL002CAL001Reuse,
  type CAL002CAL001RerunEvidence,
  type CAL002OriginGoverningHashes,
} from './origin';

export const CAL002_ORIGIN_RECEIPT_VERSION_V2 = 'cal-002-origin-receipt-v2' as const;

export const CAL002_ORIGIN_FROZEN_GOVERNING_HASHES = {
  protocolSha256: 'd78ceb22bd2d3a2bc91676d93facd7003af6c1b8351fdf773139a138bd1f1528',
  sourceBindingReceiptSha256: '47bd66907ec2efa67da718e0cfb38458151ca84d3cdedc941488fe4b001475ac',
  splitPlanSha256: '9c4638526e9a4161d3e74f70197f0b25717439e6bd477bef98664a03c9a9219c',
  scannerCommitSha: '45d2dd038107d3d1d7731192126bf0d48dd6f84b',
  configSha256: 'a1d72023270a0f85ea5e630c90c04551201cf2a886ab6a29ce38b63e02d595b8',
  catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
  holdoutReceiptSha256: 'db9551ec4540282bf35fbc896d0e33dc31434019de52da0f2972ade2d5dc4cfe',
  metricsSha256: '9d4e57ef42dfad1d65becf750690ef9991ba29c03f0181531fb4321853f1bea5',
  cal001MatrixSha256: '3c170e308f8ec0be1c1c31b4a5716810388f2692f6e7f0a179b4fd48665eca1c',
  reducerSha256: '42b554357d45913c05b4b5f5adeef928a08fbb27a1b83c2f4465bc9dbac7343b',
} as const satisfies CAL002OriginGoverningHashes;

export interface CAL002OriginRowV2 {
  readonly ruleId: string;
  readonly destination: 'research-origin';
  readonly evidenceStatus: 'reused' | 'rerun-completed';
  readonly claimCeiling: 'internal-origin-association';
  readonly runtimeOutcome: 'default-off';
  readonly enabledByDefault: false;
  readonly scoreEligible: false;
  readonly gateEligible: false;
  readonly runnableByExplicitOptIn: true;
  readonly evidenceSha256: string;
  readonly admitted: false;
}

export interface CAL002OriginReceiptV2 {
  readonly version: typeof CAL002_ORIGIN_RECEIPT_VERSION_V2;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION_V2;
  readonly authorityReceiptSha256: string;
  readonly originImplementationCommitSha: string;
  readonly status: 'reused' | 'rerun-completed';
  readonly governingHashes: CAL002OriginGoverningHashes;
  readonly rows: readonly CAL002OriginRowV2[];
  readonly admitted: false;
}

export interface BuildCAL002OriginReceiptV2Input {
  readonly authorityReceipt: CAL002AuthorityReceiptV2;
  readonly governingHashes: Partial<CAL002OriginGoverningHashes>;
  readonly expectedGoverningHashes: CAL002OriginGoverningHashes;
  readonly originImplementationCommitSha: string;
  readonly rerunEvidence?: CAL002CAL001RerunEvidence;
}

export interface CAL002OriginReceiptResultV2 {
  readonly receipt: CAL002OriginReceiptV2;
  readonly receiptJson: string;
  readonly receiptSha256: string;
}

const HASH_KEYS = [
  'protocolSha256',
  'sourceBindingReceiptSha256',
  'splitPlanSha256',
  'scannerCommitSha',
  'configSha256',
  'catalogSha256',
  'holdoutReceiptSha256',
  'metricsSha256',
  'cal001MatrixSha256',
  'reducerSha256',
] as const satisfies readonly (keyof CAL002OriginGoverningHashes)[];

const RECEIPT_KEYS = [
  'version',
  'protocolVersion',
  'authorityReceiptSha256',
  'originImplementationCommitSha',
  'status',
  'governingHashes',
  'rows',
  'admitted',
] as const;

const ROW_KEYS = [
  'ruleId',
  'destination',
  'evidenceStatus',
  'claimCeiling',
  'runtimeOutcome',
  'enabledByDefault',
  'scoreEligible',
  'gateEligible',
  'runnableByExplicitOptIn',
  'evidenceSha256',
  'admitted',
] as const;

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort(compareCodePoints);
  const sortedExpected = [...expected].sort(compareCodePoints);
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function assertInputKeys(value: Record<string, unknown>): void {
  const allowed = [
    'authorityReceipt',
    'governingHashes',
    'expectedGoverningHashes',
    'originImplementationCommitSha',
    'rerunEvidence',
  ];
  const required = allowed.filter((key) => key !== 'rerunEvidence');
  if (Object.keys(value).some((key) => !allowed.includes(key))
    || required.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError('CAL-002 v2 origin receipt input has unknown or missing fields');
  }
}

function researchAuthorityRows(rows: readonly CAL002AuthorityRowV2[]): readonly CAL002AuthorityRowV2[] {
  return rows.filter((row) =>
    row.destination === 'research-origin' && row.readiness === 'research-only');
}

function canonicalResearchRuleIds(): readonly string[] {
  const rows = researchAuthorityRows(canonicalAuthorityRowsV2());
  if (rows.length !== 32) {
    throw new TypeError('CAL-002 canonical authority does not contain exactly 32 research-origin rows');
  }
  return rows.map((row) => row.ruleId);
}

function assertResearchAuthorityRows(rows: readonly CAL002AuthorityRowV2[]): void {
  const expectedRuleIds = canonicalResearchRuleIds();
  const actualRuleIds = rows.map((row) => row.ruleId);
  if (actualRuleIds.length !== expectedRuleIds.length
    || actualRuleIds.some((ruleId, index) => ruleId !== expectedRuleIds[index])) {
    throw new TypeError('CAL-002 authority receipt must project exactly 32 canonical research-origin rows');
  }
  for (const row of rows) {
    if (row.sourceClass !== 'research-origin'
      || row.action !== 'hold'
      || row.claimClass !== 'no-valid-quality-claim'
      || row.qualityDomain !== 'none'
      || row.assignmentEligible !== false) {
      throw new TypeError(`CAL-002 research-origin authority metadata is invalid for ${row.ruleId}`);
    }
    if (row.aiAssociation.claimCeiling !== 'association-only'
      || row.aiAssociation.source === 'none-recorded'
      || row.aiAssociation.evidenceSha256 === undefined) {
      throw new TypeError(`CAL-002 research-origin row ${row.ruleId} lacks bounded association evidence`);
    }
    assertSha256(row.aiAssociation.evidenceSha256, `CAL-002 research-origin row ${row.ruleId} evidenceSha256`);
  }
}

function selectedGoverningHashes(
  input: BuildCAL002OriginReceiptV2Input,
  status: CAL002OriginReceiptV2['status'],
): CAL002OriginGoverningHashes {
  if (status === 'reused') return input.expectedGoverningHashes;
  if (input.rerunEvidence === undefined) {
    throw new TypeError('CAL-002 origin hash drift requires completed one-worker rerun evidence');
  }
  return input.rerunEvidence.governingHashes;
}

export function buildCAL002OriginReceiptV2(
  input: BuildCAL002OriginReceiptV2Input,
): CAL002OriginReceiptResultV2 {
  if (!isRecord(input)) throw new TypeError('CAL-002 v2 origin receipt input must be an object');
  assertInputKeys(input);
  assertCAL002AuthorityReceiptV2(input.authorityReceipt);
  assertCommitSha(input.originImplementationCommitSha, 'originImplementationCommitSha');

  const authorityRows = researchAuthorityRows(input.authorityReceipt.rows);
  assertResearchAuthorityRows(authorityRows);
  const reuse = assessCAL002CAL001Reuse({
    governingHashes: input.governingHashes,
    expectedGoverningHashes: input.expectedGoverningHashes,
    ...(input.rerunEvidence === undefined ? {} : { rerunEvidence: input.rerunEvidence }),
  });
  if (reuse.status === 'rerun-required') {
    throw new TypeError(
      `CAL-002 origin governing hash drift requires a completed one-worker rerun: ${reuse.mismatches.join(', ')}`,
    );
  }
  const status = reuse.status;
  const governingHashes = selectedGoverningHashes(input, status);
  if (governingHashes.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256) {
    throw new TypeError('CAL-002 origin governing catalog hash does not match the locked catalog');
  }

  const receipt: CAL002OriginReceiptV2 = {
    version: CAL002_ORIGIN_RECEIPT_VERSION_V2,
    protocolVersion: CAL002_PROTOCOL_VERSION_V2,
    authorityReceiptSha256: canonicalArtifact(input.authorityReceipt).sha256,
    originImplementationCommitSha: input.originImplementationCommitSha,
    status,
    governingHashes,
    rows: authorityRows.map((row) => {
      const evidenceSha256 = row.aiAssociation.evidenceSha256;
      if (evidenceSha256 === undefined) {
        throw new TypeError(`CAL-002 research-origin row ${row.ruleId} must bind association evidence`);
      }
      return {
        ruleId: row.ruleId,
        destination: 'research-origin',
        evidenceStatus: status,
        claimCeiling: 'internal-origin-association',
        runtimeOutcome: 'default-off',
        enabledByDefault: false,
        scoreEligible: false,
        gateEligible: false,
        runnableByExplicitOptIn: true,
        evidenceSha256,
        admitted: false,
      };
    }),
    admitted: false,
  };
  assertCAL002OriginReceiptV2(receipt);
  const artifact = canonicalArtifact(receipt);
  return {
    receipt,
    receiptJson: artifact.json,
    receiptSha256: artifact.sha256,
  };
}

function validateHashes(value: unknown, errors: string[]): void {
  if (!isRecord(value) || !sameKeys(value, HASH_KEYS)) {
    errors.push('artifact.governingHashes must contain the exact governing hash fields');
    return;
  }
  for (const key of HASH_KEYS) {
    try {
      if (key === 'scannerCommitSha') assertCommitSha(value[key], `artifact.governingHashes.${key}`);
      else assertSha256(value[key], `artifact.governingHashes.${key}`);
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  if (value.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256) {
    errors.push('artifact.governingHashes.catalogSha256 must match the locked catalog');
  }
}

function validateRow(
  value: unknown,
  expectedRuleId: string,
  status: unknown,
  index: number,
  errors: string[],
): void {
  const path = `artifact.rows[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!sameKeys(value, ROW_KEYS)) errors.push(`${path} has unknown or missing fields`);
  if (value.ruleId !== expectedRuleId) errors.push(`${path}.ruleId must follow canonical research-origin order`);
  if (value.destination !== 'research-origin') errors.push(`${path}.destination must be research-origin`);
  if (value.evidenceStatus !== status) errors.push(`${path}.evidenceStatus must match artifact.status`);
  if (value.claimCeiling !== 'internal-origin-association') {
    errors.push(`${path}.claimCeiling must remain internal-origin-association`);
  }
  if (value.runtimeOutcome !== 'default-off') errors.push(`${path}.runtimeOutcome must remain default-off`);
  if (value.enabledByDefault !== false) errors.push(`${path}.enabledByDefault must be false`);
  if (value.scoreEligible !== false) errors.push(`${path}.scoreEligible must be false`);
  if (value.gateEligible !== false) errors.push(`${path}.gateEligible must be false`);
  if (value.runnableByExplicitOptIn !== true) errors.push(`${path}.runnableByExplicitOptIn must be true`);
  try {
    assertSha256(value.evidenceSha256, `${path}.evidenceSha256`);
  } catch (error) {
    errors.push((error as Error).message);
  }
  if (value.admitted !== false) errors.push(`${path}.admitted must be false`);
}

export function validateCAL002OriginReceiptV2(value: unknown): CAL002ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['artifact must be an object'] };
  if (!sameKeys(value, RECEIPT_KEYS)) errors.push('artifact has unknown or missing fields');
  if (value.version !== CAL002_ORIGIN_RECEIPT_VERSION_V2) errors.push('artifact.version is invalid');
  if (value.protocolVersion !== CAL002_PROTOCOL_VERSION_V2) errors.push('artifact.protocolVersion is invalid');
  try {
    assertSha256(value.authorityReceiptSha256, 'artifact.authorityReceiptSha256');
  } catch (error) {
    errors.push((error as Error).message);
  }
  try {
    assertCommitSha(value.originImplementationCommitSha, 'artifact.originImplementationCommitSha');
  } catch (error) {
    errors.push((error as Error).message);
  }
  if (value.status !== 'reused' && value.status !== 'rerun-completed') {
    errors.push('artifact.status must be reused or rerun-completed');
  }
  validateHashes(value.governingHashes, errors);
  const expectedRuleIds = canonicalResearchRuleIds();
  if (!Array.isArray(value.rows) || value.rows.length !== expectedRuleIds.length) {
    errors.push('artifact.rows must contain exactly 32 canonical research-origin rows');
  }
  const rows = Array.isArray(value.rows) ? value.rows : [];
  for (const [index, expectedRuleId] of expectedRuleIds.entries()) {
    validateRow(rows[index], expectedRuleId, value.status, index, errors);
  }
  if (value.admitted !== false) errors.push('artifact.admitted must be false');
  return { ok: errors.length === 0, errors };
}

export function assertCAL002OriginReceiptV2(value: unknown): asserts value is CAL002OriginReceiptV2 {
  const validation = validateCAL002OriginReceiptV2(value);
  if (!validation.ok) {
    throw new TypeError(`CAL-002 v2 origin receipt validation failed: ${validation.errors.join('; ')}`);
  }
}
