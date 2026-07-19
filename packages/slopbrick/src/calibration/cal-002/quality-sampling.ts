import { createHash } from 'node:crypto';
import {
  CAL002_ASSIGNMENT_VERSION,
  CAL002_PROTOCOL_VERSION,
  assertCommitSha,
  assertSha256,
  canonicalArtifact,
  validateCAL002Assignment,
  type CAL002EvidenceClass,
} from './contracts';
import {
  assertCorpusV1SourceUse,
  type CorpusV1SourceDisposition,
} from '../corpus-v1/source-policy';

type CAL002QualityReviewClass = Extract<
  CAL002EvidenceClass,
  'contextual-quality' | 'statistical-review-utility'
>;
type CAL002QualityRole = 'finding' | 'control';
type CAL002QualityRound = 'initial' | 'final';

export interface CAL002QualityFinding {
  readonly ruleId: string;
  readonly line: number;
  readonly column: number;
  readonly messageSha256: string;
}

export interface CAL002QualityObservation {
  readonly unitId: string;
  readonly familyId: string;
  readonly language: string;
  readonly byteCount: number;
  readonly contentSha256: string;
  readonly findings: readonly CAL002QualityFinding[];
}

export interface CAL002QualityLaneDecision {
  readonly ruleId: string;
  readonly lane: 'quality';
  readonly evidenceClass: CAL002QualityReviewClass;
}

export interface CAL002QualityAssignmentRow {
  readonly reviewId: string;
  readonly ruleId: string;
  readonly evidenceClass: CAL002QualityReviewClass;
  readonly role: CAL002QualityRole;
  readonly unitId: string;
}

export interface CAL002QualityBlindedRow {
  readonly reviewId: string;
  readonly ruleId: string;
  readonly evidenceClass: CAL002QualityReviewClass;
  readonly sourceIdentitySha256: string;
  readonly lineWindowLocator: string;
}

export interface CAL002QualityAssignment {
  readonly version: typeof CAL002_ASSIGNMENT_VERSION;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION;
  readonly catalogSha256: string;
  readonly assignmentImplementationCommitSha: string;
  readonly assignmentId: string;
  readonly assignmentSha256: string;
  readonly selectionManifestSha256: string;
  readonly blindedBatchSha256: string;
  readonly round: CAL002QualityRound;
  readonly targetPerArm: 30 | 100;
  readonly rows: readonly CAL002QualityAssignmentRow[];
  readonly blindedRows: readonly CAL002QualityBlindedRow[];
  readonly admitted: false;
}

export interface CAL002QualityShortage {
  readonly ruleId: string;
  readonly role: CAL002QualityRole;
  readonly reason: 'count' | 'family-reach' | 'matched-strata';
  readonly requested: number;
  readonly selected: number;
  readonly missing: number;
}

export interface BuildCAL002QualityAssignmentInput {
  readonly catalogSha256: string;
  readonly assignmentImplementationCommitSha: string;
  readonly assignmentId: string;
  readonly round: CAL002QualityRound;
  readonly laneDecisions: readonly CAL002QualityLaneDecision[];
  readonly observations: readonly CAL002QualityObservation[];
  readonly expansionRuleIds?: readonly string[];
  readonly priorAssignment?: CAL002QualityAssignment;
}

export interface CAL002QualityAssignmentResult {
  readonly assignment: CAL002QualityAssignment;
  readonly assignmentJson: string;
  readonly blindedBatch: readonly CAL002QualityBlindedRow[];
  readonly blindedBatchJson: string;
  readonly blindedBatchSha256: string;
  readonly shortages: readonly CAL002QualityShortage[];
}

export interface CAL002QualitySourceCandidate<TSourceRef> {
  readonly sourceRef: TSourceRef;
  readonly unitId: string;
  readonly familyId: string;
  readonly language: string;
  readonly contentSha256: string;
}

export interface ScanCAL002QualitySourceCandidatesInput<TSourceRef> {
  readonly disposition: CorpusV1SourceDisposition;
  readonly candidates: readonly CAL002QualitySourceCandidate<TSourceRef>[];
  readonly readCandidate: (sourceRef: TSourceRef) => Promise<Uint8Array>;
  readonly scanCandidate: (
    sourceRef: TSourceRef,
    bytes: Uint8Array,
  ) => Promise<readonly CAL002QualityFinding[]>;
}

interface SelectedRow {
  readonly ruleId: string;
  readonly evidenceClass: CAL002QualityReviewClass;
  readonly role: CAL002QualityRole;
  readonly unitId: string;
}

const RULE_ID = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/u;
const QUALITY_REVIEW_CLASSES: ReadonlySet<unknown> = new Set([
  'contextual-quality',
  'statistical-review-utility',
]);
const OBSERVATION_KEYS = ['unitId', 'familyId', 'language', 'byteCount', 'contentSha256', 'findings'] as const;
const FINDING_KEYS = ['ruleId', 'line', 'column', 'messageSha256'] as const;
const LANE_DECISION_KEYS = ['ruleId', 'lane', 'evidenceClass'] as const;
const FAMILY_REACH_TARGET = 5;

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hashParts(...parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\0'), 'utf8').digest('hex');
}

function selectionKey(ruleId: string, role: CAL002QualityRole, unitId: string): string {
  return hashParts(CAL002_PROTOCOL_VERSION, ruleId, role, unitId);
}

function reviewId(selectionManifestSha256: string, ruleId: string, unitId: string): string {
  return hashParts(CAL002_PROTOCOL_VERSION, selectionManifestSha256, ruleId, unitId);
}

function presentationKey(selectionManifestSha256: string, id: string): string {
  return hashParts(CAL002_PROTOCOL_VERSION, 'presentation', selectionManifestSha256, id);
}

function lineWindowLocator(
  selectionManifestSha256: string,
  id: string,
  sourceIdentitySha256: string,
): string {
  return `window:${hashParts(
    CAL002_PROTOCOL_VERSION,
    'window',
    selectionManifestSha256,
    id,
    sourceIdentitySha256,
  )}`;
}

function byteBucket(byteCount: number): number {
  return Math.floor(Math.log2(Math.max(1, byteCount)));
}

function requireRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function requireExactKeys(record: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) throw new TypeError(`${label} ${key} is unknown`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(record, key)) throw new TypeError(`${label} ${key} is required`);
  }
}

function requireNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
}

function requireRuleId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !RULE_ID.test(value)) throw new TypeError(`${label} must be a canonical rule ID`);
}

function requirePositiveInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 1) throw new TypeError(`${label} must be a positive integer`);
}

function isQualityReviewClass(value: unknown): value is CAL002QualityReviewClass {
  return QUALITY_REVIEW_CLASSES.has(value);
}

function validateFinding(value: unknown, label: string): asserts value is CAL002QualityFinding {
  requireRecord(value, label);
  requireExactKeys(value, FINDING_KEYS, label);
  requireRuleId(value.ruleId, `${label} ruleId`);
  requirePositiveInteger(value.line, `${label} line`);
  requirePositiveInteger(value.column, `${label} column`);
  assertSha256(value.messageSha256, `${label} messageSha256`);
}

function validateObservation(value: unknown, index: number): asserts value is CAL002QualityObservation {
  const label = `Quality observation[${index}]`;
  requireRecord(value, label);
  requireExactKeys(value, OBSERVATION_KEYS, label);
  requireNonEmptyString(value.unitId, `${label} unitId`);
  requireNonEmptyString(value.familyId, `${label} familyId`);
  requireNonEmptyString(value.language, `${label} language`);
  if (!Number.isInteger(value.byteCount) || (value.byteCount as number) < 0) {
    throw new TypeError(`${label} byteCount must be a non-negative integer`);
  }
  assertSha256(value.contentSha256, `${label} contentSha256`);
  if (!Array.isArray(value.findings)) throw new TypeError(`${label} findings must be an array`);
  value.findings.forEach((finding, findingIndex) => validateFinding(finding, `${label} finding[${findingIndex}]`));
}

function sortedFindings(findings: readonly CAL002QualityFinding[]): readonly CAL002QualityFinding[] {
  return [...findings].sort((left, right) =>
    compareCodePoints(left.ruleId, right.ruleId)
    || left.line - right.line
    || left.column - right.column
    || compareCodePoints(left.messageSha256, right.messageSha256));
}

function indexObservations(rows: readonly CAL002QualityObservation[]): Map<string, CAL002QualityObservation> {
  if (!Array.isArray(rows)) throw new TypeError('Quality observations must be an array');
  const observations = new Map<string, CAL002QualityObservation>();
  rows.forEach((row, index) => {
    validateObservation(row, index);
    if (observations.has(row.unitId)) throw new TypeError(`Duplicate quality observation unitId ${row.unitId}`);
    observations.set(row.unitId, { ...row, findings: sortedFindings(row.findings) });
  });
  return observations;
}

function indexLaneDecisions(rows: readonly CAL002QualityLaneDecision[]): Map<string, CAL002QualityLaneDecision> {
  if (!Array.isArray(rows)) throw new TypeError('Quality lane decisions must be an array');
  const decisions = new Map<string, CAL002QualityLaneDecision>();
  rows.forEach((row, index) => {
    const label = `Quality lane decision[${index}]`;
    requireRecord(row, label);
    requireExactKeys(row, LANE_DECISION_KEYS, label);
    requireRuleId(row.ruleId, `${label} ruleId`);
    if (row.lane !== 'quality') throw new TypeError(`${label} lane must be quality`);
    if (!isQualityReviewClass(row.evidenceClass)) {
      throw new TypeError(`${label} evidenceClass must be contextual or statistical review evidence`);
    }
    if (decisions.has(row.ruleId)) throw new TypeError(`Duplicate quality lane decision ${row.ruleId}`);
    decisions.set(row.ruleId, {
      ruleId: row.ruleId,
      lane: row.lane,
      evidenceClass: row.evidenceClass,
    });
  });
  return decisions;
}

function compareSelectedRows(left: SelectedRow, right: SelectedRow): number {
  return compareCodePoints(left.ruleId, right.ruleId)
    || compareCodePoints(left.role, right.role)
    || compareCodePoints(left.unitId, right.unitId);
}

function relevantFinding(observation: CAL002QualityObservation, ruleId: string): CAL002QualityFinding | undefined {
  return observation.findings.find((finding) => finding.ruleId === ruleId);
}

function bestAvailableCandidate(
  candidates: readonly CAL002QualityObservation[],
  usedUnits: ReadonlySet<string>,
  compare: (left: CAL002QualityObservation, right: CAL002QualityObservation) => number,
): CAL002QualityObservation | undefined {
  let best: CAL002QualityObservation | undefined;
  for (const candidate of candidates) {
    if (usedUnits.has(candidate.unitId)) continue;
    if (best === undefined || compare(candidate, best) < 0) best = candidate;
  }
  return best;
}

function selectFindings(
  ruleId: string,
  candidates: readonly CAL002QualityObservation[],
  requested: number,
  usedUnits: Set<string>,
  priorFamilies: ReadonlySet<string>,
): CAL002QualityObservation[] {
  const selected: CAL002QualityObservation[] = [];
  const selectedFamilies = new Set(priorFamilies);
  while (selected.length < requested) {
    const next = bestAvailableCandidate(candidates, usedUnits, (left, right) =>
        Number(selectedFamilies.has(left.familyId)) - Number(selectedFamilies.has(right.familyId))
        || compareCodePoints(selectionKey(ruleId, 'finding', left.unitId), selectionKey(ruleId, 'finding', right.unitId)));
    if (next === undefined) break;
    selected.push(next);
    selectedFamilies.add(next.familyId);
    usedUnits.add(next.unitId);
  }
  return selected;
}

interface ControlSelection {
  readonly selected: readonly CAL002QualityObservation[];
  readonly requiredMatches: number;
}

function selectControls(
  ruleId: string,
  candidates: readonly CAL002QualityObservation[],
  requested: number,
  matchedFindings: readonly CAL002QualityObservation[],
  usedUnits: Set<string>,
  priorFamilies: ReadonlySet<string>,
): ControlSelection {
  const selected: CAL002QualityObservation[] = [];
  const selectedFamilies = new Set(priorFamilies);
  const requiredMatches = matchedFindings.slice(0, requested);
  for (const match of requiredMatches) {
    const eligible = candidates.filter((candidate) =>
      candidate.language === match.language
      && byteBucket(candidate.byteCount) === byteBucket(match.byteCount));
    const next = bestAvailableCandidate(eligible, usedUnits, (left, right) =>
      Number(selectedFamilies.has(left.familyId)) - Number(selectedFamilies.has(right.familyId))
      || compareCodePoints(selectionKey(ruleId, 'control', left.unitId), selectionKey(ruleId, 'control', right.unitId)));
    if (next === undefined) continue;
    selected.push(next);
    selectedFamilies.add(next.familyId);
    usedUnits.add(next.unitId);
  }
  return { selected, requiredMatches: requiredMatches.length };
}

function priorCounts(
  prior: CAL002QualityAssignment | undefined,
): Map<string, Readonly<Record<CAL002QualityRole, number>>> {
  const counts = new Map<string, Record<CAL002QualityRole, number>>();
  for (const row of prior?.rows ?? []) {
    const current = counts.get(row.ruleId) ?? { finding: 0, control: 0 };
    current[row.role] += 1;
    counts.set(row.ruleId, current);
  }
  return counts;
}

function priorRowsForRule(
  prior: CAL002QualityAssignment | undefined,
  ruleId: string,
): readonly CAL002QualityAssignmentRow[] {
  return prior?.rows.filter((row) => row.ruleId === ruleId) ?? [];
}

function familiesForRole(
  rows: readonly Pick<CAL002QualityAssignmentRow, 'role' | 'unitId'>[],
  role: CAL002QualityRole,
  observationsByUnit: ReadonlyMap<string, CAL002QualityObservation>,
): Set<string> {
  const families = new Set<string>();
  for (const row of rows) {
    if (row.role !== role) continue;
    const observation = observationsByUnit.get(row.unitId);
    if (observation !== undefined) families.add(observation.familyId);
  }
  return families;
}

function unmatchedPriorFindings(
  priorRows: readonly CAL002QualityAssignmentRow[],
  observationsByUnit: ReadonlyMap<string, CAL002QualityObservation>,
): CAL002QualityObservation[] {
  const controlsByStratum = new Map<string, number>();
  for (const row of priorRows) {
    if (row.role !== 'control') continue;
    const observation = observationsByUnit.get(row.unitId);
    if (observation === undefined) continue;
    const stratum = `${observation.language}\0${byteBucket(observation.byteCount)}`;
    controlsByStratum.set(stratum, (controlsByStratum.get(stratum) ?? 0) + 1);
  }
  const unmatched: CAL002QualityObservation[] = [];
  for (const row of priorRows) {
    if (row.role !== 'finding') continue;
    const observation = observationsByUnit.get(row.unitId);
    if (observation === undefined) continue;
    const stratum = `${observation.language}\0${byteBucket(observation.byteCount)}`;
    const remainingControls = controlsByStratum.get(stratum) ?? 0;
    if (remainingControls > 0) {
      controlsByStratum.set(stratum, remainingControls - 1);
    } else {
      unmatched.push(observation);
    }
  }
  return unmatched;
}

interface RuleSelection {
  readonly rows: readonly SelectedRow[];
  readonly matchedStrataRequested: number;
  readonly matchedStrataSelected: number;
}

function selectedRowsForRule(
  decision: CAL002QualityLaneDecision,
  observations: readonly CAL002QualityObservation[],
  observationsByUnit: ReadonlyMap<string, CAL002QualityObservation>,
  priorRows: readonly CAL002QualityAssignmentRow[],
  requestedByRole: Readonly<Record<CAL002QualityRole, number>>,
  usedUnits: Set<string>,
): RuleSelection {
  const findings = observations.filter((observation) => relevantFinding(observation, decision.ruleId) !== undefined);
  const controls = observations.filter((observation) => relevantFinding(observation, decision.ruleId) === undefined);
  const selectedFindings = selectFindings(
    decision.ruleId,
    findings,
    requestedByRole.finding,
    usedUnits,
    familiesForRole(priorRows, 'finding', observationsByUnit),
  );
  const controlSelection = selectControls(
    decision.ruleId,
    controls,
    requestedByRole.control,
    [...unmatchedPriorFindings(priorRows, observationsByUnit), ...selectedFindings],
    usedUnits,
    familiesForRole(priorRows, 'control', observationsByUnit),
  );
  const rows = [
    ...selectedFindings.map((observation): SelectedRow => ({
      ruleId: decision.ruleId,
      evidenceClass: decision.evidenceClass,
      role: 'finding',
      unitId: observation.unitId,
    })),
    ...controlSelection.selected.map((observation): SelectedRow => ({
      ruleId: decision.ruleId,
      evidenceClass: decision.evidenceClass,
      role: 'control',
      unitId: observation.unitId,
    })),
  ];
  return {
    rows,
    matchedStrataRequested: controlSelection.requiredMatches,
    matchedStrataSelected: controlSelection.selected.length,
  };
}

function validatePriorAssignmentIntegrity(
  prior: CAL002QualityAssignment,
  catalogSha256: string,
): void {
  const priorValidation = validateCAL002Assignment(prior);
  if (!priorValidation.ok) {
    throw new TypeError(`Final quality prior assignment is invalid: ${priorValidation.errors.join('; ')}`);
  }
  if (prior.round !== 'initial' || prior.targetPerArm !== 30) {
    throw new TypeError('Final quality prior assignment must be an initial 30-per-arm assignment');
  }
  if (prior.catalogSha256 !== catalogSha256) {
    throw new TypeError('Final quality prior assignment catalog hash does not match');
  }

  const selectedWithoutReviewIds = prior.rows.map(({ reviewId: _reviewId, ...row }) => row);
  const expectedSelectionManifestSha256 = canonicalArtifact(selectedWithoutReviewIds).sha256;
  if (prior.selectionManifestSha256 !== expectedSelectionManifestSha256) {
    throw new TypeError('Final quality prior selection manifest hash does not match its rows');
  }

  const seenRuleUnits = new Set<string>();
  const counts = new Map<string, number>();
  for (const row of prior.rows) {
    const ruleUnit = `${row.ruleId}\0${row.unitId}`;
    if (seenRuleUnits.has(ruleUnit)) {
      throw new TypeError(`Final quality prior assignment has duplicate rule/unit ${row.ruleId} ${row.unitId}`);
    }
    seenRuleUnits.add(ruleUnit);
    const expectedReviewId = reviewId(expectedSelectionManifestSha256, row.ruleId, row.unitId);
    if (row.reviewId !== expectedReviewId) {
      throw new TypeError(`Final quality prior review ID does not match ${row.ruleId} ${row.unitId}`);
    }
    const arm = `${row.ruleId}\0${row.role}`;
    const count = (counts.get(arm) ?? 0) + 1;
    if (count > 30) {
      throw new TypeError(`Final quality prior assignment exceeds the initial 30-per-arm ceiling for ${row.ruleId}`);
    }
    counts.set(arm, count);
  }

  const blindedByReviewId = new Map(prior.blindedRows.map((row) => [row.reviewId, row]));
  if (blindedByReviewId.size !== prior.rows.length || prior.blindedRows.length !== prior.rows.length) {
    throw new TypeError('Final quality prior blinded rows do not correspond one-to-one with assignment rows');
  }
  for (const row of prior.rows) {
    const blinded = blindedByReviewId.get(row.reviewId);
    if (
      blinded === undefined
      || blinded.ruleId !== row.ruleId
      || blinded.evidenceClass !== row.evidenceClass
    ) {
      throw new TypeError(`Final quality prior blinded row does not match review ID ${row.reviewId}`);
    }
  }

  if (prior.blindedBatchSha256 !== canonicalArtifact(prior.blindedRows).sha256) {
    throw new TypeError('Final quality prior blinded batch hash does not match its rows');
  }
  const { assignmentSha256: _assignmentSha256, ...withoutSelfHash } = prior;
  if (prior.assignmentSha256 !== canonicalArtifact(withoutSelfHash).sha256) {
    throw new TypeError('Final quality prior assignment hash does not match its artifact');
  }
}

function finalRuleIds(
  input: BuildCAL002QualityAssignmentInput,
  decisions: ReadonlyMap<string, CAL002QualityLaneDecision>,
): readonly string[] {
  if (input.round === 'initial') {
    if (input.priorAssignment !== undefined || input.expansionRuleIds !== undefined) {
      throw new TypeError('Initial quality assignment cannot include prior assignment or expansion rule IDs');
    }
    return [...decisions.keys()].sort(compareCodePoints);
  }
  if (input.priorAssignment === undefined) throw new TypeError('Final quality assignment requires a prior assignment');
  validatePriorAssignmentIntegrity(input.priorAssignment, input.catalogSha256);
  if (!Array.isArray(input.expansionRuleIds)) throw new TypeError('Final quality assignment requires expansion rule IDs');
  const ids = new Set<string>();
  for (const ruleId of input.expansionRuleIds) {
    requireRuleId(ruleId, 'Quality expansion ruleId');
    if (!decisions.has(ruleId)) throw new TypeError(`Quality expansion rule ${ruleId} has no lane decision`);
    if (ids.has(ruleId)) throw new TypeError(`Duplicate quality expansion rule ${ruleId}`);
    ids.add(ruleId);
  }
  return [...ids].sort(compareCodePoints);
}

function validateInputHeader(input: BuildCAL002QualityAssignmentInput): void {
  assertSha256(input.catalogSha256, 'catalogSha256');
  assertCommitSha(input.assignmentImplementationCommitSha, 'assignmentImplementationCommitSha');
  requireNonEmptyString(input.assignmentId, 'assignmentId');
  if (input.round !== 'initial' && input.round !== 'final') throw new TypeError('Quality assignment round is invalid');
}

export function buildCAL002QualityAssignment(
  input: BuildCAL002QualityAssignmentInput,
): CAL002QualityAssignmentResult {
  validateInputHeader(input);
  const decisions = indexLaneDecisions(input.laneDecisions);
  const observationsByUnit = indexObservations(input.observations);
  const observations = [...observationsByUnit.values()].sort((left, right) => compareCodePoints(left.unitId, right.unitId));
  const ruleIds = finalRuleIds(input, decisions);
  const targetPerArm = input.round === 'initial' ? 30 as const : 100 as const;
  const countsBefore = priorCounts(input.priorAssignment);
  const usedUnitsByRule = new Map<string, Set<string>>();
  for (const row of input.priorAssignment?.rows ?? []) {
    const usedUnits = usedUnitsByRule.get(row.ruleId) ?? new Set<string>();
    usedUnits.add(row.unitId);
    usedUnitsByRule.set(row.ruleId, usedUnits);
  }
  const selected: SelectedRow[] = [];
  const selectionByRule = new Map<string, RuleSelection>();

  for (const ruleId of ruleIds) {
    const prior = countsBefore.get(ruleId) ?? { finding: 0, control: 0 };
    if (prior.finding > targetPerArm || prior.control > targetPerArm) {
      throw new TypeError(`Prior quality assignment exceeds the ${targetPerArm}/${targetPerArm} cap for ${ruleId}`);
    }
    const priorRows = priorRowsForRule(input.priorAssignment, ruleId);
    const usedUnits = usedUnitsByRule.get(ruleId) ?? new Set<string>();
    usedUnitsByRule.set(ruleId, usedUnits);
    const ruleSelection = selectedRowsForRule(
      decisions.get(ruleId)!,
      observations,
      observationsByUnit,
      priorRows,
      {
        finding: targetPerArm - prior.finding,
        control: targetPerArm - prior.control,
      },
      usedUnits,
    );
    selectionByRule.set(ruleId, ruleSelection);
    selected.push(...ruleSelection.rows);
  }
  selected.sort(compareSelectedRows);

  const selectionManifestSha256 = canonicalArtifact(selected).sha256;
  const rows = selected.map((row): CAL002QualityAssignmentRow => ({
    reviewId: reviewId(selectionManifestSha256, row.ruleId, row.unitId),
    ...row,
  }));
  const blindedRows = rows.map((row): CAL002QualityBlindedRow => {
    const observation = observationsByUnit.get(row.unitId)!;
    return {
      reviewId: row.reviewId,
      ruleId: row.ruleId,
      evidenceClass: row.evidenceClass,
      sourceIdentitySha256: observation.contentSha256,
      lineWindowLocator: lineWindowLocator(
        selectionManifestSha256,
        row.reviewId,
        observation.contentSha256,
      ),
    };
  }).sort((left, right) =>
    compareCodePoints(
      presentationKey(selectionManifestSha256, left.reviewId),
      presentationKey(selectionManifestSha256, right.reviewId),
    ) || compareCodePoints(left.reviewId, right.reviewId));
  const blindedBatchArtifact = canonicalArtifact(blindedRows);
  const assignmentWithoutSelfHash = {
    version: CAL002_ASSIGNMENT_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: input.catalogSha256,
    assignmentImplementationCommitSha: input.assignmentImplementationCommitSha,
    assignmentId: input.assignmentId,
    selectionManifestSha256,
    blindedBatchSha256: blindedBatchArtifact.sha256,
    round: input.round,
    targetPerArm,
    rows,
    blindedRows,
    admitted: false as const,
  };
  const assignment: CAL002QualityAssignment = {
    ...assignmentWithoutSelfHash,
    assignmentSha256: canonicalArtifact(assignmentWithoutSelfHash).sha256,
  };
  const shortages: CAL002QualityShortage[] = [];
  for (const ruleId of ruleIds) {
    const prior = countsBefore.get(ruleId) ?? { finding: 0, control: 0 };
    const priorRows = priorRowsForRule(input.priorAssignment, ruleId);
    const selectedForRule = selected.filter((row) => row.ruleId === ruleId);
    for (const role of ['control', 'finding'] as const) {
      const selectedCount = selectedForRule.filter((row) => row.role === role).length;
      const cumulative = prior[role] + selectedCount;
      if (cumulative < targetPerArm) {
        shortages.push({
          ruleId,
          role,
          reason: 'count',
          requested: targetPerArm,
          selected: cumulative,
          missing: targetPerArm - cumulative,
        });
      }
      const familyCount = familiesForRole(
        [...priorRows, ...selectedForRule],
        role,
        observationsByUnit,
      ).size;
      if (familyCount < FAMILY_REACH_TARGET) {
        shortages.push({
          ruleId,
          role,
          reason: 'family-reach',
          requested: FAMILY_REACH_TARGET,
          selected: familyCount,
          missing: FAMILY_REACH_TARGET - familyCount,
        });
      }
    }
    const ruleSelection = selectionByRule.get(ruleId)!;
    if (ruleSelection.matchedStrataSelected < ruleSelection.matchedStrataRequested) {
      shortages.push({
        ruleId,
        role: 'control',
        reason: 'matched-strata',
        requested: ruleSelection.matchedStrataRequested,
        selected: ruleSelection.matchedStrataSelected,
        missing: ruleSelection.matchedStrataRequested - ruleSelection.matchedStrataSelected,
      });
    }
  }
  shortages.sort((left, right) =>
    compareCodePoints(left.ruleId, right.ruleId)
    || compareCodePoints(left.role, right.role)
    || compareCodePoints(left.reason, right.reason));
  const assignmentArtifact = canonicalArtifact(assignment);
  return {
    assignment,
    assignmentJson: assignmentArtifact.json,
    blindedBatch: blindedRows,
    blindedBatchJson: blindedBatchArtifact.json,
    blindedBatchSha256: blindedBatchArtifact.sha256,
    shortages,
  };
}

export async function scanCAL002QualitySourceCandidates<TSourceRef>(
  input: ScanCAL002QualitySourceCandidatesInput<TSourceRef>,
): Promise<readonly CAL002QualityObservation[]> {
  if (input.disposition === undefined) {
    throw new TypeError('Corpus v1 source disposition is required before quality scanning');
  }
  assertCorpusV1SourceUse(input.disposition, 'calibration_evaluation');
  if (!Array.isArray(input.candidates)) throw new TypeError('Quality source candidates must be an array');
  const candidates = [...input.candidates].sort((left, right) => compareCodePoints(left.unitId, right.unitId));
  const seenUnits = new Set<string>();
  const observations: CAL002QualityObservation[] = [];
  for (const [index, candidate] of candidates.entries()) {
    const label = `Quality source candidate[${index}]`;
    requireNonEmptyString(candidate.unitId, `${label} unitId`);
    requireNonEmptyString(candidate.familyId, `${label} familyId`);
    requireNonEmptyString(candidate.language, `${label} language`);
    assertSha256(candidate.contentSha256, `${label} contentSha256`);
    if (seenUnits.has(candidate.unitId)) throw new TypeError(`Duplicate quality source candidate unitId ${candidate.unitId}`);
    seenUnits.add(candidate.unitId);
    const bytes = await input.readCandidate(candidate.sourceRef);
    if (!(bytes instanceof Uint8Array)) throw new TypeError(`${label} reader must return bytes`);
    const observedContentSha256 = createHash('sha256').update(bytes).digest('hex');
    if (observedContentSha256 !== candidate.contentSha256) {
      throw new Error(`${label} content SHA-256 does not match its source binding`);
    }
    const findings = await input.scanCandidate(candidate.sourceRef, bytes);
    if (!Array.isArray(findings)) throw new TypeError(`${label} scanner findings must be an array`);
    findings.forEach((finding, findingIndex) => validateFinding(finding, `${label} finding[${findingIndex}]`));
    observations.push({
      unitId: candidate.unitId,
      familyId: candidate.familyId,
      language: candidate.language,
      byteCount: bytes.byteLength,
      contentSha256: observedContentSha256,
      findings: sortedFindings(findings),
    });
  }
  return observations;
}
