/**
 * Read-only preflight for an explicit admission artifact set.
 *
 * The caller must provide the complete, explicit artifact set.  This boundary
 * never discovers files, derives source paths from a proposal, repairs
 * symlinks, or writes a transaction.  It only proves that the named files are
 * present under `review/admission` and, when supplied, match their byte
 * commitments.  Graph/schema validation and publication remain separate
 * gates.
 */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

import { requireAdmissionPathSecurity, sameAdmissionFileIdentity } from './admission-path-security';

const ADMISSION_RELATIVE_ROOT = 'review/admission';
const SHA256 = /^[a-f0-9]{64}$/u;
const KIND = /^[a-z][a-z0-9._:-]{0,127}$/u;

/** One caller-selected file required by a future publication boundary. */
export interface AdmissionArtifactPreflightItem {
  /** Project-root-relative path; it must begin with `review/admission/`. */
  readonly relativePath: string;
  /** Stable diagnostic label, not a filesystem-discovery hint. */
  readonly kind: string;
  /** Optional exact byte commitment supplied by the caller. */
  readonly sha256?: string;
  /** Optional exact byte length supplied by the caller. */
  readonly bytes?: number;
}

export interface AdmissionArtifactPreflightRequest {
  readonly projectRoot: string;
  /** The complete explicit artifact set. No paths are inferred or expanded. */
  readonly artifacts: readonly AdmissionArtifactPreflightItem[];
}

export type AdmissionArtifactPreflightErrorCode =
  | 'request_invalid'
  | 'root_unavailable'
  | 'missing_input'
  | 'invalid_input';

export interface AdmissionArtifactPreflightError {
  readonly code: AdmissionArtifactPreflightErrorCode;
  readonly kind?: string;
  readonly relativePath?: string;
  readonly message: string;
}

export interface AdmissionArtifactPreflightItemResult {
  readonly kind: string;
  readonly relativePath: string;
  readonly status: 'present' | 'missing' | 'invalid';
  readonly sha256?: string;
  readonly bytes?: number;
  readonly message?: string;
}

export interface AdmissionArtifactPreflightResult {
  readonly ok: boolean;
  readonly status: 'ready' | 'blocked';
  readonly checked: number;
  readonly artifacts: readonly AdmissionArtifactPreflightItemResult[];
  readonly errors: readonly AdmissionArtifactPreflightError[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === 'string' ? error.code : undefined;
}

function isMissing(error: unknown): boolean {
  const code = errorCode(error);
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function safeProjectRoot(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.includes('\u0000') && !value.includes('\\');
}

function safeArtifactPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('/')
    || value.includes('\\') || value.includes('\u0000')) return false;
  const parts = value.split('/');
  return parts.every((part) => part.length > 0 && part !== '.' && part !== '..');
}

function containedPath(root: string, relativePath: string): string {
  if (!safeArtifactPath(relativePath)) throw new Error('artifact path is unsafe');
  const candidate = resolve(root, relativePath);
  const admissionRoot = resolve(root, ADMISSION_RELATIVE_ROOT);
  const child = relative(admissionRoot, candidate);
  if (child === '' || child === '..' || child.startsWith(`..${sep}`) || child.startsWith('/') || child.includes('\\')) {
    throw new Error('artifact path must be contained under review/admission');
  }
  return candidate;
}

async function assertNoSymlinkPath(root: string, candidate: string): Promise<void> {
  const child = relative(root, candidate);
  if (child === '' || child === '..' || child.startsWith(`..${sep}`) || child.startsWith('/') || child.includes('\\')) {
    throw new Error('artifact path escapes project root');
  }
  let current = root;
  const parts = child.split(sep).filter(Boolean);
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    let metadata;
    try {
      metadata = await lstat(current);
    } catch (error) {
      if (isMissing(error)) throw error;
      throw new Error(`artifact path cannot be inspected: ${messageOf(error)}`);
    }
    if (metadata.isSymbolicLink()) throw new Error('artifact path contains a symlink');
    if (index < parts.length - 1 && !metadata.isDirectory()) {
      throw new Error('artifact path has a non-directory parent');
    }
  }
}

async function readExactFile(root: string, candidate: string): Promise<Buffer> {
  await assertNoSymlinkPath(root, candidate);
  const pathBeforeOpen = await lstat(candidate, { bigint: true });
  if (!pathBeforeOpen.isFile()) throw new Error('artifact is not a regular file');
  const canonicalCandidate = await realpath(candidate);
  if (!containedPath(root, relative(root, canonicalCandidate)) || canonicalCandidate !== candidate) {
    throw new Error('artifact path changed during preflight');
  }
  const handle = await open(canonicalCandidate, constants.O_RDONLY | requireAdmissionPathSecurity());
  try {
    const metadata = await handle.stat({ bigint: true });
    if (!metadata.isFile() || !sameAdmissionFileIdentity(pathBeforeOpen, metadata)) {
      throw new Error('artifact path changed before read');
    }
    const bytes = await handle.readFile();
    // The initial component walk and O_NOFOLLOW protect the normal path. A
    // final realpath check also rejects an ancestor swap observed during the
    // read instead of silently accepting a different target.
    const pathAfterRead = await lstat(candidate, { bigint: true });
    if (!sameAdmissionFileIdentity(pathBeforeOpen, pathAfterRead) || await realpath(candidate) !== canonicalCandidate) {
      throw new Error('artifact path changed during read');
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

function result(
  artifacts: readonly AdmissionArtifactPreflightItemResult[],
  errors: readonly AdmissionArtifactPreflightError[],
): AdmissionArtifactPreflightResult {
  const uniqueErrors = errors.filter((error, index) => errors.findIndex((candidate) => (
    candidate.code === error.code
      && candidate.relativePath === error.relativePath
      && candidate.message === error.message
  )) === index);
  return {
    ok: uniqueErrors.length === 0,
    status: uniqueErrors.length === 0 ? 'ready' : 'blocked',
    checked: artifacts.length,
    artifacts: [...artifacts],
    errors: uniqueErrors,
  };
}

function validateRequest(
  request: AdmissionArtifactPreflightRequest,
): readonly AdmissionArtifactPreflightError[] {
  const errors: AdmissionArtifactPreflightError[] = [];
  if (!isRecord(request)) {
    return [{ code: 'request_invalid', message: 'artifact preflight request must be an object' }];
  }
  const keys = Object.keys(request).sort();
  if (keys.join('\u0000') !== 'artifacts\u0000projectRoot') {
    errors.push({ code: 'request_invalid', message: 'artifact preflight request has unexpected keys' });
  }
  if (!safeProjectRoot(request.projectRoot)) {
    errors.push({ code: 'request_invalid', message: 'artifact preflight projectRoot is invalid' });
  }
  if (!Array.isArray(request.artifacts) || request.artifacts.length === 0) {
    errors.push({ code: 'request_invalid', message: 'artifact preflight requires a non-empty explicit artifact set' });
    return errors;
  }
  const seen = new Set<string>();
  for (const artifact of request.artifacts) {
    if (!isRecord(artifact)) {
      errors.push({ code: 'request_invalid', message: 'artifact preflight item is not an object' });
      continue;
    }
    const artifactKeys = Object.keys(artifact).sort();
    const allowed = ['bytes', 'kind', 'relativePath', 'sha256'];
    if (artifactKeys.some((key) => !allowed.includes(key))) {
      errors.push({ code: 'request_invalid', message: 'artifact preflight item has unexpected keys' });
      continue;
    }
    if (!safeArtifactPath(artifact.relativePath)
      || !artifact.relativePath.startsWith(`${ADMISSION_RELATIVE_ROOT}/`)) {
      errors.push({ code: 'request_invalid', relativePath: typeof artifact.relativePath === 'string' ? artifact.relativePath : undefined, message: 'artifact preflight path must be project-root-relative under review/admission' });
    }
    if (typeof artifact.kind !== 'string' || !KIND.test(artifact.kind)) {
      errors.push({ code: 'request_invalid', kind: typeof artifact.kind === 'string' ? artifact.kind : undefined, message: 'artifact preflight kind is invalid' });
    }
    if (artifact.sha256 !== undefined && (typeof artifact.sha256 !== 'string' || !SHA256.test(artifact.sha256))) {
      errors.push({ code: 'request_invalid', relativePath: typeof artifact.relativePath === 'string' ? artifact.relativePath : undefined, message: 'artifact preflight sha256 is invalid' });
    }
    if (artifact.bytes !== undefined && (typeof artifact.bytes !== 'number' || !Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0)) {
      errors.push({ code: 'request_invalid', relativePath: typeof artifact.relativePath === 'string' ? artifact.relativePath : undefined, message: 'artifact preflight byte length is invalid' });
    }
    if (typeof artifact.relativePath === 'string') {
      if (seen.has(artifact.relativePath)) errors.push({ code: 'request_invalid', relativePath: artifact.relativePath, message: 'artifact preflight paths must be unique' });
      seen.add(artifact.relativePath);
    }
  }
  return errors;
}

/**
 * Check an explicit artifact set without discovering or mutating a project. A
 * successful result means only that the named bytes are present and match
 * their optional commitments; it is not a graph or policy pass.
 */
export async function preflightAdmissionArtifacts(
  request: AdmissionArtifactPreflightRequest,
): Promise<AdmissionArtifactPreflightResult> {
  const requestErrors = validateRequest(request);
  if (requestErrors.length > 0) return result([], requestErrors);

  const artifacts: AdmissionArtifactPreflightItemResult[] = [];
  const errors: AdmissionArtifactPreflightError[] = [];
  const projectRoot = resolve(request.projectRoot);
  let canonicalRoot: string;
  try {
    const rootMetadata = await lstat(projectRoot);
    if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) throw new Error('projectRoot must be a real directory');
    canonicalRoot = await realpath(projectRoot);
    const admissionRoot = join(canonicalRoot, ADMISSION_RELATIVE_ROOT);
    await assertNoSymlinkPath(canonicalRoot, admissionRoot);
    const admissionMetadata = await lstat(admissionRoot);
    if (!admissionMetadata.isDirectory()) throw new Error('review/admission must be a directory');
  } catch (error) {
    errors.push({ code: isMissing(error) ? 'root_unavailable' : 'invalid_input', message: `artifact preflight root is unavailable: ${messageOf(error)}` });
    return result([], errors);
  }

  for (const artifact of request.artifacts) {
    const relativePath = artifact.relativePath;
    const base = { kind: artifact.kind, relativePath };
    let candidate: string;
    try {
      candidate = containedPath(canonicalRoot, relativePath);
      const bytes = await readExactFile(canonicalRoot, candidate);
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (artifact.bytes !== undefined && bytes.byteLength !== artifact.bytes) {
        const message = `artifact preflight byte length differs (expected ${artifact.bytes}, got ${bytes.byteLength})`;
        artifacts.push({ ...base, status: 'invalid', sha256: digest, bytes: bytes.byteLength, message });
        errors.push({ code: 'invalid_input', ...base, message });
        continue;
      }
      if (artifact.sha256 !== undefined && digest !== artifact.sha256) {
        const message = 'artifact preflight sha256 differs from the supplied commitment';
        artifacts.push({ ...base, status: 'invalid', sha256: digest, bytes: bytes.byteLength, message });
        errors.push({ code: 'invalid_input', ...base, message });
        continue;
      }
      artifacts.push({ ...base, status: 'present', sha256: digest, bytes: bytes.byteLength });
    } catch (error) {
      const missing = isMissing(error);
      const message = `artifact preflight ${missing ? 'required input is missing' : 'input is invalid'}: ${messageOf(error)}`;
      artifacts.push({ ...base, status: missing ? 'missing' : 'invalid', message });
      errors.push({ code: missing ? 'missing_input' : 'invalid_input', ...base, message });
    }
  }
  return result(artifacts, errors);
}
