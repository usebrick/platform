import { createHash } from 'node:crypto';

import {
  CORPUS_V1_SOURCE_BINDING_VERSION,
  type CorpusV1SourceBindingResult,
} from '../corpus-v1/source-binding';
import { CAL001_FROZEN_INPUT_HASHES } from '../corpus-v1/calibration-inputs';
import { canonicalJson } from '../v103/canonical';
import {
  CAL002_DETERMINISTIC_RULE_IDS,
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  assertCommitSha,
  assertSha256,
  canonicalArtifact,
} from './contracts';
import {
  CAL002_PROTOCOL_VERSION_V2,
  assertCAL002AuthorityReceiptV2,
  type CAL002AuthorityReceiptV2,
} from './contracts-v2';
import {
  CAL002_ORACLE_RECEIPT_VERSION,
  buildCAL002OracleReceipt,
  type CAL002OracleAuthority,
  type CAL002OracleObservation,
  type CAL002OracleReceipt,
} from './oracles';

export const CAL002_ORACLE_RECEIPT_VERSION_V2 = 'cal-002-oracle-receipt-v2' as const;

export const CAL002_REAL_SOURCE_CONTROL_FAMILIES = [
  'alternate-syntax',
  'baseline',
  'comment-adjacent',
  'near-miss',
  'regression-safe',
] as const;

type TransferControlFamily = (typeof CAL002_REAL_SOURCE_CONTROL_FAMILIES)[number];

export interface CAL002TransferOracleSourceCaseV2 {
  readonly caseId: string;
  readonly virtualPath: string;
  readonly source: string;
  readonly familyId?: TransferControlFamily;
}

export interface CAL002TransferredOracleFixtureV2 {
  readonly ruleId: string;
  readonly authority: CAL002OracleAuthority;
  readonly reference: string;
  readonly execution: {
    readonly mode: 'source-text';
    readonly context: { readonly virtualSourcePath: string };
  };
  readonly positiveCases: readonly CAL002TransferOracleSourceCaseV2[];
  readonly negativeCases: readonly CAL002TransferOracleSourceCaseV2[];
  readonly adversarialCases: readonly CAL002TransferOracleSourceCaseV2[];
  readonly controls: readonly CAL002TransferOracleSourceCaseV2[];
}

export interface CAL002TransferOracleObservationV2 {
  readonly ruleId: string;
  readonly caseId: string;
  readonly observed: CAL002OracleObservation;
  readonly sourceSha256: string;
}

export interface CAL002RealSourceControlInputV2 {
  readonly ruleId: string;
  readonly familyId: string;
  /** Transient scan input. This value is hashed and never projected into the receipt. */
  readonly source: string;
  readonly contentSha256: string;
  readonly sourceBindingReceiptSha256: string;
  readonly observed: CAL002OracleObservation;
}

export interface CAL002RealSourceControlV2 {
  readonly controlId: string;
  readonly familyId: string;
  readonly contentSha256: string;
  readonly sourceBindingReceiptSha256: string;
  readonly observed: 'no-finding';
}

export interface CAL002OracleCaseResultV2 {
  readonly caseId: string;
  readonly expected: CAL002OracleObservation;
  readonly observed: CAL002OracleObservation;
  readonly sourceSha256: string;
}

export interface CAL002FixtureControlV2 {
  readonly caseId: string;
  readonly familyId: string;
  readonly contentSha256: string;
  readonly observed: CAL002OracleObservation;
}

export interface CAL002OracleReceiptRowV2 {
  readonly ruleId: string;
  readonly transferred: boolean;
  readonly declaration: {
    readonly authority: CAL002OracleAuthority;
    readonly reference: string;
    readonly positiveCaseIds: readonly string[];
    readonly negativeCaseIds: readonly string[];
  };
  readonly caseResults: readonly CAL002OracleCaseResultV2[];
  readonly fixtureControls: readonly CAL002FixtureControlV2[];
  readonly realSourceControls: readonly CAL002RealSourceControlV2[];
  readonly status: 'passed' | 'failed';
  readonly outcome: 'default-on' | 'default-off';
  readonly failures: readonly string[];
  readonly admitted: false;
}

export interface CAL002OracleReceiptV2 {
  readonly version: typeof CAL002_ORACLE_RECEIPT_VERSION_V2;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION_V2;
  readonly authorityReceiptSha256: string;
  readonly startingOracleReceiptSha256: string;
  readonly sourceBindingReceiptSha256: string;
  readonly implementationCommitSha: string;
  readonly rows: readonly CAL002OracleReceiptRowV2[];
  readonly counts: {
    readonly starting: 32;
    readonly transferred: 9;
    readonly passed: number;
    readonly failed: number;
  };
  readonly admitted: false;
}

export interface CAL002OracleReceiptV2Result {
  readonly receipt: CAL002OracleReceiptV2;
  readonly receiptJson: string;
  readonly receiptSha256: string;
}

export interface BuildCAL002OracleReceiptV2Input {
  readonly authorityReceipt: CAL002AuthorityReceiptV2;
  readonly startingOracleReceipt: CAL002OracleReceipt;
  readonly transferredFixtures: readonly CAL002TransferredOracleFixtureV2[];
  readonly observations: readonly CAL002TransferOracleObservationV2[];
  readonly sourceBinding: CorpusV1SourceBindingResult;
  readonly realSourceControls: readonly CAL002RealSourceControlInputV2[];
  readonly implementationCommitSha: string;
}

const SHA256 = /^[a-f0-9]{64}$/u;
const RULE_ID = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/u;
const CASE_ID = /^[a-z0-9][a-z0-9-]*$/u;
const AUTHORITIES = new Set<CAL002OracleAuthority>([
  'language-contract',
  'security-contract',
  'wcag-22',
  'repository-contract',
]);
const OBSERVATIONS = new Set<CAL002OracleObservation>(['finding', 'no-finding']);
const CONTROL_FAMILY_SET = new Set<string>(CAL002_REAL_SOURCE_CONTROL_FAMILIES);

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
}

function requireArray(value: unknown, label: string): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
}

function requireString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function requireRuleId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !RULE_ID.test(value)) {
    throw new TypeError(`${label} must be a canonical rule ID`);
  }
}

function requireCaseId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !CASE_ID.test(value)) {
    throw new TypeError(`${label} must be a canonical case ID`);
  }
}

function requireObservation(value: unknown, label: string): asserts value is CAL002OracleObservation {
  if (!OBSERVATIONS.has(value as CAL002OracleObservation)) {
    throw new TypeError(`${label} must be finding or no-finding`);
  }
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(compareCodePoints);
  const expected = [...keys].sort(compareCodePoints);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} contains unknown or missing fields`);
  }
}

function addUnique<T>(map: Map<string, T>, key: string, value: T, label: string): void {
  if (map.has(key)) throw new TypeError(`Duplicate ${label} ${key}`);
  map.set(key, value);
}

function verifySourceBinding(value: CorpusV1SourceBindingResult): void {
  requireRecord(value, 'Corpus v1 source-binding result');
  exactKeys(value, ['receipt', 'receiptJson', 'receiptSha256'], 'Corpus v1 source-binding result');
  requireRecord(value.receipt, 'Corpus v1 source-binding receipt');
  exactKeys(value.receipt, [
    'authorityTier',
    'csvSha256',
    'languages',
    'projectionManifestSha256',
    'rightsDisposition',
    'rowBindingSha256',
    'rows',
    'sourceClaims',
    'sourceId',
    'version',
  ], 'Corpus v1 source-binding receipt');
  if (value.receipt.version !== CORPUS_V1_SOURCE_BINDING_VERSION
    || value.receipt.authorityTier !== 'publisher_attested'
    || value.receipt.rightsDisposition !== 'internal_analysis') {
    throw new TypeError('Corpus v1 source-binding result must come from the approved internal-analysis adapter');
  }
  assertSha256(value.receipt.csvSha256, 'Corpus v1 source-binding csvSha256');
  assertSha256(value.receipt.projectionManifestSha256, 'Corpus v1 source-binding projectionManifestSha256');
  assertSha256(value.receipt.rowBindingSha256, 'Corpus v1 source-binding rowBindingSha256');
  assertSha256(value.receiptSha256, 'Corpus v1 source-binding receiptSha256');
  const expectedJson = canonicalJson(value.receipt);
  if (value.receiptJson !== expectedJson || sha256(value.receiptJson) !== value.receiptSha256) {
    throw new TypeError('Corpus v1 source-binding receipt hash or canonical JSON mismatch');
  }
  if (value.receiptSha256 !== CAL001_FROZEN_INPUT_HASHES.sourceBindingReceiptSha256) {
    throw new TypeError('Corpus v1 source-binding identity does not match the frozen CAL-001 input');
  }
}

function verifyFrozenStartingReceipt(receipt: CAL002OracleReceipt): readonly CAL002OracleReceiptRowV2[] {
  requireRecord(receipt, 'CAL-002 starting oracle receipt');
  if (receipt.version !== CAL002_ORACLE_RECEIPT_VERSION) {
    throw new TypeError('CAL-002 starting oracle receipt must use the frozen v1 contract');
  }
  if (receipt.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256 || receipt.admitted !== false) {
    throw new TypeError('CAL-002 starting oracle receipt has catalog or admission drift');
  }
  assertCommitSha(receipt.implementationCommitSha, 'startingOracleReceipt.implementationCommitSha');
  requireArray(receipt.rows, 'CAL-002 starting oracle rows');
  if (receipt.rows.length !== 32) {
    throw new TypeError('CAL-002 v2 oracle receipt requires exactly 32 starting deterministic rows');
  }
  const expectedIds = [...CAL002_DETERMINISTIC_RULE_IDS].sort(compareCodePoints);
  const actualIds = receipt.rows.map((row) => row.ruleId);
  if (actualIds.some((ruleId, index) => ruleId !== expectedIds[index])) {
    throw new TypeError('CAL-002 starting oracle receipt must contain the exact canonical 32-rule identity');
  }
  if (receipt.rows.some((row) => row.transferred || row.admitted !== false || !row.declaration)) {
    throw new TypeError('CAL-002 starting oracle rows must be non-transferred, non-admitting, and declared');
  }

  const rebuilt = buildCAL002OracleReceipt({
    catalogSha256: receipt.catalogSha256,
    implementationCommitSha: receipt.implementationCommitSha,
    declarations: receipt.rows.map((row) => ({ ruleId: row.ruleId, ...row.declaration! })),
    caseResults: receipt.rows.flatMap((row) => row.caseResults.map((result) => ({ ruleId: row.ruleId, ...result }))),
    sourceControls: receipt.rows.flatMap((row) => row.sourceControls.map((control) => ({ ruleId: row.ruleId, ...control }))),
  }).receipt;
  if (canonicalArtifact(rebuilt).json !== canonicalArtifact(receipt).json) {
    throw new TypeError('CAL-002 starting oracle receipt is not an exact reproducible v1 receipt');
  }

  return receipt.rows.map((row) => ({
    ruleId: row.ruleId,
    transferred: false,
    declaration: row.declaration!,
    caseResults: row.caseResults.map(({ caseId, expected, observed, sourceSha256 }) => ({
      caseId,
      expected,
      observed,
      sourceSha256,
    })),
    fixtureControls: row.sourceControls.map(({ unitId, familyId, contentSha256, observed }) => ({
      caseId: unitId,
      familyId,
      contentSha256,
      observed,
    })),
    realSourceControls: [],
    status: row.status === 'pass' ? 'passed' : 'failed',
    outcome: row.status === 'pass' ? 'default-on' : 'default-off',
    failures: row.status === 'pass' ? [] : [...row.failures],
    admitted: false,
  }));
}

interface ExpectedTransferCase {
  readonly testCase: CAL002TransferOracleSourceCaseV2;
  readonly expected: CAL002OracleObservation;
  readonly control: boolean;
}

function validateFixture(
  fixture: CAL002TransferredOracleFixtureV2,
  expectedRuleIds: ReadonlySet<string>,
): readonly ExpectedTransferCase[] {
  requireRecord(fixture, 'CAL-002 transferred oracle fixture');
  requireRuleId(fixture.ruleId, 'CAL-002 transferred oracle fixture ruleId');
  if (!expectedRuleIds.has(fixture.ruleId)) {
    throw new TypeError(`Unknown CAL-002 deterministic transfer fixture ${fixture.ruleId}`);
  }
  if (!AUTHORITIES.has(fixture.authority)) {
    throw new TypeError(`CAL-002 transfer ${fixture.ruleId} has an invalid authority`);
  }
  requireString(fixture.reference, `CAL-002 transfer ${fixture.ruleId} reference`);
  requireRecord(fixture.execution, `CAL-002 transfer ${fixture.ruleId} execution`);
  if (fixture.execution.mode !== 'source-text') {
    throw new TypeError(`CAL-002 transfer ${fixture.ruleId} must use source-text execution`);
  }
  requireRecord(fixture.execution.context, `CAL-002 transfer ${fixture.ruleId} execution context`);
  requireString(fixture.execution.context.virtualSourcePath, `CAL-002 transfer ${fixture.ruleId} execution path`);
  const groups = [
    [fixture.positiveCases, 'finding', false, 'positiveCases'],
    [fixture.negativeCases, 'no-finding', false, 'negativeCases'],
    [fixture.adversarialCases, 'no-finding', false, 'adversarialCases'],
    [fixture.controls, 'no-finding', true, 'controls'],
  ] as const;
  const seen = new Set<string>();
  const cases: ExpectedTransferCase[] = [];
  for (const [rows, expected, control, groupName] of groups) {
    requireArray(rows, `CAL-002 transfer ${fixture.ruleId} ${groupName}`);
    if (rows.length === 0 || (control && rows.length !== 5)) {
      throw new TypeError(`CAL-002 transfer ${fixture.ruleId} has incomplete ${groupName}`);
    }
    rows.forEach((testCase, index) => {
      requireRecord(testCase, `CAL-002 transfer ${fixture.ruleId} ${groupName}[${index}]`);
      requireCaseId(testCase.caseId, `CAL-002 transfer ${fixture.ruleId} caseId`);
      requireString(testCase.source, `CAL-002 transfer ${fixture.ruleId}/${testCase.caseId} source`);
      requireString(testCase.virtualPath, `CAL-002 transfer ${fixture.ruleId}/${testCase.caseId} virtualPath`);
      if (testCase.virtualPath !== fixture.execution.context.virtualSourcePath) {
        throw new TypeError(`CAL-002 transfer ${fixture.ruleId}/${testCase.caseId} path does not match execution`);
      }
      if (seen.has(testCase.caseId)) {
        throw new TypeError(`Duplicate CAL-002 transfer case ${fixture.ruleId}/${testCase.caseId}`);
      }
      seen.add(testCase.caseId);
      if (control && testCase.familyId !== CAL002_REAL_SOURCE_CONTROL_FAMILIES[index]) {
        throw new TypeError(`CAL-002 transfer ${fixture.ruleId} control family mismatch`);
      }
      cases.push({ testCase, expected, control });
    });
  }
  return cases;
}

interface IndexedTransfer {
  readonly fixture: CAL002TransferredOracleFixtureV2;
  readonly cases: readonly ExpectedTransferCase[];
}

function indexTransferredFixtures(
  authorityReceipt: CAL002AuthorityReceiptV2,
  fixtures: readonly CAL002TransferredOracleFixtureV2[],
): ReadonlyMap<string, IndexedTransfer> {
  if (isRecord(authorityReceipt) && Array.isArray(authorityReceipt.rows)) {
    const unready = authorityReceipt.rows.find((row) => isRecord(row)
      && row.action === 'transfer'
      && row.destination === 'quality'
      && row.evidenceClass === 'deterministic-or-standards'
      && (row.readiness !== 'evidence-ready' || row.assignmentEligible !== true));
    if (isRecord(unready) && typeof unready.ruleId === 'string') {
      throw new TypeError(`CAL-002 deterministic transfer ${unready.ruleId} is not evidence-ready`);
    }
  }
  assertCAL002AuthorityReceiptV2(authorityReceipt);
  const authorityTransfers = authorityReceipt.rows.filter((row) =>
    row.action === 'transfer'
    && row.destination === 'quality'
    && row.evidenceClass === 'deterministic-or-standards');
  if (authorityTransfers.length !== 9) {
    throw new TypeError('CAL-002 authority must identify exactly nine deterministic transfers');
  }
  for (const row of authorityTransfers) {
    if (row.readiness !== 'evidence-ready' || row.assignmentEligible !== true) {
      throw new TypeError(`CAL-002 deterministic transfer ${row.ruleId} is not evidence-ready`);
    }
  }
  requireArray(fixtures, 'CAL-002 transferred fixtures');
  if (fixtures.length !== 9) {
    throw new TypeError('CAL-002 v2 oracle receipt requires exactly nine transfer fixtures');
  }
  const expectedRuleIds = new Set(authorityTransfers.map((row) => row.ruleId));
  const indexed = new Map<string, IndexedTransfer>();
  for (const fixture of fixtures) {
    addUnique(indexed, fixture.ruleId, {
      fixture,
      cases: validateFixture(fixture, expectedRuleIds),
    }, 'CAL-002 transfer fixture');
  }
  if ([...expectedRuleIds].some((ruleId) => !indexed.has(ruleId))) {
    throw new TypeError('CAL-002 v2 oracle receipt is missing a deterministic transfer fixture');
  }
  return indexed;
}

function indexObservations(
  rows: readonly CAL002TransferOracleObservationV2[],
  expected: ReadonlyMap<string, IndexedTransfer>,
): ReadonlyMap<string, CAL002TransferOracleObservationV2> {
  requireArray(rows, 'CAL-002 transfer observations');
  const indexed = new Map<string, CAL002TransferOracleObservationV2>();
  for (const [index, observation] of rows.entries()) {
    requireRecord(observation, `CAL-002 transfer observation[${index}]`);
    requireRuleId(observation.ruleId, `CAL-002 transfer observation[${index}].ruleId`);
    requireCaseId(observation.caseId, `CAL-002 transfer observation[${index}].caseId`);
    requireObservation(observation.observed, `CAL-002 transfer observation ${observation.ruleId}/${observation.caseId}`);
    assertSha256(observation.sourceSha256, `CAL-002 transfer observation ${observation.ruleId}/${observation.caseId} sourceSha256`);
    const transfer = expected.get(observation.ruleId);
    const expectedCase = transfer?.cases.find(({ testCase }) => testCase.caseId === observation.caseId);
    if (!expectedCase) throw new TypeError(`Unknown CAL-002 transfer observation ${observation.ruleId}/${observation.caseId}`);
    if (sha256(expectedCase.testCase.source) !== observation.sourceSha256) {
      throw new TypeError(`CAL-002 transfer source hash mismatch for ${observation.ruleId}/${observation.caseId}`);
    }
    addUnique(indexed, `${observation.ruleId}\0${observation.caseId}`, {
      ruleId: observation.ruleId,
      caseId: observation.caseId,
      observed: observation.observed,
      sourceSha256: observation.sourceSha256,
    }, 'CAL-002 transfer observation');
  }
  const expectedCount = [...expected.values()].reduce((count, transfer) => count + transfer.cases.length, 0);
  if (indexed.size !== expectedCount) {
    throw new TypeError('CAL-002 transfer observation coverage is incomplete');
  }
  return indexed;
}

interface IndexedRealSourceControls {
  readonly acceptedByRule: ReadonlyMap<string, readonly CAL002RealSourceControlV2[]>;
  readonly unexpectedRules: ReadonlySet<string>;
}

function indexRealSourceControls(
  rows: readonly CAL002RealSourceControlInputV2[],
  ruleIds: ReadonlySet<string>,
  sourceBindingReceiptSha256: string,
): IndexedRealSourceControls {
  requireArray(rows, 'CAL-002 real-source controls');
  const acceptedByRule = new Map<string, CAL002RealSourceControlV2[]>();
  const unexpectedRules = new Set<string>();
  const seen = new Set<string>();
  const seenContent = new Set<string>();
  for (const [index, control] of rows.entries()) {
    requireRecord(control, `CAL-002 real-source control[${index}]`);
    requireRuleId(control.ruleId, `CAL-002 real-source control[${index}].ruleId`);
    if (!ruleIds.has(control.ruleId)) {
      throw new TypeError(`Unknown CAL-002 real-source control rule ${control.ruleId}`);
    }
    if (typeof control.familyId !== 'string' || !CONTROL_FAMILY_SET.has(control.familyId)) {
      throw new TypeError(`CAL-002 real-source control ${control.ruleId} has an unknown family`);
    }
    requireString(control.source, `CAL-002 real-source control ${control.ruleId}/${control.familyId} source`);
    requireObservation(control.observed, `CAL-002 real-source control ${control.ruleId}/${control.familyId} observed`);
    assertSha256(control.contentSha256, `CAL-002 real-source control ${control.ruleId}/${control.familyId} contentSha256`);
    assertSha256(
      control.sourceBindingReceiptSha256,
      `CAL-002 real-source control ${control.ruleId}/${control.familyId} sourceBindingReceiptSha256`,
    );
    if (control.sourceBindingReceiptSha256 !== sourceBindingReceiptSha256) {
      throw new TypeError(`CAL-002 real-source control ${control.ruleId}/${control.familyId} source-binding receipt mismatch`);
    }
    if (sha256(control.source) !== control.contentSha256) {
      throw new TypeError(`CAL-002 real-source control ${control.ruleId}/${control.familyId} content hash mismatch`);
    }
    const bindingKey = `${control.ruleId}\0${control.familyId}`;
    if (seen.has(bindingKey)) throw new TypeError(`Duplicate CAL-002 real-source control ${bindingKey}`);
    seen.add(bindingKey);
    const contentKey = `${control.ruleId}\0${control.contentSha256}`;
    if (seenContent.has(contentKey)) {
      throw new TypeError(`Duplicate CAL-002 real-source control content for ${control.ruleId}`);
    }
    seenContent.add(contentKey);
    if (control.observed !== 'no-finding') {
      unexpectedRules.add(control.ruleId);
      continue;
    }
    const projected: CAL002RealSourceControlV2 = {
      controlId: sha256(`${control.ruleId}\0${control.familyId}\0${control.contentSha256}`),
      familyId: control.familyId,
      contentSha256: control.contentSha256,
      sourceBindingReceiptSha256: control.sourceBindingReceiptSha256,
      observed: 'no-finding',
    };
    acceptedByRule.set(control.ruleId, [...(acceptedByRule.get(control.ruleId) ?? []), projected]);
  }
  for (const [ruleId, controls] of acceptedByRule) {
    acceptedByRule.set(ruleId, [...controls].sort((left, right) => compareCodePoints(left.familyId, right.familyId)));
  }
  return { acceptedByRule, unexpectedRules };
}

function appendRealSourceControls(
  row: CAL002OracleReceiptRowV2,
  indexed: IndexedRealSourceControls,
): CAL002OracleReceiptRowV2 {
  const controls = indexed.acceptedByRule.get(row.ruleId) ?? [];
  const failures = [...row.failures];
  if (controls.length !== 5 || new Set(controls.map((control) => control.familyId)).size !== 5) {
    failures.push('real-source-control-shortage');
  }
  if (indexed.unexpectedRules.has(row.ruleId)) {
    failures.push('unexpected-real-source-control-observation');
  }
  const canonicalFailures = [...new Set(failures)].sort(compareCodePoints);
  const status = canonicalFailures.length === 0 ? 'passed' : 'failed';
  return {
    ...row,
    realSourceControls: controls,
    status,
    outcome: status === 'passed' ? 'default-on' : 'default-off',
    failures: canonicalFailures,
  };
}

function buildTransferRows(
  transfers: ReadonlyMap<string, IndexedTransfer>,
  observations: ReadonlyMap<string, CAL002TransferOracleObservationV2>,
): readonly CAL002OracleReceiptRowV2[] {
  return [...transfers.values()].map(({ fixture, cases }) => {
    const failures: string[] = [];
    const caseResults: CAL002OracleCaseResultV2[] = [];
    const fixtureControls: CAL002FixtureControlV2[] = [];
    for (const expectedCase of cases) {
      const observation = observations.get(`${fixture.ruleId}\0${expectedCase.testCase.caseId}`)!;
      if (observation.observed !== expectedCase.expected) failures.push('unexpected-oracle-observation');
      if (expectedCase.control) {
        fixtureControls.push({
          caseId: expectedCase.testCase.caseId,
          familyId: expectedCase.testCase.familyId!,
          contentSha256: observation.sourceSha256,
          observed: observation.observed,
        });
      } else {
        caseResults.push({
          caseId: expectedCase.testCase.caseId,
          expected: expectedCase.expected,
          observed: observation.observed,
          sourceSha256: observation.sourceSha256,
        });
      }
    }
    caseResults.sort((left, right) => compareCodePoints(left.caseId, right.caseId));
    fixtureControls.sort((left, right) => compareCodePoints(left.familyId, right.familyId));
    const canonicalFailures = [...new Set(failures)].sort(compareCodePoints);
    const status = canonicalFailures.length === 0 ? 'passed' : 'failed';
    return {
      ruleId: fixture.ruleId,
      transferred: true,
      declaration: {
        authority: fixture.authority,
        reference: fixture.reference,
        positiveCaseIds: fixture.positiveCases.map(({ caseId }) => caseId).sort(compareCodePoints),
        negativeCaseIds: [...fixture.negativeCases, ...fixture.adversarialCases]
          .map(({ caseId }) => caseId)
          .sort(compareCodePoints),
      },
      caseResults,
      fixtureControls,
      realSourceControls: [],
      status,
      outcome: status === 'passed' ? 'default-on' : 'default-off',
      failures: canonicalFailures,
      admitted: false,
    } satisfies CAL002OracleReceiptRowV2;
  });
}

export function buildCAL002OracleReceiptV2(
  input: BuildCAL002OracleReceiptV2Input,
): CAL002OracleReceiptV2Result {
  requireRecord(input, 'CAL-002 v2 oracle receipt input');
  assertCommitSha(input.implementationCommitSha, 'implementationCommitSha');
  verifySourceBinding(input.sourceBinding);
  const starting = verifyFrozenStartingReceipt(input.startingOracleReceipt);
  const transfers = indexTransferredFixtures(input.authorityReceipt, input.transferredFixtures);
  const observations = indexObservations(input.observations, transfers);
  const transferred = buildTransferRows(transfers, observations);
  const ruleIds = new Set([...starting, ...transferred].map((row) => row.ruleId));
  const realSourceControls = indexRealSourceControls(
    input.realSourceControls,
    ruleIds,
    input.sourceBinding.receiptSha256,
  );
  const rows = [...starting, ...transferred]
    .map((row) => appendRealSourceControls(row, realSourceControls))
    .sort((left, right) => compareCodePoints(left.ruleId, right.ruleId));
  if (rows.length !== 41 || ruleIds.size !== 41) {
    throw new TypeError('CAL-002 v2 oracle receipt must contain 32 starting and 9 transferred rows');
  }
  const passed = rows.filter((row) => row.status === 'passed').length;
  const receipt: CAL002OracleReceiptV2 = {
    version: CAL002_ORACLE_RECEIPT_VERSION_V2,
    protocolVersion: CAL002_PROTOCOL_VERSION_V2,
    authorityReceiptSha256: canonicalArtifact(input.authorityReceipt).sha256,
    startingOracleReceiptSha256: canonicalArtifact(input.startingOracleReceipt).sha256,
    sourceBindingReceiptSha256: input.sourceBinding.receiptSha256,
    implementationCommitSha: input.implementationCommitSha,
    rows,
    counts: {
      starting: 32,
      transferred: 9,
      passed,
      failed: rows.length - passed,
    },
    admitted: false,
  };
  const artifact = canonicalArtifact(receipt);
  return { receipt, receiptJson: artifact.json, receiptSha256: artifact.sha256 };
}
