import {
  canonicalArtifact,
  type CAL002ValidationResult,
} from './contracts';
import {
  CAL002_PROTOCOL_VERSION_V2,
  assertCAL002AuthorityReceiptV2,
  type CAL002AuthorityReceiptV2,
} from './contracts-v2';

export const CAL002_PARITY_RECEIPT_VERSION = 'cal-002-parity-receipt-v2' as const;
export const CAL002_SUPERSESSION_RECEIPT_VERSION = 'cal-002-supersession-receipt-v2' as const;

export interface CAL002ParityCaseResultV2 {
  readonly caseId: string;
  readonly sourceSha256: string;
  readonly expectedReplacementObservation: 'finding' | 'no-finding';
  readonly observedReplacementObservation: 'finding' | 'no-finding';
}

export interface CAL002ParityReceiptV2 {
  readonly version: typeof CAL002_PARITY_RECEIPT_VERSION;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION_V2;
  readonly authorityReceiptSha256: string;
  readonly ruleId: 'db/sql-concat' | 'logic/math-any-density' | 'logic/math-console-log-storm';
  readonly replacementRuleId: 'security/sql-construction' | 'ai/any-density' | 'ai/console-debug-storm';
  readonly migrationCommitSha: string;
  readonly uniqueCoverageDisposition: 'ported' | 'rejected-as-false-positive' | 'split-to-new-rule';
  readonly splitRuleId?: string;
  readonly reasonCode:
    | 'with-query-coverage-ported'
    | 'line-denominator-not-type-bearing'
    | 'window-clustering-ported-with-guards';
  readonly caseResults: readonly CAL002ParityCaseResultV2[];
  readonly status: 'passed';
  readonly admitted: false;
}

export interface CAL002SupersessionRowV2 {
  readonly ruleId: CAL002ParityReceiptV2['ruleId'];
  readonly replacementRuleId: CAL002ParityReceiptV2['replacementRuleId'];
  readonly parityReceiptSha256: string;
  readonly migrationCommitSha: string;
  readonly uniqueCoverageDisposition: CAL002ParityReceiptV2['uniqueCoverageDisposition'];
  readonly splitRuleId?: string;
}

export interface CAL002SupersessionReceiptV2 {
  readonly version: typeof CAL002_SUPERSESSION_RECEIPT_VERSION;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION_V2;
  readonly authorityReceiptSha256: string;
  readonly rows: readonly CAL002SupersessionRowV2[];
  readonly admitted: false;
}

export interface BuildCAL002ParityReceiptInputV2 {
  readonly authorityReceipt: CAL002AuthorityReceiptV2;
  readonly ruleId: CAL002ParityReceiptV2['ruleId'];
  readonly replacementRuleId: CAL002ParityReceiptV2['replacementRuleId'];
  readonly migrationCommitSha: string;
  readonly uniqueCoverageDisposition: CAL002ParityReceiptV2['uniqueCoverageDisposition'];
  readonly splitRuleId?: string;
  readonly reasonCode: CAL002ParityReceiptV2['reasonCode'];
  readonly caseResults: readonly CAL002ParityCaseResultV2[];
}

export interface CAL002ParityReceiptResultV2 {
  readonly receipt: CAL002ParityReceiptV2;
  readonly receiptJson: string;
  readonly receiptSha256: string;
}

export interface CAL002SupersessionReceiptResultV2 {
  readonly receipt: CAL002SupersessionReceiptV2;
  readonly receiptJson: string;
  readonly receiptSha256: string;
}

type ParityObservation = CAL002ParityCaseResultV2['expectedReplacementObservation'];
type SupersededRuleId = CAL002ParityReceiptV2['ruleId'];

interface FixedParityCase {
  readonly caseId: string;
  readonly observation: ParityObservation;
}

interface FixedParityAuthority {
  readonly replacementRuleId: CAL002ParityReceiptV2['replacementRuleId'];
  readonly reasonCode: CAL002ParityReceiptV2['reasonCode'];
  readonly cases: readonly FixedParityCase[];
}

const CANONICAL_SUPERSEDED_RULE_IDS = [
  'db/sql-concat',
  'logic/math-any-density',
  'logic/math-console-log-storm',
] as const satisfies readonly SupersededRuleId[];

const FIXED_PARITY_AUTHORITY: Readonly<Record<SupersededRuleId, FixedParityAuthority>> = {
  'db/sql-concat': {
    replacementRuleId: 'security/sql-construction',
    reasonCode: 'with-query-coverage-ported',
    cases: [
      { caseId: 'sql-with-template-ported', observation: 'finding' },
      { caseId: 'sql-with-parameterized-guard', observation: 'no-finding' },
      { caseId: 'sql-with-comment-guard', observation: 'no-finding' },
    ],
  },
  'logic/math-any-density': {
    replacementRuleId: 'ai/any-density',
    reasonCode: 'line-denominator-not-type-bearing',
    cases: [
      { caseId: 'any-line-density-rejected', observation: 'no-finding' },
      { caseId: 'any-declaration-ratio-retained', observation: 'finding' },
      { caseId: 'any-non-typescript-guard', observation: 'no-finding' },
    ],
  },
  'logic/math-console-log-storm': {
    replacementRuleId: 'ai/console-debug-storm',
    reasonCode: 'window-clustering-ported-with-guards',
    cases: [
      { caseId: 'console-five-in-thirty-ported', observation: 'finding' },
      { caseId: 'console-window-spread-guard', observation: 'no-finding' },
      { caseId: 'console-test-file-guard', observation: 'no-finding' },
      { caseId: 'console-logger-file-guard', observation: 'no-finding' },
      { caseId: 'console-structured-logger-guard', observation: 'no-finding' },
    ],
  },
};

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT_SHA = /^[a-f0-9]{40}$/u;
const RULE_ID = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/u;
const OBSERVATIONS = ['finding', 'no-finding'] as const;
const DISPOSITIONS = ['ported', 'rejected-as-false-positive', 'split-to-new-rule'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fixedAuthority(ruleId: unknown): FixedParityAuthority | undefined {
  if (typeof ruleId !== 'string'
    || !CANONICAL_SUPERSEDED_RULE_IDS.includes(ruleId as SupersededRuleId)) {
    return undefined;
  }
  return FIXED_PARITY_AUTHORITY[ruleId as SupersededRuleId];
}

function keyErrors(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  path: string,
  errors: string[],
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length > 0) errors.push(path + ' has unknown fields: ' + unknown.join(', '));
  if (missing.length > 0) errors.push(path + ' is missing fields: ' + missing.join(', '));
}

function validateSplitRule(
  value: Record<string, unknown>,
  path: string,
  errors: string[],
): void {
  const disposition = value.uniqueCoverageDisposition;
  const hasSplitRuleId = Object.hasOwn(value, 'splitRuleId');
  if (disposition === 'split-to-new-rule') {
    if (!hasSplitRuleId || typeof value.splitRuleId !== 'string' || !RULE_ID.test(value.splitRuleId)) {
      errors.push(path + '.splitRuleId is required for split-to-new-rule disposition');
    }
  } else if (hasSplitRuleId) {
    errors.push(path + '.splitRuleId must not be present unless disposition is split-to-new-rule');
  }
}

function validateCaseResults(
  value: unknown,
  fixed: FixedParityAuthority | undefined,
  path: string,
  errors: string[],
): void {
  if (!Array.isArray(value)) {
    errors.push(path + ' must be an array');
    return;
  }

  const expectedById = new Map(fixed?.cases.map((item) => [item.caseId, item.observation] as const) ?? []);
  const ids: string[] = [];
  let hasFinding = false;
  let hasNoFinding = false;

  for (let index = 0; index < value.length; index += 1) {
    const casePath = path + '[' + index + ']';
    if (!Object.hasOwn(value, index)) {
      errors.push(casePath + ' must be present as an own array element');
      continue;
    }
    const item = value[index];
    if (!isRecord(item)) {
      errors.push(casePath + ' must be an object');
      continue;
    }
    const keys = [
      'caseId',
      'sourceSha256',
      'expectedReplacementObservation',
      'observedReplacementObservation',
    ];
    keyErrors(item, keys, keys, casePath, errors);
    if (typeof item.caseId !== 'string' || item.caseId.length === 0) {
      errors.push(casePath + '.caseId must be a non-empty canonical case ID');
    } else {
      ids.push(item.caseId);
    }
    if (typeof item.sourceSha256 !== 'string' || !SHA256.test(item.sourceSha256)) {
      errors.push(casePath + '.sourceSha256 must be a lowercase SHA-256');
    }
    const expected = item.expectedReplacementObservation;
    const observed = item.observedReplacementObservation;
    if (!OBSERVATIONS.includes(expected as ParityObservation)) {
      errors.push(casePath + '.expectedReplacementObservation is invalid');
    } else {
      hasFinding ||= expected === 'finding';
      hasNoFinding ||= expected === 'no-finding';
    }
    if (!OBSERVATIONS.includes(observed as ParityObservation)) {
      errors.push(casePath + '.observedReplacementObservation is invalid');
    } else if (expected !== observed) {
      errors.push(casePath + ' observed replacement observation must equal expected parity');
    }
    if (typeof item.caseId === 'string' && expectedById.has(item.caseId)
      && expected !== expectedById.get(item.caseId)) {
      errors.push(casePath + ' expected observation does not match its semantic case ID');
    }
  }

  if (!hasFinding) errors.push(path + ' requires at least one positive finding semantic case');
  if (!hasNoFinding) errors.push(path + ' requires at least one guarded no-finding semantic case');
  if (new Set(ids).size !== ids.length) errors.push(path + ' case IDs must be unique');

  if (fixed !== undefined) {
    const expectedIds = fixed.cases.map((item) => item.caseId);
    const unknown = ids.filter((caseId) => !expectedById.has(caseId));
    if (unknown.length > 0) errors.push(path + ' contains unknown case ID: ' + unknown.join(', '));
    if (value.length !== expectedIds.length) {
      errors.push(path + ' must contain the exact canonical semantic cases');
    } else if (ids.some((caseId, index) => caseId !== expectedIds[index])) {
      errors.push(path + ' case IDs must follow canonical order');
    }
  }
}

export function validateCAL002ParityReceiptV2(value: unknown): CAL002ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['artifact must be an object'] };
  const allowed = [
    'version',
    'protocolVersion',
    'authorityReceiptSha256',
    'ruleId',
    'replacementRuleId',
    'migrationCommitSha',
    'uniqueCoverageDisposition',
    'splitRuleId',
    'reasonCode',
    'caseResults',
    'status',
    'admitted',
  ];
  const required = allowed.filter((key) => key !== 'splitRuleId');
  keyErrors(value, allowed, required, 'artifact', errors);
  if (value.version !== CAL002_PARITY_RECEIPT_VERSION) errors.push('artifact.version is invalid');
  if (value.protocolVersion !== CAL002_PROTOCOL_VERSION_V2) errors.push('artifact.protocolVersion is invalid');
  if (typeof value.authorityReceiptSha256 !== 'string' || !SHA256.test(value.authorityReceiptSha256)) {
    errors.push('artifact.authorityReceiptSha256 must be a lowercase SHA-256');
  }
  if (typeof value.migrationCommitSha !== 'string' || !COMMIT_SHA.test(value.migrationCommitSha)) {
    errors.push('artifact.migrationCommitSha must be a lowercase 40-character commit SHA');
  }
  if (!DISPOSITIONS.includes(value.uniqueCoverageDisposition as CAL002ParityReceiptV2['uniqueCoverageDisposition'])) {
    errors.push('artifact.uniqueCoverageDisposition is invalid');
  }
  validateSplitRule(value, 'artifact', errors);

  const fixed = fixedAuthority(value.ruleId);
  if (fixed === undefined) {
    errors.push('artifact.ruleId is not a canonical superseded rule');
  } else {
    if (value.replacementRuleId !== fixed.replacementRuleId) {
      errors.push('artifact replacement mapping is not approved for ' + String(value.ruleId));
    }
    if (value.reasonCode !== fixed.reasonCode) {
      errors.push('artifact.reasonCode is not approved for ' + String(value.ruleId));
    }
  }
  validateCaseResults(value.caseResults, fixed, 'artifact.caseResults', errors);
  if (value.status !== 'passed') errors.push('artifact.status must be passed');
  if (value.admitted !== false) errors.push('artifact.admitted must be false');
  return { ok: errors.length === 0, errors };
}

export function assertCAL002ParityReceiptV2(value: unknown): asserts value is CAL002ParityReceiptV2 {
  const result = validateCAL002ParityReceiptV2(value);
  if (!result.ok) {
    throw new TypeError('CAL-002 v2 parity receipt validation failed: ' + result.errors.join('; '));
  }
}

function validateSupersessionRow(
  value: unknown,
  expectedRuleId: SupersededRuleId,
  index: number,
  errors: string[],
): void {
  const path = 'artifact.rows[' + index + ']';
  if (!isRecord(value)) {
    errors.push(path + ' must be an object');
    return;
  }
  const allowed = [
    'ruleId',
    'replacementRuleId',
    'parityReceiptSha256',
    'migrationCommitSha',
    'uniqueCoverageDisposition',
    'splitRuleId',
  ];
  const required = allowed.filter((key) => key !== 'splitRuleId');
  keyErrors(value, allowed, required, path, errors);
  const fixed = FIXED_PARITY_AUTHORITY[expectedRuleId];
  if (value.ruleId !== expectedRuleId) errors.push(path + '.ruleId must follow canonical supersession order');
  if (value.replacementRuleId !== fixed.replacementRuleId) {
    errors.push(path + '.replacementRuleId does not match the approved mapping');
  }
  if (!DISPOSITIONS.includes(value.uniqueCoverageDisposition as CAL002ParityReceiptV2['uniqueCoverageDisposition'])) {
    errors.push(path + '.uniqueCoverageDisposition is invalid');
  }
  if (typeof value.parityReceiptSha256 !== 'string' || !SHA256.test(value.parityReceiptSha256)) {
    errors.push(path + '.parityReceiptSha256 must be a lowercase SHA-256');
  }
  if (typeof value.migrationCommitSha !== 'string' || !COMMIT_SHA.test(value.migrationCommitSha)) {
    errors.push(path + '.migrationCommitSha must be a lowercase 40-character commit SHA');
  }
  validateSplitRule(value, path, errors);
}

export function validateCAL002SupersessionReceiptV2(value: unknown): CAL002ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['artifact must be an object'] };
  const keys = ['version', 'protocolVersion', 'authorityReceiptSha256', 'rows', 'admitted'];
  keyErrors(value, keys, keys, 'artifact', errors);
  if (value.version !== CAL002_SUPERSESSION_RECEIPT_VERSION) errors.push('artifact.version is invalid');
  if (value.protocolVersion !== CAL002_PROTOCOL_VERSION_V2) errors.push('artifact.protocolVersion is invalid');
  if (typeof value.authorityReceiptSha256 !== 'string' || !SHA256.test(value.authorityReceiptSha256)) {
    errors.push('artifact.authorityReceiptSha256 must be a lowercase SHA-256');
  }
  if (value.admitted !== false) errors.push('artifact.admitted must be false');

  if (!Array.isArray(value.rows)) {
    errors.push('artifact.rows must be an array');
    return { ok: false, errors };
  }
  const rows = value.rows;
  if (rows.length !== CANONICAL_SUPERSEDED_RULE_IDS.length) {
    errors.push('artifact.rows must contain exactly three canonical supersession rows');
  }
  CANONICAL_SUPERSEDED_RULE_IDS.forEach((ruleId, index) => {
    validateSupersessionRow(rows[index], ruleId, index, errors);
  });

  return { ok: errors.length === 0, errors };
}

export function assertCAL002SupersessionReceiptV2(value: unknown): asserts value is CAL002SupersessionReceiptV2 {
  const result = validateCAL002SupersessionReceiptV2(value);
  if (!result.ok) {
    throw new TypeError('CAL-002 v2 supersession receipt validation failed: ' + result.errors.join('; '));
  }
}

export function buildCAL002ParityReceiptV2(
  input: BuildCAL002ParityReceiptInputV2,
): CAL002ParityReceiptResultV2 {
  if (!isRecord(input)) throw new TypeError('CAL-002 parity input must be an object');
  const allowed = [
    'authorityReceipt',
    'ruleId',
    'replacementRuleId',
    'migrationCommitSha',
    'uniqueCoverageDisposition',
    'splitRuleId',
    'reasonCode',
    'caseResults',
  ];
  const required = allowed.filter((key) => key !== 'splitRuleId');
  const inputErrors: string[] = [];
  keyErrors(input, allowed, required, 'CAL-002 parity input', inputErrors);
  if (inputErrors.length > 0) throw new TypeError(inputErrors.join('; '));
  assertCAL002AuthorityReceiptV2(input.authorityReceipt);

  const receipt: CAL002ParityReceiptV2 = {
    version: CAL002_PARITY_RECEIPT_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION_V2,
    authorityReceiptSha256: canonicalArtifact(input.authorityReceipt).sha256,
    ruleId: input.ruleId,
    replacementRuleId: input.replacementRuleId,
    migrationCommitSha: input.migrationCommitSha,
    uniqueCoverageDisposition: input.uniqueCoverageDisposition,
    ...(input.splitRuleId === undefined ? {} : { splitRuleId: input.splitRuleId }),
    reasonCode: input.reasonCode,
    caseResults: input.caseResults,
    status: 'passed',
    admitted: false,
  };
  assertCAL002ParityReceiptV2(receipt);
  const artifact = canonicalArtifact(receipt);
  return { receipt, receiptJson: artifact.json, receiptSha256: artifact.sha256 };
}

export function buildCAL002SupersessionReceiptV2(
  authorityReceipt: CAL002AuthorityReceiptV2,
  parityReceipts: readonly CAL002ParityReceiptV2[],
): CAL002SupersessionReceiptResultV2 {
  assertCAL002AuthorityReceiptV2(authorityReceipt);
  if (!Array.isArray(parityReceipts) || parityReceipts.length !== CANONICAL_SUPERSEDED_RULE_IDS.length) {
    throw new TypeError('CAL-002 supersession requires exactly three parity receipts with no missing row');
  }
  const expectedAuthoritySha256 = canonicalArtifact(authorityReceipt).sha256;
  const byRuleId = new Map<SupersededRuleId, CAL002ParityReceiptV2>();
  for (const parityReceipt of parityReceipts) {
    assertCAL002ParityReceiptV2(parityReceipt);
    if (parityReceipt.authorityReceiptSha256 !== expectedAuthoritySha256) {
      throw new TypeError('CAL-002 parity authorityReceiptSha256 does not match the approved authority hash');
    }
    if (byRuleId.has(parityReceipt.ruleId)) {
      throw new TypeError('CAL-002 supersession contains duplicate parity receipt for ' + parityReceipt.ruleId);
    }
    byRuleId.set(parityReceipt.ruleId, parityReceipt);
  }
  const missing = CANONICAL_SUPERSEDED_RULE_IDS.filter((ruleId) => !byRuleId.has(ruleId));
  if (missing.length > 0) {
    throw new TypeError('CAL-002 supersession is missing canonical parity receipt: ' + missing.join(', '));
  }

  const rows = CANONICAL_SUPERSEDED_RULE_IDS.map((ruleId): CAL002SupersessionRowV2 => {
    const parityReceipt = byRuleId.get(ruleId);
    if (parityReceipt === undefined) throw new TypeError('CAL-002 supersession is missing ' + ruleId);
    return {
      ruleId,
      replacementRuleId: parityReceipt.replacementRuleId,
      parityReceiptSha256: canonicalArtifact(parityReceipt).sha256,
      migrationCommitSha: parityReceipt.migrationCommitSha,
      uniqueCoverageDisposition: parityReceipt.uniqueCoverageDisposition,
      ...(parityReceipt.splitRuleId === undefined ? {} : { splitRuleId: parityReceipt.splitRuleId }),
    };
  });
  const parityReceiptHashes = rows.map((row) => row.parityReceiptSha256);
  if (new Set(parityReceiptHashes).size !== rows.length) {
    throw new TypeError('CAL-002 supersession parity receipt hash collision or duplicate binding');
  }
  const receipt: CAL002SupersessionReceiptV2 = {
    version: CAL002_SUPERSESSION_RECEIPT_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION_V2,
    authorityReceiptSha256: expectedAuthoritySha256,
    rows,
    admitted: false,
  };
  assertCAL002SupersessionReceiptV2(receipt);
  const artifact = canonicalArtifact(receipt);
  return { receipt, receiptJson: artifact.json, receiptSha256: artifact.sha256 };
}
