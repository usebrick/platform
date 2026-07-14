import { createHash } from 'node:crypto';

/**
 * The v10.3 scan artifacts are useful inputs, but they are not themselves a
 * calibration result.  Until a provenance-approved eligible cohort and the
 * denominator-aware metrics producer exist, derived artifacts must say that
 * metrics are unavailable rather than serializing placeholder zeros.
 */
export const V103_REPORT_ARTIFACT_VERSION = 'v10.3-report-v1' as const;

export const V103_DERIVED_ARTIFACT_NAMES = [
  'rule-metrics.json',
  'language-metrics.json',
  'report.md',
  'logs/report.jsonl',
] as const;

export type V103DerivedArtifactName = (typeof V103_DERIVED_ARTIFACT_NAMES)[number];

export type V103UnavailableReason =
  | 'eligible-cohort-unavailable'
  | 'coverage-gate-not-promotable';

type Sha256 = string;

export interface V103DerivedInputHashes {
  readonly observationsSha256: Sha256;
  readonly failuresSha256: Sha256;
  readonly coverageSha256: Sha256;
}

export interface V103UnavailableArtifact {
  readonly version: typeof V103_REPORT_ARTIFACT_VERSION;
  readonly artifact: V103DerivedArtifactName;
  readonly status: 'unavailable';
  readonly reason: V103UnavailableReason;
  readonly runId: string;
  readonly runManifestSha256: Sha256;
  readonly inputArtifacts: V103DerivedInputHashes;
}

export interface V103UnavailableArtifactBundle {
  readonly ruleMetrics: V103UnavailableArtifact;
  readonly languageMetrics: V103UnavailableArtifact;
  readonly reportMarkdown: string;
  readonly reportLog: V103UnavailableArtifact;
}

const SHA256 = /^[a-f0-9]{64}$/;
const RUN_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const REASONS = new Set<V103UnavailableReason>([
  'eligible-cohort-unavailable',
  'coverage-gate-not-promotable',
]);
const JSON_ARTIFACTS = new Set<V103DerivedArtifactName>([
  'rule-metrics.json',
  'language-metrics.json',
  'logs/report.jsonl',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = new Set(keys);
  return Object.keys(value).every((key) => expected.has(key)) && keys.every((key) => key in value);
}

function isInputHashes(value: unknown): value is V103DerivedInputHashes {
  if (!isRecord(value) || !hasOnlyKeys(value, ['observationsSha256', 'failuresSha256', 'coverageSha256'])) return false;
  return SHA256.test(value.observationsSha256 as string)
    && SHA256.test(value.failuresSha256 as string)
    && SHA256.test(value.coverageSha256 as string);
}

/** Strict validator for the JSON line/envelope emitted by this module. */
export function isV103UnavailableArtifact(value: unknown): value is V103UnavailableArtifact {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'version',
    'artifact',
    'status',
    'reason',
    'runId',
    'runManifestSha256',
    'inputArtifacts',
  ])) return false;
  return value.version === V103_REPORT_ARTIFACT_VERSION
    && typeof value.artifact === 'string'
    && JSON_ARTIFACTS.has(value.artifact as V103DerivedArtifactName)
    && value.status === 'unavailable'
    && typeof value.reason === 'string'
    && REASONS.has(value.reason as V103UnavailableReason)
    && typeof value.runId === 'string'
    && RUN_ID.test(value.runId)
    && typeof value.runManifestSha256 === 'string'
    && SHA256.test(value.runManifestSha256)
    && isInputHashes(value.inputArtifacts);
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function unavailableArtifact(
  artifact: V103DerivedArtifactName,
  input: {
    readonly runId: string;
    readonly runManifestSha256: Sha256;
    readonly inputArtifacts: V103DerivedInputHashes;
    readonly reason: V103UnavailableReason;
  },
): V103UnavailableArtifact {
  const value: V103UnavailableArtifact = {
    version: V103_REPORT_ARTIFACT_VERSION,
    artifact,
    status: 'unavailable',
    reason: input.reason,
    runId: input.runId,
    runManifestSha256: input.runManifestSha256,
    inputArtifacts: input.inputArtifacts,
  };
  if (!isV103UnavailableArtifact(value)) throw new Error('Internal unavailable-artifact contract error');
  return value;
}

/**
 * Build the four planned derived artifacts without inventing any metric.
 * Hashes bind the unavailable receipt to the verified upstream scan bytes and
 * are the only numeric-looking values emitted by this status artifact.
 */
export function buildV103UnavailableArtifactBundle(input: {
  readonly runId: string;
  readonly runManifestSha256: Sha256;
  readonly inputArtifacts: V103DerivedInputHashes;
  readonly reason: V103UnavailableReason;
}): V103UnavailableArtifactBundle {
  if (!RUN_ID.test(input.runId) || !SHA256.test(input.runManifestSha256)
    || !isInputHashes(input.inputArtifacts) || !REASONS.has(input.reason)) {
    throw new Error('Invalid unavailable-artifact inputs');
  }
  const ruleMetrics = unavailableArtifact('rule-metrics.json', input);
  const languageMetrics = unavailableArtifact('language-metrics.json', input);
  const reportLog = unavailableArtifact('logs/report.jsonl', input);
  const reportMarkdown = [
    '# v10.3 Calibration Report',
    '',
    'Status: `unavailable`',
    `Reason: \`${input.reason}\``,
    '',
    'Rule and language metrics were not produced. No calibration verdict,',
    'precision/recall estimate, or corpus eligibility claim is available.',
    'The upstream scan artifacts were verified before this status report was',
    'written; rerun the provenance and coverage gates before promoting any',
    'derived metrics.',
    '',
    `Run: \`${input.runId}\``,
    `Run manifest SHA-256: \`${input.runManifestSha256}\``,
    '',
    'The machine-readable receipts in `rule-metrics.json` and',
    '`language-metrics.json` bind the unavailable status to the upstream',
    'observations, failures, and coverage artifact hashes.',
    '',
  ].join('\n');
  const bundle = { ruleMetrics, languageMetrics, reportMarkdown, reportLog };
  if (!isV103UnavailableArtifact(bundle.ruleMetrics)
    || !isV103UnavailableArtifact(bundle.languageMetrics)
    || !isV103UnavailableArtifact(bundle.reportLog)) {
    throw new Error('Internal unavailable-artifact bundle error');
  }
  return bundle;
}

/**
 * Derive byte hashes for the verified, path-free upstream artifacts. The
 * caller must run the semantic scan verifier before calling this function.
 */
export function hashV103UpstreamArtifacts(input: {
  readonly observations: Uint8Array;
  readonly failures: Uint8Array;
  readonly coverage: Uint8Array;
}): V103DerivedInputHashes {
  return {
    observationsSha256: sha256Bytes(input.observations),
    failuresSha256: sha256Bytes(input.failures),
    coverageSha256: sha256Bytes(input.coverage),
  };
}

/** Render the JSONL log as exactly one deterministic, path-free event. */
export function renderV103ReportLog(value: V103UnavailableArtifact): string {
  if (!isV103UnavailableArtifact(value) || value.artifact !== 'logs/report.jsonl') {
    throw new Error('Invalid report log artifact');
  }
  return `${JSON.stringify(value)}\n`;
}
