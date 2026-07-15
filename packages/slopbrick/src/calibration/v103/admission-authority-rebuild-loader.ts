import { constants } from 'node:fs';
import { lstat, open, realpath, type FileHandle } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { TextDecoder } from 'node:util';

import {
  isCalibrationAdmissionAuthorityCurrentV1,
  isCalibrationAdmissionInputGenerationProposalV1,
  isCalibrationAdmissionInputGenerationV1,
  isCalibrationAdmissionSourceGenerationApprovalV1,
  isCalibrationAdmissionSourceGenerationProposalV1,
  isCalibrationAdmissionSourceCurrentV1,
  isCalibrationAdmissionSourceGenerationV1,
  isCalibrationAdmissionStaticAuthorityGenerationV1,
  calibrationAdmissionCanonicalJson,
  type CalibrationAdmissionAuthorityCurrentV1,
  type CalibrationAdmissionInputGenerationProposalV1,
  type CalibrationAdmissionInputGenerationV1,
  type CalibrationAdmissionSourceGenerationApprovalV1,
  type CalibrationAdmissionSourceGenerationProposalV1,
  type CalibrationAdmissionSourceCurrentV1,
  type CalibrationAdmissionSourceGenerationV1,
  type CalibrationAdmissionStaticAuthorityGenerationV1,
} from '@usebrick/core';

import {
  validatePrebuiltAdmissionAuthorityGraph,
  type PrebuiltAdmissionAuthorityGraphInput,
} from './admission-authority-rebuild';

const AUTHORITY_CURRENT_RELATIVE_PATH = 'review/admission/authority/current.json';
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export interface PrebuiltAdmissionAuthorityGraphLoadRequest {
  /** Project directory containing the review/admission authority root. */
  readonly projectRoot: string;
  /** Exact proposal object file. It is never discovered from a directory. */
  readonly proposalPath: string;
  /** Exact input-generation object file. Its parent is the generation root. */
  readonly inputGenerationPath: string;
  /** Optional exact prior-current object file for replace proposals. */
  readonly priorCurrentPath?: string;
  /** When true, load and bind every source proposal and independent approval object. */
  readonly requireSourceProposalBytes?: boolean;
}

export type PrebuiltAdmissionAuthorityGraphLoadResult =
  | { readonly ok: true; readonly graph: PrebuiltAdmissionAuthorityGraphInput }
  | { readonly ok: false; readonly errors: readonly string[] };

type AdmissionRoot = Readonly<{
  readonly lexicalProjectRoot: string;
  readonly projectRoot: string;
  readonly admissionRoot: string;
}>;

type ObjectRead = Readonly<{
  readonly value: unknown;
  readonly bytes: Buffer;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resultError(error: unknown): PrebuiltAdmissionAuthorityGraphLoadResult {
  const message = errorMessage(error);
  return { ok: false, errors: [message.length > 0 ? message : 'prebuilt authority graph load failed closed'] };
}

function pathInside(base: string, candidate: string): boolean {
  const child = relative(base, candidate);
  return child === ''
    || (child !== '..'
      && !child.startsWith(`..${sep}`)
      && !child.startsWith('/')
      && !child.includes('\\'));
}

function assertPathText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty path`);
  if (value.includes('\u0000')) throw new Error(`${label} contains a NUL byte`);
  if (value.includes('\\')) throw new Error(`${label} must not contain a backslash`);
  // A caller may supply an absolute path, but the exact path may not contain
  // normalization components that could hide traversal from the boundary.
  const segments = value.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`${label} contains an unsafe traversal component`);
  }
}

function assertProjectRootText(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('projectRoot must be a non-empty path');
  if (value.includes('\u0000')) throw new Error('projectRoot contains a NUL byte');
  if (value.includes('\\')) throw new Error('projectRoot must not contain a backslash');
}

function containedPath(root: AdmissionRoot, requested: string, label: string): string {
  assertPathText(requested, label);
  const lexicalCandidate = resolve(root.lexicalProjectRoot, requested);
  const lexicalAdmissionRoot = join(root.lexicalProjectRoot, 'review', 'admission');
  if (!pathInside(lexicalAdmissionRoot, lexicalCandidate) || lexicalCandidate === lexicalAdmissionRoot) {
    throw new Error(`${label} must be contained under the project admission root`);
  }
  const relativeToProject = relative(root.lexicalProjectRoot, lexicalCandidate);
  const candidate = join(root.projectRoot, relativeToProject);
  if (!pathInside(root.admissionRoot, candidate) || candidate === root.admissionRoot) {
    throw new Error(`${label} must be contained under the project admission root`);
  }
  return candidate;
}

async function assertNoSymlinkPath(root: string, target: string, label: string): Promise<void> {
  if (!pathInside(root, target) || target === root) throw new Error(`${label} escapes the contained admission root`);
  const targetRelative = relative(root, target);
  let current = root;
  const segments = targetRelative.split(/[\\/]+/u).filter(Boolean);
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment);
    let metadata;
    try {
      metadata = await lstat(current);
    } catch (error) {
      const code = isRecord(error) ? error.code : undefined;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        throw new Error(`${label} is missing`);
      }
      throw new Error(`${label} cannot be inspected: ${errorMessage(error)}`);
    }
    if (metadata.isSymbolicLink()) throw new Error(`${label} contains a symlink path component`);
    if (index < segments.length - 1 && !metadata.isDirectory()) {
      throw new Error(`${label} has a non-directory path component`);
    }
  }
}

async function resolveAdmissionRoot(projectRootInput: string): Promise<AdmissionRoot> {
  // Unlike caller-selected files, the project root is an explicit boundary
  // and may naturally be supplied as `.` or `../workspace`. Resolve those
  // components before applying the contained admission-root checks.
  assertProjectRootText(projectRootInput);
  const lexicalProjectRoot = resolve(projectRootInput);
  let projectMetadata;
  try {
    projectMetadata = await lstat(lexicalProjectRoot);
  } catch (error) {
    throw new Error(`projectRoot cannot be inspected: ${errorMessage(error)}`);
  }
  if (projectMetadata.isSymbolicLink()) throw new Error('projectRoot must not be a symlink');
  if (!projectMetadata.isDirectory()) throw new Error('projectRoot must be a directory');
  const projectRoot = await realpath(lexicalProjectRoot);
  const admissionRoot = join(projectRoot, 'review', 'admission');
  await assertNoSymlinkPath(projectRoot, admissionRoot, 'review/admission');
  let admissionMetadata;
  try {
    admissionMetadata = await lstat(admissionRoot);
  } catch (error) {
    throw new Error(`review/admission cannot be inspected: ${errorMessage(error)}`);
  }
  if (!admissionMetadata.isDirectory()) throw new Error('review/admission must be a directory');
  return { lexicalProjectRoot, projectRoot, admissionRoot };
}

async function readContainedFile(root: AdmissionRoot, target: string, label: string): Promise<Buffer> {
  await assertNoSymlinkPath(root.admissionRoot, target, label);
  let canonicalTarget: string;
  try {
    canonicalTarget = await realpath(target);
  } catch (error) {
    throw new Error(`${label} cannot be resolved: ${errorMessage(error)}`);
  }
  if (!pathInside(root.admissionRoot, canonicalTarget)) throw new Error(`${label} escapes the contained admission root`);
  let handle: FileHandle | undefined;
  try {
    // Reopen the canonical target with O_NOFOLLOW. The preflight rejects
    // symlink ancestors; this final no-follow open also prevents a leaf from
    // being swapped to a symlink between the preflight and the read.
    handle = await open(canonicalTarget, constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error(`${label} must be a regular file`);
    const bytes = await handle.readFile();
    // Detect an ancestor/rename race before returning bytes. A changed
    // canonical path is rejected rather than being accepted as the requested
    // authority artifact.
    if (await realpath(target) !== canonicalTarget) throw new Error(`${label} changed during read`);
    return bytes;
  } catch (error) {
    throw new Error(`${label} cannot be read: ${errorMessage(error)}`);
  } finally {
    if (handle !== undefined) await handle.close().catch(() => undefined);
  }
}

function decodeUtf8(bytes: Uint8Array, label: string): string {
  if (bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new Error(`${label} must not contain a UTF-8 BOM`);
  }
  try {
    return UTF8_DECODER.decode(bytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8`);
  }
}

async function readCanonicalObject(root: AdmissionRoot, target: string, label: string): Promise<ObjectRead> {
  const bytes = await readContainedFile(root, target, label);
  const text = decodeUtf8(bytes, label);
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  let canonical: string;
  try {
    canonical = calibrationAdmissionCanonicalJson(value);
  } catch {
    throw new Error(`${label} cannot be canonicalized`);
  }
  if (text !== canonical) throw new Error(`${label} must be exact canonical JSON bytes`);
  return { value, bytes };
}

async function readSourceReview(root: AdmissionRoot, target: string, sourceId: string): Promise<Buffer> {
  const bytes = await readContainedFile(root, target, `source ${sourceId} source-review.json`);
  const text = decodeUtf8(bytes, `source ${sourceId} source-review.json`);
  if (!text.endsWith('\n') || text.endsWith('\n\n')) {
    throw new Error(`source ${sourceId} source-review.json must end with exactly one LF`);
  }
  const json = text.slice(0, -1);
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch {
    throw new Error(`source ${sourceId} source-review.json is not valid JSON`);
  }
  try {
    if (calibrationAdmissionCanonicalJson(value) !== json) {
      throw new Error(`source ${sourceId} source-review.json must be exact canonical JSON bytes`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('must be exact canonical')) throw error;
    throw new Error(`source ${sourceId} source-review.json cannot be canonicalized`);
  }
  return bytes;
}

function safeGenerationRelativePath(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\') || value.includes('\u0000')) {
    throw new Error(`${label} is unsafe`);
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new Error(`${label} is unsafe`);
  }
}

async function readReceiptMap(
  root: AdmissionRoot,
  generationDirectory: string,
  artifacts: readonly unknown[],
  label: string,
): Promise<Readonly<Record<string, Buffer>>> {
  const output: Record<string, Buffer> = {};
  for (const artifact of artifacts) {
    if (!isRecord(artifact)
      || (artifact.pathBase !== 'generation_local' && artifact.pathBase !== 'admission_root_content_addressed')
      || typeof artifact.relativePath !== 'string'
      || typeof artifact.sha256 !== 'string') {
      throw new Error(`${label} contains an invalid artifact receipt`);
    }
    safeGenerationRelativePath(artifact.relativePath, `${label} artifact path`);
    if (Object.prototype.hasOwnProperty.call(output, artifact.relativePath)) {
      throw new Error(`${label} contains duplicate artifact receipt paths`);
    }
    let artifactPath: string;
    if (artifact.pathBase === 'generation_local') {
      artifactPath = resolve(generationDirectory, artifact.relativePath);
    } else if (artifact.pathBase === 'admission_root_content_addressed') {
      const casParts = artifact.relativePath.split('/');
      if (casParts.length !== 4 || casParts[0] !== 'evidence-cas' || casParts[1] !== 'sha256'
        || !/^[a-f0-9]{2}$/u.test(casParts[2]!) || casParts[2] !== artifact.sha256.slice(0, 2)
        || casParts[3] !== artifact.sha256) {
        throw new Error(`${label} contains an invalid content-addressed artifact path`);
      }
      artifactPath = resolve(root.admissionRoot, artifact.relativePath);
    } else {
      throw new Error(`${label} contains an unsupported artifact path base`);
    }
    if (!pathInside(root.admissionRoot, artifactPath)) throw new Error(`${label} artifact path escapes the contained admission root`);
    output[artifact.relativePath] = await readContainedFile(root, artifactPath, `${label} artifact ${artifact.relativePath}`);
  }
  return output;
}

function assertObject<T>(value: unknown, guard: (candidate: unknown) => candidate is T, label: string): T {
  if (!guard(value)) throw new Error(`${label} failed Core validation`);
  return value;
}

async function loadGraph(request: PrebuiltAdmissionAuthorityGraphLoadRequest): Promise<PrebuiltAdmissionAuthorityGraphInput> {
  if (!isRecord(request)) throw new Error('prebuilt authority graph load request is not an object');
  const requestKeys = Object.keys(request).sort();
  const expectedKeys = [
    'inputGenerationPath', 'projectRoot', 'proposalPath',
    ...(request.priorCurrentPath === undefined ? [] : ['priorCurrentPath']),
    ...(request.requireSourceProposalBytes === undefined ? [] : ['requireSourceProposalBytes']),
  ].sort();
  if (requestKeys.length !== expectedKeys.length || requestKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error('prebuilt authority graph load request has unexpected keys');
  }
  const root = await resolveAdmissionRoot(request.projectRoot);
  const proposalPath = containedPath(root, request.proposalPath, 'proposal path');
  const inputGenerationPath = containedPath(root, request.inputGenerationPath, 'input generation path');
  const currentPath = join(root.projectRoot, AUTHORITY_CURRENT_RELATIVE_PATH);
  const proposalRead = await readCanonicalObject(root, proposalPath, 'proposal');
  const inputGenerationRead = await readCanonicalObject(root, inputGenerationPath, 'input generation');
  const currentRead = await readCanonicalObject(root, currentPath, 'authority current pointer');
  const proposal = assertObject(proposalRead.value, isCalibrationAdmissionInputGenerationProposalV1, 'proposal') as CalibrationAdmissionInputGenerationProposalV1;
  const inputGeneration = assertObject(inputGenerationRead.value, isCalibrationAdmissionInputGenerationV1, 'input generation') as CalibrationAdmissionInputGenerationV1;
  const current = assertObject(currentRead.value, isCalibrationAdmissionAuthorityCurrentV1, 'authority current pointer') as CalibrationAdmissionAuthorityCurrentV1;
  const requireSourceProposalBytes = request.requireSourceProposalBytes === true;

  const inputGenerationDirectory = dirname(inputGenerationPath);
  const inputArtifacts = await readReceiptMap(root, inputGenerationDirectory, inputGeneration.artifacts, 'input generation');
  safeGenerationRelativePath(current.staticGenerationRelativePath, 'authority current static generation path');
  const staticGenerationDirectory = containedPath(root, current.staticGenerationRelativePath, 'static generation path');
  const staticGenerationRead = await readCanonicalObject(root, join(staticGenerationDirectory, 'generation.json'), 'static generation');
  const staticGeneration = assertObject(staticGenerationRead.value, isCalibrationAdmissionStaticAuthorityGenerationV1, 'static generation') as CalibrationAdmissionStaticAuthorityGenerationV1;
  const staticArtifacts = await readReceiptMap(root, staticGenerationDirectory, staticGeneration.artifacts, 'static generation');

  let priorCurrent: CalibrationAdmissionAuthorityCurrentV1 | undefined;
  let priorCurrentBytes: Buffer | undefined;
  if (request.priorCurrentPath !== undefined) {
    const priorPath = containedPath(root, request.priorCurrentPath, 'prior current path');
    const priorRead = await readCanonicalObject(root, priorPath, 'prior current pointer');
    priorCurrent = assertObject(priorRead.value, isCalibrationAdmissionAuthorityCurrentV1, 'prior current pointer') as CalibrationAdmissionAuthorityCurrentV1;
    priorCurrentBytes = priorRead.bytes;
  }

  const sources: Array<PrebuiltAdmissionAuthorityGraphInput['sources'][number]> = [];
  for (const sourceReference of inputGeneration.sourceGenerations) {
    const sourceId = sourceReference.sourceId;
    const sourceCurrentPath = containedPath(root, `review/admission/sources/${sourceId}/current.json`, `source ${sourceId} current path`);
    const sourceCurrentRead = await readCanonicalObject(root, sourceCurrentPath, `source ${sourceId} current pointer`);
    const sourceCurrent = assertObject(sourceCurrentRead.value, isCalibrationAdmissionSourceCurrentV1, `source ${sourceId} current pointer`) as CalibrationAdmissionSourceCurrentV1;
    safeGenerationRelativePath(sourceCurrent.generationRelativePath, `source ${sourceId} generation path`);
    const sourceGenerationDirectory = containedPath(root, `review/admission/${sourceCurrent.generationRelativePath}`, `source ${sourceId} generation path`);
    const sourceGenerationRead = await readCanonicalObject(root, join(sourceGenerationDirectory, 'source-generation.json'), `source ${sourceId} generation`);
    const sourceGeneration = assertObject(sourceGenerationRead.value, isCalibrationAdmissionSourceGenerationV1, `source ${sourceId} generation`) as CalibrationAdmissionSourceGenerationV1;
    const sourceReviewBytes = await readSourceReview(root, join(sourceGenerationDirectory, 'source-review.json'), sourceId);
    const sourceArtifacts = await readReceiptMap(root, sourceGenerationDirectory, sourceGeneration.artifacts, `source ${sourceId}`);
    let sourceProposal: CalibrationAdmissionSourceGenerationProposalV1 | undefined;
    let sourceProposalBytes: Buffer | undefined;
    let approval: CalibrationAdmissionSourceGenerationApprovalV1 | undefined;
    let approvalBytes: Buffer | undefined;
    if (requireSourceProposalBytes) {
      const proposalReference = proposal.sourceGenerationProposals.find((entry) => entry.sourceId === sourceId);
      if (!proposalReference) throw new Error(`source ${sourceId} proposal reference is missing from input-generation proposal`);
      if (!isRecord(proposalReference) || typeof proposalReference.proposalRelativePath !== 'string') {
        throw new Error(`source ${sourceId} proposal reference path is invalid`);
      }
      const proposalObjectRead = await readCanonicalObject(
        root,
        containedPath(root, proposalReference.proposalRelativePath, `source ${sourceId} proposal path`),
        `source ${sourceId} source-generation proposal`,
      );
      sourceProposal = assertObject(
        proposalObjectRead.value,
        isCalibrationAdmissionSourceGenerationProposalV1,
        `source ${sourceId} source-generation proposal`,
      ) as CalibrationAdmissionSourceGenerationProposalV1;
      sourceProposalBytes = proposalObjectRead.bytes;
      if (sourceGeneration.approval.kind === 'independent_review') {
        if (!isRecord(proposalReference) || typeof proposalReference.approvalRelativePath !== 'string') {
          throw new Error(`source ${sourceId} approval reference path is missing`);
        }
        const approvalRelativePath = proposalReference.approvalRelativePath;
        const expectedApprovalRelativePath = `review/admission/sources/${sourceId}/proposals/${sourceGeneration.proposalId}-approval.json`;
        if (approvalRelativePath !== expectedApprovalRelativePath) {
          throw new Error(`source ${sourceId} approval reference path is not fixed`);
        }
        const approvalRead = await readCanonicalObject(
          root,
          containedPath(root, approvalRelativePath, `source ${sourceId} approval path`),
          `source ${sourceId} source-generation approval`,
        );
        approval = assertObject(
          approvalRead.value,
          isCalibrationAdmissionSourceGenerationApprovalV1,
          `source ${sourceId} source-generation approval`,
        ) as CalibrationAdmissionSourceGenerationApprovalV1;
        approvalBytes = approvalRead.bytes;
      }
    }
    sources.push({
      sourceGeneration,
      sourceGenerationBytes: sourceGenerationRead.bytes,
      current: sourceCurrent,
      currentBytes: sourceCurrentRead.bytes,
      sourceReviewBytes,
      artifactBytes: sourceArtifacts,
      ...(sourceProposal === undefined ? {} : { sourceProposal, sourceProposalBytes }),
      ...(approval === undefined ? {} : { approval, approvalBytes }),
    });
  }

  const graph: PrebuiltAdmissionAuthorityGraphInput = {
    proposal,
    proposalBytes: proposalRead.bytes,
    inputGeneration,
    inputGenerationBytes: inputGenerationRead.bytes,
    inputGenerationArtifactBytes: inputArtifacts,
    staticGeneration,
    staticGenerationBytes: staticGenerationRead.bytes,
    staticGenerationArtifactBytes: staticArtifacts,
    current,
    currentBytes: currentRead.bytes,
    ...(priorCurrent === undefined ? {} : { priorCurrent, priorCurrentBytes }),
    sources,
  };
  const validation = validatePrebuiltAdmissionAuthorityGraph(graph);
  if (!validation.ok) throw new Error(validation.errors.join('; '));
  return graph;
}

/** Read and validate one caller-selected, byte-backed authority graph. */
export async function loadPrebuiltAdmissionAuthorityGraph(
  request: PrebuiltAdmissionAuthorityGraphLoadRequest,
): Promise<PrebuiltAdmissionAuthorityGraphLoadResult> {
  try {
    return { ok: true, graph: await loadGraph(request) };
  } catch (error) {
    return resultError(error);
  }
}

/** Alias retained for callers that describe this boundary as a read operation. */
export const readPrebuiltAdmissionAuthorityGraph = loadPrebuiltAdmissionAuthorityGraph;
