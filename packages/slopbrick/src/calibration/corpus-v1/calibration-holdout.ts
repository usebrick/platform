import {
  computeV103MacroMetrics,
  computeV103Metrics,
  computeV103RepositoryClusterBootstrap,
  type V103BootstrapOptions,
  type V103MetricObservation,
  type V103MetricRuleDefinition,
  type V103MetricsInput,
  type V103MetricsResult,
  type V103MacroMetricsResult,
  type V103RepositoryClusterBootstrapResult,
} from '../v103/metrics';
import { canonicalJson, canonicalSha256 } from '../v103/canonical';
import type { CAL001SmokeInputHashes } from './calibration-smoke';

export const CAL001_HOLDOUT_RECEIPT_VERSION = 'cal-001-v1-holdout-receipt-v1' as const;
export const CAL001_HOLDOUT_METRICS_VERSION = 'cal-001-v1-holdout-metrics-v1' as const;
export const CAL001_HOLDOUT_BOOTSTRAP: V103BootstrapOptions = {
  seed: 0x6ca10002,
  replicates: 128,
  confidenceLevel: 0.95,
};

export type CAL001HoldoutSplit = 'train' | 'validation' | 'test';
export type CAL001HoldoutLabel = 'positive' | 'negative';

const SPLITS = ['train', 'validation', 'test'] as const satisfies readonly CAL001HoldoutSplit[];
const LABELS = ['positive', 'negative'] as const satisfies readonly CAL001HoldoutLabel[];
const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT_SHA = /^[a-f0-9]{40}$/u;
const RUN_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/u;

export interface CAL001HoldoutRow {
  readonly unitId: string;
  readonly sourceRecordId: string;
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly label: CAL001HoldoutLabel;
  readonly contentSha256: string;
  readonly normalizedSha256: string | null;
  readonly familyKey: string;
  readonly language: string;
  readonly split: CAL001HoldoutSplit;
  readonly byteCount: number;
}

export interface CAL001HoldoutInput {
  readonly protocolVersion: 'CAL-001-v1';
  readonly runId: string;
  readonly implementationCommitSha: string;
  readonly packageVersion: string;
  readonly configHash: string;
  readonly inputHashes: CAL001SmokeInputHashes;
  readonly workerCount: 1;
  readonly rows: readonly CAL001HoldoutRow[];
  readonly observations: readonly V103MetricObservation[];
  readonly ruleCatalog: readonly V103MetricRuleDefinition[];
  readonly bootstrap?: V103BootstrapOptions;
}

interface CAL001SplitPopulation {
  readonly total: number;
  readonly positive: number;
  readonly negative: number;
  readonly familyCount: number;
}

interface CAL001CoverageArm {
  readonly requested: number;
  readonly successful: number;
  readonly excluded: number;
  readonly failed: number;
  readonly parseFailures: number;
  readonly timeouts: number;
  readonly scannerFailures: number;
}

interface CAL001Coverage extends CAL001CoverageArm {
  readonly bySplit: Readonly<Record<CAL001HoldoutSplit, CAL001CoverageArm>>;
}

interface CAL001ByteStats {
  readonly count: number;
  readonly min: number | null;
  readonly max: number | null;
  readonly mean: number | null;
}

interface CAL001Confounds {
  readonly sourceIds: Readonly<Record<string, number>>;
  readonly sourceVersions: Readonly<Record<string, number>>;
  readonly languagesBySplit: Readonly<Record<CAL001HoldoutSplit, Readonly<Record<string, number>>>>;
  readonly familiesBySplit: Readonly<Record<CAL001HoldoutSplit, number>>;
  readonly byteStatsBySplitAndPolarity: Readonly<Record<CAL001HoldoutSplit, Readonly<Record<CAL001HoldoutLabel, CAL001ByteStats>>>>;
  readonly frameworkBuckets: { readonly status: 'not-available'; readonly reason: 'manifest-does-not-declare-framework' };
  readonly generatedFixtureSchemaDocumentationBuckets: { readonly status: 'not-available'; readonly reason: 'manifest-does-not-declare-semantic-bucket' };
  readonly sourceEraBuckets: { readonly status: 'not-available'; readonly reason: 'manifest-does-not-declare-source-era' };
}

interface CAL001Leakage {
  readonly status: 'clear' | 'failed';
  readonly crossLabelExactGroups: number;
  readonly crossLabelExactRows: number;
  readonly crossLabelNormalizedGroups: number;
  readonly crossLabelNormalizedRows: number;
  readonly familySplitOverlapGroups: number;
  readonly familySplitOverlapRows: number;
}

export interface CAL001HoldoutSplitMetrics {
  readonly population: CAL001SplitPopulation;
  readonly base: V103MetricsResult;
  readonly macro: V103MacroMetricsResult;
  readonly repositoryClusterBootstrap: V103RepositoryClusterBootstrapResult;
}

export interface CAL001HoldoutMetrics {
  readonly version: typeof CAL001_HOLDOUT_METRICS_VERSION;
  readonly thresholdPolicy: 'binary-scanner-output-not-tuned';
  readonly usefulness: 'not-evaluated';
  readonly splits: Readonly<Record<CAL001HoldoutSplit, CAL001HoldoutSplitMetrics>>;
}

interface CAL001MetricsReceipt {
  readonly status: 'available' | 'unavailable';
  readonly metricsSha256: string;
  readonly splitStatuses: Readonly<Record<CAL001HoldoutSplit, V103MetricsResult['status']>>;
}

export interface CAL001HoldoutReceipt {
  readonly version: typeof CAL001_HOLDOUT_RECEIPT_VERSION;
  readonly protocolVersion: 'CAL-001-v1';
  readonly runId: string;
  readonly implementationCommitSha: string;
  readonly packageVersion: string;
  readonly configHash: string;
  readonly workerCount: 1;
  readonly inputHashes: CAL001SmokeInputHashes;
  readonly population: {
    readonly total: number;
    readonly positive: number;
    readonly negative: number;
    readonly splits: Readonly<Record<CAL001HoldoutSplit, CAL001SplitPopulation>>;
  };
  readonly coverage: CAL001Coverage;
  readonly rowsSha256: string;
  readonly observationsSha256: string;
  readonly metrics: CAL001MetricsReceipt;
  readonly leakage: CAL001Leakage;
  readonly confounds: CAL001Confounds;
  readonly evaluation: 'diagnostic-only' | 'failed-incomplete-cohort' | 'failed-leakage';
  readonly thresholdPolicy: 'binary-scanner-output-not-tuned';
  readonly testSetHandling: 'observed-once-without-tuning';
  readonly usefulness: 'not-evaluated';
  readonly admission: 'not-evaluated';
  /** This receipt is diagnostic evidence and cannot admit a corpus or rule. */
  readonly admitted: false;
  /** The evaluator consumes scanner observations produced from source bytes. */
  readonly scannerCodeExecuted: true;
  readonly authorityTier: 'publisher_attested';
  readonly rightsDisposition: 'internal_analysis';
}

export interface CAL001HoldoutResult {
  readonly receipt: CAL001HoldoutReceipt;
  readonly receiptJson: string;
  readonly receiptSha256: string;
  readonly metrics: CAL001HoldoutMetrics;
  readonly metricsJson: string;
  readonly metricsSha256: string;
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new TypeError(`${label} must be a lowercase SHA-256`);
}

function assertInputHashes(input: CAL001SmokeInputHashes): void {
  for (const [label, value] of Object.entries(input)) assertSha256(value, label);
}

function assertRow(row: CAL001HoldoutRow): void {
  for (const [label, value] of [
    ['unitId', row.unitId],
    ['sourceRecordId', row.sourceRecordId],
    ['sourceId', row.sourceId],
    ['sourceVersion', row.sourceVersion],
    ['familyKey', row.familyKey],
    ['language', row.language],
  ] as const) {
    if (typeof value !== 'string' || value.length === 0) throw new TypeError(`holdout row ${label} is invalid`);
  }
  assertSha256(row.contentSha256, `contentSha256 for ${row.unitId}`);
  if (row.normalizedSha256 !== null) assertSha256(row.normalizedSha256, `normalizedSha256 for ${row.unitId}`);
  if (!LABELS.includes(row.label) || !SPLITS.includes(row.split)) throw new TypeError(`holdout row ${row.unitId} has an invalid label or split`);
  if (!Number.isSafeInteger(row.byteCount) || row.byteCount < 0) throw new TypeError(`holdout row ${row.unitId} has an invalid byte count`);
}

function assertInput(input: CAL001HoldoutInput): Map<string, CAL001HoldoutRow> {
  if (input.protocolVersion !== 'CAL-001-v1') throw new TypeError('CAL-001 holdout protocol version is invalid');
  if (typeof input.runId !== 'string' || !RUN_ID.test(input.runId)) throw new TypeError('CAL-001 holdout run ID is invalid');
  if (typeof input.implementationCommitSha !== 'string' || !COMMIT_SHA.test(input.implementationCommitSha)) {
    throw new TypeError('CAL-001 holdout implementation commit SHA is invalid');
  }
  if (typeof input.packageVersion !== 'string' || input.packageVersion.length === 0) throw new TypeError('CAL-001 holdout package version is invalid');
  assertSha256(input.configHash, 'configHash');
  assertInputHashes(input.inputHashes);
  if (input.workerCount !== 1) throw new RangeError('CAL-001 holdout requires exactly one worker');
  if (input.rows.length === 0) throw new TypeError('CAL-001 holdout rows must not be empty');
  if (input.ruleCatalog.length === 0) throw new TypeError('CAL-001 holdout rule catalog must not be empty');

  const rowsById = new Map<string, CAL001HoldoutRow>();
  for (const row of input.rows) {
    assertRow(row);
    if (rowsById.has(row.unitId)) throw new TypeError('CAL-001 holdout rows contain a duplicate unit ID');
    rowsById.set(row.unitId, row);
  }
  if (input.observations.length !== rowsById.size) throw new TypeError('CAL-001 holdout observations do not cover the population');
  return rowsById;
}

function assertObservations(
  input: CAL001HoldoutInput,
  rowsById: ReadonlyMap<string, CAL001HoldoutRow>,
): void {
  const seen = new Set<string>();
  for (const observation of input.observations) {
    const row = rowsById.get(observation.fileId);
    if (row === undefined || seen.has(observation.fileId)) throw new TypeError('CAL-001 holdout observations contain an unexpected or duplicate file ID');
    if (observation.runId !== input.runId) throw new TypeError('CAL-001 holdout observation has a stale run ID');
    const polarity = row.label === 'positive' ? 'verified_ai' : 'verified_human';
    if (
      observation.polarity !== polarity
      || observation.repositoryId !== row.sourceId
      || observation.familyId !== row.familyKey
      || observation.language !== row.language
    ) {
      throw new TypeError(`CAL-001 holdout observation identity does not match ${row.unitId}`);
    }
    seen.add(observation.fileId);
  }
}

function emptyCoverage(): CAL001CoverageArm {
  return { requested: 0, successful: 0, excluded: 0, failed: 0, parseFailures: 0, timeouts: 0, scannerFailures: 0 };
}

function addCoverage(coverage: CAL001CoverageArm, status: V103MetricObservation['status']): CAL001CoverageArm {
  const next = { ...coverage, requested: coverage.requested + 1 };
  if (status === 'success_findings' || status === 'success_zero') return { ...next, successful: next.successful + 1 };
  if (status === 'excluded') return { ...next, excluded: next.excluded + 1 };
  if (status === 'parse_failure') return { ...next, failed: next.failed + 1, parseFailures: next.parseFailures + 1 };
  if (status === 'timeout') return { ...next, failed: next.failed + 1, timeouts: next.timeouts + 1 };
  return { ...next, failed: next.failed + 1, scannerFailures: next.scannerFailures + 1 };
}

function coverage(
  rowsById: ReadonlyMap<string, CAL001HoldoutRow>,
  observations: readonly V103MetricObservation[],
): CAL001Coverage {
  const bySplit: Record<CAL001HoldoutSplit, CAL001CoverageArm> = {
    train: emptyCoverage(),
    validation: emptyCoverage(),
    test: emptyCoverage(),
  };
  let total = emptyCoverage();
  for (const observation of observations) {
    const row = rowsById.get(observation.fileId);
    if (row === undefined) throw new TypeError('CAL-001 holdout coverage encountered an unknown file ID');
    total = addCoverage(total, observation.status);
    bySplit[row.split] = addCoverage(bySplit[row.split], observation.status);
  }
  return { ...total, bySplit };
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function countsBy(rows: readonly CAL001HoldoutRow[], keyOf: (row: CAL001HoldoutRow) => string): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const row of rows) increment(counts, keyOf(row));
  return counts;
}

function stats(rows: readonly CAL001HoldoutRow[]): CAL001ByteStats {
  if (rows.length === 0) return { count: 0, min: null, max: null, mean: null };
  const bytes = rows.map((row) => row.byteCount);
  return {
    count: bytes.length,
    min: Math.min(...bytes),
    max: Math.max(...bytes),
    mean: bytes.reduce((sum, value) => sum + value, 0) / bytes.length,
  };
}

function confounds(rows: readonly CAL001HoldoutRow[]): CAL001Confounds {
  const bySplit = (split: CAL001HoldoutSplit): readonly CAL001HoldoutRow[] => rows.filter((row) => row.split === split);
  const languagesBySplit = Object.fromEntries(SPLITS.map((split) => [split, countsBy(bySplit(split), (row) => row.language)])) as Record<CAL001HoldoutSplit, Readonly<Record<string, number>>>;
  const familiesBySplit = Object.fromEntries(SPLITS.map((split) => [split, new Set(bySplit(split).map((row) => row.familyKey)).size])) as Record<CAL001HoldoutSplit, number>;
  const byteStatsBySplitAndPolarity = Object.fromEntries(SPLITS.map((split) => [
    split,
    Object.fromEntries(LABELS.map((label) => [label, stats(bySplit(split).filter((row) => row.label === label))])),
  ])) as Record<CAL001HoldoutSplit, Readonly<Record<CAL001HoldoutLabel, CAL001ByteStats>>>;
  return {
    sourceIds: countsBy(rows, (row) => row.sourceId),
    sourceVersions: countsBy(rows, (row) => row.sourceVersion),
    languagesBySplit,
    familiesBySplit,
    byteStatsBySplitAndPolarity,
    frameworkBuckets: { status: 'not-available', reason: 'manifest-does-not-declare-framework' },
    generatedFixtureSchemaDocumentationBuckets: { status: 'not-available', reason: 'manifest-does-not-declare-semantic-bucket' },
    sourceEraBuckets: { status: 'not-available', reason: 'manifest-does-not-declare-source-era' },
  };
}

interface CollisionSummary {
  readonly groups: number;
  readonly rows: number;
}

function crossLabelCollisions(
  rows: readonly CAL001HoldoutRow[],
  keyOf: (row: CAL001HoldoutRow) => string | null,
): CollisionSummary {
  const groups = new Map<string, CAL001HoldoutRow[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null) continue;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  let collisionGroups = 0;
  let collisionRows = 0;
  for (const group of groups.values()) {
    if (new Set(group.map((row) => row.label)).size < 2) continue;
    collisionGroups += 1;
    collisionRows += group.length;
  }
  return { groups: collisionGroups, rows: collisionRows };
}

function familySplitOverlap(rows: readonly CAL001HoldoutRow[]): CollisionSummary {
  const groups = new Map<string, CAL001HoldoutRow[]>();
  for (const row of rows) {
    const group = groups.get(row.familyKey) ?? [];
    group.push(row);
    groups.set(row.familyKey, group);
  }
  let overlapGroups = 0;
  let overlapRows = 0;
  for (const group of groups.values()) {
    if (new Set(group.map((row) => row.split)).size < 2) continue;
    overlapGroups += 1;
    overlapRows += group.length;
  }
  return { groups: overlapGroups, rows: overlapRows };
}

function leakage(rows: readonly CAL001HoldoutRow[]): CAL001Leakage {
  const exact = crossLabelCollisions(rows, (row) => row.contentSha256);
  const normalized = crossLabelCollisions(rows, (row) => row.normalizedSha256);
  const family = familySplitOverlap(rows);
  const failed = exact.groups > 0 || normalized.groups > 0 || family.groups > 0;
  return {
    status: failed ? 'failed' : 'clear',
    crossLabelExactGroups: exact.groups,
    crossLabelExactRows: exact.rows,
    crossLabelNormalizedGroups: normalized.groups,
    crossLabelNormalizedRows: normalized.rows,
    familySplitOverlapGroups: family.groups,
    familySplitOverlapRows: family.rows,
  };
}

function population(rows: readonly CAL001HoldoutRow[]): {
  readonly total: number;
  readonly positive: number;
  readonly negative: number;
  readonly splits: Readonly<Record<CAL001HoldoutSplit, CAL001SplitPopulation>>;
} {
  const splits = Object.fromEntries(SPLITS.map((split) => {
    const selected = rows.filter((row) => row.split === split);
    const positive = selected.filter((row) => row.label === 'positive').length;
    return [split, {
      total: selected.length,
      positive,
      negative: selected.length - positive,
      familyCount: new Set(selected.map((row) => row.familyKey)).size,
    }];
  })) as Record<CAL001HoldoutSplit, CAL001SplitPopulation>;
  const positive = rows.filter((row) => row.label === 'positive').length;
  return { total: rows.length, positive, negative: rows.length - positive, splits };
}

function metricsForSplit(
  split: CAL001HoldoutSplit,
  rows: readonly CAL001HoldoutRow[],
  observations: readonly V103MetricObservation[],
  ruleCatalog: readonly V103MetricRuleDefinition[],
  bootstrap: V103BootstrapOptions,
): CAL001HoldoutSplitMetrics {
  const selectedRows = rows.filter((row) => row.split === split);
  const selectedIds = new Set(selectedRows.map((row) => row.unitId));
  const selectedObservations = observations.filter((observation) => selectedIds.has(observation.fileId));
  const metricInput: V103MetricsInput = {
    observations: selectedObservations,
    ruleCatalog,
    eligibleFileIdsByPolarity: {
      verified_ai: selectedRows.filter((row) => row.label === 'positive').map((row) => row.unitId),
      verified_human: selectedRows.filter((row) => row.label === 'negative').map((row) => row.unitId),
    },
  };
  return {
    population: population(selectedRows).splits[split],
    base: computeV103Metrics(metricInput),
    macro: computeV103MacroMetrics(metricInput),
    repositoryClusterBootstrap: computeV103RepositoryClusterBootstrap(metricInput, bootstrap),
  };
}

function metrics(
  rows: readonly CAL001HoldoutRow[],
  observations: readonly V103MetricObservation[],
  ruleCatalog: readonly V103MetricRuleDefinition[],
  bootstrap: V103BootstrapOptions,
): CAL001HoldoutMetrics {
  return {
    version: CAL001_HOLDOUT_METRICS_VERSION,
    thresholdPolicy: 'binary-scanner-output-not-tuned',
    usefulness: 'not-evaluated',
    splits: Object.fromEntries(SPLITS.map((split) => [split, metricsForSplit(split, rows, observations, ruleCatalog, bootstrap)])) as Record<CAL001HoldoutSplit, CAL001HoldoutSplitMetrics>,
  };
}

export function buildCAL001HoldoutReceipt(input: CAL001HoldoutInput): CAL001HoldoutResult {
  const rowsById = assertInput(input);
  assertObservations(input, rowsById);
  const sortedRows = [...input.rows].sort((left, right) => left.unitId.localeCompare(right.unitId));
  const sortedObservations = [...input.observations].sort((left, right) => left.fileId.localeCompare(right.fileId));
  const checkedPopulation = population(input.rows);
  const checkedCoverage = coverage(rowsById, input.observations);
  const checkedLeakage = leakage(input.rows);
  const checkedMetrics = metrics(input.rows, input.observations, input.ruleCatalog, input.bootstrap ?? CAL001_HOLDOUT_BOOTSTRAP);
  const metricsJson = canonicalJson(checkedMetrics);
  const metricsSha256 = canonicalSha256(checkedMetrics);
  const splitStatuses = Object.fromEntries(SPLITS.map((split) => [split, checkedMetrics.splits[split].base.status])) as Record<CAL001HoldoutSplit, V103MetricsResult['status']>;
  const allMetricsAvailable = SPLITS.every((split) => checkedMetrics.splits[split].base.status === 'available');
  const evaluation = checkedLeakage.status === 'failed'
    ? 'failed-leakage' as const
    : checkedCoverage.failed > 0
      ? 'failed-incomplete-cohort' as const
      : 'diagnostic-only' as const;
  const receipt: CAL001HoldoutReceipt = {
    version: CAL001_HOLDOUT_RECEIPT_VERSION,
    protocolVersion: input.protocolVersion,
    runId: input.runId,
    implementationCommitSha: input.implementationCommitSha,
    packageVersion: input.packageVersion,
    configHash: input.configHash,
    workerCount: 1,
    inputHashes: input.inputHashes,
    population: checkedPopulation,
    coverage: checkedCoverage,
    rowsSha256: canonicalSha256(sortedRows),
    observationsSha256: canonicalSha256(sortedObservations),
    metrics: {
      status: allMetricsAvailable ? 'available' : 'unavailable',
      metricsSha256,
      splitStatuses,
    },
    leakage: checkedLeakage,
    confounds: confounds(input.rows),
    evaluation,
    thresholdPolicy: 'binary-scanner-output-not-tuned',
    testSetHandling: 'observed-once-without-tuning',
    usefulness: 'not-evaluated',
    admission: 'not-evaluated',
    admitted: false,
    scannerCodeExecuted: true,
    authorityTier: 'publisher_attested',
    rightsDisposition: 'internal_analysis',
  };
  const receiptJson = canonicalJson(receipt);
  return {
    receipt,
    receiptJson,
    receiptSha256: canonicalSha256(receipt),
    metrics: checkedMetrics,
    metricsJson,
    metricsSha256,
  };
}
