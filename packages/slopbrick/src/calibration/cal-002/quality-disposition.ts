import {
  canonicalAuthorityRowsV2,
} from './authority';
import {
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  assertCommitSha,
  canonicalArtifact,
  type CAL002Interval,
  type CAL002ValidationResult,
} from './contracts';
import {
  CAL002_PROTOCOL_VERSION_V2,
  assertCAL002AuthorityReceiptV2,
  type CAL002AuthorityReceiptV2,
  type CAL002AuthorityRowV2,
  type CAL002RuntimeOutcomeV2,
} from './contracts-v2';
import {
  wilson95,
  type CAL002QualityLabelCounts,
  type CAL002QualityMetricsRow,
} from './quality-metrics';

export const CAL002_QUALITY_DISPOSITION_VERSION = 'cal-002-quality-disposition-v2' as const;

export type CAL002MeasurementStatusV2 = 'measured' | 'not-requested-owner-capacity';
export type CAL002QualityEvidenceClassV2 = 'contextual-quality' | 'statistical-review-utility';

export interface CAL002QualityDispositionRowV2 {
  readonly ruleId: string;
  readonly evidenceClass: CAL002QualityEvidenceClassV2;
  readonly measurementStatus: CAL002MeasurementStatusV2;
  readonly sampleCounts: {
    readonly findings: number;
    readonly controls: number;
    readonly cannotDetermine: number;
  };
  readonly uncertainty?: {
    readonly findingUseful: CAL002Interval;
    readonly controlUseful: CAL002Interval;
  };
  readonly runtimeOutcome: Extract<
    CAL002RuntimeOutcomeV2,
    'default-on' | 'default-off' | 'quality-advisory' | 'insufficient-evidence' | 'quality-candidate-default-off'
  >;
  readonly enabledByDefault: boolean;
  readonly scoreEligible: boolean;
  readonly gateEligible: boolean;
  readonly repairSafety: 'finding-bound-only' | 'no-safe-repair';
  readonly metricsRowSha256?: string;
}

export interface CAL002QualityDispositionV2 {
  readonly version: typeof CAL002_QUALITY_DISPOSITION_VERSION;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION_V2;
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly authorityReceiptSha256: string;
  readonly implementationCommitSha: string;
  readonly selectedRuleIds: readonly string[];
  readonly rows: readonly CAL002QualityDispositionRowV2[];
  readonly admitted: false;
  readonly applied: false;
}

export interface CAL002QualityDispositionResultV2 {
  readonly disposition: CAL002QualityDispositionV2;
  readonly dispositionJson: string;
  readonly dispositionSha256: string;
}

export interface CAL002QualityReachRowV2 {
  readonly ruleId: string;
  readonly findings: number;
  readonly controls: number;
  readonly familyCount: number;
}

export interface CAL002QualityCohortPlanV2 {
  readonly selectedRuleIds: readonly string[];
  readonly initialLabels: number;
  readonly maximumLabels: number;
}

export interface BuildCAL002QualityDispositionInputV2 {
  readonly authorityReceipt: CAL002AuthorityReceiptV2;
  readonly selectedRuleIds?: readonly string[];
  readonly selectedMetrics?: readonly CAL002QualityMetricsRow[];
  readonly implementationCommitSha: string;
}

const SHA256 = /^[a-f0-9]{64}$/u;
const RULE_ID = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/u;
const QUALITY_OUTCOMES = ['default-on', 'default-off', 'quality-advisory', 'insufficient-evidence'] as const;

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  const missing = allowed.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length > 0 || missing.length > 0) {
    throw new TypeError(`${label} has unknown or missing fields`);
  }
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer`);
  }
  return value;
}

function isQualityOutcome(value: unknown): value is CAL002QualityMetricsRow['outcome'] {
  return typeof value === 'string' && QUALITY_OUTCOMES.includes(value as CAL002QualityMetricsRow['outcome']);
}

function isQualityAuthorityRow(
  row: CAL002AuthorityRowV2,
): row is CAL002AuthorityRowV2 & { readonly evidenceClass: CAL002QualityEvidenceClassV2 } {
  return row.evidenceClass === 'contextual-quality' || row.evidenceClass === 'statistical-review-utility';
}

function qualityAuthorityRows(
  authorityReceipt: CAL002AuthorityReceiptV2,
): readonly (CAL002AuthorityRowV2 & { readonly evidenceClass: CAL002QualityEvidenceClassV2 })[] {
  assertCAL002AuthorityReceiptV2(authorityReceipt);
  const rows = authorityReceipt.rows.filter((row): row is CAL002AuthorityRowV2 & {
    readonly evidenceClass: CAL002QualityEvidenceClassV2;
  } => row.evidenceClass === 'contextual-quality' || row.evidenceClass === 'statistical-review-utility');
  const startingContextual = rows.filter((row) =>
    row.sourceClass === 'starting-quality' && row.evidenceClass === 'contextual-quality').length;
  const startingStatistical = rows.filter((row) =>
    row.sourceClass === 'starting-quality' && row.evidenceClass === 'statistical-review-utility').length;
  const transferredContextual = rows.filter((row) =>
    row.sourceClass === 'owner-batch' && row.evidenceClass === 'contextual-quality').length;
  if (rows.length !== 32
    || startingContextual !== 11
    || startingStatistical !== 4
    || transferredContextual !== 17) {
    throw new TypeError('CAL-002 quality authority must contain exactly 11 starting contextual, 4 starting statistical, and 17 transferred contextual rows');
  }
  return rows;
}

function requireAuthorityRow(
  authorityReceipt: CAL002AuthorityReceiptV2,
  ruleId: string,
): CAL002AuthorityRowV2 & { readonly evidenceClass: CAL002QualityEvidenceClassV2 } {
  const authority = authorityReceipt.rows.find((row) => row.ruleId === ruleId);
  if (!authority) throw new TypeError(`CAL-002 authority has no rule ${ruleId}`);
  if (authority.readiness !== 'evidence-ready' || !authority.assignmentEligible) {
    throw new TypeError(`${ruleId} is not evidence-ready`);
  }
  if (authority.destination !== 'quality' || !isQualityAuthorityRow(authority)) {
    throw new TypeError(`${ruleId} is not a contextual or statistical quality candidate`);
  }
  return authority;
}

function validateSelectedRuleIds(
  authorityReceipt: CAL002AuthorityReceiptV2,
  selectedRuleIds: readonly string[],
): readonly string[] {
  if (!Array.isArray(selectedRuleIds)) throw new TypeError('CAL-002 selected rule IDs must be an array');
  if (new Set(selectedRuleIds).size !== selectedRuleIds.length) {
    throw new TypeError('CAL-002 selected rule IDs must be unique');
  }
  if (selectedRuleIds.length > 4) throw new TypeError('CAL-002 owner cohort is limited to four rules');
  for (const ruleId of selectedRuleIds) {
    if (typeof ruleId !== 'string' || !RULE_ID.test(ruleId)) {
      throw new TypeError('CAL-002 selected rule IDs must be canonical rule IDs');
    }
    requireAuthorityRow(authorityReceipt, ruleId);
  }
  return [...selectedRuleIds].sort(compareCodePoints);
}

function validateReachRows(reach: readonly CAL002QualityReachRowV2[]): ReadonlyMap<string, CAL002QualityReachRowV2> {
  if (!Array.isArray(reach)) throw new TypeError('CAL-002 quality reach must be an array');
  const byRuleId = new Map<string, CAL002QualityReachRowV2>();
  for (const [index, value] of reach.entries()) {
    if (!isRecord(value)) throw new TypeError(`CAL-002 quality reach[${index}] must be an object`);
    exactKeys(value, ['ruleId', 'findings', 'controls', 'familyCount'], `CAL-002 quality reach[${index}]`);
    if (typeof value.ruleId !== 'string' || !RULE_ID.test(value.ruleId)) {
      throw new TypeError(`CAL-002 quality reach[${index}].ruleId must be canonical`);
    }
    const findings = nonNegativeInteger(value.findings, `CAL-002 quality reach[${index}].findings`);
    const controls = nonNegativeInteger(value.controls, `CAL-002 quality reach[${index}].controls`);
    const familyCount = nonNegativeInteger(value.familyCount, `CAL-002 quality reach[${index}].familyCount`);
    if (byRuleId.has(value.ruleId)) throw new TypeError(`CAL-002 quality reach rule IDs must be unique; duplicate ${value.ruleId}`);
    byRuleId.set(value.ruleId, { ruleId: value.ruleId, findings, controls, familyCount });
  }
  return byRuleId;
}

export function planCAL002QualityCohortV2(input: {
  readonly authorityReceipt: CAL002AuthorityReceiptV2;
  readonly reach: readonly CAL002QualityReachRowV2[];
  readonly selectedRuleIds: readonly string[];
}): CAL002QualityCohortPlanV2 {
  if (!isRecord(input)) throw new TypeError('CAL-002 quality cohort input must be an object');
  exactKeys(input, ['authorityReceipt', 'reach', 'selectedRuleIds'], 'CAL-002 quality cohort input');
  assertCAL002AuthorityReceiptV2(input.authorityReceipt);
  const selectedRuleIds = validateSelectedRuleIds(input.authorityReceipt, input.selectedRuleIds);
  const reachByRuleId = validateReachRows(input.reach);
  for (const ruleId of selectedRuleIds) {
    const row = reachByRuleId.get(ruleId);
    if (!row || row.findings < 30 || row.controls < 30 || row.familyCount < 5) {
      throw new TypeError(`${ruleId} lacks 30/30 reach and five control families`);
    }
  }
  return {
    selectedRuleIds,
    initialLabels: selectedRuleIds.length * 60,
    maximumLabels: selectedRuleIds.length * 200,
  };
}

export function assertCAL002QualityCohortPlanV2(value: unknown): asserts value is CAL002QualityCohortPlanV2 {
  if (!isRecord(value)) throw new TypeError('CAL-002 quality cohort plan must be an object');
  exactKeys(value, ['selectedRuleIds', 'initialLabels', 'maximumLabels'], 'CAL-002 quality cohort plan');
  if (!Array.isArray(value.selectedRuleIds)
    || value.selectedRuleIds.length > 4
    || value.selectedRuleIds.some((ruleId) => typeof ruleId !== 'string' || !RULE_ID.test(ruleId))
    || new Set(value.selectedRuleIds).size !== value.selectedRuleIds.length) {
    throw new TypeError('CAL-002 quality cohort plan selectedRuleIds are invalid');
  }
  const sorted = [...value.selectedRuleIds].sort(compareCodePoints);
  if (canonicalArtifact(value.selectedRuleIds).json !== canonicalArtifact(sorted).json) {
    throw new TypeError('CAL-002 quality cohort plan selectedRuleIds are not in canonical order');
  }
  if (value.initialLabels !== value.selectedRuleIds.length * 60
    || value.maximumLabels !== value.selectedRuleIds.length * 200) {
    throw new TypeError('CAL-002 quality cohort plan label counts do not match its selection');
  }
}

interface ValidatedLabelCounts {
  readonly counts: CAL002QualityLabelCounts;
  readonly total: number;
  readonly cannotDetermine: number;
  readonly useful: number;
}

function labelCount(value: unknown, label: string): ValidatedLabelCounts {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  exactKeys(value, ['actionableDefect', 'usefulNoSafeFix', 'notUseful', 'cannotDetermine'], label);
  const counts: CAL002QualityLabelCounts = {
    actionableDefect: nonNegativeInteger(value.actionableDefect, `${label}.actionableDefect`),
    usefulNoSafeFix: nonNegativeInteger(value.usefulNoSafeFix, `${label}.usefulNoSafeFix`),
    notUseful: nonNegativeInteger(value.notUseful, `${label}.notUseful`),
    cannotDetermine: nonNegativeInteger(value.cannotDetermine, `${label}.cannotDetermine`),
  };
  return {
    counts,
    total: counts.actionableDefect + counts.usefulNoSafeFix + counts.notUseful + counts.cannotDetermine,
    cannotDetermine: counts.cannotDetermine,
    useful: counts.actionableDefect + counts.usefulNoSafeFix,
  };
}

function validateMetricRow(
  value: unknown,
  authority: CAL002AuthorityRowV2 & { readonly evidenceClass: CAL002QualityEvidenceClassV2 },
): CAL002QualityMetricsRow {
  if (!isRecord(value)) throw new TypeError(`CAL-002 selected metric ${authority.ruleId} must be an object`);
  exactKeys(value, ['ruleId', 'evidenceClass', 'requestedPerArm', 'finding', 'control', 'outcome', 'claimCeiling'], `CAL-002 selected metric ${authority.ruleId}`);
  if (value.ruleId !== authority.ruleId) throw new TypeError(`CAL-002 selected metric rule ID does not match ${authority.ruleId}`);
  if (value.evidenceClass !== authority.evidenceClass) {
    throw new TypeError(`CAL-002 selected metric evidence class does not match authority for ${authority.ruleId}`);
  }
  if (value.requestedPerArm !== 30 && value.requestedPerArm !== 100) {
    throw new TypeError(`CAL-002 selected metric ${authority.ruleId} requestedPerArm must be 30 or 100`);
  }
  const finding = labelCount(value.finding, `CAL-002 selected metric ${authority.ruleId}.finding`);
  const control = labelCount(value.control, `CAL-002 selected metric ${authority.ruleId}.control`);
  if (finding.total > value.requestedPerArm || control.total > value.requestedPerArm) {
    throw new TypeError(`CAL-002 selected metric ${authority.ruleId} exceeds its requested labels`);
  }
  if (!isQualityOutcome(value.outcome)) {
    throw new TypeError(`CAL-002 selected metric ${authority.ruleId} has an invalid outcome`);
  }
  const outcome = value.outcome;
  if (authority.evidenceClass === 'statistical-review-utility' && outcome === 'default-on') {
    throw new TypeError(`CAL-002 statistical evidence cannot produce default-on for ${authority.ruleId}`);
  }
  const claimCeiling: CAL002QualityMetricsRow['claimCeiling'] = outcome === 'insufficient-evidence'
    ? 'insufficient-evidence'
    : outcome === 'quality-advisory' || authority.evidenceClass === 'statistical-review-utility'
      ? 'review-target-utility'
      : 'quality-usefulness';
  if (value.claimCeiling !== claimCeiling) {
    throw new TypeError(`CAL-002 selected metric ${authority.ruleId} outcome and claim ceiling are incompatible`);
  }
  if (outcome !== 'insufficient-evidence'
    && (finding.total === finding.cannotDetermine || control.total === control.cannotDetermine)) {
    throw new TypeError(`CAL-002 selected metric ${authority.ruleId} is measured without determinate labels`);
  }
  return {
    ruleId: authority.ruleId,
    evidenceClass: authority.evidenceClass,
    requestedPerArm: value.requestedPerArm,
    finding: finding.counts,
    control: control.counts,
    outcome,
    claimCeiling,
  };
}

function unmeasuredRow(
  row: CAL002AuthorityRowV2 & { readonly evidenceClass: CAL002QualityEvidenceClassV2 },
): CAL002QualityDispositionRowV2 {
  return {
    ruleId: row.ruleId,
    evidenceClass: row.evidenceClass,
    measurementStatus: 'not-requested-owner-capacity',
    sampleCounts: { findings: 0, controls: 0, cannotDetermine: 0 },
    runtimeOutcome: 'quality-candidate-default-off',
    enabledByDefault: false,
    scoreEligible: false,
    gateEligible: false,
    repairSafety: 'no-safe-repair',
  };
}

function measuredRow(metric: CAL002QualityMetricsRow): CAL002QualityDispositionRowV2 {
  const finding = labelCount(metric.finding, `CAL-002 selected metric ${metric.ruleId}.finding`);
  const control = labelCount(metric.control, `CAL-002 selected metric ${metric.ruleId}.control`);
  const findingDeterminate = finding.total - finding.cannotDetermine;
  const controlDeterminate = control.total - control.cannotDetermine;
  const defaultOn = metric.outcome === 'default-on';
  return {
    ruleId: metric.ruleId,
    evidenceClass: metric.evidenceClass,
    measurementStatus: 'measured',
    sampleCounts: {
      findings: finding.total,
      controls: control.total,
      cannotDetermine: finding.cannotDetermine + control.cannotDetermine,
    },
    ...(metric.outcome === 'insufficient-evidence' ? {} : {
      uncertainty: {
        findingUseful: wilson95(finding.useful, findingDeterminate),
        controlUseful: wilson95(control.useful, controlDeterminate),
      },
    }),
    runtimeOutcome: metric.outcome,
    enabledByDefault: defaultOn,
    scoreEligible: defaultOn,
    gateEligible: defaultOn,
    repairSafety: metric.evidenceClass === 'contextual-quality' ? 'finding-bound-only' : 'no-safe-repair',
    metricsRowSha256: canonicalArtifact(metric).sha256,
  };
}

function canonicalSelectedMetrics(
  authorityReceipt: CAL002AuthorityReceiptV2,
  selectedRuleIds: readonly string[],
  selectedMetrics: readonly CAL002QualityMetricsRow[],
): ReadonlyMap<string, CAL002QualityMetricsRow> {
  if (!Array.isArray(selectedMetrics)) throw new TypeError('CAL-002 selected metrics must be an array');
  const selected = new Set(selectedRuleIds);
  const byRuleId = new Map<string, CAL002QualityMetricsRow>();
  for (const metric of selectedMetrics) {
    if (!isRecord(metric) || typeof metric.ruleId !== 'string') {
      throw new TypeError('CAL-002 selected metrics must contain rule-ID rows');
    }
    if (!selected.has(metric.ruleId)) throw new TypeError(`CAL-002 metrics include unselected row ${metric.ruleId}`);
    if (byRuleId.has(metric.ruleId)) throw new TypeError(`CAL-002 selected metrics duplicate ${metric.ruleId}`);
    const authority = requireAuthorityRow(authorityReceipt, metric.ruleId);
    byRuleId.set(metric.ruleId, validateMetricRow(metric, authority));
  }
  for (const ruleId of selectedRuleIds) {
    if (!byRuleId.has(ruleId)) throw new TypeError(`CAL-002 selection is missing metrics for ${ruleId}`);
  }
  return byRuleId;
}

export function buildCAL002QualityDispositionV2(
  input: BuildCAL002QualityDispositionInputV2,
): CAL002QualityDispositionResultV2 {
  if (!isRecord(input)) throw new TypeError('CAL-002 quality disposition input must be an object');
  const allowed = ['authorityReceipt', 'selectedRuleIds', 'selectedMetrics', 'implementationCommitSha'];
  const unknown = Object.keys(input).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new TypeError('CAL-002 quality disposition input has unknown fields');
  assertCAL002AuthorityReceiptV2(input.authorityReceipt);
  assertCommitSha(input.implementationCommitSha, 'CAL-002 quality disposition implementationCommitSha');
  const authorityRows = qualityAuthorityRows(input.authorityReceipt);
  const selectedRuleIds = validateSelectedRuleIds(input.authorityReceipt, input.selectedRuleIds ?? []);
  const selectedMetrics = canonicalSelectedMetrics(
    input.authorityReceipt,
    selectedRuleIds,
    input.selectedMetrics ?? [],
  );
  const disposition: CAL002QualityDispositionV2 = {
    version: CAL002_QUALITY_DISPOSITION_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION_V2,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    authorityReceiptSha256: canonicalArtifact(input.authorityReceipt).sha256,
    implementationCommitSha: input.implementationCommitSha,
    selectedRuleIds,
    rows: authorityRows.map((row) => {
      const metric = selectedMetrics.get(row.ruleId);
      return metric === undefined ? unmeasuredRow(row) : measuredRow(metric);
    }),
    admitted: false,
    applied: false,
  };
  assertCAL002QualityDispositionV2(disposition);
  const artifact = canonicalArtifact(disposition);
  return {
    disposition,
    dispositionJson: artifact.json,
    dispositionSha256: artifact.sha256,
  };
}

function expectedQualityRows(): readonly (CAL002AuthorityRowV2 & { readonly evidenceClass: CAL002QualityEvidenceClassV2 })[] {
  return canonicalAuthorityRowsV2().filter((row): row is CAL002AuthorityRowV2 & {
    readonly evidenceClass: CAL002QualityEvidenceClassV2;
  } => row.evidenceClass === 'contextual-quality' || row.evidenceClass === 'statistical-review-utility');
}

function intervalErrors(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)
    || Object.keys(value).length !== 2
    || !Object.hasOwn(value, 'lower')
    || !Object.hasOwn(value, 'upper')) {
    errors.push(`${path} must be a closed interval`);
    return;
  }
  if (typeof value.lower !== 'number'
    || typeof value.upper !== 'number'
    || !Number.isFinite(value.lower)
    || !Number.isFinite(value.upper)
    || value.lower < 0
    || value.upper > 1
    || value.lower > value.upper) {
    errors.push(`${path} must satisfy 0 <= lower <= upper <= 1`);
  }
}

function rowValidationErrors(value: unknown, expected: ReturnType<typeof expectedQualityRows>[number], index: number): string[] {
  const errors: string[] = [];
  const path = `artifact.rows[${index}]`;
  if (!isRecord(value)) return [`${path} must be an object`];
  const allowed = [
    'ruleId', 'evidenceClass', 'measurementStatus', 'sampleCounts', 'uncertainty', 'runtimeOutcome',
    'enabledByDefault', 'scoreEligible', 'gateEligible', 'repairSafety', 'metricsRowSha256',
  ];
  const required = allowed.filter((key) => key !== 'uncertainty' && key !== 'metricsRowSha256');
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length > 0 || missing.length > 0) errors.push(`${path} has unknown or missing fields`);
  if (value.ruleId !== expected.ruleId) errors.push(`${path}.ruleId must follow the canonical quality authority order`);
  if (value.evidenceClass !== expected.evidenceClass) errors.push(`${path}.evidenceClass must match authority`);
  const counts = value.sampleCounts;
  if (!isRecord(counts)
    || Object.keys(counts).length !== 3
    || !['findings', 'controls', 'cannotDetermine'].every((key) => Object.hasOwn(counts, key))) {
    errors.push(`${path}.sampleCounts must be exact`);
  } else {
    for (const key of ['findings', 'controls', 'cannotDetermine'] as const) {
      if (!Number.isSafeInteger(counts[key]) || (counts[key] as number) < 0) {
        errors.push(`${path}.sampleCounts.${key} must be a non-negative integer`);
      }
    }
    if (Number.isSafeInteger(counts.cannotDetermine)
      && Number.isSafeInteger(counts.findings)
      && Number.isSafeInteger(counts.controls)
      && (counts.cannotDetermine as number) > (counts.findings as number) + (counts.controls as number)) {
      errors.push(`${path}.sampleCounts.cannotDetermine exceeds all labels`);
    }
  }
  if (value.measurementStatus === 'not-requested-owner-capacity') {
    if (!isRecord(counts)
      || counts.findings !== 0
      || counts.controls !== 0
      || counts.cannotDetermine !== 0) {
      errors.push(`${path} not-requested rows must have zero labels`);
    }
    if (Object.hasOwn(value, 'uncertainty')) errors.push(`${path} zero-label rows cannot include Wilson uncertainty`);
    if (Object.hasOwn(value, 'metricsRowSha256')) errors.push(`${path} not-requested rows cannot bind metrics`);
    if (value.runtimeOutcome !== 'quality-candidate-default-off'
      || value.enabledByDefault !== false
      || value.scoreEligible !== false
      || value.gateEligible !== false
      || value.repairSafety !== 'no-safe-repair') {
      errors.push(`${path} not-requested runtime effects are invalid`);
    }
  } else if (value.measurementStatus === 'measured') {
    if (!isQualityOutcome(value.runtimeOutcome)) {
      errors.push(`${path}.runtimeOutcome is invalid for measured evidence`);
    }
    if (typeof value.metricsRowSha256 !== 'string' || !SHA256.test(value.metricsRowSha256)) {
      errors.push(`${path}.metricsRowSha256 must bind the canonical metrics row`);
    }
    const defaultOn = value.runtimeOutcome === 'default-on';
    if (value.enabledByDefault !== defaultOn
      || value.scoreEligible !== defaultOn
      || value.gateEligible !== defaultOn) {
      errors.push(`${path} measured runtime effects do not match the outcome`);
    }
    if (expected.evidenceClass === 'statistical-review-utility' && defaultOn) {
      errors.push(`${path} statistical evidence cannot produce default-on`);
    }
    const expectedRepair = expected.evidenceClass === 'contextual-quality' ? 'finding-bound-only' : 'no-safe-repair';
    if (value.repairSafety !== expectedRepair) errors.push(`${path}.repairSafety does not match the evidence class`);
    if (value.runtimeOutcome === 'insufficient-evidence') {
      if (Object.hasOwn(value, 'uncertainty')) errors.push(`${path} insufficient evidence cannot include Wilson uncertainty`);
    } else {
      if (!isRecord(counts) || (counts.findings as number) < 1 || (counts.controls as number) < 1) {
        errors.push(`${path} measured evidence requires nonzero arms`);
      }
      if (!isRecord(value.uncertainty)
        || !Object.hasOwn(value.uncertainty, 'findingUseful')
        || !Object.hasOwn(value.uncertainty, 'controlUseful')) {
        errors.push(`${path}.uncertainty is required for measured evidence`);
      } else {
        intervalErrors(value.uncertainty.findingUseful, `${path}.uncertainty.findingUseful`, errors);
        intervalErrors(value.uncertainty.controlUseful, `${path}.uncertainty.controlUseful`, errors);
      }
    }
  } else {
    errors.push(`${path}.measurementStatus is invalid`);
  }
  return errors;
}

export function validateCAL002QualityDispositionV2(value: unknown): CAL002ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['artifact must be an object'] };
  const keys = [
    'version', 'protocolVersion', 'catalogSha256', 'authorityReceiptSha256', 'implementationCommitSha',
    'selectedRuleIds', 'rows', 'admitted', 'applied',
  ];
  const unknown = Object.keys(value).filter((key) => !keys.includes(key));
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length > 0 || missing.length > 0) errors.push('artifact has unknown or missing fields');
  if (value.version !== CAL002_QUALITY_DISPOSITION_VERSION) errors.push('artifact.version is invalid');
  if (value.protocolVersion !== CAL002_PROTOCOL_VERSION_V2) errors.push('artifact.protocolVersion is invalid');
  if (value.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256) errors.push('artifact.catalogSha256 is invalid');
  if (typeof value.authorityReceiptSha256 !== 'string' || !SHA256.test(value.authorityReceiptSha256)) {
    errors.push('artifact.authorityReceiptSha256 must be a lowercase SHA-256');
  }
  try {
    assertCommitSha(value.implementationCommitSha, 'artifact.implementationCommitSha');
  } catch (error) {
    errors.push((error as Error).message);
  }
  if (value.admitted !== false) errors.push('artifact.admitted must be false');
  if (value.applied !== false) errors.push('artifact.applied must be false');

  const selectedRuleIds = Array.isArray(value.selectedRuleIds) ? value.selectedRuleIds : [];
  if (!Array.isArray(value.selectedRuleIds)) errors.push('artifact.selectedRuleIds must be an array');
  if (selectedRuleIds.length > 4
    || selectedRuleIds.some((ruleId) => typeof ruleId !== 'string' || !RULE_ID.test(ruleId))) {
    errors.push('artifact.selectedRuleIds must contain at most four canonical rule IDs');
  }
  if (new Set(selectedRuleIds).size !== selectedRuleIds.length) errors.push('artifact.selectedRuleIds must be unique');
  const sortedSelected = [...selectedRuleIds].sort(compareCodePoints);
  if (canonicalArtifact(selectedRuleIds).json !== canonicalArtifact(sortedSelected).json) {
    errors.push('artifact.selectedRuleIds must be in canonical order');
  }

  const expected = expectedQualityRows();
  const rows = Array.isArray(value.rows) ? value.rows : [];
  if (!Array.isArray(value.rows) || rows.length !== 32) errors.push('artifact.rows must contain exactly 32 rows');
  for (let index = 0; index < expected.length; index += 1) {
    errors.push(...rowValidationErrors(rows[index], expected[index]!, index));
  }
  const measuredRuleIds = rows
    .filter((row): row is Record<string, unknown> => isRecord(row) && row.measurementStatus === 'measured')
    .map((row) => row.ruleId)
    .filter((ruleId): ruleId is string => typeof ruleId === 'string')
    .sort(compareCodePoints);
  if (canonicalArtifact(measuredRuleIds).json !== canonicalArtifact(sortedSelected).json) {
    errors.push('artifact measured rows must exactly match selectedRuleIds');
  }
  return { ok: errors.length === 0, errors };
}

export function assertCAL002QualityDispositionV2(value: unknown): asserts value is CAL002QualityDispositionV2 {
  const result = validateCAL002QualityDispositionV2(value);
  if (!result.ok) throw new TypeError(`CAL-002 v2 quality disposition validation failed: ${result.errors.join('; ')}`);
}
