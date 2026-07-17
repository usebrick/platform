/**
 * Read-only reopening of one immutable witness publication.
 *
 * The routing projection is a selector, never authority by itself.  This
 * boundary validates the projection, follows only its hash-derived bundle and
 * completion paths, rehashes their canonical bytes, and brands the exact
 * reopened graph for the ready-census verifier.
 */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionWitnessPublicationCompletionSha256,
  calibrationAdmissionWitnessRoutingReferenceSha256,
  isCalibrationAdmissionSearchResultBundleV1,
  isCalibrationAdmissionWitnessPublicationCompletionV1,
  isCalibrationAdmissionWitnessReviewBundleV1,
  isCalibrationAdmissionWitnessRoutingReferenceV1,
  type CalibrationAdmissionSearchResultBundleV1,
  type CalibrationAdmissionWitnessPublicationCompletionV1,
  type CalibrationAdmissionWitnessReviewBundleV1,
  type CalibrationAdmissionWitnessRoutingReferenceV1,
} from '@usebrick/core';

const SHA256 = /^[a-f0-9]{64}$/u;
const RELATIVE_PATH = /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\/\/)[^\u0000-\u001f]+$/u;
const MAX_WITNESS_PUBLICATION_BYTES = 64 * 1024 * 1024;

export type AdmissionWitnessPublicationGateV1 = 'smoke' | 'canary';
export type AdmissionWitnessPublicationKindV1 = 'search_result' | 'witness_review';

export interface OpenAdmissionWitnessPublicationInputV1 {
  readonly root: string;
  readonly gate: AdmissionWitnessPublicationGateV1;
  readonly kind: AdmissionWitnessPublicationKindV1;
  readonly reference: unknown;
}

export type VerifiedAdmissionWitnessPublicationV1 = Readonly<{
  readonly gate: AdmissionWitnessPublicationGateV1;
  readonly kind: AdmissionWitnessPublicationKindV1;
  readonly reference: CalibrationAdmissionWitnessRoutingReferenceV1;
  readonly bundle: CalibrationAdmissionSearchResultBundleV1 | CalibrationAdmissionWitnessReviewBundleV1;
  readonly completion: CalibrationAdmissionWitnessPublicationCompletionV1;
  readonly [verifiedWitnessPublicationBrand]: true;
}>;

declare const verifiedWitnessPublicationBrand: unique symbol;
const verifiedWitnessPublications = new WeakSet<object>();

export class AdmissionWitnessReopenError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AdmissionWitnessReopenError';
  }
}

function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonical(value: unknown): Buffer {
  return Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8');
}

function isSha(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

function isRelativePath(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096 && RELATIVE_PATH.test(value);
}

function inside(root: string, candidate: string): boolean {
  const child = relative(root, candidate);
  return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !child.startsWith('/') && !child.includes('\\'));
}

async function noSymlinkPath(root: string, candidate: string): Promise<void> {
  const rootResolved = resolve(root);
  const candidateResolved = resolve(candidate);
  if (!inside(rootResolved, candidateResolved)) throw new AdmissionWitnessReopenError('witness publication path escapes root');
  const segments = relative(rootResolved, candidateResolved).split(sep).filter(Boolean);
  let current = rootResolved;
  for (const [index, segment] of segments.entries()) {
    current = `${current}${sep}${segment}`;
    let metadata;
    try {
      metadata = await lstat(current);
    } catch (error) {
      const code = (error as { readonly code?: string }).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') throw new AdmissionWitnessReopenError('witness publication path is missing');
      throw error;
    }
    if (metadata.isSymbolicLink()) throw new AdmissionWitnessReopenError('witness publication contains a symlink');
    if (index < segments.length - 1 && !metadata.isDirectory()) throw new AdmissionWitnessReopenError('witness publication contains a non-directory path component');
  }
}

async function rootPath(value: string): Promise<string> {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\u0000') || value.includes('\\')) throw new AdmissionWitnessReopenError('witness publication root is invalid');
  let root: string;
  try { root = await realpath(resolve(value)); } catch { throw new AdmissionWitnessReopenError('witness publication root is unavailable'); }
  const metadata = await lstat(root);
  if (!metadata.isDirectory()) throw new AdmissionWitnessReopenError('witness publication root is not a directory');
  return root;
}

function containedPath(root: string, pathValue: string): string {
  if (!isRelativePath(pathValue)) throw new AdmissionWitnessReopenError('witness publication relative path is invalid');
  const absolute = resolve(root, pathValue);
  if (!inside(root, absolute)) throw new AdmissionWitnessReopenError('witness publication relative path escapes root');
  return absolute;
}

async function readCanonicalJson<T>(root: string, pathValue: string, label: string): Promise<{ readonly value: T; readonly sha256: string }> {
  const absolute = containedPath(root, pathValue);
  await noSymlinkPath(root, absolute);
  const metadata = await lstat(absolute);
  if (!metadata.isFile() || metadata.size > MAX_WITNESS_PUBLICATION_BYTES) throw new AdmissionWitnessReopenError(`${label} is not a bounded regular file`);
  let handle;
  try {
    handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size !== metadata.size || opened.size > MAX_WITNESS_PUBLICATION_BYTES) throw new AdmissionWitnessReopenError(`${label} changed or is not a bounded regular file`);
    const bytes = await handle.readFile();
    let value: unknown;
    try { value = JSON.parse(bytes.toString('utf8')) as unknown; } catch { throw new AdmissionWitnessReopenError(`${label} is not valid JSON`); }
    if (!Buffer.from(canonical(value)).equals(bytes)) throw new AdmissionWitnessReopenError(`${label} is not canonical JSON`);
    return { value: value as T, sha256: hashBytes(bytes) };
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function bundleRelativePath(gate: AdmissionWitnessPublicationGateV1, kind: AdmissionWitnessPublicationKindV1, sha256: string): string {
  return `review/admission/witnesses/${gate}/${kind === 'search_result' ? 'search-results' : 'witness-reviews'}/${sha256}.json`;
}

function completionRelativePath(gate: AdmissionWitnessPublicationGateV1, sha256: string): string {
  return `review/admission/witnesses/${gate}/publication-completions/${sha256}.json`;
}

function parseReference(value: unknown): CalibrationAdmissionWitnessRoutingReferenceV1 {
  const parsed = typeof value === 'string' ? (() => {
    try { return JSON.parse(value) as unknown; } catch { throw new AdmissionWitnessReopenError('witness routing reference is not valid JSON'); }
  })() : value;
  if (!isCalibrationAdmissionWitnessRoutingReferenceV1(parsed)) throw new AdmissionWitnessReopenError('witness routing reference is invalid');
  if (!isSha(parsed.referenceSha256) || calibrationAdmissionWitnessRoutingReferenceSha256(parsed) !== parsed.referenceSha256) throw new AdmissionWitnessReopenError('witness routing reference self-hash is invalid');
  if (typeof value === 'string' && value !== calibrationAdmissionCanonicalJson(parsed)) throw new AdmissionWitnessReopenError('witness routing reference is not canonical');
  return parsed;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== 'object' || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) deepFreeze((value as Record<PropertyKey, unknown>)[key], seen);
  return Object.freeze(value);
}

export function isVerifiedAdmissionWitnessPublication(value: unknown): value is VerifiedAdmissionWitnessPublicationV1 {
  return typeof value === 'object' && value !== null && verifiedWitnessPublications.has(value);
}

export async function openAdmissionWitnessPublication(
  input: OpenAdmissionWitnessPublicationInputV1,
): Promise<VerifiedAdmissionWitnessPublicationV1> {
  // Never freeze a caller-owned routing reference while branding the reopened
  // graph. Object inputs are already validated by `parseReference`, so clone
  // before deep-freezing the result.
  const reference = structuredClone(parseReference(input.reference));
  if ((input.gate !== 'smoke' && input.gate !== 'canary') || (input.kind !== 'search_result' && input.kind !== 'witness_review')) {
    throw new AdmissionWitnessReopenError('witness publication selector is invalid');
  }
  if (reference.gate !== input.gate || reference.kind !== input.kind
    || reference.bundleRelativePath !== bundleRelativePath(input.gate, input.kind, reference.bundleSha256)
    || reference.publicationCompletionRelativePath !== completionRelativePath(input.gate, reference.publicationCompletionSha256)) {
    throw new AdmissionWitnessReopenError('witness routing reference is not hash-addressed');
  }
  const root = await rootPath(input.root);
  const bundleRead = await readCanonicalJson<CalibrationAdmissionSearchResultBundleV1 | CalibrationAdmissionWitnessReviewBundleV1>(root, reference.bundleRelativePath, 'witness bundle');
  const completionRead = await readCanonicalJson<CalibrationAdmissionWitnessPublicationCompletionV1>(root, reference.publicationCompletionRelativePath, 'witness publication completion');
  const bundleValid = input.kind === 'search_result'
    ? isCalibrationAdmissionSearchResultBundleV1(bundleRead.value)
    : isCalibrationAdmissionWitnessReviewBundleV1(bundleRead.value);
  if (!bundleValid) throw new AdmissionWitnessReopenError('witness publication bundle is invalid');
  if (!isCalibrationAdmissionWitnessPublicationCompletionV1(completionRead.value)
    || completionRead.value.gate !== input.gate
    || completionRead.value.kind !== input.kind
    || completionRead.value.bundleRelativePath !== reference.bundleRelativePath
    || completionRead.value.bundleSha256 !== reference.bundleSha256
    || completionRead.value.completionSha256 !== reference.publicationCompletionSha256
    || calibrationAdmissionWitnessPublicationCompletionSha256(completionRead.value) !== completionRead.value.completionSha256) {
    throw new AdmissionWitnessReopenError('witness publication completion is invalid or not bound');
  }
  const result = deepFreeze({ gate: input.gate, kind: input.kind, reference, bundle: bundleRead.value, completion: completionRead.value }) as VerifiedAdmissionWitnessPublicationV1;
  verifiedWitnessPublications.add(result as object);
  return result;
}
