import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import type { Rule } from '../../src/types';
import type { CAL001DecisionRow } from '../../src/calibration/corpus-v1/calibration-decisions';
import { buildCAL002Catalog } from '../../src/calibration/cal-002/catalog';
import {
  CAL002_CONTEXTUAL_RULE_IDS,
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  CAL002_PROTOCOL_VERSION,
  CAL002_STATISTICAL_RULE_IDS,
  canonicalArtifact,
  validateCAL002QualityMetrics,
  type CAL002Catalog,
  type CAL002EvidenceClass,
  type CAL002ReviewLabel,
} from '../../src/calibration/cal-002/contracts';
import {
  buildCAL002OracleReceipt,
  type CAL002OracleReceipt,
} from '../../src/calibration/cal-002/oracles';
import {
  reduceCAL002QualityEvidence,
  wilson95,
  type CAL002QualityEvidenceRound,
  type ReduceCAL002QualityEvidenceInput,
} from '../../src/calibration/cal-002/quality-metrics';
import type { CAL002QualityAssignment } from '../../src/calibration/cal-002/quality-sampling';
import type { CAL002ReviewReceipt } from '../../src/calibration/cal-002/review-session';
import { RuleRegistry } from '../../src/rules/registry';
import { getDefaultOffRules } from '../../src/rules/signal-strength';
import {
  CAL002_ORACLE_DECLARATIONS,
  CAL002_ORACLE_MUTATION_CASES,
  CAL002_ORACLE_SOURCE_CONTROLS,
} from './fixtures/cal-002-oracle-cases';

const COMMIT_SHA = '0123456789abcdef0123456789abcdef01234567';
const HASH_A = 'a'.repeat(64);
const CONTEXTUAL_RULE = CAL002_CONTEXTUAL_RULE_IDS[0];
const SECOND_CONTEXTUAL_RULE = CAL002_CONTEXTUAL_RULE_IDS[1];
const STATISTICAL_RULE = CAL002_STATISTICAL_RULE_IDS[0];
const SECOND_STATISTICAL_RULE = CAL002_STATISTICAL_RULE_IDS[1];
const REVIEW_RULES = [...CAL002_CONTEXTUAL_RULE_IDS, ...CAL002_STATISTICAL_RULE_IDS];

interface LabelCounts {
  readonly actionableDefect: number;
  readonly usefulNoSafeFix: number;
  readonly notUseful: number;
  readonly cannotDetermine: number;
}

interface RuleRoundLabels {
  readonly finding: LabelCounts;
  readonly control: LabelCounts;
}

function sha256(...parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\0'), 'utf8').digest('hex');
}

function fullCatalogFixture(): CAL002Catalog {
  const registry = new RuleRegistry();
  registry.loadBuiltins();
  const rules = registry.getRules() as readonly Pick<Rule, 'id' | 'category' | 'aiSpecific' | 'defaultOff'>[];
  const effectiveDefaultOffRuleIds = getDefaultOffRules();
  const cal001Rows: CAL001DecisionRow[] = rules.map((rule) => {
    const existingDefaultOff = rule.defaultOff === true || effectiveDefaultOffRuleIds.has(rule.id);
    const decision = rule.aiSpecific ? 'default-off' as const : 'quality-only' as const;
    return {
      ruleId: rule.id,
      aiSpecific: rule.aiSpecific,
      existingDefaultOff,
      decision,
      policyAction: decision === 'quality-only' || existingDefaultOff ? 'preserve' : 'owner-review-required',
      evidence: {
        holdoutReceiptSha256: HASH_A,
        metricsSha256: 'b'.repeat(64),
        report: 'CAL-001-v1-origin-discrimination-diagnostic',
      },
      originResult: {
        status: rule.aiSpecific ? 'diagnostic-only' : 'not-evaluated',
        splitStatus: { train: 'available', validation: 'available', test: 'available' },
        ruleStatus: { train: 'ok', validation: 'ok', test: 'ok' },
      },
      usefulnessResult: 'not-evaluated',
      confounds: {
        leakage: 'clear',
        sourceLabels: 'publisher-attested-polarity-not-authorship',
        frameworkBuckets: 'not-available',
        semanticBuckets: 'not-available',
      },
      owner: 'calibration-maintainers',
      rationale: 'Frozen CAL-001 fixture row.',
    };
  });
  return buildCAL002Catalog({
    rules,
    effectiveDefaultOffRuleIds,
    cal001Rows,
    cal001MatrixSha256: HASH_A,
  }).catalog;
}

function oracleReceiptWithFailure(ruleId?: string): CAL002OracleReceipt {
  const caseResults = CAL002_ORACLE_MUTATION_CASES.map((row, index) => {
    if (ruleId === undefined || row.ruleId !== ruleId || index !== CAL002_ORACLE_MUTATION_CASES.findIndex((candidate) => candidate.ruleId === ruleId)) {
      return row;
    }
    return { ...row, observed: row.expected === 'finding' ? 'no-finding' as const : 'finding' as const };
  });
  return buildCAL002OracleReceipt({
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    implementationCommitSha: COMMIT_SHA,
    declarations: CAL002_ORACLE_DECLARATIONS,
    caseResults,
    sourceControls: CAL002_ORACLE_SOURCE_CONTROLS,
  }).receipt;
}

const CATALOG = fullCatalogFixture();
const ORACLE = oracleReceiptWithFailure();

function counts(useful: number, notUseful: number, cannotDetermine = 0, usefulNoSafeFix = 0): LabelCounts {
  return {
    actionableDefect: useful - usefulNoSafeFix,
    usefulNoSafeFix,
    notUseful,
    cannotDetermine,
  };
}

function labelsForCounts(value: LabelCounts): CAL002ReviewLabel[] {
  return [
    ...Array<CAL002ReviewLabel>(value.actionableDefect).fill('actionable-defect'),
    ...Array<CAL002ReviewLabel>(value.usefulNoSafeFix).fill('useful-no-safe-fix'),
    ...Array<CAL002ReviewLabel>(value.notUseful).fill('not-useful'),
    ...Array<CAL002ReviewLabel>(value.cannotDetermine).fill('cannot-determine'),
  ];
}

function evidenceClassFor(ruleId: string): Extract<CAL002EvidenceClass, 'contextual-quality' | 'statistical-review-utility'> {
  return (CAL002_STATISTICAL_RULE_IDS as readonly string[]).includes(ruleId)
    ? 'statistical-review-utility'
    : 'contextual-quality';
}

function terminalInitialLabels(ruleId: string): RuleRoundLabels {
  if (evidenceClassFor(ruleId) === 'statistical-review-utility') {
    return { finding: counts(24, 6), control: counts(6, 24) };
  }
  return { finding: counts(30, 0), control: counts(0, 30) };
}

function buildRound(
  round: 'initial' | 'final',
  overrides: Readonly<Record<string, RuleRoundLabels>> = {},
): CAL002QualityEvidenceRound {
  const selectedRules = round === 'initial' ? REVIEW_RULES : Object.keys(overrides);
  const selectedRows: Array<{
    readonly ruleId: string;
    readonly evidenceClass: ReturnType<typeof evidenceClassFor>;
    readonly role: 'finding' | 'control';
    readonly unitId: string;
  }> = [];
  const labelsByUnitId = new Map<string, CAL002ReviewLabel>();

  for (const ruleId of selectedRules) {
    const ruleLabels = overrides[ruleId] ?? terminalInitialLabels(ruleId);
    for (const role of ['finding', 'control'] as const) {
      for (const [index, label] of labelsForCounts(ruleLabels[role]).entries()) {
        const unitId = `${round}-${ruleId.replace('/', '-')}-${role}-${index}`;
        selectedRows.push({ ruleId, evidenceClass: evidenceClassFor(ruleId), role, unitId });
        labelsByUnitId.set(unitId, label);
      }
    }
  }
  selectedRows.sort((left, right) => left.ruleId.localeCompare(right.ruleId)
    || left.role.localeCompare(right.role)
    || left.unitId.localeCompare(right.unitId));

  const selectionManifestSha256 = canonicalArtifact(selectedRows).sha256;
  const rows = selectedRows.map((row) => ({
    reviewId: sha256(CAL002_PROTOCOL_VERSION, selectionManifestSha256, row.ruleId, row.unitId),
    ...row,
  }));
  const blindedRows = rows.map((row) => {
    const sourceIdentitySha256 = sha256('source', row.unitId);
    return {
      reviewId: row.reviewId,
      ruleId: row.ruleId,
      evidenceClass: row.evidenceClass,
      sourceIdentitySha256,
      lineWindowLocator: `window:${sha256(
        CAL002_PROTOCOL_VERSION,
        'window',
        selectionManifestSha256,
        row.reviewId,
        sourceIdentitySha256,
      )}`,
    };
  }).sort((left, right) => sha256(
    CAL002_PROTOCOL_VERSION, 'presentation', selectionManifestSha256, left.reviewId,
  ).localeCompare(sha256(
    CAL002_PROTOCOL_VERSION, 'presentation', selectionManifestSha256, right.reviewId,
  )) || left.reviewId.localeCompare(right.reviewId));
  const blindedBatchSha256 = canonicalArtifact(blindedRows).sha256;
  const assignmentWithoutSelfHash = {
    version: 'cal-002-assignment-v1' as const,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    assignmentImplementationCommitSha: COMMIT_SHA,
    assignmentId: `cal-002-quality-${round}`,
    selectionManifestSha256,
    blindedBatchSha256,
    round,
    targetPerArm: round === 'initial' ? 30 as const : 100 as const,
    rows,
    blindedRows,
    admitted: false as const,
  };
  const assignment: CAL002QualityAssignment = {
    ...assignmentWithoutSelfHash,
    assignmentSha256: canonicalArtifact(assignmentWithoutSelfHash).sha256,
  };
  const reviewReceipt: CAL002ReviewReceipt = {
    version: 'cal-002-review-receipt-v1',
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    assignmentSha256: assignment.assignmentSha256,
    blindedBatchSha256,
    stateSha256: sha256('state', round, assignment.assignmentSha256),
    reviewImplementationCommitSha: COMMIT_SHA,
    reviewerAuthority: 'repository-owner',
    rows: rows.map((row) => ({
      reviewId: row.reviewId,
      label: labelsByUnitId.get(row.unitId)!,
    })).sort((left, right) => left.reviewId.localeCompare(right.reviewId)),
    admitted: false,
  };
  return { assignment, reviewReceipt, shortages: [] };
}

function inputWith(
  initialOverrides: Readonly<Record<string, RuleRoundLabels>> = {},
  finalOverrides?: Readonly<Record<string, RuleRoundLabels>>,
): ReduceCAL002QualityEvidenceInput {
  return {
    catalog: CATALOG,
    oracleReceipt: ORACLE,
    initial: buildRound('initial', initialOverrides),
    ...(finalOverrides === undefined ? {} : { final: buildRound('final', finalOverrides) }),
    reducerImplementationCommitSha: COMMIT_SHA,
  };
}

function resealAssignment(assignment: CAL002QualityAssignment): CAL002QualityAssignment {
  const { assignmentSha256: _assignmentSha256, ...withoutSelfHash } = assignment;
  return { ...withoutSelfHash, assignmentSha256: canonicalArtifact(withoutSelfHash).sha256 };
}

function rebindRoundRows(
  round: CAL002QualityEvidenceRound,
  mutate: (
    rows: readonly Omit<CAL002QualityAssignment['rows'][number], 'reviewId'>[],
  ) => readonly Omit<CAL002QualityAssignment['rows'][number], 'reviewId'>[],
): CAL002QualityEvidenceRound {
  const priorLabels = new Map(round.reviewReceipt.rows.map((row) => [row.reviewId, row.label]));
  const selectedRows = [...mutate(round.assignment.rows.map(({ reviewId: _reviewId, ...row }) => row))]
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId)
      || left.role.localeCompare(right.role)
      || left.unitId.localeCompare(right.unitId));
  const selectionManifestSha256 = canonicalArtifact(selectedRows).sha256;
  const rows = selectedRows.map((row) => ({
    reviewId: sha256(CAL002_PROTOCOL_VERSION, selectionManifestSha256, row.ruleId, row.unitId),
    ...row,
  }));
  const blindedRows = rows.map((row) => {
    const sourceIdentitySha256 = sha256('source', row.unitId);
    return {
      reviewId: row.reviewId,
      ruleId: row.ruleId,
      evidenceClass: row.evidenceClass,
      sourceIdentitySha256,
      lineWindowLocator: `window:${sha256(
        CAL002_PROTOCOL_VERSION,
        'window',
        selectionManifestSha256,
        row.reviewId,
        sourceIdentitySha256,
      )}`,
    };
  }).sort((left, right) => sha256(
    CAL002_PROTOCOL_VERSION, 'presentation', selectionManifestSha256, left.reviewId,
  ).localeCompare(sha256(
    CAL002_PROTOCOL_VERSION, 'presentation', selectionManifestSha256, right.reviewId,
  )) || left.reviewId.localeCompare(right.reviewId));
  const blindedBatchSha256 = canonicalArtifact(blindedRows).sha256;
  const assignmentWithoutSelfHash = {
    ...round.assignment,
    selectionManifestSha256,
    blindedBatchSha256,
    rows,
    blindedRows,
  };
  const { assignmentSha256: _assignmentSha256, ...unsealed } = assignmentWithoutSelfHash;
  const assignment: CAL002QualityAssignment = {
    ...unsealed,
    assignmentSha256: canonicalArtifact(unsealed).sha256,
  };
  const labels = round.assignment.rows.map((row) => priorLabels.get(row.reviewId)!);
  const reviewReceipt: CAL002ReviewReceipt = {
    ...round.reviewReceipt,
    assignmentSha256: assignment.assignmentSha256,
    blindedBatchSha256,
    rows: rows.map((row, index) => ({ reviewId: row.reviewId, label: labels[index]! }))
      .sort((left, right) => left.reviewId.localeCompare(right.reviewId)),
  };
  return { ...round, assignment, reviewReceipt };
}

describe('CAL-002 Wilson intervals', () => {
  it('freezes two-sided 95% Wilson values to six decimals', () => {
    expect(wilson95(30, 30)).toEqual({ lower: 0.886486, upper: 1 });
    expect(wilson95(0, 30)).toEqual({ lower: 0, upper: 0.113514 });
  });

  it.each([
    [-1, 30],
    [31, 30],
    [1.5, 30],
    [1, 0],
    [1, 2.5],
  ])('rejects invalid Wilson inputs (%s, %s)', (successes, total) => {
    expect(() => wilson95(successes, total)).toThrow(RangeError);
  });
});

describe('CAL-002 quality evidence reduction', () => {
  it('accounts for all labels while excluding cannot-determine from binary intervals', () => {
    const result = reduceCAL002QualityEvidence(inputWith({
      [CONTEXTUAL_RULE]: {
        finding: counts(18, 10, 2, 8),
        control: counts(5, 23, 2, 4),
      },
    }));
    const row = result.evaluations.find((candidate) => candidate.ruleId === CONTEXTUAL_RULE)!;

    expect(row.finding).toMatchObject({
      labels: { actionableDefect: 10, usefulNoSafeFix: 8, notUseful: 10, cannotDetermine: 2 },
      useful: 18,
      determinate: 28,
      usefulInterval: wilson95(18, 28),
    });
    expect(row.control).toMatchObject({ useful: 5, determinate: 28, usefulInterval: wilson95(5, 28) });
    expect(result.metrics.rows.find((candidate) => candidate.ruleId === CONTEXTUAL_RULE)).toMatchObject({
      finding: { actionableDefect: 10, usefulNoSafeFix: 8, notUseful: 10, cannotDetermine: 2 },
      control: { actionableDefect: 1, usefulNoSafeFix: 4, notUseful: 23, cannotDetermine: 2 },
    });
  });

  it('uses the locked terminal table for contextual and statistical rows', () => {
    const result = reduceCAL002QualityEvidence(inputWith({
      [CONTEXTUAL_RULE]: { finding: counts(30, 0), control: counts(0, 30) },
      [SECOND_CONTEXTUAL_RULE]: { finding: counts(0, 30), control: counts(30, 0) },
      [STATISTICAL_RULE]: { finding: counts(24, 6), control: counts(6, 24) },
      [SECOND_STATISTICAL_RULE]: { finding: counts(0, 30), control: counts(0, 30) },
    }));

    expect(result.evaluations.find(({ ruleId }) => ruleId === CONTEXTUAL_RULE)).toMatchObject({
      outcome: 'default-on', rationaleCode: 'contextual-default-on', terminal: true,
    });
    expect(result.evaluations.find(({ ruleId }) => ruleId === SECOND_CONTEXTUAL_RULE)).toMatchObject({
      outcome: 'default-off', rationaleCode: 'control-dominated', terminal: true,
    });
    expect(result.evaluations.find(({ ruleId }) => ruleId === STATISTICAL_RULE)).toMatchObject({
      outcome: 'quality-advisory', rationaleCode: 'review-utility', terminal: true,
    });
    expect(result.metrics.rows.find(({ ruleId }) => ruleId === STATISTICAL_RULE)?.outcome).not.toBe('default-on');
    expect(result.evaluations.find(({ ruleId }) => ruleId === SECOND_STATISTICAL_RULE)).toMatchObject({
      outcome: 'default-off', rationaleCode: 'finding-below-quality-floor', terminal: true,
    });
  });

  it('locks threshold edges and contextual advisory to the final round', () => {
    const initial = {
      [CONTEXTUAL_RULE]: { finding: counts(18, 12), control: counts(8, 22) },
    };
    const defaultOn = reduceCAL002QualityEvidence(inputWith(initial, {
      [CONTEXTUAL_RULE]: { finding: counts(61, 9), control: counts(13, 57) },
    }));
    const advisory = reduceCAL002QualityEvidence(inputWith(initial, {
      [CONTEXTUAL_RULE]: { finding: counts(42, 28), control: counts(32, 38) },
    }));

    expect(defaultOn.evaluations.find(({ ruleId }) => ruleId === CONTEXTUAL_RULE)).toMatchObject({
      finding: { useful: 79, usefulInterval: { lower: 0.7002, upper: 0.858344 } },
      control: { useful: 21, usefulInterval: { lower: 0.141656, upper: 0.2998 } },
      outcome: 'default-on',
    });
    expect(advisory.evaluations.find(({ ruleId }) => ruleId === CONTEXTUAL_RULE)).toMatchObject({
      finding: { useful: 60, usefulInterval: { lower: 0.502002, upper: 0.690599 } },
      control: { useful: 40, usefulInterval: { lower: 0.309401, upper: 0.497998 } },
      outcome: 'quality-advisory',
    });
  });

  it('sorts bounded 70/70 expansion requests for inconclusive initial rows', () => {
    const inconclusive = { finding: counts(18, 12), control: counts(8, 22) };
    const result = reduceCAL002QualityEvidence(inputWith({
      [SECOND_CONTEXTUAL_RULE]: inconclusive,
      [CONTEXTUAL_RULE]: inconclusive,
    }));

    expect(result.expansionRequests).toEqual([
      { ruleId: CONTEXTUAL_RULE, findings: 70, controls: 70 },
      { ruleId: SECOND_CONTEXTUAL_RULE, findings: 70, controls: 70 },
    ]);
    expect(result.evaluations.find(({ ruleId }) => ruleId === CONTEXTUAL_RULE)).toMatchObject({
      outcome: 'insufficient-evidence',
      nextRound: { findings: 100, controls: 100 },
      terminal: false,
    });
  });

  it('enforces determinate floors and final uncertainty without fabricating labels', () => {
    const lowDeterminate = { finding: counts(15, 8, 7), control: counts(5, 18, 7) };
    const initial = reduceCAL002QualityEvidence(inputWith({ [CONTEXTUAL_RULE]: lowDeterminate }));
    expect(initial.evaluations.find(({ ruleId }) => ruleId === CONTEXTUAL_RULE)).toMatchObject({
      determinateFloor: 24,
      outcome: 'insufficient-evidence',
      rationaleCode: 'insufficient-determinate',
      terminal: false,
    });
    expect(initial.expansionRequests).toContainEqual({ ruleId: CONTEXTUAL_RULE, findings: 70, controls: 70 });

    const final = reduceCAL002QualityEvidence(inputWith({
      [CONTEXTUAL_RULE]: { finding: counts(18, 12), control: counts(8, 22) },
    }, {
      [CONTEXTUAL_RULE]: { finding: counts(38, 32), control: counts(12, 58) },
    }));
    expect(final.evaluations.find(({ ruleId }) => ruleId === CONTEXTUAL_RULE)).toMatchObject({
      requestedPerArm: 100,
      outcome: 'insufficient-evidence',
      rationaleCode: 'insufficient-final-certainty',
      terminal: true,
    });
    expect(final.expansionRequests).toEqual([]);
  });

  it('preserves count and reach shortages as insufficient evidence', () => {
    const input = inputWith();
    const initial: CAL002QualityEvidenceRound = {
      ...input.initial,
      shortages: [
        { ruleId: CONTEXTUAL_RULE, role: 'finding', reason: 'family-reach', requested: 5, selected: 4, missing: 1 },
      ],
    };
    const result = reduceCAL002QualityEvidence({ ...input, initial });
    expect(result.evaluations.find(({ ruleId }) => ruleId === CONTEXTUAL_RULE)).toMatchObject({
      outcome: 'insufficient-evidence', rationaleCode: 'insufficient-reach', terminal: false,
    });
    expect(result.expansionRequests).toContainEqual({ ruleId: CONTEXTUAL_RULE, findings: 70, controls: 70 });
  });

  it('keeps deterministic oracle failures explicit and default-off', () => {
    const failedRuleId = CAL002_ORACLE_DECLARATIONS[0]!.ruleId;
    const result = reduceCAL002QualityEvidence({
      ...inputWith(),
      oracleReceipt: oracleReceiptWithFailure(failedRuleId),
    });
    expect(result.oracleDispositions.find(({ ruleId }) => ruleId === failedRuleId)).toMatchObject({
      status: 'fail', outcome: 'default-off', admitted: false,
    });
  });

  it('emits canonical schema-shaped, non-admitting, source-free metrics', () => {
    const input = inputWith();
    const result = reduceCAL002QualityEvidence(input);

    expect(validateCAL002QualityMetrics(result.metrics)).toEqual({ ok: true, errors: [] });
    expect(result.metricsJson).toBe(canonicalArtifact(result.metrics).json);
    expect(result.metricsSha256).toBe(canonicalArtifact(result.metrics).sha256);
    expect(result.metrics).toMatchObject({
      version: 'cal-002-quality-metrics-v1',
      protocolVersion: CAL002_PROTOCOL_VERSION,
      catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
      assignmentSha256: input.initial.assignment.assignmentSha256,
      reviewReceiptSha256: canonicalArtifact(input.initial.reviewReceipt).sha256,
      reducerImplementationCommitSha: COMMIT_SHA,
      admitted: false,
    });
    expect(Object.keys(result.metrics).sort()).toEqual([
      'admitted', 'assignmentSha256', 'catalogSha256', 'protocolVersion',
      'reducerImplementationCommitSha', 'reviewReceiptSha256', 'rows', 'version',
    ]);
    expect(result.metricsJson).not.toContain('unitId');
    expect(result.metricsJson).not.toContain('lineWindowLocator');
    expect(result.metricsJson).not.toContain('sourceIdentitySha256');
    expect(result.metricsJson).not.toContain('reviewerAuthority');
    expect(result.metricsJson).not.toContain(input.initial.assignment.rows[0]!.unitId);
  });

  it.each([
    ['assignment self-hash', (input: ReduceCAL002QualityEvidenceInput) => ({
      ...input,
      initial: { ...input.initial, assignment: { ...input.initial.assignment, assignmentSha256: HASH_A } },
    }), /assignment hash/i],
    ['review assignment binding', (input: ReduceCAL002QualityEvidenceInput) => ({
      ...input,
      initial: { ...input.initial, reviewReceipt: { ...input.initial.reviewReceipt, assignmentSha256: HASH_A } },
    }), /review receipt.*assignment/i],
    ['review batch binding', (input: ReduceCAL002QualityEvidenceInput) => ({
      ...input,
      initial: { ...input.initial, reviewReceipt: { ...input.initial.reviewReceipt, blindedBatchSha256: HASH_A } },
    }), /review receipt.*batch/i],
    ['wrong initial round', (input: ReduceCAL002QualityEvidenceInput) => ({
      ...input,
      initial: {
        ...input.initial,
        assignment: resealAssignment({ ...input.initial.assignment, round: 'final', targetPerArm: 100 }),
      },
    }), /initial.*round/i],
  ])('fails closed on %s drift', (_name, mutate, error) => {
    expect(() => reduceCAL002QualityEvidence(mutate(inputWith()))).toThrow(error);
  });

  it.each([
    ['missing', (rows: CAL002ReviewReceipt['rows']) => rows.slice(1), /coverage.*missing/i],
    ['extra', (rows: CAL002ReviewReceipt['rows']) => [...rows, { reviewId: 'f'.repeat(64), label: 'not-useful' as const }], /coverage.*extra/i],
    ['duplicate', (rows: CAL002ReviewReceipt['rows']) => [...rows, rows[0]!], /duplicate/i],
  ])('rejects %s review rows', (_name, mutate, error) => {
    const input = inputWith();
    const reviewReceipt = { ...input.initial.reviewReceipt, rows: mutate(input.initial.reviewReceipt.rows) };
    expect(() => reduceCAL002QualityEvidence({
      ...input,
      initial: { ...input.initial, reviewReceipt },
    })).toThrow(error);
  });

  it('rejects wrong roles, malformed rounds, final row reuse, and path/source leakage', () => {
    const base = inputWith({
      [CONTEXTUAL_RULE]: { finding: counts(18, 12), control: counts(8, 22) },
    }, {
      [CONTEXTUAL_RULE]: { finding: counts(42, 28), control: counts(32, 38) },
    });
    const wrongRoleRows = base.initial.assignment.rows.map((row, index) => index === 0
      ? { ...row, role: 'candidate' as never }
      : row);
    const wrongRole = resealAssignment({ ...base.initial.assignment, rows: wrongRoleRows });
    expect(() => reduceCAL002QualityEvidence({
      ...base,
      initial: { ...base.initial, assignment: wrongRole },
    })).toThrow(/role/i);

    expect(() => reduceCAL002QualityEvidence({
      ...base,
      final: { assignment: base.final!.assignment } as never,
    })).toThrow(/final.*review receipt|final.*pair/i);

    const duplicatedFinal = rebindRoundRows(base.final!, (rows) => [
      { ...rows[0]!, unitId: base.initial.assignment.rows[0]!.unitId },
      ...rows.slice(1),
    ]);
    expect(() => reduceCAL002QualityEvidence({
      ...base,
      final: duplicatedFinal,
    })).toThrow(/prior row|source-bound row|duplicate/i);

    const leakedReview = {
      ...base.initial.reviewReceipt,
      rows: [{ ...base.initial.reviewReceipt.rows[0]!, source: '/Users/private/repo/file.ts' }, ...base.initial.reviewReceipt.rows.slice(1)],
    };
    expect(() => reduceCAL002QualityEvidence({
      ...base,
      initial: { ...base.initial, reviewReceipt: leakedReview as CAL002ReviewReceipt },
    })).toThrow(/unknown key|invalid/i);

    const leakedBlinded = base.initial.assignment.blindedRows.map((row, index) => index === 0
      ? { ...row, lineWindowLocator: '/Users/private/repo/file.ts' }
      : row);
    const leakedAssignment = resealAssignment({
      ...base.initial.assignment,
      blindedRows: leakedBlinded,
      blindedBatchSha256: canonicalArtifact(leakedBlinded).sha256,
    });
    expect(() => reduceCAL002QualityEvidence({
      ...base,
      initial: { ...base.initial, assignment: leakedAssignment },
    })).toThrow(/locator.*path-free|path-free.*locator/i);
  });

  it('rejects catalog, oracle, assignment-manifest, and final review drift independently', () => {
    const initial = { [CONTEXTUAL_RULE]: { finding: counts(18, 12), control: counts(8, 22) } };
    const final = { [CONTEXTUAL_RULE]: { finding: counts(42, 28), control: counts(32, 38) } };
    const base = inputWith(initial, final);
    expect(() => reduceCAL002QualityEvidence({
      ...base,
      catalog: { ...base.catalog, admitted: true as never },
    })).toThrow(/catalog/i);
    expect(() => reduceCAL002QualityEvidence({
      ...base,
      oracleReceipt: { ...base.oracleReceipt, catalogSha256: HASH_A },
    })).toThrow(/oracle.*catalog/i);

    const staleManifest = resealAssignment({
      ...base.initial.assignment,
      selectionManifestSha256: HASH_A,
    });
    expect(() => reduceCAL002QualityEvidence({
      ...base,
      initial: { ...base.initial, assignment: staleManifest },
    })).toThrow(/selection manifest/i);

    expect(() => reduceCAL002QualityEvidence({
      ...base,
      final: {
        ...base.final!,
        reviewReceipt: { ...base.final!.reviewReceipt, assignmentSha256: HASH_A },
      },
    })).toThrow(/final.*review receipt.*assignment/i);
  });
});
