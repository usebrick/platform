/**
 * Pure runtime validation for the v10.3 calibration corpus manifest.
 *
 * The JSON Schema remains the cross-language authority. This validator is a
 * dependency-free guard for TypeScript callers and additionally enforces
 * manifest-wide invariants JSON Schema cannot express: unique identities,
 * repository/file family agreement, and no verified-human/verified-AI family,
 * cluster, split, or pair-group leakage.
 */

import type { SlopbrickCalibrationCorpusManifestV103 } from './generated/calibration-corpus-manifest';

type ManifestLabel = 'verified_ai' | 'verified_human' | 'mixed' | 'quarantine';
type ManifestSplit = 'train' | 'validation' | 'test' | 'mixed_evaluation' | 'excluded';

const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const COMMIT_SHA = /^[a-f0-9]{40,64}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const METHOD_VERSION = /^v10\.3\.\d+$/;
const NORMALIZED_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._@+%=-]+(?:\/[A-Za-z0-9._@+%=-]+)*$/;
const LABELS = new Set<ManifestLabel>(['verified_ai', 'verified_human', 'mixed', 'quarantine']);
const TIERS = new Set(['gold', 'silver', 'quarantine']);
const SPLITS = new Set<ManifestSplit>(['train', 'validation', 'test', 'mixed_evaluation', 'excluded']);
const STRATA = new Set(['production', 'test', 'generated', 'vendor', 'minified', 'example', 'other']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isIsoDateTime(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || Number.isNaN(Date.parse(value))) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth;
}

function isHttpsUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isEvidence(value: unknown): boolean {
  if (!isRecord(value) || !isHttpsUrl(value.reference)) return false;
  if (value.kind === 'generator_record') {
    return hasOnlyKeys(value, ['kind', 'reference', 'model', 'promptTaskId', 'generatedAt', 'humanEditStatus']) &&
      isNonEmptyString(value.model) && isNonEmptyString(value.promptTaskId) && isIsoDateTime(value.generatedAt) &&
      ['none', 'light', 'substantial', 'unknown'].includes(value.humanEditStatus as string);
  }
  if (value.kind === 'benchmark') {
    return hasOnlyKeys(value, ['kind', 'reference', 'benchmarkId', 'benchmarkVersion']) &&
      isNonEmptyString(value.benchmarkId) && isNonEmptyString(value.benchmarkVersion);
  }
  return value.kind === 'manual_protocol' && hasOnlyKeys(value, ['kind', 'reference', 'protocolId']) && isNonEmptyString(value.protocolId);
}

function addGroupValue(groups: Map<string, Set<string>>, group: string, value: string): boolean {
  const entries = groups.get(group) ?? new Set<string>();
  entries.add(value);
  groups.set(group, entries);
  return entries.size <= 1;
}

/**
 * Canonical v10.3 file identity. It contains no local path: the repository
 * identifier, immutable Git object ID, and normalized repository-relative
 * path are the complete source identity.
 */
export function calibrationCorpusSourceId(repositoryId: string, commitSha: string, normalizedPath: string): string {
  return `${repositoryId}@${commitSha}:${normalizedPath}`;
}

/**
 * Versioned semantic verifier required after JSON Schema validation. Returns
 * `true` only for a complete v10.3 manifest with canonical source IDs,
 * immutable source revisions, correctly eligible gold/silver/mixed records,
 * and no declared human/AI family, content-cluster, split, or pair-group leak. This
 * function performs no I/O and does not establish that evidence URLs or
 * source revisions have been externally reviewed.
 */
export function isCalibrationCorpusManifestV103(value: unknown): value is SlopbrickCalibrationCorpusManifestV103 {
  if (!isRecord(value) || !hasOnlyKeys(value, ['version', 'generatedAt', 'methodVersion', 'leakageReview', 'repositories', 'files']) ||
    value.version !== 'v10.3' || !isIsoDateTime(value.generatedAt) || !METHOD_VERSION.test(value.methodVersion as string)) {
    return false;
  }
  if (!isRecord(value.leakageReview) || !hasOnlyKeys(value.leakageReview, ['protocolVersion', 'reviewedAt', 'reviewerIds', 'noCrossPolarityFamilyOrCluster']) ||
    !isNonEmptyString(value.leakageReview.protocolVersion) ||
    !isIsoDateTime(value.leakageReview.reviewedAt) || !isStringArray(value.leakageReview.reviewerIds) ||
    value.leakageReview.reviewerIds.length === 0 || new Set(value.leakageReview.reviewerIds).size !== value.leakageReview.reviewerIds.length ||
    value.leakageReview.noCrossPolarityFamilyOrCluster !== true) {
    return false;
  }
  if (!Array.isArray(value.repositories) || value.repositories.length === 0 || !Array.isArray(value.files) || value.files.length === 0) {
    return false;
  }

  const repositories = new Map<string, { familyId: string; commitSha: string }>();
  for (const repository of value.repositories) {
    if (!isRecord(repository) || !hasOnlyKeys(repository, ['repositoryId', 'familyId', 'originUrl', 'commitSha', 'acquiredAt', 'license']) ||
      !IDENTIFIER.test(repository.repositoryId as string) || !IDENTIFIER.test(repository.familyId as string) ||
      !isHttpsUrl(repository.originUrl) || !COMMIT_SHA.test(repository.commitSha as string) ||
      !isIsoDateTime(repository.acquiredAt) || !isNonEmptyString(repository.license) || repositories.has(repository.repositoryId as string)) {
      return false;
    }
    repositories.set(repository.repositoryId as string, {
      familyId: repository.familyId as string,
      commitSha: repository.commitSha as string,
    });
  }

  const sourceIds = new Set<string>();
  const familyLabels = new Map<string, Set<string>>();
  const clusterLabels = new Map<string, Set<string>>();
  const familySplits = new Map<string, Set<string>>();
  const clusterSplits = new Map<string, Set<string>>();
  const pairGroupSplits = new Map<string, Set<string>>();
  for (const file of value.files) {
    if (!isRecord(file) || !hasOnlyKeys(file, ['sourceId', 'repositoryId', 'familyId', 'normalizedPath', 'contentSha256', 'language', 'stratum', 'clusterId', 'pairGroupId', 'label', 'tier', 'split', 'exclusionReason', 'evidence']) ||
      !isNonEmptyString(file.sourceId) || sourceIds.has(file.sourceId) ||
      !IDENTIFIER.test(file.repositoryId as string) || !IDENTIFIER.test(file.familyId as string) ||
      repositories.get(file.repositoryId as string)?.familyId !== file.familyId || !NORMALIZED_PATH.test(file.normalizedPath as string) ||
      !SHA256.test(file.contentSha256 as string) || !isNonEmptyString(file.language) || !STRATA.has(file.stratum as string) ||
      !IDENTIFIER.test(file.clusterId as string) || (file.pairGroupId !== undefined && !IDENTIFIER.test(file.pairGroupId as string)) ||
      !LABELS.has(file.label as ManifestLabel) || !TIERS.has(file.tier as string) ||
      !SPLITS.has(file.split as ManifestSplit) || !isEvidence(file.evidence)) {
      return false;
    }
    const repository = repositories.get(file.repositoryId as string);
    if (!repository || file.sourceId !== calibrationCorpusSourceId(file.repositoryId as string, repository.commitSha, file.normalizedPath as string)) return false;
    if ((file.split === 'excluded') !== isNonEmptyString(file.exclusionReason)) return false;
    if (file.tier === 'silver' && file.split !== 'train' && file.split !== 'excluded') return false;
    if (file.label === 'mixed' && (file.tier !== 'gold' || file.split !== 'mixed_evaluation')) return false;
    if ((file.label === 'verified_ai' || file.label === 'verified_human') && file.split === 'mixed_evaluation') return false;
    if ((file.label === 'quarantine' || file.tier === 'quarantine') && (file.label !== 'quarantine' || file.tier !== 'quarantine' || file.split !== 'excluded')) return false;
    sourceIds.add(file.sourceId);

    if (file.split === 'excluded') continue;
    const binaryLabel = file.label === 'verified_ai' || file.label === 'verified_human' ? file.label : '';
    if (binaryLabel && (!addGroupValue(familyLabels, file.familyId as string, binaryLabel) ||
      !addGroupValue(clusterLabels, file.clusterId as string, binaryLabel))) return false;
    if (!addGroupValue(familySplits, file.familyId as string, file.split as string) ||
      !addGroupValue(clusterSplits, file.clusterId as string, file.split as string) ||
      (file.pairGroupId !== undefined && !addGroupValue(pairGroupSplits, file.pairGroupId as string, file.split as string))) return false;
  }
  return true;
}
