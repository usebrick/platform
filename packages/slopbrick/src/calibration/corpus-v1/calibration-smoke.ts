import {
  computeV103MacroMetrics,
  computeV103Metrics,
  computeV103RepositoryClusterBootstrap,
  type V103BootstrapOptions,
  type V103EligibleFileIds,
  type V103MetricObservation,
  type V103MetricRuleDefinition,
  type V103MetricsResult,
} from '../v103/metrics';
import { canonicalJson, canonicalSha256 } from '../v103/canonical';

export const CAL001_PROTOCOL_VERSION = 'CAL-001-v1' as const;
export const CAL001_SMOKE_RECEIPT_VERSION = 'cal-001-v1-smoke-receipt-v1' as const;
export const CAL001_SMOKE_ROWS_PER_POLARITY = 100 as const;
export const CAL001_SMOKE_BOOTSTRAP: V103BootstrapOptions = {
  seed: 0x6ca10001,
  replicates: 128,
  confidenceLevel: 0.95,
};

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT_SHA = /^[a-f0-9]{40}$/u;
const RUN_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/u;

export interface CAL001SmokeInputHashes {
  readonly protocolSha256: string;
  readonly candidateManifestSha256: string;
  readonly planSha256: string;
  readonly sourceBindingReceiptSha256: string;
  readonly eligibleManifestSha256: string;
  readonly eligibleReceiptSha256: string;
  readonly smokeManifestSha256: string;
  readonly smokeReceiptSha256: string;
}

export interface CAL001SmokeInput {
  readonly protocolVersion: typeof CAL001_PROTOCOL_VERSION;
  readonly runId: string;
  readonly implementationCommitSha: string;
  readonly packageVersion: string;
  readonly configHash: string;
  readonly inputHashes: CAL001SmokeInputHashes;
  readonly workerCount: 1;
  readonly observations: readonly V103MetricObservation[];
  readonly ruleCatalog: readonly V103MetricRuleDefinition[];
  readonly eligibleFileIdsByPolarity: V103EligibleFileIds;
  readonly bootstrap?: V103BootstrapOptions;
}

interface CAL001Coverage {
  readonly requested: number;
  readonly successful: number;
  readonly excluded: number;
  readonly failed: number;
  readonly parseFailures: number;
  readonly timeouts: number;
  readonly scannerFailures: number;
}

interface CAL001AvailableMetrics {
  readonly status: 'available';
  readonly metricsSha256: string;
  readonly ruleCount: number;
  readonly measuredRules: number;
  readonly zeroFireRules: number;
  readonly ineligibleRules: number;
}

interface CAL001UnavailableMetrics {
  readonly status: 'unavailable';
  readonly reason: 'eligible-cohort-unavailable' | 'rule-evidence-unavailable';
  readonly metricsSha256: string;
}

export interface CAL001SmokeReceipt {
  readonly version: typeof CAL001_SMOKE_RECEIPT_VERSION;
  readonly protocolVersion: typeof CAL001_PROTOCOL_VERSION;
  readonly runId: string;
  readonly implementationCommitSha: string;
  readonly packageVersion: string;
  readonly configHash: string;
  readonly workerCount: 1;
  readonly inputHashes: CAL001SmokeInputHashes;
  readonly selected: {
    readonly positive: number;
    readonly negative: number;
    readonly total: number;
  };
  readonly coverage: CAL001Coverage;
  readonly observationsSha256: string;
  readonly metrics: CAL001AvailableMetrics | CAL001UnavailableMetrics;
  /** This receipt is diagnostic evidence and cannot admit a corpus or rule. */
  readonly admitted: false;
  /** The smoke executes scanner code against source-bound bytes. */
  readonly scannerCodeExecuted: true;
  readonly authorityTier: 'publisher_attested';
  readonly rightsDisposition: 'internal_analysis';
}

export interface CAL001SmokeResult {
  readonly receipt: CAL001SmokeReceipt;
  readonly receiptJson: string;
  readonly receiptSha256: string;
  /** Canonical, path-free metric output bound by receipt.metricsSha256. */
  readonly metricsJson: string;
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new TypeError(`${label} must be a lowercase SHA-256`);
}

function assertInputHashes(input: CAL001SmokeInputHashes): void {
  for (const [label, value] of Object.entries(input)) assertSha256(value, label);
}

function assertExpectedCohort(input: CAL001SmokeInput): Map<string, 'verified_ai' | 'verified_human'> {
  const expected = new Map<string, 'verified_ai' | 'verified_human'>();
  for (const polarity of ['verified_ai', 'verified_human'] as const) {
    const fileIds = input.eligibleFileIdsByPolarity[polarity];
    if (fileIds.length !== CAL001_SMOKE_ROWS_PER_POLARITY) {
      throw new RangeError(`CAL-001 smoke requires ${CAL001_SMOKE_ROWS_PER_POLARITY} ${polarity} file IDs`);
    }
    for (const fileId of fileIds) {
      if (typeof fileId !== 'string' || fileId.length === 0 || expected.has(fileId)) {
        throw new TypeError('CAL-001 smoke file IDs must be unique across both polarities');
      }
      expected.set(fileId, polarity);
    }
  }
  return expected;
}

function assertInput(input: CAL001SmokeInput): Map<string, 'verified_ai' | 'verified_human'> {
  if (input.protocolVersion !== CAL001_PROTOCOL_VERSION) throw new TypeError('CAL-001 smoke protocol version is invalid');
  if (typeof input.runId !== 'string' || !RUN_ID.test(input.runId)) throw new TypeError('CAL-001 smoke run ID is invalid');
  if (typeof input.implementationCommitSha !== 'string' || !COMMIT_SHA.test(input.implementationCommitSha)) {
    throw new TypeError('CAL-001 smoke implementation commit SHA is invalid');
  }
  if (typeof input.packageVersion !== 'string' || input.packageVersion.length === 0) throw new TypeError('CAL-001 smoke package version is invalid');
  assertSha256(input.configHash, 'configHash');
  assertInputHashes(input.inputHashes);
  if (input.workerCount !== 1) throw new RangeError('CAL-001 smoke requires exactly one worker');
  if (input.ruleCatalog.length === 0) throw new TypeError('CAL-001 smoke rule catalog must not be empty');
  return assertExpectedCohort(input);
}

function assertObservations(
  input: CAL001SmokeInput,
  expected: ReadonlyMap<string, 'verified_ai' | 'verified_human'>,
): void {
  if (input.observations.length !== expected.size) throw new TypeError('CAL-001 smoke observations do not cover the selected cohort');
  const seen = new Set<string>();
  for (const observation of input.observations) {
    const expectedPolarity = expected.get(observation.fileId);
    if (expectedPolarity === undefined || seen.has(observation.fileId)) {
      throw new TypeError('CAL-001 smoke observations contain an unexpected or duplicate file ID');
    }
    if (observation.runId !== input.runId || observation.polarity !== expectedPolarity) {
      throw new TypeError('CAL-001 smoke observation is stale or has the wrong polarity');
    }
    seen.add(observation.fileId);
  }
}

function coverage(observations: readonly V103MetricObservation[]): CAL001Coverage {
  let successful = 0;
  let excluded = 0;
  let parseFailures = 0;
  let timeouts = 0;
  let scannerFailures = 0;
  for (const observation of observations) {
    if (observation.status === 'success_findings' || observation.status === 'success_zero') successful += 1;
    else if (observation.status === 'excluded') excluded += 1;
    else if (observation.status === 'parse_failure') parseFailures += 1;
    else if (observation.status === 'timeout') timeouts += 1;
    else scannerFailures += 1;
  }
  return {
    requested: observations.length,
    successful,
    excluded,
    failed: parseFailures + timeouts + scannerFailures,
    parseFailures,
    timeouts,
    scannerFailures,
  };
}

function metricBundle(input: CAL001SmokeInput): { readonly metricsJson: string; readonly base: V103MetricsResult } {
  const metricsInput = {
    observations: input.observations,
    ruleCatalog: input.ruleCatalog,
    eligibleFileIdsByPolarity: input.eligibleFileIdsByPolarity,
  };
  const base = computeV103Metrics(metricsInput);
  const macro = computeV103MacroMetrics(metricsInput);
  const bootstrap = computeV103RepositoryClusterBootstrap(metricsInput, input.bootstrap ?? CAL001_SMOKE_BOOTSTRAP);
  return {
    metricsJson: canonicalJson({ base, macro, repositoryClusterBootstrap: bootstrap }),
    base,
  };
}

/**
 * Build the path-free CAL-001 diagnostic receipt from already-materialized
 * scanner observations. This reducer never writes, admits, tunes, or changes
 * a rule; callers own the one-worker source execution boundary.
 */
export function buildCAL001SmokeReceipt(input: CAL001SmokeInput): CAL001SmokeResult {
  const expected = assertInput(input);
  assertObservations(input, expected);
  const { metricsJson, base } = metricBundle(input);
  const metricsSha256 = canonicalSha256(JSON.parse(metricsJson) as unknown);
  const sortedObservations = [...input.observations].sort((left, right) => left.fileId.localeCompare(right.fileId));
  const observationsSha256 = canonicalSha256(sortedObservations);
  const checkedCoverage = coverage(input.observations);
  const positive = input.eligibleFileIdsByPolarity.verified_ai.length;
  const negative = input.eligibleFileIdsByPolarity.verified_human.length;
  const metrics = base.status === 'available'
    ? {
      status: 'available' as const,
      metricsSha256,
      ruleCount: base.rules.length,
      measuredRules: base.rules.filter((rule) => rule.status === 'measured').length,
      zeroFireRules: base.rules.filter((rule) => rule.status === 'zero-fire').length,
      ineligibleRules: base.rules.filter((rule) => rule.status === 'ineligible').length,
    }
    : { status: 'unavailable' as const, reason: base.reason, metricsSha256 };
  const receipt: CAL001SmokeReceipt = {
    version: CAL001_SMOKE_RECEIPT_VERSION,
    protocolVersion: CAL001_PROTOCOL_VERSION,
    runId: input.runId,
    implementationCommitSha: input.implementationCommitSha,
    packageVersion: input.packageVersion,
    configHash: input.configHash,
    workerCount: 1,
    inputHashes: input.inputHashes,
    selected: { positive, negative, total: positive + negative },
    coverage: checkedCoverage,
    observationsSha256,
    metrics,
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
    metricsJson,
  };
}
