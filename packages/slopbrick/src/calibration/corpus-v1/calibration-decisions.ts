import {
  type CAL001HoldoutMetrics,
  type CAL001HoldoutSplit,
} from './calibration-holdout';
import {
  canonicalJson,
  canonicalSha256,
} from '../v103/canonical';
import type { V103RuleMetric, V103MetricsResult } from '../v103/metrics';

export const CAL001_DECISION_MATRIX_VERSION = 'cal-001-v1-decision-matrix-v1' as const;

export type CAL001Decision = 'default-off' | 'quality-only' | 'recalibrate';
export type CAL001DecisionOriginStatus = 'diagnostic-only' | 'not-evaluated';

const SPLITS = ['train', 'validation', 'test'] as const satisfies readonly CAL001HoldoutSplit[];
const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT_SHA = /^[a-f0-9]{40}$/u;

export interface CAL001DecisionRuleDefinition {
  readonly ruleId: string;
  readonly aiSpecific: boolean;
  readonly existingDefaultOff: boolean;
}

export interface CAL001DecisionMatrixInput {
  readonly protocolVersion: 'CAL-001-v1';
  readonly holdoutImplementationCommitSha: string;
  readonly decisionImplementationCommitSha: string;
  readonly holdoutReceiptSha256: string;
  readonly metricsSha256: string;
  readonly leakageStatus: 'clear' | 'failed';
  readonly metricsStatus: 'available' | 'unavailable';
  readonly ruleCatalog: readonly CAL001DecisionRuleDefinition[];
  readonly metrics: CAL001HoldoutMetrics;
}

interface CAL001DecisionEvidence {
  readonly holdoutReceiptSha256: string;
  readonly metricsSha256: string;
  readonly report: 'CAL-001-v1-origin-discrimination-diagnostic';
}

interface CAL001OriginResult {
  readonly status: CAL001DecisionOriginStatus;
  readonly splitStatus: Readonly<Record<CAL001HoldoutSplit, V103MetricsResult['status']>>;
  readonly ruleStatus: Readonly<Record<CAL001HoldoutSplit, V103RuleMetric['status'] | 'unavailable'>>;
}

export interface CAL001DecisionRow {
  readonly ruleId: string;
  readonly aiSpecific: boolean;
  readonly existingDefaultOff: boolean;
  readonly decision: CAL001Decision;
  readonly policyAction: 'preserve' | 'owner-review-required';
  readonly evidence: CAL001DecisionEvidence;
  readonly originResult: CAL001OriginResult;
  readonly usefulnessResult: 'not-evaluated';
  readonly confounds: {
    readonly leakage: 'clear' | 'failed';
    readonly sourceLabels: 'publisher-attested-polarity-not-authorship';
    readonly frameworkBuckets: 'not-available';
    readonly semanticBuckets: 'not-available';
  };
  readonly owner: 'calibration-maintainers';
  readonly rationale: string;
}

export interface CAL001DecisionMatrix {
  readonly version: typeof CAL001_DECISION_MATRIX_VERSION;
  readonly protocolVersion: 'CAL-001-v1';
  readonly holdoutImplementationCommitSha: string;
  readonly decisionImplementationCommitSha: string;
  readonly holdoutReceiptSha256: string;
  readonly metricsSha256: string;
  readonly ruleCatalogSha256: string;
  readonly leakageStatus: 'clear' | 'failed';
  readonly metricsStatus: 'available' | 'unavailable';
  readonly rows: readonly CAL001DecisionRow[];
  readonly counts: {
    readonly total: number;
    readonly aiSpecific: number;
    readonly defaultOff: number;
    readonly recalibrate: number;
    readonly qualityOnly: number;
    readonly existingDefaultOff: number;
    readonly ownerReviewRequired: number;
  };
  readonly usefulness: 'not-evaluated';
  readonly admission: 'not-evaluated';
  /** Matrix review does not apply any rule-state or admission mutation. */
  readonly applied: false;
  readonly admitted: false;
}

export interface CAL001DecisionMatrixResult {
  readonly matrix: CAL001DecisionMatrix;
  readonly matrixJson: string;
  readonly matrixSha256: string;
}

function assertHash(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new TypeError(`${label} must be a lowercase SHA-256`);
}

function metricForRule(
  metrics: CAL001HoldoutMetrics,
  split: CAL001HoldoutSplit,
  ruleId: string,
): V103RuleMetric | undefined {
  const base = metrics.splits[split].base;
  return base.status === 'available' ? base.rules.find((rule) => rule.ruleId === ruleId) : undefined;
}

function baseStatusBySplit(metrics: CAL001HoldoutMetrics): Readonly<Record<CAL001HoldoutSplit, V103MetricsResult['status']>> {
  return Object.fromEntries(SPLITS.map((split) => [split, metrics.splits[split].base.status])) as Record<CAL001HoldoutSplit, V103MetricsResult['status']>;
}

function decisionRationale(
  definition: CAL001DecisionRuleDefinition,
  decision: CAL001Decision,
  ready: boolean,
): string {
  if (!definition.aiSpecific) {
    return 'This is not an origin-discrimination candidate in CAL-001; preserve its deterministic quality behavior and do not use publisher polarity as a quality label.';
  }
  if (decision === 'recalibrate' || !ready) {
    return 'The frozen run is not eligible for an origin decision because its leakage or metric-availability precondition failed; retain the signal for a new protocol revision and keep it non-admitting.';
  }
  return 'Publisher-declared polarity is not authorship, the current v10.3 admission count is zero, and independent usefulness review is not evaluated; keep this origin signal default-off until an admitted, leakage-checked result exists.';
}

export function buildCAL001DecisionMatrix(input: CAL001DecisionMatrixInput): CAL001DecisionMatrixResult {
  if (input.protocolVersion !== 'CAL-001-v1') throw new TypeError('CAL-001 decision matrix protocol version is invalid');
  if (!COMMIT_SHA.test(input.holdoutImplementationCommitSha)) throw new TypeError('CAL-001 holdout implementation commit SHA is invalid');
  if (!COMMIT_SHA.test(input.decisionImplementationCommitSha)) throw new TypeError('CAL-001 decision matrix implementation commit SHA is invalid');
  assertHash(input.holdoutReceiptSha256, 'holdoutReceiptSha256');
  assertHash(input.metricsSha256, 'metricsSha256');
  if (input.ruleCatalog.length === 0) throw new TypeError('CAL-001 decision matrix rule catalog must not be empty');
  const seen = new Set<string>();
  for (const definition of input.ruleCatalog) {
    if (definition.ruleId.length === 0 || seen.has(definition.ruleId)) throw new TypeError('CAL-001 decision matrix rule catalog contains a duplicate or empty ID');
    if (typeof definition.aiSpecific !== 'boolean' || typeof definition.existingDefaultOff !== 'boolean') throw new TypeError('CAL-001 decision matrix rule catalog metadata is invalid');
    seen.add(definition.ruleId);
  }
  const ready = input.leakageStatus === 'clear'
    && input.metricsStatus === 'available'
    && SPLITS.every((split) => input.metrics.splits[split].base.status === 'available');
  const splitStatus = baseStatusBySplit(input.metrics);
  const rows = [...input.ruleCatalog].sort((left, right) => left.ruleId.localeCompare(right.ruleId)).map((definition): CAL001DecisionRow => {
    const ruleStatus = Object.fromEntries(SPLITS.map((split) => [split, metricForRule(input.metrics, split, definition.ruleId)?.status ?? 'unavailable'])) as Record<CAL001HoldoutSplit, V103RuleMetric['status'] | 'unavailable'>;
    const decision: CAL001Decision = !definition.aiSpecific
      ? 'quality-only'
      : ready ? 'default-off' : 'recalibrate';
    const policyAction = decision === 'quality-only' || (decision === 'default-off' && definition.existingDefaultOff)
      ? 'preserve' as const
      : 'owner-review-required' as const;
    return {
      ruleId: definition.ruleId,
      aiSpecific: definition.aiSpecific,
      existingDefaultOff: definition.existingDefaultOff,
      decision,
      policyAction,
      evidence: {
        holdoutReceiptSha256: input.holdoutReceiptSha256,
        metricsSha256: input.metricsSha256,
        report: 'CAL-001-v1-origin-discrimination-diagnostic',
      },
      originResult: {
        status: ready && definition.aiSpecific ? 'diagnostic-only' : 'not-evaluated',
        splitStatus,
        ruleStatus,
      },
      usefulnessResult: 'not-evaluated',
      confounds: {
        leakage: input.leakageStatus,
        sourceLabels: 'publisher-attested-polarity-not-authorship',
        frameworkBuckets: 'not-available',
        semanticBuckets: 'not-available',
      },
      owner: 'calibration-maintainers',
      rationale: decisionRationale(definition, decision, ready),
    };
  });
  const matrixBody = {
    version: CAL001_DECISION_MATRIX_VERSION,
    protocolVersion: input.protocolVersion,
    holdoutImplementationCommitSha: input.holdoutImplementationCommitSha,
    decisionImplementationCommitSha: input.decisionImplementationCommitSha,
    holdoutReceiptSha256: input.holdoutReceiptSha256,
    metricsSha256: input.metricsSha256,
    ruleCatalogSha256: canonicalSha256([...input.ruleCatalog].sort((left, right) => left.ruleId.localeCompare(right.ruleId))),
    leakageStatus: input.leakageStatus,
    metricsStatus: input.metricsStatus,
    rows,
    counts: {
      total: rows.length,
      aiSpecific: rows.filter((row) => row.aiSpecific).length,
      defaultOff: rows.filter((row) => row.decision === 'default-off').length,
      recalibrate: rows.filter((row) => row.decision === 'recalibrate').length,
      qualityOnly: rows.filter((row) => row.decision === 'quality-only').length,
      existingDefaultOff: rows.filter((row) => row.existingDefaultOff).length,
      ownerReviewRequired: rows.filter((row) => row.policyAction === 'owner-review-required').length,
    },
    usefulness: 'not-evaluated' as const,
    admission: 'not-evaluated' as const,
    applied: false as const,
    admitted: false as const,
  };
  const matrix = matrixBody satisfies CAL001DecisionMatrix;
  const matrixJson = canonicalJson(matrix);
  return { matrix, matrixJson, matrixSha256: canonicalSha256(matrix) };
}
