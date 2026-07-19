import { createHash } from 'node:crypto';

import {
  CAL002_CONTEXTUAL_RULE_IDS,
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  CAL002_PROTOCOL_VERSION,
  CAL002_QUALITY_METRICS_VERSION,
  CAL002_STATISTICAL_RULE_IDS,
  assertCommitSha,
  canonicalArtifact,
  validateCAL002Assignment,
  validateCAL002Catalog,
  validateCAL002QualityMetrics,
  type CAL002Catalog,
  type CAL002ClaimCeiling,
  type CAL002EvidenceClass,
  type CAL002Interval,
  type CAL002PolicyOutcome,
  type CAL002ReviewLabel,
} from './contracts';
import {
  buildCAL002OracleReceipt,
  type CAL002OracleReceipt,
} from './oracles';
import type {
  CAL002QualityAssignment,
  CAL002QualityAssignmentRow,
  CAL002QualityShortage,
} from './quality-sampling';
import {
  assertCAL002ReviewReceipt,
  type CAL002ReviewReceipt,
} from './review-session';

type CAL002QualityEvidenceClass = Extract<
  CAL002EvidenceClass,
  'contextual-quality' | 'statistical-review-utility'
>;
type CAL002QualityRole = 'finding' | 'control';
type CAL002QualityRound = 'initial' | 'final';

const REVIEW_ID = /^[a-f0-9]{64}$/u;
const LINE_WINDOW_LOCATOR = /^window:[a-f0-9]{64}$/u;
const CONTEXTUAL_IDS = new Set<string>(CAL002_CONTEXTUAL_RULE_IDS);
const STATISTICAL_IDS = new Set<string>(CAL002_STATISTICAL_RULE_IDS);
const REVIEW_IDS = [...CAL002_CONTEXTUAL_RULE_IDS, ...CAL002_STATISTICAL_RULE_IDS]
  .sort(compareCodePoints);

export interface CAL002QualityLabelCounts {
  readonly actionableDefect: number;
  readonly usefulNoSafeFix: number;
  readonly notUseful: number;
  readonly cannotDetermine: number;
}

export interface CAL002QualityMetricsRow {
  readonly ruleId: string;
  readonly evidenceClass: CAL002QualityEvidenceClass;
  readonly requestedPerArm: number;
  readonly finding: CAL002QualityLabelCounts;
  readonly control: CAL002QualityLabelCounts;
  readonly outcome: Extract<
    CAL002PolicyOutcome,
    'default-on' | 'default-off' | 'quality-advisory' | 'insufficient-evidence'
  >;
  readonly claimCeiling: Extract<
    CAL002ClaimCeiling,
    'quality-usefulness' | 'review-target-utility' | 'insufficient-evidence'
  >;
}

export interface CAL002QualityMetrics {
  readonly version: typeof CAL002_QUALITY_METRICS_VERSION;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION;
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly assignmentSha256: string;
  readonly reviewReceiptSha256: string;
  readonly reducerImplementationCommitSha: string;
  readonly rows: readonly CAL002QualityMetricsRow[];
  readonly admitted: false;
}

export interface CAL002QualityEvidenceRound {
  readonly assignment: CAL002QualityAssignment;
  readonly reviewReceipt: CAL002ReviewReceipt;
  readonly shortages: readonly CAL002QualityShortage[];
}

export interface ReduceCAL002QualityEvidenceInput {
  readonly catalog: CAL002Catalog;
  readonly oracleReceipt: CAL002OracleReceipt;
  readonly initial: CAL002QualityEvidenceRound;
  readonly final?: CAL002QualityEvidenceRound;
  readonly reducerImplementationCommitSha: string;
}

export interface CAL002QualityArmEvaluation {
  readonly labels: CAL002QualityLabelCounts;
  readonly useful: number;
  readonly determinate: number;
  readonly usefulInterval?: CAL002Interval;
}

export type CAL002QualityRationaleCode =
  | 'insufficient-reach'
  | 'insufficient-determinate'
  | 'control-dominated'
  | 'finding-below-quality-floor'
  | 'contextual-default-on'
  | 'review-utility'
  | 'initial-expansion-required'
  | 'insufficient-final-certainty';

export interface CAL002QualityEvaluation {
  readonly ruleId: string;
  readonly evidenceClass: CAL002QualityEvidenceClass;
  readonly requestedPerArm: 30 | 100;
  readonly determinateFloor: number;
  readonly finding: CAL002QualityArmEvaluation;
  readonly control: CAL002QualityArmEvaluation;
  readonly reviewUtilityBar: boolean;
  readonly controlDominated: boolean;
  readonly outcome: CAL002QualityMetricsRow['outcome'];
  readonly claimCeiling: CAL002QualityMetricsRow['claimCeiling'];
  readonly rationaleCode: CAL002QualityRationaleCode;
  readonly terminal: boolean;
  readonly nextRound?: { readonly findings: 100; readonly controls: 100 };
}

export interface CAL002QualityExpansionRequest {
  readonly ruleId: string;
  readonly findings: 70;
  readonly controls: 70;
}

export interface CAL002OracleDisposition {
  readonly ruleId: string;
  readonly transferred: boolean;
  readonly status: 'pass' | 'fail';
  readonly outcome: 'default-on' | 'default-off';
  readonly failures: readonly string[];
  readonly admitted: false;
}

export interface CAL002QualityRoundBinding {
  readonly round: CAL002QualityRound;
  readonly assignmentSha256: string;
  readonly reviewReceiptSha256: string;
  readonly blindedBatchSha256: string;
}

export interface CAL002QualityMetricsResult {
  readonly metrics: CAL002QualityMetrics;
  readonly metricsJson: string;
  readonly metricsSha256: string;
  readonly evaluations: readonly CAL002QualityEvaluation[];
  readonly expansionRequests: readonly CAL002QualityExpansionRequest[];
  readonly oracleDispositions: readonly CAL002OracleDisposition[];
  readonly roundBindings: readonly CAL002QualityRoundBinding[];
}

interface ValidatedRound {
  readonly round: CAL002QualityRound;
  readonly assignment: CAL002QualityAssignment;
  readonly labelsByReviewId: ReadonlyMap<string, CAL002ReviewLabel>;
  readonly shortages: readonly CAL002QualityShortage[];
  readonly reviewReceiptSha256: string;
}

interface Decision {
  readonly outcome: CAL002QualityEvaluation['outcome'];
  readonly claimCeiling: CAL002QualityEvaluation['claimCeiling'];
  readonly rationaleCode: CAL002QualityRationaleCode;
  readonly terminal: boolean;
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hashParts(...parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\0'), 'utf8').digest('hex');
}

export function wilson95(successes: number, total: number): CAL002Interval {
  if (
    !Number.isInteger(successes)
    || !Number.isInteger(total)
    || successes < 0
    || total < 1
    || successes > total
  ) {
    throw new RangeError('Wilson inputs must satisfy 0 <= successes <= total');
  }
  const z = 1.959963984540054;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin = (z / denominator)
    * Math.sqrt((p * (1 - p) / total) + (z * z) / (4 * total * total));
  // Round outward so serialization never makes the confidence interval narrower.
  return {
    lower: Math.floor(Math.max(0, center - margin) * 1_000_000) / 1_000_000,
    upper: Math.ceil(Math.min(1, center + margin) * 1_000_000) / 1_000_000,
  };
}

function requireRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function validateCatalog(catalog: CAL002Catalog): ReadonlyMap<string, CAL002QualityEvidenceClass> {
  const validation = validateCAL002Catalog(catalog);
  if (!validation.ok) {
    throw new TypeError(`CAL-002 catalog is invalid: ${validation.errors.join('; ')}`);
  }
  if (
    catalog.protocolVersion !== CAL002_PROTOCOL_VERSION
    || catalog.ruleCatalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256
    || catalog.admitted !== false
    || catalog.applied !== false
  ) {
    throw new TypeError('CAL-002 catalog does not match the locked non-admitting identity');
  }

  const qualityClasses = new Map<string, CAL002QualityEvidenceClass>();
  for (const row of catalog.rows) {
    if (row.lane !== 'quality' || row.evidenceClass === 'deterministic-or-standards') continue;
    qualityClasses.set(row.ruleId, row.evidenceClass);
  }
  if (
    qualityClasses.size !== REVIEW_IDS.length
    || REVIEW_IDS.some((ruleId) => qualityClasses.get(ruleId) !== evidenceClassFor(ruleId))
  ) {
    throw new TypeError('CAL-002 catalog quality classes do not match the locked contextual/statistical set');
  }
  return qualityClasses;
}

function evidenceClassFor(ruleId: string): CAL002QualityEvidenceClass {
  if (CONTEXTUAL_IDS.has(ruleId)) return 'contextual-quality';
  if (STATISTICAL_IDS.has(ruleId)) return 'statistical-review-utility';
  throw new TypeError(`CAL-002 rule ${ruleId} is not in a review quality class`);
}

function validateAssignmentIntegrity(
  assignment: CAL002QualityAssignment,
  expectedRound: CAL002QualityRound,
  qualityClasses: ReadonlyMap<string, CAL002QualityEvidenceClass>,
): void {
  const validation = validateCAL002Assignment(assignment);
  if (!validation.ok) {
    throw new TypeError(`CAL-002 ${expectedRound} assignment is invalid: ${validation.errors.join('; ')}`);
  }
  const targetPerArm = expectedRound === 'initial' ? 30 : 100;
  if (assignment.round !== expectedRound || assignment.targetPerArm !== targetPerArm) {
    throw new TypeError(`CAL-002 ${expectedRound} assignment has the wrong round/target pair`);
  }
  if (
    assignment.protocolVersion !== CAL002_PROTOCOL_VERSION
    || assignment.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256
    || assignment.admitted !== false
  ) {
    throw new TypeError(`CAL-002 ${expectedRound} assignment does not match the locked catalog/protocol/admission identity`);
  }

  const selectedRows = assignment.rows.map(({ reviewId: _reviewId, ...row }) => row);
  const sortedSelectedRows = [...selectedRows].sort((left, right) =>
    compareCodePoints(left.ruleId, right.ruleId)
    || compareCodePoints(left.role, right.role)
    || compareCodePoints(left.unitId, right.unitId));
  if (canonicalArtifact(selectedRows).json !== canonicalArtifact(sortedSelectedRows).json) {
    throw new TypeError(`CAL-002 ${expectedRound} assignment rows are not in canonical order`);
  }
  const selectionManifestSha256 = canonicalArtifact(selectedRows).sha256;
  if (assignment.selectionManifestSha256 !== selectionManifestSha256) {
    throw new TypeError(`CAL-002 ${expectedRound} assignment selection manifest hash does not match its rows`);
  }

  const blindedByReviewId = new Map(assignment.blindedRows.map((row) => [row.reviewId, row]));
  for (const row of assignment.rows) {
    if (!REVIEW_ID.test(row.reviewId)) {
      throw new TypeError(`CAL-002 ${expectedRound} assignment review ID is not path-free`);
    }
    const expectedClass = qualityClasses.get(row.ruleId);
    if (expectedClass === undefined || row.evidenceClass !== expectedClass) {
      throw new TypeError(`CAL-002 ${expectedRound} assignment row has the wrong quality class for ${row.ruleId}`);
    }
    const expectedReviewId = hashParts(
      CAL002_PROTOCOL_VERSION,
      selectionManifestSha256,
      row.ruleId,
      row.unitId,
    );
    if (row.reviewId !== expectedReviewId) {
      throw new TypeError(`CAL-002 ${expectedRound} assignment review ID does not match its source-bound row`);
    }
    const blinded = blindedByReviewId.get(row.reviewId);
    if (blinded === undefined) {
      throw new TypeError(`CAL-002 ${expectedRound} assignment is missing a blinded review row`);
    }
    if (!LINE_WINDOW_LOCATOR.test(blinded.lineWindowLocator)) {
      throw new TypeError(`CAL-002 ${expectedRound} assignment line-window locator is not path-free`);
    }
    const expectedLocator = `window:${hashParts(
      CAL002_PROTOCOL_VERSION,
      'window',
      selectionManifestSha256,
      row.reviewId,
      blinded.sourceIdentitySha256,
    )}`;
    if (blinded.lineWindowLocator !== expectedLocator) {
      throw new TypeError(`CAL-002 ${expectedRound} assignment line-window locator is not source-bound`);
    }
  }
  if (assignment.blindedBatchSha256 !== canonicalArtifact(assignment.blindedRows).sha256) {
    throw new TypeError(`CAL-002 ${expectedRound} assignment blinded batch hash does not match its rows`);
  }
  const sortedBlindedRows = [...assignment.blindedRows].sort((left, right) =>
    compareCodePoints(
      hashParts(CAL002_PROTOCOL_VERSION, 'presentation', selectionManifestSha256, left.reviewId),
      hashParts(CAL002_PROTOCOL_VERSION, 'presentation', selectionManifestSha256, right.reviewId),
    ) || compareCodePoints(left.reviewId, right.reviewId));
  if (canonicalArtifact(assignment.blindedRows).json !== canonicalArtifact(sortedBlindedRows).json) {
    throw new TypeError(`CAL-002 ${expectedRound} blinded assignment rows are not in canonical presentation order`);
  }
  const { assignmentSha256: _assignmentSha256, ...withoutSelfHash } = assignment;
  if (assignment.assignmentSha256 !== canonicalArtifact(withoutSelfHash).sha256) {
    throw new TypeError(`CAL-002 ${expectedRound} assignment hash does not match its artifact`);
  }
}

function validateShortages(
  shortages: readonly CAL002QualityShortage[],
  round: CAL002QualityRound,
  qualityClasses: ReadonlyMap<string, CAL002QualityEvidenceClass>,
): void {
  if (!Array.isArray(shortages)) throw new TypeError(`CAL-002 ${round} shortages must be an array`);
  const seen = new Set<string>();
  for (const [index, shortage] of shortages.entries()) {
    if (shortage === null || typeof shortage !== 'object' || Array.isArray(shortage)) {
      throw new TypeError(`CAL-002 ${round} shortages[${index}] must be an object`);
    }
    const keys = Object.keys(shortage).sort(compareCodePoints);
    const expectedKeys = ['missing', 'reason', 'requested', 'role', 'ruleId', 'selected'];
    if (keys.length !== expectedKeys.length || keys.some((key, keyIndex) => key !== expectedKeys[keyIndex])) {
      throw new TypeError(`CAL-002 ${round} shortage must contain exact path-free accounting fields`);
    }
    if (!qualityClasses.has(shortage.ruleId)) {
      throw new TypeError(`CAL-002 ${round} shortage has an unknown quality rule ${shortage.ruleId}`);
    }
    if (shortage.role !== 'finding' && shortage.role !== 'control') {
      throw new TypeError(`CAL-002 ${round} shortage has an invalid role`);
    }
    if (!['count', 'family-reach', 'matched-strata'].includes(shortage.reason)) {
      throw new TypeError(`CAL-002 ${round} shortage has an invalid reason`);
    }
    if (
      !Number.isInteger(shortage.requested)
      || !Number.isInteger(shortage.selected)
      || !Number.isInteger(shortage.missing)
      || shortage.requested < 1
      || shortage.selected < 0
      || shortage.missing < 1
      || shortage.selected + shortage.missing !== shortage.requested
    ) {
      throw new TypeError(`CAL-002 ${round} shortage has invalid bounded counts`);
    }
    const identity = `${shortage.ruleId}\0${shortage.role}\0${shortage.reason}`;
    if (seen.has(identity)) throw new TypeError(`CAL-002 ${round} shortage contains a duplicate row`);
    seen.add(identity);
  }
}

function validateReviewBinding(
  receipt: CAL002ReviewReceipt,
  assignment: CAL002QualityAssignment,
  round: CAL002QualityRound,
): ReadonlyMap<string, CAL002ReviewLabel> {
  try {
    assertCAL002ReviewReceipt(receipt);
  } catch (error) {
    throw new TypeError(`CAL-002 ${round} review receipt is invalid: ${(error as Error).message}`);
  }
  if (receipt.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256) {
    throw new TypeError(`CAL-002 ${round} review receipt catalog hash is invalid`);
  }
  if (receipt.assignmentSha256 !== assignment.assignmentSha256) {
    throw new TypeError(`CAL-002 ${round} review receipt assignment hash does not match`);
  }
  if (receipt.blindedBatchSha256 !== assignment.blindedBatchSha256) {
    throw new TypeError(`CAL-002 ${round} review receipt blinded batch hash does not match`);
  }

  const assignmentIds = new Set(assignment.rows.map((row) => row.reviewId));
  const labels = new Map<string, CAL002ReviewLabel>();
  let priorReviewId: string | undefined;
  for (const row of receipt.rows) {
    if (priorReviewId !== undefined && compareCodePoints(priorReviewId, row.reviewId) >= 0) {
      throw new TypeError(`CAL-002 ${round} review receipt rows are not in canonical review-ID order`);
    }
    labels.set(row.reviewId, row.label);
    priorReviewId = row.reviewId;
  }
  const missing = [...assignmentIds].filter((reviewId) => !labels.has(reviewId));
  const extra = [...labels.keys()].filter((reviewId) => !assignmentIds.has(reviewId));
  if (missing.length > 0) {
    throw new TypeError(`CAL-002 ${round} review coverage has missing assignment review IDs`);
  }
  if (extra.length > 0) {
    throw new TypeError(`CAL-002 ${round} review coverage has extra review IDs`);
  }
  return labels;
}

function validateRound(
  round: CAL002QualityEvidenceRound,
  expectedRound: CAL002QualityRound,
  qualityClasses: ReadonlyMap<string, CAL002QualityEvidenceClass>,
): ValidatedRound {
  requireRecord(round, `CAL-002 ${expectedRound} round`);
  const keys = Object.keys(round).sort(compareCodePoints);
  if (keys.length !== 3 || keys[0] !== 'assignment' || keys[1] !== 'reviewReceipt' || keys[2] !== 'shortages') {
    throw new TypeError(`CAL-002 ${expectedRound} assignment/review/shortage pair is incomplete`);
  }
  validateAssignmentIntegrity(round.assignment, expectedRound, qualityClasses);
  validateShortages(round.shortages, expectedRound, qualityClasses);
  const labelsByReviewId = validateReviewBinding(round.reviewReceipt, round.assignment, expectedRound);
  return {
    round: expectedRound,
    assignment: round.assignment,
    labelsByReviewId,
    shortages: round.shortages,
    reviewReceiptSha256: canonicalArtifact(round.reviewReceipt).sha256,
  };
}

function validateOracleReceipt(receipt: CAL002OracleReceipt): readonly CAL002OracleDisposition[] {
  requireRecord(receipt, 'CAL-002 oracle receipt');
  if (
    receipt.protocolVersion !== CAL002_PROTOCOL_VERSION
    || receipt.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256
    || receipt.admitted !== false
  ) {
    throw new TypeError('CAL-002 oracle receipt protocol/catalog/admission identity is invalid');
  }
  const transfers = receipt.rows
    .filter((row) => row.transferred)
    .map((row) => ({ ruleId: row.ruleId, reason: 'standards-or-contract-quality-claim' as const }));
  const declarations = receipt.rows.flatMap((row) => row.declaration === undefined ? [] : [{
    ruleId: row.ruleId,
    ...row.declaration,
  }]);
  const caseResults = receipt.rows.flatMap((row) => row.caseResults.map((result) => ({
    ruleId: row.ruleId,
    ...result,
  })));
  const sourceControls = receipt.rows.flatMap((row) => row.sourceControls.map((control) => ({
    ruleId: row.ruleId,
    ...control,
  })));
  let rebuilt: CAL002OracleReceipt;
  try {
    rebuilt = buildCAL002OracleReceipt({
      catalogSha256: receipt.catalogSha256,
      implementationCommitSha: receipt.implementationCommitSha,
      transfers,
      declarations,
      caseResults,
      sourceControls,
    }).receipt;
  } catch (error) {
    throw new TypeError(`CAL-002 oracle receipt is invalid: ${(error as Error).message}`);
  }
  if (canonicalArtifact(rebuilt).json !== canonicalArtifact(receipt).json) {
    throw new TypeError('CAL-002 oracle receipt does not match its deterministic canonical reduction');
  }
  return receipt.rows.map((row) => ({
    ruleId: row.ruleId,
    transferred: row.transferred,
    status: row.status,
    outcome: row.status === 'pass' ? 'default-on' : 'default-off',
    failures: [...row.failures],
    admitted: false,
  }));
}

function emptyLabelCounts(): CAL002QualityLabelCounts {
  return { actionableDefect: 0, usefulNoSafeFix: 0, notUseful: 0, cannotDetermine: 0 };
}

function addLabel(counts: CAL002QualityLabelCounts, label: CAL002ReviewLabel): void {
  const mutable = counts as {
    actionableDefect: number;
    usefulNoSafeFix: number;
    notUseful: number;
    cannotDetermine: number;
  };
  if (label === 'actionable-defect') mutable.actionableDefect += 1;
  else if (label === 'useful-no-safe-fix') mutable.usefulNoSafeFix += 1;
  else if (label === 'not-useful') mutable.notUseful += 1;
  else mutable.cannotDetermine += 1;
}

function armEvaluation(labels: CAL002QualityLabelCounts): CAL002QualityArmEvaluation {
  const useful = labels.actionableDefect + labels.usefulNoSafeFix;
  const determinate = useful + labels.notUseful;
  return {
    labels,
    useful,
    determinate,
    ...(determinate === 0 ? {} : { usefulInterval: wilson95(useful, determinate) }),
  };
}

function shortageForRule(
  shortages: readonly CAL002QualityShortage[],
  ruleId: string,
): boolean {
  return shortages.some((shortage) => shortage.ruleId === ruleId);
}

function decisionFor(input: {
  readonly evidenceClass: CAL002QualityEvidenceClass;
  readonly round: CAL002QualityRound;
  readonly finding: CAL002QualityArmEvaluation;
  readonly control: CAL002QualityArmEvaluation;
  readonly determinateFloor: number;
  readonly hasShortage: boolean;
}): Decision {
  // Locked precedence: insufficient inputs, negative evidence, contextual
  // activation, utility advisory, then bounded expansion/final insufficiency.
  const { evidenceClass, round, finding, control, determinateFloor, hasShortage } = input;
  const pending = round === 'initial';
  const insufficient = (
    rationaleCode: Extract<CAL002QualityRationaleCode, 'insufficient-reach' | 'insufficient-determinate'>,
  ): Decision => ({
    outcome: 'insufficient-evidence',
    claimCeiling: 'insufficient-evidence',
    rationaleCode,
    terminal: !pending,
  });
  if (hasShortage) return insufficient('insufficient-reach');
  if (finding.determinate < determinateFloor || control.determinate < determinateFloor) {
    return insufficient('insufficient-determinate');
  }
  const findingInterval = finding.usefulInterval!;
  const controlInterval = control.usefulInterval!;
  const controlDominated = findingInterval.upper <= controlInterval.lower;
  if (controlDominated) {
    return {
      outcome: 'default-off',
      claimCeiling: evidenceClass === 'contextual-quality' ? 'quality-usefulness' : 'review-target-utility',
      rationaleCode: 'control-dominated',
      terminal: true,
    };
  }
  if (findingInterval.upper < 0.5) {
    return {
      outcome: 'default-off',
      claimCeiling: evidenceClass === 'contextual-quality' ? 'quality-usefulness' : 'review-target-utility',
      rationaleCode: 'finding-below-quality-floor',
      terminal: true,
    };
  }
  if (
    evidenceClass === 'contextual-quality'
    && findingInterval.lower >= 0.7
    && controlInterval.upper <= 0.3
  ) {
    return {
      outcome: 'default-on',
      claimCeiling: 'quality-usefulness',
      rationaleCode: 'contextual-default-on',
      terminal: true,
    };
  }
  const reviewUtilityBar = findingInterval.lower >= 0.5
    && findingInterval.lower > controlInterval.upper;
  if (reviewUtilityBar && (evidenceClass === 'statistical-review-utility' || round === 'final')) {
    return {
      outcome: 'quality-advisory',
      claimCeiling: 'review-target-utility',
      rationaleCode: 'review-utility',
      terminal: true,
    };
  }
  if (pending) {
    return {
      outcome: 'insufficient-evidence',
      claimCeiling: 'insufficient-evidence',
      rationaleCode: 'initial-expansion-required',
      terminal: false,
    };
  }
  return {
    outcome: 'insufficient-evidence',
    claimCeiling: 'insufficient-evidence',
    rationaleCode: 'insufficient-final-certainty',
    terminal: true,
  };
}

function countRows(
  ruleId: string,
  rounds: readonly ValidatedRound[],
): Readonly<Record<CAL002QualityRole, CAL002QualityLabelCounts>> {
  const finding = emptyLabelCounts();
  const control = emptyLabelCounts();
  for (const round of rounds) {
    for (const row of round.assignment.rows) {
      if (row.ruleId !== ruleId) continue;
      const label = round.labelsByReviewId.get(row.reviewId);
      if (label === undefined) throw new TypeError(`CAL-002 review label is missing for ${row.reviewId}`);
      addLabel(row.role === 'finding' ? finding : control, label);
    }
  }
  return { finding, control };
}

function rowsForRule(
  rows: readonly CAL002QualityAssignmentRow[],
  ruleId: string,
  role: CAL002QualityRole,
): number {
  return rows.filter((row) => row.ruleId === ruleId && row.role === role).length;
}

function validateCountAccounting(
  round: ValidatedRound,
  prior: ValidatedRound | undefined,
  ruleIds: readonly string[] = REVIEW_IDS,
): void {
  const target = round.round === 'initial' ? 30 : 100;
  for (const ruleId of ruleIds) {
    for (const role of ['finding', 'control'] as const) {
      const selected = rowsForRule(round.assignment.rows, ruleId, role)
        + (prior === undefined ? 0 : rowsForRule(prior.assignment.rows, ruleId, role));
      if (selected > target) {
        throw new TypeError(`CAL-002 ${round.round} ${ruleId} ${role} rows exceed the cumulative ${target} cap`);
      }
      const shortage = round.shortages.find((candidate) =>
        candidate.ruleId === ruleId && candidate.role === role && candidate.reason === 'count');
      if (selected < target) {
        if (shortage === undefined || shortage.requested !== target || shortage.selected !== selected) {
          throw new TypeError(`CAL-002 ${round.round} ${ruleId} ${role} count shortage does not match assigned rows`);
        }
      } else if (shortage !== undefined) {
        throw new TypeError(`CAL-002 ${round.round} ${ruleId} ${role} count shortage contradicts assigned rows`);
      }
    }
  }
}

function evaluationFor(
  ruleId: string,
  evidenceClass: CAL002QualityEvidenceClass,
  currentRound: CAL002QualityRound,
  rounds: readonly ValidatedRound[],
): CAL002QualityEvaluation {
  const labels = countRows(ruleId, rounds);
  const finding = armEvaluation(labels.finding);
  const control = armEvaluation(labels.control);
  const requestedPerArm = currentRound === 'initial' ? 30 as const : 100 as const;
  const determinateFloor = Math.ceil(requestedPerArm * 0.8);
  const current = rounds[rounds.length - 1]!;
  const hasShortage = shortageForRule(current.shortages, ruleId);
  const decision = decisionFor({
    evidenceClass,
    round: currentRound,
    finding,
    control,
    determinateFloor,
    hasShortage,
  });
  const findingInterval = finding.usefulInterval;
  const controlInterval = control.usefulInterval;
  const reviewUtilityBar = findingInterval !== undefined
    && controlInterval !== undefined
    && findingInterval.lower >= 0.5
    && findingInterval.lower > controlInterval.upper;
  const controlDominated = findingInterval !== undefined
    && controlInterval !== undefined
    && findingInterval.upper <= controlInterval.lower;
  return {
    ruleId,
    evidenceClass,
    requestedPerArm,
    determinateFloor,
    finding,
    control,
    reviewUtilityBar,
    controlDominated,
    ...decision,
    ...(!decision.terminal ? { nextRound: { findings: 100 as const, controls: 100 as const } } : {}),
  };
}

function validateRoundCombination(
  initial: ValidatedRound,
  final: ValidatedRound | undefined,
  initialEvaluations: readonly CAL002QualityEvaluation[],
): void {
  validateCountAccounting(initial, undefined);
  if (final === undefined) return;

  const expansionIds = new Set(initialEvaluations.filter((row) => !row.terminal).map((row) => row.ruleId));
  if (expansionIds.size === 0) {
    throw new TypeError('CAL-002 final assignment is invalid when no initial rule requires expansion');
  }
  const finalIds = new Set([
    ...final.assignment.rows.map((row) => row.ruleId),
    ...final.shortages.map((row) => row.ruleId),
  ]);
  if (
    finalIds.size !== expansionIds.size
    || [...finalIds].some((ruleId) => !expansionIds.has(ruleId))
  ) {
    throw new TypeError('CAL-002 final assignment does not exactly cover the initial expansion rules');
  }

  const priorUnits = new Set(initial.assignment.rows.map((row) => `${row.ruleId}\0${row.unitId}`));
  for (const row of final.assignment.rows) {
    if (priorUnits.has(`${row.ruleId}\0${row.unitId}`)) {
      throw new TypeError(`CAL-002 final assignment repeats a prior source-bound row for ${row.ruleId}`);
    }
  }
  validateCountAccounting(final, initial, [...expansionIds]);
}

export function reduceCAL002QualityEvidence(
  input: ReduceCAL002QualityEvidenceInput,
): CAL002QualityMetricsResult {
  requireRecord(input, 'CAL-002 quality reducer input');
  const inputKeys = Object.keys(input);
  if (inputKeys.some((key) => ![
    'catalog',
    'oracleReceipt',
    'initial',
    'final',
    'reducerImplementationCommitSha',
  ].includes(key))) {
    throw new TypeError('CAL-002 quality reducer input has unknown fields');
  }
  assertCommitSha(input.reducerImplementationCommitSha, 'reducerImplementationCommitSha');
  const qualityClasses = validateCatalog(input.catalog);
  const oracleDispositions = validateOracleReceipt(input.oracleReceipt);
  const initial = validateRound(input.initial, 'initial', qualityClasses);
  let final: ValidatedRound | undefined;
  if (Object.hasOwn(input, 'final')) {
    if (input.final === undefined) throw new TypeError('CAL-002 final assignment/review pair is incomplete');
    final = validateRound(input.final, 'final', qualityClasses);
  }

  const initialEvaluations = REVIEW_IDS.map((ruleId) => evaluationFor(
    ruleId,
    qualityClasses.get(ruleId)!,
    'initial',
    [initial],
  ));
  validateRoundCombination(initial, final, initialEvaluations);

  const finalRuleIds = new Set(final?.assignment.rows.map((row) => row.ruleId) ?? []);
  for (const shortage of final?.shortages ?? []) finalRuleIds.add(shortage.ruleId);
  const evaluations = REVIEW_IDS.map((ruleId) => {
    if (final !== undefined && finalRuleIds.has(ruleId)) {
      return evaluationFor(ruleId, qualityClasses.get(ruleId)!, 'final', [initial, final]);
    }
    return initialEvaluations.find((row) => row.ruleId === ruleId)!;
  });
  const expansionRequests = initialEvaluations
    .filter((row) => !row.terminal && final === undefined)
    .map((row): CAL002QualityExpansionRequest => ({
      ruleId: row.ruleId,
      findings: 70,
      controls: 70,
    }));
  const current = final ?? initial;
  const metrics: CAL002QualityMetrics = {
    version: CAL002_QUALITY_METRICS_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    assignmentSha256: current.assignment.assignmentSha256,
    reviewReceiptSha256: current.reviewReceiptSha256,
    reducerImplementationCommitSha: input.reducerImplementationCommitSha,
    rows: evaluations.map((row): CAL002QualityMetricsRow => ({
      ruleId: row.ruleId,
      evidenceClass: row.evidenceClass,
      requestedPerArm: row.requestedPerArm,
      finding: row.finding.labels,
      control: row.control.labels,
      outcome: row.outcome,
      claimCeiling: row.claimCeiling,
    })),
    admitted: false,
  };
  const validation = validateCAL002QualityMetrics(metrics);
  if (!validation.ok) {
    throw new TypeError(`CAL-002 quality metrics output is invalid: ${validation.errors.join('; ')}`);
  }
  const artifact = canonicalArtifact(metrics);
  const rounds = [initial, ...(final === undefined ? [] : [final])];
  return {
    metrics,
    metricsJson: artifact.json,
    metricsSha256: artifact.sha256,
    evaluations,
    expansionRequests,
    oracleDispositions,
    roundBindings: rounds.map((round) => ({
      round: round.round,
      assignmentSha256: round.assignment.assignmentSha256,
      reviewReceiptSha256: round.reviewReceiptSha256,
      blindedBatchSha256: round.assignment.blindedBatchSha256,
    })),
  };
}
