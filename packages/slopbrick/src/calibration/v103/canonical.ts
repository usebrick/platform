import { createHash } from 'node:crypto';

export type CanonicalJsonValue = null | boolean | number | string | readonly CanonicalJsonValue[] | { readonly [key: string]: CanonicalJsonValue };

function canonicalize(value: unknown): CanonicalJsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON does not permit non-finite numbers');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object') throw new TypeError(`Canonical JSON does not permit ${typeof value}`);
  const record = value as Record<string, unknown>;
  const result: Record<string, CanonicalJsonValue> = {};
  for (const key of Object.keys(record).sort((a, b) => a.localeCompare(b))) {
    const child = record[key];
    if (child === undefined) throw new TypeError(`Canonical JSON does not permit undefined (${key})`);
    result[key] = canonicalize(child);
  }
  return result;
}

/** Deterministic JSON for hashes and JSONL records. Never serializes paths supplied by a host. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function canonicalSha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

interface ManifestFileIdentity {
  repositoryId: string;
  familyId: string;
  normalizedPath: string;
}

interface ManifestRepositoryIdentity {
  repositoryId: string;
  familyId: string;
  commitSha: string;
}

/**
 * Stable file IDs deliberately use repository/family identity, immutable
 * revision, and the manifest-relative path. A local corpus checkout path is
 * neither accepted nor represented here.
 */
export function stableCalibrationFileId(
  file: ManifestFileIdentity,
  repositories: readonly ManifestRepositoryIdentity[],
): string {
  const repository = repositories.find((candidate) => candidate.repositoryId === file.repositoryId);
  if (!repository || repository.familyId !== file.familyId) {
    throw new Error(`No matching immutable repository for ${file.repositoryId}`);
  }
  return `sbf_${canonicalSha256({
    familyId: file.familyId,
    repositoryId: file.repositoryId,
    commitSha: repository.commitSha,
    normalizedPath: file.normalizedPath,
  })}`;
}

/** The manifest hash is order-independent while preserving every record value. */
export function canonicalCorpusManifestSha256(manifest: {
  repositories: readonly { repositoryId: string }[];
  files: readonly { sourceId: string }[];
}): string {
  return canonicalSha256({
    ...manifest,
    repositories: [...manifest.repositories].sort((a, b) => a.repositoryId.localeCompare(b.repositoryId)),
    files: [...manifest.files].sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
  });
}
