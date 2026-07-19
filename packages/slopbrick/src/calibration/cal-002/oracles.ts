import {
  CAL002_CONTEXTUAL_RULE_IDS,
  CAL002_DETERMINISTIC_RULE_IDS,
  CAL002_LOCKED_RULE_IDS,
  CAL002_PROTOCOL_VERSION,
  CAL002_STATISTICAL_RULE_IDS,
  assertCommitSha,
  assertSha256,
  canonicalArtifact,
} from './contracts';

export const CAL002_ORACLE_RECEIPT_VERSION = 'cal-002-oracle-receipt-v1' as const;

export type CAL002DeterministicRuleId = (typeof CAL002_DETERMINISTIC_RULE_IDS)[number];
export type CAL002OracleAuthority = 'language-contract' | 'security-contract' | 'wcag-22' | 'repository-contract';
export type CAL002OracleObservation = 'finding' | 'no-finding';

export interface CAL002OracleDeclaration {
  readonly ruleId: string;
  readonly authority: CAL002OracleAuthority;
  readonly reference: string;
  readonly positiveCaseIds: readonly string[];
  readonly negativeCaseIds: readonly string[];
}

export interface CAL002StandardsTransfer {
  readonly ruleId: string;
  readonly reason: 'standards-or-contract-quality-claim';
}

export interface CAL002OracleCaseResult {
  readonly ruleId: string;
  readonly caseId: string;
  readonly expected: CAL002OracleObservation;
  readonly observed: CAL002OracleObservation;
  readonly sourceSha256: string;
}

export interface CAL002OracleSourceControl {
  readonly ruleId: string;
  readonly unitId: string;
  readonly familyId: string;
  readonly contentSha256: string;
  readonly observed: CAL002OracleObservation;
}

export interface BuildCAL002OracleReceiptInput {
  readonly catalogSha256: string;
  readonly implementationCommitSha: string;
  readonly transfers?: readonly CAL002StandardsTransfer[];
  readonly declarations: readonly CAL002OracleDeclaration[];
  readonly caseResults: readonly CAL002OracleCaseResult[];
  readonly sourceControls: readonly CAL002OracleSourceControl[];
}

export interface CAL002OracleReceiptRow {
  readonly ruleId: string;
  readonly transferred: boolean;
  readonly declaration?: {
    readonly authority: CAL002OracleAuthority;
    readonly reference: string;
    readonly positiveCaseIds: readonly string[];
    readonly negativeCaseIds: readonly string[];
  };
  readonly caseResults: readonly Omit<CAL002OracleCaseResult, 'ruleId'>[];
  readonly sourceControls: readonly Omit<CAL002OracleSourceControl, 'ruleId'>[];
  readonly status: 'pass' | 'fail';
  readonly outcome: 'default-on' | 'default-off';
  readonly failures: readonly string[];
  readonly admitted: false;
}

export interface CAL002OracleReceipt {
  readonly version: typeof CAL002_ORACLE_RECEIPT_VERSION;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION;
  readonly catalogSha256: string;
  readonly implementationCommitSha: string;
  readonly rows: readonly CAL002OracleReceiptRow[];
  readonly admitted: false;
}

export interface CAL002OracleReceiptResult {
  readonly receipt: CAL002OracleReceipt;
  readonly receiptJson: string;
  readonly receiptSha256: string;
}

const AUTHORITIES: ReadonlySet<unknown> = new Set([
  'language-contract',
  'security-contract',
  'wcag-22',
  'repository-contract',
]);
const OBSERVATIONS: ReadonlySet<unknown> = new Set(['finding', 'no-finding']);
const RULE_ID = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/u;
const ORACLE_ID = /^[a-z0-9][a-z0-9-]*$/u;
const STARTING_QUALITY_IDS = new Set<string>([
  ...CAL002_DETERMINISTIC_RULE_IDS,
  ...CAL002_CONTEXTUAL_RULE_IDS,
  ...CAL002_STATISTICAL_RULE_IDS,
]);
const FROZEN_ORIGIN_IDS = new Set<string>(CAL002_LOCKED_RULE_IDS.filter((ruleId) => !STARTING_QUALITY_IDS.has(ruleId)));

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function requireArray(value: unknown, label: string): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
}

function requireRuleId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !RULE_ID.test(value)) throw new TypeError(`${label} must be a canonical rule ID`);
}

function requireOracleId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !ORACLE_ID.test(value)) {
    throw new TypeError(`${label} must be a canonical oracle ID`);
  }
}

function requireOracleIdArray(value: unknown, label: string): readonly string[] {
  requireArray(value, label);
  return value.map((item, index) => {
    requireOracleId(item, `${label}[${index}]`);
    return item;
  });
}

function requireObservation(value: unknown, label: string): asserts value is CAL002OracleObservation {
  if (!OBSERVATIONS.has(value)) {
    throw new TypeError(`${label} must be finding or no-finding`);
  }
}

function addUnique<T>(target: Map<string, T>, key: string, value: T, label: string): void {
  if (target.has(key)) throw new TypeError(`Duplicate ${label} ${key}`);
  target.set(key, value);
}

interface IndexedDeclaration {
  readonly ruleId: string;
  readonly authority: unknown;
  readonly reference: unknown;
  readonly positiveCaseIds: readonly string[];
  readonly negativeCaseIds: readonly string[];
}

function isOracleAuthority(value: unknown): value is CAL002OracleAuthority {
  return AUTHORITIES.has(value);
}

function declarationFailures(declaration: IndexedDeclaration | undefined): string[] {
  if (!declaration) return ['missing-declaration'];
  const failures: string[] = [];
  if (!isOracleAuthority(declaration.authority)) failures.push('invalid-authority');
  if (typeof declaration.reference !== 'string' || declaration.reference.trim().length === 0) failures.push('missing-reference');
  if (declaration.positiveCaseIds.length === 0) failures.push('missing-positive-case');
  if (declaration.negativeCaseIds.length === 0) failures.push('missing-negative-case');
  const allIds = [...declaration.positiveCaseIds, ...declaration.negativeCaseIds];
  if (allIds.some((caseId) => typeof caseId !== 'string' || caseId.length === 0)) failures.push('invalid-case-id');
  if (new Set(allIds).size !== allIds.length) failures.push('duplicate-declared-case-id');
  return failures;
}

function caseFailures(
  declaration: IndexedDeclaration | undefined,
  caseResults: readonly CAL002OracleCaseResult[],
): string[] {
  if (!declaration) return caseResults.length === 0 ? [] : ['cases-without-declaration'];
  const failures: string[] = [];
  const expectedById = new Map<string, CAL002OracleObservation>();
  for (const caseId of declaration.positiveCaseIds) expectedById.set(caseId, 'finding');
  for (const caseId of declaration.negativeCaseIds) expectedById.set(caseId, 'no-finding');
  const observedIds = new Set(caseResults.map((result) => result.caseId));
  if (expectedById.size !== caseResults.length || [...expectedById.keys()].some((caseId) => !observedIds.has(caseId))) {
    failures.push('case-coverage-mismatch');
  }
  for (const result of caseResults) {
    if (expectedById.get(result.caseId) !== result.expected) failures.push('case-polarity-mismatch');
    if (result.expected !== result.observed) failures.push('unexpected-case-observation');
  }
  return failures;
}

function controlFailures(sourceControls: readonly CAL002OracleSourceControl[]): string[] {
  const failures: string[] = [];
  if (sourceControls.length < 5) failures.push('insufficient-source-controls');
  if (new Set(sourceControls.map((control) => control.familyId)).size < 5) failures.push('insufficient-control-families');
  if (sourceControls.some((control) => control.observed !== 'no-finding')) failures.push('unexpected-source-control-observation');
  return failures;
}

function canProjectDeclaration(declaration: IndexedDeclaration): declaration is IndexedDeclaration & {
  readonly authority: CAL002OracleAuthority;
  readonly reference: string;
} {
  return isOracleAuthority(declaration.authority)
    && typeof declaration.reference === 'string'
    && declaration.reference.trim().length > 0;
}

function indexTransfers(transferRows: readonly unknown[]): Map<string, CAL002StandardsTransfer> {
  const startingIds = new Set<string>(CAL002_DETERMINISTIC_RULE_IDS);
  const transfers = new Map<string, CAL002StandardsTransfer>();
  for (const [index, transfer] of transferRows.entries()) {
    requireRecord(transfer, `Oracle transfer[${index}]`);
    requireRuleId(transfer.ruleId, 'Oracle transfer ruleId');
    if (transfer.reason !== 'standards-or-contract-quality-claim') {
      throw new TypeError(`Oracle transfer ${transfer.ruleId} has an invalid reason`);
    }
    if (startingIds.has(transfer.ruleId)) {
      throw new TypeError(`Oracle transfer ${transfer.ruleId} duplicates a starting deterministic rule`);
    }
    if (!FROZEN_ORIGIN_IDS.has(transfer.ruleId)) {
      throw new TypeError(`Oracle transfer ${transfer.ruleId} is not a frozen origin row`);
    }
    addUnique(transfers, transfer.ruleId, { ruleId: transfer.ruleId, reason: transfer.reason }, 'oracle transfer');
  }
  return transfers;
}

function indexDeclarations(
  declarationRows: readonly unknown[],
  finalIdSet: ReadonlySet<string>,
): Map<string, IndexedDeclaration> {
  const declarations = new Map<string, IndexedDeclaration>();
  for (const [index, declaration] of declarationRows.entries()) {
    requireRecord(declaration, `Oracle declaration[${index}]`);
    requireRuleId(declaration.ruleId, 'Oracle declaration ruleId');
    if (!finalIdSet.has(declaration.ruleId)) {
      throw new TypeError(`Extra oracle declaration ${declaration.ruleId} is not in the final deterministic set`);
    }
    const positiveCaseIds = requireOracleIdArray(
      declaration.positiveCaseIds,
      `Oracle declaration ${declaration.ruleId} positiveCaseIds`,
    );
    const negativeCaseIds = requireOracleIdArray(
      declaration.negativeCaseIds,
      `Oracle declaration ${declaration.ruleId} negativeCaseIds`,
    );
    addUnique(declarations, declaration.ruleId, {
      ruleId: declaration.ruleId,
      authority: declaration.authority,
      reference: declaration.reference,
      positiveCaseIds,
      negativeCaseIds,
    }, 'oracle declaration');
  }
  return declarations;
}

function indexCaseResults(
  caseRows: readonly unknown[],
  finalIdSet: ReadonlySet<string>,
): Map<string, CAL002OracleCaseResult[]> {
  const bindings = new Map<string, CAL002OracleCaseResult>();
  const casesByRule = new Map<string, CAL002OracleCaseResult[]>();
  for (const [index, result] of caseRows.entries()) {
    requireRecord(result, `Oracle case result[${index}]`);
    requireRuleId(result.ruleId, 'Oracle case result ruleId');
    requireOracleId(result.caseId, 'Oracle case result caseId');
    requireObservation(result.expected, `Oracle case result ${result.ruleId}/${result.caseId} expected`);
    requireObservation(result.observed, `Oracle case result ${result.ruleId}/${result.caseId} observed`);
    assertSha256(result.sourceSha256, `Oracle case result ${result.ruleId}/${result.caseId} sourceSha256`);
    if (!finalIdSet.has(result.ruleId)) {
      throw new TypeError(`Oracle case result ${result.ruleId}/${result.caseId} is not in the final deterministic set`);
    }
    const projected = {
      ruleId: result.ruleId,
      caseId: result.caseId,
      expected: result.expected,
      observed: result.observed,
      sourceSha256: result.sourceSha256,
    };
    addUnique(bindings, `${result.ruleId}\0${result.caseId}`, projected, 'oracle case result');
    casesByRule.set(result.ruleId, [...(casesByRule.get(result.ruleId) ?? []), projected]);
  }
  return casesByRule;
}

function indexSourceControls(
  controlRows: readonly unknown[],
  finalIdSet: ReadonlySet<string>,
): Map<string, CAL002OracleSourceControl[]> {
  const bindings = new Map<string, CAL002OracleSourceControl>();
  const controlsByRule = new Map<string, CAL002OracleSourceControl[]>();
  for (const [index, control] of controlRows.entries()) {
    requireRecord(control, `Oracle source control[${index}]`);
    requireRuleId(control.ruleId, 'Oracle source control ruleId');
    requireOracleId(control.unitId, 'Oracle source control unitId');
    requireOracleId(control.familyId, 'Oracle source control familyId');
    requireObservation(control.observed, `Oracle source control ${control.ruleId}/${control.unitId} observed`);
    assertSha256(control.contentSha256, `Oracle source control ${control.ruleId}/${control.unitId} contentSha256`);
    if (!finalIdSet.has(control.ruleId)) {
      throw new TypeError(`Oracle source control ${control.ruleId}/${control.unitId} is not in the final deterministic set`);
    }
    const projected = {
      ruleId: control.ruleId,
      unitId: control.unitId,
      familyId: control.familyId,
      contentSha256: control.contentSha256,
      observed: control.observed,
    };
    addUnique(bindings, `${control.ruleId}\0${control.unitId}`, projected, 'oracle source control');
    controlsByRule.set(control.ruleId, [...(controlsByRule.get(control.ruleId) ?? []), projected]);
  }
  return controlsByRule;
}

interface BuildOracleRowInput {
  readonly ruleId: string;
  readonly transferred: boolean;
  readonly declaration?: IndexedDeclaration;
  readonly caseResults: readonly CAL002OracleCaseResult[];
  readonly sourceControls: readonly CAL002OracleSourceControl[];
}

function buildOracleRow(input: BuildOracleRowInput): CAL002OracleReceiptRow {
  const ruleCases = [...input.caseResults].sort((left, right) => compareCodePoints(left.caseId, right.caseId));
  const ruleControls = [...input.sourceControls].sort((left, right) => compareCodePoints(left.unitId, right.unitId));
  const failures = [...new Set([
    ...declarationFailures(input.declaration),
    ...caseFailures(input.declaration, ruleCases),
    ...controlFailures(ruleControls),
  ])].sort(compareCodePoints);
  const status = failures.length === 0 ? 'pass' : 'fail';
  return {
    ruleId: input.ruleId,
    transferred: input.transferred,
    ...(input.declaration && canProjectDeclaration(input.declaration) ? {
      declaration: {
        authority: input.declaration.authority,
        reference: input.declaration.reference,
        positiveCaseIds: [...input.declaration.positiveCaseIds].sort(compareCodePoints),
        negativeCaseIds: [...input.declaration.negativeCaseIds].sort(compareCodePoints),
      },
    } : {}),
    caseResults: ruleCases.map(({ caseId, expected, observed, sourceSha256 }) => ({
      caseId, expected, observed, sourceSha256,
    })),
    sourceControls: ruleControls.map(({ unitId, familyId, contentSha256, observed }) => ({
      unitId, familyId, contentSha256, observed,
    })),
    status,
    outcome: status === 'pass' ? 'default-on' : 'default-off',
    failures,
    admitted: false,
  };
}

export function buildCAL002OracleReceipt(input: BuildCAL002OracleReceiptInput): CAL002OracleReceiptResult {
  requireRecord(input, 'Oracle receipt input');
  assertSha256(input.catalogSha256, 'catalogSha256');
  assertCommitSha(input.implementationCommitSha, 'implementationCommitSha');

  const transferRows = input.transfers === undefined ? [] : input.transfers;
  requireArray(transferRows, 'Oracle transfers');
  requireArray(input.declarations, 'Oracle declarations');
  requireArray(input.caseResults, 'Oracle case results');
  requireArray(input.sourceControls, 'Oracle source controls');

  const transfers = indexTransfers(transferRows);
  const finalIds = [...CAL002_DETERMINISTIC_RULE_IDS, ...transfers.keys()].sort(compareCodePoints);
  const finalIdSet = new Set(finalIds);
  const declarations = indexDeclarations(input.declarations, finalIdSet);
  const casesByRule = indexCaseResults(input.caseResults, finalIdSet);
  const controlsByRule = indexSourceControls(input.sourceControls, finalIdSet);
  const rows = finalIds.map((ruleId) => buildOracleRow({
    ruleId,
    transferred: transfers.has(ruleId),
    declaration: declarations.get(ruleId),
    caseResults: casesByRule.get(ruleId) ?? [],
    sourceControls: controlsByRule.get(ruleId) ?? [],
  }));

  const receipt: CAL002OracleReceipt = {
    version: CAL002_ORACLE_RECEIPT_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: input.catalogSha256,
    implementationCommitSha: input.implementationCommitSha,
    rows,
    admitted: false,
  };
  const artifact = canonicalArtifact(receipt);
  return { receipt, receiptJson: artifact.json, receiptSha256: artifact.sha256 };
}
