import {
  CAL002_LOCKED_COUNTS,
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  CAL002_ORIGIN_RECEIPT_VERSION,
  CAL002_PROTOCOL_VERSION,
  assertCommitSha,
  assertSha256,
  canonicalArtifact,
  validateCAL002Catalog,
  validateCAL002OriginReceipt,
  type CAL002Catalog,
  type CAL002OriginDisposition,
  type CAL002TransferReason,
} from './contracts';

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
] as const;

const TRANSFER_REASONS = [
  'standards-or-contract-quality-claim',
  'contextual-defect-quality-claim',
  'statistical-review-utility-claim',
] as const satisfies readonly CAL002TransferReason[];

const CAL001_RERUN_COMMAND = [
  'corepack pnpm --filter slopbrick cal:corpus:v1-holdout --',
  '--workers 1',
  '&& corepack pnpm --filter slopbrick cal:corpus:v1-decisions --',
  '--workers 1',
].join(' ');

type HashKey = (typeof HASH_KEYS)[number];

export interface CAL002OriginGoverningHashes {
  readonly protocolSha256: string;
  readonly sourceBindingReceiptSha256: string;
  readonly splitPlanSha256: string;
  readonly scannerCommitSha: string;
  readonly configSha256: string;
  readonly catalogSha256: string;
  readonly holdoutReceiptSha256: string;
  readonly metricsSha256: string;
  readonly cal001MatrixSha256: string;
  readonly reducerSha256: string;
}

export interface CAL002OriginDecisionRow {
  readonly ruleId: string;
  readonly disposition: CAL002OriginDisposition;
  readonly reason?: CAL002TransferReason | 'duplicate-or-obsolete';
}

export interface CAL002OriginResolution {
  readonly rows: readonly CAL002OriginDecisionRow[];
  readonly unresolvedRuleIds: readonly string[];
}

export interface CAL002OriginReceipt {
  readonly version: typeof CAL002_ORIGIN_RECEIPT_VERSION;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION;
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly originImplementationCommitSha: string;
  readonly status: 'reused' | 'rerun-required' | 'rerun-completed';
  readonly governingHashes: CAL002OriginGoverningHashes;
  readonly rows: readonly CAL002OriginDecisionRow[];
  readonly admitted: false;
}

export interface BuildCAL002OriginReceiptInput {
  readonly catalog: CAL002Catalog;
  readonly decisions: readonly CAL002OriginDecisionRow[];
  readonly status: CAL002OriginReceipt['status'];
  readonly governingHashes: CAL002OriginGoverningHashes;
  readonly originImplementationCommitSha: string;
}

export interface CAL002OriginReceiptResult {
  readonly receipt: CAL002OriginReceipt;
  readonly receiptJson: string;
  readonly receiptSha256: string;
}

export interface CAL002CAL001RerunEvidence {
  readonly workerCount: 1;
  readonly governingHashes: CAL002OriginGoverningHashes;
}

export interface AssessCAL002CAL001ReuseInput {
  readonly governingHashes: Partial<CAL002OriginGoverningHashes>;
  readonly expectedGoverningHashes: CAL002OriginGoverningHashes;
  readonly rerunEvidence?: CAL002CAL001RerunEvidence;
}

export interface CAL002CAL001ReuseResult {
  readonly status: 'reused' | 'rerun-required' | 'rerun-completed';
  readonly mismatches: readonly HashKey[];
  readonly rerunCommand: string;
  readonly requiredWorkerCount: 1;
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort(compareCodePoints);
  const expected = [...required].sort(compareCodePoints);
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(label + ' has unknown or missing fields');
  }
}

function assertOriginCatalog(catalog: CAL002Catalog): void {
  const validation = validateCAL002Catalog(catalog);
  if (!validation.ok) {
    throw new TypeError('CAL-002 catalog is invalid: ' + validation.errors.join('; '));
  }
  if (
    catalog.ruleCatalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256
    || catalog.admitted !== false
    || catalog.applied !== false
    || catalog.counts.total !== CAL002_LOCKED_COUNTS.total
    || catalog.counts.startingOrigin !== CAL002_LOCKED_COUNTS.startingOrigin
    || catalog.counts.ownerReviewRequired !== CAL002_LOCKED_COUNTS.ownerReviewRequired
  ) {
    throw new TypeError('CAL-002 origin catalog does not match the locked non-admitting identity');
  }
}

function assertDecisionRow(value: unknown, label: string): asserts value is CAL002OriginDecisionRow {
  if (!isRecord(value)) throw new TypeError(label + ' must be an object');
  if (typeof value.ruleId !== 'string' || value.ruleId.length === 0) {
    throw new TypeError(label + '.ruleId must be a non-empty rule ID');
  }
  if (
    value.disposition !== 'hold-origin-default-off'
    && value.disposition !== 'transfer-to-quality'
    && value.disposition !== 'retire'
  ) {
    throw new TypeError(label + '.disposition is invalid');
  }
  if (value.disposition === 'hold-origin-default-off') {
    assertExactKeys(value, ['ruleId', 'disposition'], label);
    return;
  }
  if (value.disposition === 'transfer-to-quality') {
    assertExactKeys(value, ['ruleId', 'disposition', 'reason'], label);
    if (!TRANSFER_REASONS.includes(value.reason as (typeof TRANSFER_REASONS)[number])) {
      throw new TypeError(label + '.reason is invalid for transfer-to-quality');
    }
    return;
  }
  assertExactKeys(value, ['ruleId', 'disposition', 'reason'], label);
  if (value.reason !== 'duplicate-or-obsolete') {
    throw new TypeError(label + '.reason must be duplicate-or-obsolete for retirement');
  }
}

function originRows(catalog: CAL002Catalog) {
  return catalog.rows.filter((row) => row.lane === 'origin');
}

export function resolveCAL002OriginDecisions(input: {
  readonly catalog: CAL002Catalog;
  readonly decisions: readonly CAL002OriginDecisionRow[];
  readonly allowIncomplete?: boolean;
}): CAL002OriginResolution {
  if (!isRecord(input)) throw new TypeError('CAL-002 origin decision input must be an object');
  assertOriginCatalog(input.catalog);
  if (!Array.isArray(input.decisions)) throw new TypeError('CAL-002 origin decisions must be an array');
  if (input.allowIncomplete !== undefined && typeof input.allowIncomplete !== 'boolean') {
    throw new TypeError('CAL-002 origin allowIncomplete must be boolean');
  }

  const allOriginRows = originRows(input.catalog);
  if (allOriginRows.length !== CAL002_LOCKED_COUNTS.startingOrigin) {
    throw new TypeError('CAL-002 origin catalog does not contain exactly 72 origin rows');
  }
  const byRuleId = new Map(allOriginRows.map((row) => [row.ruleId, row]));
  const supplied = new Map<string, CAL002OriginDecisionRow>();
  for (const [index, candidate] of input.decisions.entries()) {
    assertDecisionRow(candidate, 'CAL-002 origin decision[' + index + ']');
    if (!byRuleId.has(candidate.ruleId)) {
      throw new TypeError('CAL-002 origin decision names an unknown or quality rule ' + candidate.ruleId);
    }
    if (supplied.has(candidate.ruleId)) {
      throw new TypeError('CAL-002 origin decision duplicates ' + candidate.ruleId);
    }
    supplied.set(candidate.ruleId, {
      ...(candidate.reason === undefined
        ? { ruleId: candidate.ruleId, disposition: candidate.disposition }
        : { ruleId: candidate.ruleId, disposition: candidate.disposition, reason: candidate.reason }),
    });
  }

  const resolved = new Map<string, CAL002OriginDecisionRow>();
  const unresolved: string[] = [];
  for (const row of allOriginRows) {
    if (!row.ownerReviewRequired) {
      if (!row.existingDefaultOff) {
        throw new TypeError('CAL-002 non-owner origin row ' + row.ruleId + ' is not already default-off');
      }
      if (supplied.has(row.ruleId)) {
        throw new TypeError('CAL-002 auto-held origin row ' + row.ruleId + ' cannot receive an owner decision');
      }
      resolved.set(row.ruleId, { ruleId: row.ruleId, disposition: 'hold-origin-default-off' });
      continue;
    }
    const decision = supplied.get(row.ruleId);
    if (decision === undefined) {
      unresolved.push(row.ruleId);
    } else {
      resolved.set(row.ruleId, decision);
    }
  }
  if (unresolved.length > 0 && input.allowIncomplete !== true) {
    throw new TypeError('CAL-002 origin decisions have unresolved owner rows: ' + unresolved.join(', '));
  }
  const rows = [...resolved.values()].sort((left, right) =>
    compareCodePoints(left.ruleId, right.ruleId));
  return { rows, unresolvedRuleIds: unresolved.sort(compareCodePoints) };
}

function assertGoverningHashes(
  hashes: CAL002OriginGoverningHashes,
  label: string,
): void {
  if (!isRecord(hashes)) throw new TypeError(label + ' must be an object');
  assertExactKeys(hashes, HASH_KEYS, label);
  for (const key of HASH_KEYS) {
    if (key === 'scannerCommitSha') assertCommitSha(hashes[key], label + '.' + key);
    else assertSha256(hashes[key], label + '.' + key);
  }
}

function assertPartialGoverningHashes(
  hashes: Partial<CAL002OriginGoverningHashes>,
  label: string,
): void {
  if (!isRecord(hashes)) throw new TypeError(label + ' must be an object');
  const allowed = new Set<string>(HASH_KEYS);
  for (const key of Object.keys(hashes)) {
    if (!allowed.has(key)) throw new TypeError(label + '.' + key + ' is unknown');
  }
  for (const key of HASH_KEYS) {
    const value = hashes[key];
    if (value === undefined) continue;
    if (key === 'scannerCommitSha') assertCommitSha(value, label + '.' + key);
    else assertSha256(value, label + '.' + key);
  }
}

function mismatchKeys(
  actual: Partial<CAL002OriginGoverningHashes>,
  expected: CAL002OriginGoverningHashes,
): readonly HashKey[] {
  return HASH_KEYS.filter((key) => actual[key] !== expected[key]);
}

export function assessCAL002CAL001Reuse(
  input: AssessCAL002CAL001ReuseInput,
): CAL002CAL001ReuseResult {
  if (!isRecord(input)) throw new TypeError('CAL-002 CAL-001 reuse input must be an object');
  assertPartialGoverningHashes(input.governingHashes, 'CAL-002 actual governing hashes');
  assertGoverningHashes(input.expectedGoverningHashes, 'CAL-002 expected governing hashes');
  const mismatches = mismatchKeys(input.governingHashes, input.expectedGoverningHashes);
  if (mismatches.length === 0) {
    return {
      status: 'reused',
      mismatches: [],
      rerunCommand: CAL001_RERUN_COMMAND,
      requiredWorkerCount: 1,
    };
  }
  if (input.rerunEvidence !== undefined) {
    if (!isRecord(input.rerunEvidence) || input.rerunEvidence.workerCount !== 1) {
      throw new TypeError('CAL-002 CAL-001 rerun evidence requires exactly one worker');
    }
    assertGoverningHashes(input.rerunEvidence.governingHashes, 'CAL-002 rerun governing hashes');
    const rerunMismatches = mismatchKeys(
      input.rerunEvidence.governingHashes,
      input.expectedGoverningHashes,
    );
    if (rerunMismatches.length === 0) {
      return {
        status: 'rerun-completed',
        mismatches,
        rerunCommand: CAL001_RERUN_COMMAND,
        requiredWorkerCount: 1,
      };
    }
    return {
      status: 'rerun-required',
      mismatches: rerunMismatches,
      rerunCommand: CAL001_RERUN_COMMAND,
      requiredWorkerCount: 1,
    };
  }
  return {
    status: 'rerun-required',
    mismatches,
    rerunCommand: CAL001_RERUN_COMMAND,
    requiredWorkerCount: 1,
  };
}

export function buildCAL002OriginReceipt(
  input: BuildCAL002OriginReceiptInput,
): CAL002OriginReceiptResult {
  if (!isRecord(input)) throw new TypeError('CAL-002 origin receipt input must be an object');
  assertOriginCatalog(input.catalog);
  assertGoverningHashes(input.governingHashes, 'CAL-002 origin governing hashes');
  assertCommitSha(input.originImplementationCommitSha, 'originImplementationCommitSha');
  if (
    input.status !== 'reused'
    && input.status !== 'rerun-required'
    && input.status !== 'rerun-completed'
  ) {
    throw new TypeError('CAL-002 origin receipt status is invalid');
  }
  if (input.governingHashes.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256) {
    throw new TypeError('CAL-002 origin governing catalog hash does not match the locked catalog');
  }
  const resolution = resolveCAL002OriginDecisions({
    catalog: input.catalog,
    decisions: input.decisions,
  });
  const receipt: CAL002OriginReceipt = {
    version: CAL002_ORIGIN_RECEIPT_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    originImplementationCommitSha: input.originImplementationCommitSha,
    status: input.status,
    governingHashes: input.governingHashes,
    rows: resolution.rows,
    admitted: false,
  };
  const validation = validateCAL002OriginReceipt(receipt);
  if (!validation.ok) {
    throw new TypeError('CAL-002 origin receipt is invalid: ' + validation.errors.join('; '));
  }
  const artifact = canonicalArtifact(receipt);
  return {
    receipt,
    receiptJson: artifact.json,
    receiptSha256: artifact.sha256,
  };
}

export const CAL002_CAL001_RERUN_COMMAND = CAL001_RERUN_COMMAND;
