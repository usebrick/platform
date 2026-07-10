import { createHash } from 'node:crypto';
import type { SlopBrickV103CalibrationCheckoutMapLocalOnly } from './generated/calibration-checkout-map';
import type { SlopBrickV103CalibrationRunManifest } from './generated/calibration-run-manifest';

const ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SHA = /^[a-f0-9]{40,64}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const ABSOLUTE_PATH = /^(?:\/|[A-Za-z]:[\\/])/;
const EMBEDDED_ABSOLUTE_PATH = /(?:^|[=\s'"[{(:,])(?:\/|[A-Za-z]:[\\/])|[A-Za-z][A-Za-z0-9+.-]*:\/{1,}/;
// Canonical run artifacts may carry only tokenized command arguments. This
// excludes shell/JSON payloads, URI forms, backslashes, and absolute paths.
const SAFE_COMMAND_ARGUMENT = /^(?:--[a-z][a-z0-9-]*(?:=[A-Za-z0-9._:@+-]+(?:\/[A-Za-z0-9._:@+-]+)*)?|[A-Za-z0-9._:@+-]+(?:\/[A-Za-z0-9._:@+-]+)*)$/;

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function ownKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { return Object.keys(value).every((key) => keys.includes(key)); }
function nonEmpty(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function stringList(value: unknown, required = false): value is string[] { return Array.isArray(value) && (!required || value.length > 0) && value.every(nonEmpty) && new Set(value).size === value.length; }
function integer(value: unknown, minimum: number): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum; }

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new TypeError('non-finite canonical value'); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!isRecord(value)) throw new TypeError('non-JSON canonical value');
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

function containsAbsolutePath(value: unknown): boolean {
  if (typeof value === 'string') return ABSOLUTE_PATH.test(value) || EMBEDDED_ABSOLUTE_PATH.test(value);
  if (Array.isArray(value)) return value.some(containsAbsolutePath);
  return isRecord(value) && Object.values(value).some(containsAbsolutePath);
}

function safeCommandArgument(value: string): boolean {
  return SAFE_COMMAND_ARGUMENT.test(value) && !/(?:^|=)[A-Za-z][A-Za-z0-9+.-]*:\//.test(value);
}

export function calibrationCheckoutMapSha256(value: unknown): string {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

/** Local-only path map. Its paths must never be copied into a run manifest. */
export function isCalibrationCheckoutMapV103(value: unknown): value is SlopBrickV103CalibrationCheckoutMapLocalOnly {
  if (!isRecord(value) || !ownKeys(value, ['version', 'runId', 'entries']) || value.version !== 'v10.3' || !ID.test(value.runId as string) || !Array.isArray(value.entries) || value.entries.length === 0) return false;
  const identities = new Set<string>();
  return value.entries.every((entry) => {
    if (!isRecord(entry) || !ownKeys(entry, ['repositoryId', 'commitSha', 'checkoutPath']) || !ID.test(entry.repositoryId as string) || !SHA.test(entry.commitSha as string) || !nonEmpty(entry.checkoutPath) || !ABSOLUTE_PATH.test(entry.checkoutPath)) return false;
    const identity = `${entry.repositoryId}\u0000${entry.commitSha}`;
    if (identities.has(identity)) return false;
    identities.add(identity);
    return true;
  });
}

function validPolarityIds(value: unknown): boolean {
  return isRecord(value) && ownKeys(value, ['verified_ai', 'verified_human']) && stringList(value.verified_ai, true) && stringList(value.verified_human, true);
}

function disjointPolarityIds(value: unknown): boolean {
  if (!validPolarityIds(value)) return false;
  const ids = value as { verified_ai: string[]; verified_human: string[] };
  const ai = new Set(ids.verified_ai);
  return ids.verified_human.every((id) => !ai.has(id));
}

/**
 * Validate the portable, canonical run record only. It intentionally cannot
 * inspect checkout paths; callers must hash and validate the separate local
 * checkout map before execution.
 */
export function isCalibrationRunManifestV103(value: unknown): value is SlopBrickV103CalibrationRunManifest {
  if (!isRecord(value) || containsAbsolutePath(value) || !ownKeys(value, ['version', 'runId', 'createdAt', 'git', 'package', 'runtime', 'schemaVersion', 'methodVersion', 'inputHashes', 'selection', 'expected', 'settings', 'commandArgs']) ||
    value.version !== 'v10.3' || value.schemaVersion !== 'v10.3' || !ID.test(value.runId as string) || !nonEmpty(value.createdAt) || !ISO.test(value.createdAt) || Number.isNaN(Date.parse(value.createdAt)) || !/^v10\.3\.\d+$/.test(value.methodVersion as string) || !stringList(value.commandArgs, true) || !value.commandArgs.every(safeCommandArgument)) return false;
  if (!isRecord(value.git) || !ownKeys(value.git, ['sha', 'dirty']) || !SHA.test(value.git.sha as string) || typeof value.git.dirty !== 'boolean') return false;
  if (!isRecord(value.package) || !ownKeys(value.package, ['name', 'version']) || value.package.name !== 'slopbrick' || !nonEmpty(value.package.version)) return false;
  if (!isRecord(value.runtime) || !ownKeys(value.runtime, ['node', 'pnpm', 'platform', 'arch']) || !nonEmpty(value.runtime.node) || !nonEmpty(value.runtime.pnpm) || !nonEmpty(value.runtime.platform) || !nonEmpty(value.runtime.arch)) return false;
  if (!isRecord(value.inputHashes) || !ownKeys(value.inputHashes, ['registrySha256', 'signalTableSha256', 'configSha256', 'corpusManifestSha256', 'selectionSha256', 'checkoutMapSha256']) || !Object.values(value.inputHashes).every((hash) => typeof hash === 'string' && SHA256.test(hash))) return false;
  if (!isRecord(value.selection) || !ownKeys(value.selection, ['seed', 'policy']) || !nonEmpty(value.selection.seed) || !isRecord(value.selection.policy) || !ownKeys(value.selection.policy, ['eligibleLabels', 'eligibleTiers', 'eligibleStrata', 'maxPerStratum']) || !stringList(value.selection.policy.eligibleLabels, true) || !value.selection.policy.eligibleLabels.every((label) => label === 'verified_ai' || label === 'verified_human') || !stringList(value.selection.policy.eligibleTiers, true) || !value.selection.policy.eligibleTiers.every((tier) => tier === 'gold' || tier === 'silver') || !stringList(value.selection.policy.eligibleStrata, true) || !integer(value.selection.policy.maxPerStratum, 1)) return false;
  if (!isRecord(value.expected) || !ownKeys(value.expected, ['fileIdsByPolarity', 'chunkIdsByPolarity']) || !disjointPolarityIds(value.expected.fileIdsByPolarity) || !disjointPolarityIds(value.expected.chunkIdsByPolarity)) return false;
  if (!isRecord(value.settings) || !ownKeys(value.settings, ['includeRuleIds', 'excludeRuleIds', 'maxFileBytes', 'chunkSize', 'chunkTimeoutMs', 'retryTimeoutMs', 'workerCount'])) return false;
  const settings = value.settings;
  const includeRuleIds = settings.includeRuleIds;
  const excludeRuleIds = settings.excludeRuleIds;
  if (!stringList(includeRuleIds) || !stringList(excludeRuleIds) || includeRuleIds.some((id) => excludeRuleIds.includes(id)) || !integer(settings.maxFileBytes, 0) || !integer(settings.chunkSize, 1) || !integer(settings.chunkTimeoutMs, 1) || !integer(settings.retryTimeoutMs, 1) || !integer(settings.workerCount, 1)) return false;
  return true;
}
