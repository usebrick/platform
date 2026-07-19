import {
  CAL002_CONTEXTUAL_RULE_IDS,
  CAL002_DETERMINISTIC_RULE_IDS,
  CAL002_FINAL_MATRIX_VERSION,
  CAL002_LOCKED_COUNTS,
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  CAL002_LOCKED_RULE_IDS,
  CAL002_PROTOCOL_VERSION,
  CAL002_STATISTICAL_RULE_IDS,
  assertCommitSha,
  canonicalArtifact,
  validateCAL002Catalog,
  validateCAL002FinalMatrix,
  validateCAL002OriginReceipt,
  validateCAL002QualityMetrics,
  type CAL002Catalog,
  type CAL002ClaimCeiling,
  type CAL002EvidenceClass,
  type CAL002FinalRow,
  type CAL002PolicyOutcome,
} from './contracts';
import {
  buildCAL002OracleReceipt,
  type CAL002OracleReceipt,
  type CAL002OracleReceiptRow,
} from './oracles';
import {
  resolveCAL002OriginDecisions,
  type CAL002OriginDecisionRow,
  type CAL002OriginReceipt,
} from './origin';
import {
  wilson95,
  type CAL002QualityMetrics,
  type CAL002QualityMetricsRow,
} from './quality-metrics';

const QUALITY_CLASSES = new Set<CAL002EvidenceClass>([
  'deterministic-or-standards',
  'contextual-quality',
  'statistical-review-utility',
]);
const DETERMINISTIC_IDS = new Set<string>(CAL002_DETERMINISTIC_RULE_IDS);
const CONTEXTUAL_IDS = new Set<string>(CAL002_CONTEXTUAL_RULE_IDS);
const STATISTICAL_IDS = new Set<string>(CAL002_STATISTICAL_RULE_IDS);
const SHA256 = /^[a-f0-9]{64}$/u;

export interface BuildCAL002FinalMatrixInput {
  readonly catalog: CAL002Catalog;
  readonly laneDecisions?: readonly CAL002OriginDecisionRow[];
  readonly originReceipt: CAL002OriginReceipt;
  readonly qualityMetrics: CAL002QualityMetrics;
  readonly oracleReceipt: CAL002OracleReceipt;
  readonly reducerImplementationCommitSha: string;
}

export interface CAL002FinalMatrix {
  readonly version: typeof CAL002_FINAL_MATRIX_VERSION;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION;
  readonly catalogSha256: typeof CAL002_LOCKED_RULE_CATALOG_SHA256;
  readonly oracleReceiptSha256: string;
  readonly qualityMetricsSha256: string;
  readonly originReceiptSha256: string;
  readonly reducerImplementationCommitSha: string;
  readonly rows: readonly CAL002FinalRow[];
  readonly counts: {
    readonly total: number;
    readonly defaultOn: number;
    readonly defaultOff: number;
    readonly qualityAdvisory: number;
    readonly insufficientEvidence: number;
    readonly retired: number;
  };
  readonly admitted: false;
  readonly applied: false;
}

export interface CAL002FinalMatrixResult {
  readonly matrix: CAL002FinalMatrix;
  readonly matrixJson: string;
  readonly matrixSha256: string;
}

interface TransferBinding {
  readonly ruleId: string;
  readonly evidenceClass: CAL002EvidenceClass;
  readonly reason: CAL002OriginDecisionRow['reason'];
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(compareCodePoints);
  const required = [...expected].sort(compareCodePoints);
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new TypeError(`${label} has unknown or missing fields`);
  }
}

function allowedKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unknown !== undefined) throw new TypeError(`${label} has unknown field ${unknown}`);
}

function exactCanonicalOrder<T>(rows: readonly T[], sorted: readonly T[], label: string): void {
  if (canonicalArtifact(rows).json !== canonicalArtifact(sorted).json) {
    throw new TypeError(`${label} is not in canonical order`);
  }
}

function assertCatalog(catalog: CAL002Catalog): void {
  const validation = validateCAL002Catalog(catalog);
  if (!validation.ok) throw new TypeError(`CAL-002 catalog is invalid: ${validation.errors.join('; ')}`);
  if (
    catalog.protocolVersion !== CAL002_PROTOCOL_VERSION
    || catalog.ruleCatalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256
    || catalog.admitted !== false
    || catalog.applied !== false
    || catalog.rows.length !== CAL002_LOCKED_COUNTS.total
    || catalog.counts.total !== CAL002_LOCKED_COUNTS.total
    || catalog.counts.startingQuality !== CAL002_LOCKED_COUNTS.startingQuality
    || catalog.counts.startingOrigin !== CAL002_LOCKED_COUNTS.startingOrigin
    || catalog.counts.ownerReviewRequired !== CAL002_LOCKED_COUNTS.ownerReviewRequired
    || catalog.counts.deterministic !== CAL002_LOCKED_COUNTS.deterministic
    || catalog.counts.contextual !== CAL002_LOCKED_COUNTS.contextual
    || catalog.counts.statistical !== CAL002_LOCKED_COUNTS.statistical
  ) {
    throw new TypeError('CAL-002 catalog does not match the locked 119-row non-admitting identity');
  }
  const sorted = [...catalog.rows].sort((left, right) => compareCodePoints(left.ruleId, right.ruleId));
  exactCanonicalOrder(catalog.rows, sorted, 'CAL-002 catalog rows');
  const ids = catalog.rows.map((row) => row.ruleId);
  const lockedIds = [...CAL002_LOCKED_RULE_IDS].sort(compareCodePoints);
  if (ids.length !== lockedIds.length || ids.some((id, index) => id !== lockedIds[index])) {
    throw new TypeError('CAL-002 catalog rows do not exactly cover the locked rule IDs');
  }
  const identityRows = catalog.rows.map((row) => ({
    ruleId: row.ruleId,
    category: row.category,
    aiSpecific: row.aiSpecific,
    existingDefaultOff: row.existingDefaultOff,
  }));
  if (canonicalArtifact(identityRows).sha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256) {
    throw new TypeError('CAL-002 catalog row metadata has drifted from the locked catalog');
  }
}

function assertSha(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new TypeError(`${label} must be a lowercase SHA-256`);
}

function assertOriginReceipt(
  receipt: CAL002OriginReceipt,
  catalog: CAL002Catalog,
): readonly CAL002OriginDecisionRow[] {
  const validation = validateCAL002OriginReceipt(receipt);
  if (!validation.ok) throw new TypeError(`CAL-002 origin receipt is invalid: ${validation.errors.join('; ')}`);
  requireRecord(receipt, 'CAL-002 origin receipt');
  exactKeys(receipt, [
    'version', 'protocolVersion', 'catalogSha256', 'originImplementationCommitSha',
    'status', 'governingHashes', 'rows', 'admitted',
  ], 'CAL-002 origin receipt');
  if (
    receipt.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256
    || receipt.protocolVersion !== CAL002_PROTOCOL_VERSION
    || receipt.admitted !== false
    || (receipt.status !== 'reused' && receipt.status !== 'rerun-completed')
  ) {
    throw new TypeError('CAL-002 origin receipt is incomplete or not eligible for final matrix reduction');
  }
  if (receipt.rows.length !== CAL002_LOCKED_COUNTS.startingOrigin) {
    throw new TypeError('CAL-002 origin receipt must account for all 72 origin rows');
  }
  const ownerRuleIds = new Set(
    catalog.rows
      .filter((row) => row.lane === 'origin' && row.ownerReviewRequired)
      .map((row) => row.ruleId),
  );
  const resolution = resolveCAL002OriginDecisions({
    catalog,
    decisions: receipt.rows.filter((row) => ownerRuleIds.has(row.ruleId)),
  });
  if (resolution.unresolvedRuleIds.length !== 0) {
    throw new TypeError('CAL-002 origin receipt has unresolved owner decisions');
  }
  exactCanonicalOrder(receipt.rows, resolution.rows, 'CAL-002 origin receipt rows');
  return resolution.rows;
}

function transferForDecision(decision: CAL002OriginDecisionRow): TransferBinding | undefined {
  if (decision.disposition !== 'transfer-to-quality') return undefined;
  if (decision.reason === 'standards-or-contract-quality-claim') {
    return { ruleId: decision.ruleId, evidenceClass: 'deterministic-or-standards', reason: decision.reason };
  }
  if (decision.reason === 'contextual-defect-quality-claim') {
    return { ruleId: decision.ruleId, evidenceClass: 'contextual-quality', reason: decision.reason };
  }
  if (decision.reason === 'statistical-review-utility-claim') {
    return { ruleId: decision.ruleId, evidenceClass: 'statistical-review-utility', reason: decision.reason };
  }
  throw new TypeError(`CAL-002 transfer reason is missing or invalid for ${decision.ruleId}`);
}

function assertLaneDecisions(
  laneDecisions: readonly CAL002OriginDecisionRow[] | undefined,
  originRows: readonly CAL002OriginDecisionRow[],
): void {
  if (laneDecisions === undefined) return;
  exactCanonicalOrder(laneDecisions, [...laneDecisions].sort((left, right) => compareCodePoints(left.ruleId, right.ruleId)), 'CAL-002 lane decisions');
  if (canonicalArtifact(laneDecisions).json !== canonicalArtifact(originRows).json) {
    throw new TypeError('CAL-002 lane decisions do not exactly match the origin receipt projection');
  }
}

function oracleRowProjection(row: CAL002OracleReceiptRow): string {
  return canonicalArtifact({
    artifact: 'cal-002-oracle-row-v1',
    ruleId: row.ruleId,
    transferred: row.transferred,
    ...(row.declaration === undefined ? {} : { declaration: row.declaration }),
    caseResults: row.caseResults,
    sourceControls: row.sourceControls,
    status: row.status,
    failures: row.failures,
  }).sha256;
}

function assertOracleReceipt(
  receipt: CAL002OracleReceipt,
  expectedTransferred: ReadonlyMap<string, TransferBinding>,
): ReadonlyMap<string, CAL002OracleReceiptRow> {
  requireRecord(receipt, 'CAL-002 oracle receipt');
  exactKeys(receipt, ['version', 'protocolVersion', 'catalogSha256', 'implementationCommitSha', 'rows', 'admitted'], 'CAL-002 oracle receipt');
  if (receipt.version !== 'cal-002-oracle-receipt-v1' || receipt.protocolVersion !== CAL002_PROTOCOL_VERSION || receipt.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256 || receipt.admitted !== false) {
    throw new TypeError('CAL-002 oracle receipt has invalid protocol, catalog, or admission identity');
  }
  assertCommitSha(receipt.implementationCommitSha, 'CAL-002 oracle implementationCommitSha');
  const expectedIds = [...DETERMINISTIC_IDS, ...[...expectedTransferred.values()]
    .filter((binding) => binding.evidenceClass === 'deterministic-or-standards')
    .map((binding) => binding.ruleId)].sort(compareCodePoints);
  const rows = [...receipt.rows].sort((left, right) => compareCodePoints(left.ruleId, right.ruleId));
  exactCanonicalOrder(receipt.rows, rows, 'CAL-002 oracle receipt rows');
  if (rows.length !== expectedIds.length || rows.some((row, index) => row.ruleId !== expectedIds[index])) {
    throw new TypeError('CAL-002 oracle receipt does not exactly cover deterministic and transferred standards rows');
  }
  const byRuleId = new Map<string, CAL002OracleReceiptRow>();
  for (const row of rows) {
    requireRecord(row, `CAL-002 oracle row ${row.ruleId}`);
    const expectedBinding = expectedTransferred.get(row.ruleId);
    const expectedTransferredFlag = expectedBinding?.evidenceClass === 'deterministic-or-standards';
    if (row.transferred !== expectedTransferredFlag || row.admitted !== false) {
      throw new TypeError(`CAL-002 oracle transfer provenance is invalid for ${row.ruleId}`);
    }
    if (row.status !== 'pass' && row.status !== 'fail') throw new TypeError(`CAL-002 oracle status is invalid for ${row.ruleId}`);
    if (row.outcome !== (row.status === 'pass' ? 'default-on' : 'default-off')) {
      throw new TypeError(`CAL-002 oracle outcome is inconsistent for ${row.ruleId}`);
    }
    if (!Array.isArray(row.caseResults) || !Array.isArray(row.sourceControls) || !Array.isArray(row.failures)) {
      throw new TypeError(`CAL-002 oracle evidence arrays are invalid for ${row.ruleId}`);
    }
    if (byRuleId.has(row.ruleId)) throw new TypeError(`CAL-002 oracle receipt duplicates ${row.ruleId}`);
    byRuleId.set(row.ruleId, row);
  }
  const rebuilt = buildCAL002OracleReceipt({
    catalogSha256: receipt.catalogSha256,
    implementationCommitSha: receipt.implementationCommitSha,
    transfers: rows.filter((row) => row.transferred).map((row) => ({
      ruleId: row.ruleId,
      reason: 'standards-or-contract-quality-claim' as const,
    })),
    declarations: rows.flatMap((row) => row.declaration === undefined ? [] : [{ ruleId: row.ruleId, ...row.declaration }]),
    caseResults: rows.flatMap((row) => row.caseResults.map((item) => ({ ruleId: row.ruleId, ...item }))),
    sourceControls: rows.flatMap((row) => row.sourceControls.map((item) => ({ ruleId: row.ruleId, ...item }))),
  }).receipt;
  if (canonicalArtifact(rebuilt).json !== canonicalArtifact(receipt).json) {
    throw new TypeError('CAL-002 oracle receipt does not match its deterministic reduction');
  }
  return byRuleId;
}

function metricRowKeys(value: Record<string, unknown>, label: string): void {
  exactKeys(value, [
    'ruleId', 'evidenceClass', 'requestedPerArm', 'finding', 'control', 'outcome', 'claimCeiling',
  ], label);
}

function labelCount(value: unknown, label: string): number {
  requireRecord(value, label);
  exactKeys(value, ['actionableDefect', 'usefulNoSafeFix', 'notUseful', 'cannotDetermine'], label);
  const values = ['actionableDefect', 'usefulNoSafeFix', 'notUseful', 'cannotDetermine'].map((key) => value[key]);
  if (values.some((item) => !Number.isInteger(item) || (item as number) < 0)) throw new TypeError(`${label} contains invalid counts`);
  return values.reduce<number>((sum, item) => sum + (item as number), 0);
}

function metricEvidence(metric: CAL002QualityMetricsRow): {
  readonly sampleCounts: CAL002FinalRow['sampleCounts'];
  readonly uncertainty?: CAL002FinalRow['uncertainty'];
  readonly measurementStatus: CAL002FinalRow['measurementStatus'];
  readonly usefulness: CAL002FinalRow['usefulness'];
  readonly repairSafety: CAL002FinalRow['repairSafety'];
} {
  const findingTotal = labelCount(metric.finding, `quality metric ${metric.ruleId}.finding`);
  const controlTotal = labelCount(metric.control, `quality metric ${metric.ruleId}.control`);
  const findingCannotDetermine = metric.finding.cannotDetermine;
  const controlCannotDetermine = metric.control.cannotDetermine;
  const findingUseful = metric.finding.actionableDefect + metric.finding.usefulNoSafeFix;
  const controlUseful = metric.control.actionableDefect + metric.control.usefulNoSafeFix;
  const findingDeterminate = findingTotal - findingCannotDetermine;
  const controlDeterminate = controlTotal - controlCannotDetermine;
  if (metric.outcome !== 'insufficient-evidence' && (findingDeterminate < 1 || controlDeterminate < 1)) {
    throw new TypeError(`CAL-002 quality metric ${metric.ruleId} is marked measured without determinate arms`);
  }
  return {
    sampleCounts: {
      findings: findingTotal,
      controls: controlTotal,
      cannotDetermine: findingCannotDetermine + controlCannotDetermine,
    },
    ...(metric.outcome === 'insufficient-evidence' ? {} : {
      uncertainty: {
        findingUseful: wilson95(findingUseful, findingDeterminate),
        controlUseful: wilson95(controlUseful, controlDeterminate),
      },
    }),
    measurementStatus: metric.outcome === 'insufficient-evidence' ? 'unavailable' : 'measured',
    usefulness: metric.outcome === 'default-on' ? 'passed'
      : metric.outcome === 'default-off' ? 'failed'
        : metric.outcome === 'quality-advisory' ? 'advisory' : 'insufficient',
    repairSafety: metric.evidenceClass === 'statistical-review-utility' ? 'no-safe-repair' : 'finding-bound-only',
  };
}

function assertQualityMetrics(
  metrics: CAL002QualityMetrics,
  catalog: CAL002Catalog,
  expectedTransfers: ReadonlyMap<string, TransferBinding>,
): ReadonlyMap<string, CAL002QualityMetricsRow> {
  const validation = validateCAL002QualityMetrics(metrics);
  if (!validation.ok) throw new TypeError(`CAL-002 quality metrics are invalid: ${validation.errors.join('; ')}`);
  requireRecord(metrics, 'CAL-002 quality metrics');
  exactKeys(metrics, [
    'version', 'protocolVersion', 'catalogSha256', 'assignmentSha256', 'reviewReceiptSha256',
    'reducerImplementationCommitSha', 'rows', 'admitted',
  ], 'CAL-002 quality metrics');
  if (metrics.catalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256 || metrics.admitted !== false) {
    throw new TypeError('CAL-002 quality metrics have invalid catalog or admission identity');
  }
  assertSha(metrics.assignmentSha256, 'CAL-002 quality metrics assignmentSha256');
  assertSha(metrics.reviewReceiptSha256, 'CAL-002 quality metrics reviewReceiptSha256');
  assertCommitSha(metrics.reducerImplementationCommitSha, 'CAL-002 quality metrics reducerImplementationCommitSha');
  const rows = [...metrics.rows].sort((left, right) => compareCodePoints(left.ruleId, right.ruleId));
  exactCanonicalOrder(metrics.rows, rows, 'CAL-002 quality metrics rows');
  const expected = new Map<string, CAL002EvidenceClass>();
  for (const row of catalog.rows) {
    if (row.lane === 'quality' && row.evidenceClass !== 'deterministic-or-standards') expected.set(row.ruleId, row.evidenceClass);
  }
  for (const binding of expectedTransfers.values()) {
    if (binding.evidenceClass !== 'deterministic-or-standards') expected.set(binding.ruleId, binding.evidenceClass);
  }
  if (rows.length !== expected.size) throw new TypeError('CAL-002 quality metrics do not exactly cover the quality rows');
  const byRuleId = new Map<string, CAL002QualityMetricsRow>();
  for (const row of rows) {
    requireRecord(row, `CAL-002 quality metric ${row.ruleId}`);
    metricRowKeys(row, `CAL-002 quality metric ${row.ruleId}`);
    if (!QUALITY_CLASSES.has(row.evidenceClass)) {
      throw new TypeError(`CAL-002 quality metric class is invalid for ${row.ruleId}`);
    }
    if (expected.get(row.ruleId) !== row.evidenceClass) throw new TypeError(`CAL-002 quality metric has an unknown or cross-lane rule ${row.ruleId}`);
    if (byRuleId.has(row.ruleId)) throw new TypeError(`CAL-002 quality metrics duplicate ${row.ruleId}`);
    labelCount(row.finding, `CAL-002 quality metric ${row.ruleId}.finding`);
    labelCount(row.control, `CAL-002 quality metric ${row.ruleId}.control`);
    byRuleId.set(row.ruleId, row);
  }
  for (const [ruleId] of expected) if (!byRuleId.has(ruleId)) throw new TypeError(`CAL-002 quality metrics are missing ${ruleId}`);
  void catalog;
  return byRuleId;
}

function qualityRow(
  catalogRow: Extract<CAL002Catalog['rows'][number], { lane: 'quality' }> | undefined,
  ruleId: string,
  metric: CAL002QualityMetricsRow,
  transferred: boolean,
): CAL002FinalRow {
  const evidence = metricEvidence(metric);
  const claimCeiling = metric.claimCeiling as CAL002ClaimCeiling;
  const outcome = metric.outcome as CAL002PolicyOutcome;
  const row: CAL002FinalRow = {
    ruleId,
    lane: 'quality',
    priorAiSpecific: transferred,
    transferred,
    evidenceClass: metric.evidenceClass,
    measurementStatus: evidence.measurementStatus,
    claimCeiling,
    authority: 'repository-owner',
    sampleCounts: evidence.sampleCounts,
    ...(evidence.uncertainty === undefined ? {} : { uncertainty: evidence.uncertainty }),
    usefulness: evidence.usefulness,
    outcome,
    enabledByDefault: outcome === 'default-on' || outcome === 'quality-advisory',
    scoreEligibleByDefault: outcome === 'default-on',
    repairSafety: evidence.repairSafety,
    evidenceSha256: canonicalArtifact({
      artifact: 'cal-002-quality-metrics-row-v1',
      catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
      row: metric,
    }).sha256,
    admitted: false,
  };
  if (!transferred && catalogRow?.lane !== 'quality') throw new TypeError(`CAL-002 quality row ${ruleId} is not in the catalog quality lane`);
  return row;
}

function originRow(decision: CAL002OriginDecisionRow): CAL002FinalRow | undefined {
  if (decision.disposition === 'transfer-to-quality') return undefined;
  const retired = decision.disposition === 'retire';
  return {
    ruleId: decision.ruleId,
    lane: 'origin',
    priorAiSpecific: true,
    transferred: false,
    measurementStatus: retired ? 'unavailable' : 'measured',
    claimCeiling: retired ? 'retired' : 'internal-origin-association',
    authority: 'publisher-attested-internal',
    sampleCounts: { findings: 0, controls: 0, cannotDetermine: 0 },
    usefulness: 'not-applicable',
    outcome: retired ? 'retired' : 'default-off',
    enabledByDefault: false,
    scoreEligibleByDefault: false,
    repairSafety: 'not-applicable',
    evidenceSha256: canonicalArtifact({
      artifact: 'cal-002-origin-decision-row-v1',
      catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
      row: decision,
    }).sha256,
    admitted: false,
  };
}

export function buildCAL002FinalMatrix(input: BuildCAL002FinalMatrixInput): CAL002FinalMatrixResult {
  requireRecord(input, 'CAL-002 final matrix input');
  allowedKeys(input, [
    'catalog', 'laneDecisions', 'originReceipt', 'qualityMetrics', 'oracleReceipt', 'reducerImplementationCommitSha',
  ], 'CAL-002 final matrix input');
  for (const key of ['catalog', 'originReceipt', 'qualityMetrics', 'oracleReceipt', 'reducerImplementationCommitSha']) {
    if (!Object.hasOwn(input, key)) throw new TypeError(`CAL-002 final matrix input is missing ${key}`);
  }
  assertCommitSha(input.reducerImplementationCommitSha, 'reducerImplementationCommitSha');
  assertCatalog(input.catalog);
  const originRows = assertOriginReceipt(input.originReceipt, input.catalog);
  assertLaneDecisions(input.laneDecisions, originRows);
  const transfers = new Map<string, TransferBinding>();
  for (const decision of originRows) {
    const binding = transferForDecision(decision);
    if (binding !== undefined) {
      if (transfers.has(binding.ruleId)) throw new TypeError(`CAL-002 transfer is duplicated for ${binding.ruleId}`);
      transfers.set(binding.ruleId, binding);
    }
  }
  const oracleRows = assertOracleReceipt(input.oracleReceipt, transfers);
  const metricsRows = assertQualityMetrics(input.qualityMetrics, input.catalog, transfers);
  const catalogByRuleId = new Map(input.catalog.rows.map((row) => [row.ruleId, row]));
  const rows: CAL002FinalRow[] = [];
  const transferIds = new Set(transfers.keys());
  for (const catalogRow of input.catalog.rows) {
    if (catalogRow.lane === 'origin') continue;
    if (DETERMINISTIC_IDS.has(catalogRow.ruleId)) {
      const oracle = oracleRows.get(catalogRow.ruleId);
      if (oracle === undefined) throw new TypeError(`CAL-002 deterministic oracle evidence is missing for ${catalogRow.ruleId}`);
      const passed = oracle.status === 'pass';
      rows.push({
        ruleId: catalogRow.ruleId,
        lane: 'quality',
        priorAiSpecific: false,
        transferred: false,
        evidenceClass: 'deterministic-or-standards',
        measurementStatus: 'oracle-verified',
        claimCeiling: 'deterministic-defect',
        authority: 'standards-contract',
        sampleCounts: {
          findings: oracle.caseResults.filter((item) => item.observed === 'finding').length,
          controls: oracle.sourceControls.filter((item) => item.observed === 'finding').length,
          cannotDetermine: 0,
        },
        usefulness: passed ? 'passed' : 'failed',
        outcome: passed ? 'default-on' : 'default-off',
        enabledByDefault: passed,
        scoreEligibleByDefault: passed,
        repairSafety: 'finding-bound-only',
        evidenceSha256: oracleRowProjection(oracle),
        admitted: false,
      });
      continue;
    }
    if (!CONTEXTUAL_IDS.has(catalogRow.ruleId) && !STATISTICAL_IDS.has(catalogRow.ruleId)) {
      throw new TypeError(`CAL-002 quality catalog row ${catalogRow.ruleId} has no locked quality class`);
    }
    const metric = metricsRows.get(catalogRow.ruleId);
    if (metric === undefined) throw new TypeError(`CAL-002 quality metrics are missing ${catalogRow.ruleId}`);
    rows.push(qualityRow(catalogRow, catalogRow.ruleId, metric, false));
  }
  for (const [ruleId, binding] of transfers) {
    const catalogRow = catalogByRuleId.get(ruleId);
    if (catalogRow === undefined || catalogRow.lane !== 'origin') throw new TypeError(`CAL-002 transfer names an unknown catalog row ${ruleId}`);
    if (binding.evidenceClass === 'deterministic-or-standards') {
      const oracle = oracleRows.get(ruleId);
      if (oracle === undefined || oracle.transferred !== true) throw new TypeError(`CAL-002 standards transfer oracle evidence is missing for ${ruleId}`);
      const passed = oracle.status === 'pass';
      rows.push({
        ruleId,
        lane: 'quality',
        priorAiSpecific: true,
        transferred: true,
        evidenceClass: 'deterministic-or-standards',
        measurementStatus: 'oracle-verified',
        claimCeiling: 'deterministic-defect',
        authority: 'standards-contract',
        sampleCounts: {
          findings: oracle.caseResults.filter((item) => item.observed === 'finding').length,
          controls: oracle.sourceControls.filter((item) => item.observed === 'finding').length,
          cannotDetermine: 0,
        },
        usefulness: passed ? 'passed' : 'failed',
        outcome: passed ? 'default-on' : 'default-off',
        enabledByDefault: passed,
        scoreEligibleByDefault: passed,
        repairSafety: 'finding-bound-only',
        evidenceSha256: oracleRowProjection(oracle),
        admitted: false,
      });
    } else {
      const metric = metricsRows.get(ruleId);
      if (metric === undefined || metric.evidenceClass !== binding.evidenceClass) {
        throw new TypeError(`CAL-002 transfer quality evidence is missing or cross-lane for ${ruleId}`);
      }
      rows.push(qualityRow(undefined, ruleId, metric, true));
    }
  }
  for (const decision of originRows) {
    const row = originRow(decision);
    if (row !== undefined) rows.push(row);
  }
  if (rows.length !== CAL002_LOCKED_COUNTS.total) throw new TypeError('CAL-002 final matrix does not contain exactly 119 rows');
  const sortedRows = [...rows].sort((left, right) => compareCodePoints(left.ruleId, right.ruleId));
  if (new Set(sortedRows.map((row) => row.ruleId)).size !== sortedRows.length) throw new TypeError('CAL-002 final matrix contains duplicate rule IDs');
  if (transferIds.size !== sortedRows.filter((row) => row.transferred).length) throw new TypeError('CAL-002 final matrix transfer accounting is inconsistent');
  const matrix: CAL002FinalMatrix = {
    version: CAL002_FINAL_MATRIX_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    oracleReceiptSha256: canonicalArtifact(input.oracleReceipt).sha256,
    qualityMetricsSha256: canonicalArtifact(input.qualityMetrics).sha256,
    originReceiptSha256: canonicalArtifact(input.originReceipt).sha256,
    reducerImplementationCommitSha: input.reducerImplementationCommitSha,
    rows: sortedRows,
    counts: {
      total: sortedRows.length,
      defaultOn: sortedRows.filter((row) => row.outcome === 'default-on').length,
      defaultOff: sortedRows.filter((row) => row.outcome === 'default-off').length,
      qualityAdvisory: sortedRows.filter((row) => row.outcome === 'quality-advisory').length,
      insufficientEvidence: sortedRows.filter((row) => row.outcome === 'insufficient-evidence').length,
      retired: sortedRows.filter((row) => row.outcome === 'retired').length,
    },
    admitted: false,
    applied: false,
  };
  const validation = validateCAL002FinalMatrix(matrix);
  if (!validation.ok) throw new TypeError(`CAL-002 final matrix is invalid: ${validation.errors.join('; ')}`);
  const artifact = canonicalArtifact(matrix);
  return { matrix, matrixJson: artifact.json, matrixSha256: artifact.sha256 };
}
