import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

import {
  calibrationAdmissionAuthorityCurrentSha256,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionInputGenerationSha256,
  calibrationAdmissionSourceReviewSha256,
  calibrationAdmissionStaticAuthorityGenerationSha256,
  isCalibrationAdmissionAuthorityCurrentV1,
  isCalibrationAdmissionInputGenerationProposalV1,
  isCalibrationAdmissionInputGenerationV1,
  isCalibrationAdmissionSourceCurrentV1,
  isCalibrationAdmissionSourceGenerationV1,
  isCalibrationAdmissionStaticAuthorityGenerationV1,
  isCalibrationSourceReviewV103,
  validateCalibrationAdmissionStaticAuthorityGraphV1,
  type CalibrationAdmissionAuthorityCurrentV1,
  type CalibrationAdmissionInputGenerationProposalV1,
  type CalibrationAdmissionInputGenerationV1,
  type CalibrationAdmissionSourceCurrentV1,
  type CalibrationAdmissionSourceGenerationV1,
  type CalibrationAdmissionStaticAuthorityGenerationV1,
} from '@usebrick/core';

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const SAFE_RELATIVE_PATH = /^(?!\/)(?!.*\\)(?!.*\/\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*[\u0000-\u001f])[\s\S]+$/u;
const ADMISSION_ROOT = 'review/admission/';

export interface PrebuiltAdmissionAuthorityArtifactBytes {
  readonly relativePath: string;
  readonly bytes: Uint8Array;
}

export type PrebuiltAdmissionAuthorityArtifactBytesInput =
  | Readonly<Record<string, Uint8Array>>
  | readonly PrebuiltAdmissionAuthorityArtifactBytes[];

/** One immutable source-generation authority and the bytes it claims. */
export interface PrebuiltAdmissionAuthoritySourceInput {
  readonly sourceGeneration: unknown;
  readonly sourceGenerationBytes: Uint8Array;
  readonly current: unknown;
  readonly currentBytes: Uint8Array;
  /** Serialized source-review.json: canonical JSON plus one LF. */
  readonly sourceReviewBytes: Uint8Array;
  /** Every generation-local artifact, keyed by its exact receipt path. */
  readonly artifactBytes: PrebuiltAdmissionAuthorityArtifactBytesInput;
}

/**
 * Caller-owned, byte-backed authority graph. This validator is deliberately
 * computation-only: it never resolves a path or reads/writes a filesystem.
 */
export interface PrebuiltAdmissionAuthorityGraphInput {
  readonly proposal: unknown;
  readonly proposalBytes: Uint8Array;
  readonly inputGeneration: unknown;
  readonly inputGenerationBytes: Uint8Array;
  readonly staticGeneration: unknown;
  readonly staticGenerationBytes: Uint8Array;
  readonly current: unknown;
  readonly currentBytes: Uint8Array;
  readonly priorCurrent?: unknown;
  readonly priorCurrentBytes?: Uint8Array;
  readonly sources: readonly PrebuiltAdmissionAuthoritySourceInput[];
}

export interface PrebuiltAdmissionAuthorityGraphValidation {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function push(errors: string[], message: string): void {
  if (!errors.includes(message)) errors.push(message);
}

function result(errors: readonly string[]): PrebuiltAdmissionAuthorityGraphValidation {
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

function safeRelativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096 || !SAFE_RELATIVE_PATH.test(value)) return false;
  const segments = value.split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function bytes(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

function decodeUtf8(value: unknown, label: string, errors: string[]): string | undefined {
  if (!bytes(value)) {
    push(errors, `${label} must be supplied as UTF-8 bytes`);
    return undefined;
  }
  try {
    const decoded = UTF8_DECODER.decode(value);
    if (decoded.startsWith('\uFEFF') || (value.byteLength >= 3 && value[0] === 0xef && value[1] === 0xbb && value[2] === 0xbf)) {
      push(errors, `${label} must not contain a UTF-8 BOM`);
      return undefined;
    }
    return decoded;
  } catch {
    push(errors, `${label} is not valid UTF-8`);
    return undefined;
  }
}

function verifyCanonicalBytes(value: unknown, supplied: unknown, label: string, errors: string[]): void {
  const decoded = decodeUtf8(supplied, label, errors);
  if (decoded === undefined) return;
  try {
    const expected = calibrationAdmissionCanonicalJson(value);
    if (decoded !== expected) push(errors, `${label} are not the exact canonical JSON bytes`);
    const parsed = JSON.parse(decoded) as unknown;
    if (calibrationAdmissionCanonicalJson(parsed) !== expected) push(errors, `${label} do not parse as canonical JSON`);
  } catch {
    push(errors, `${label} cannot be canonicalized`);
  }
}

function verifySerializedSourceReview(supplied: unknown, sourceId: string, errors: string[]): { readonly review?: unknown; readonly bytes?: Uint8Array } {
  const decoded = decodeUtf8(supplied, `source ${sourceId} source-review bytes`, errors);
  if (decoded === undefined || !bytes(supplied)) return {};
  if (!decoded.endsWith('\n') || decoded.endsWith('\n\n')) {
    push(errors, `source ${sourceId} source-review bytes must end with exactly one LF`);
    return {};
  }
  const json = decoded.slice(0, -1);
  try {
    const review = JSON.parse(json) as unknown;
    if (calibrationAdmissionCanonicalJson(review) !== json) {
      push(errors, `source ${sourceId} source-review bytes are not canonical JSON`);
    }
    if (!isCalibrationSourceReviewV103(review)) {
      push(errors, `source ${sourceId} source-review object is invalid`);
    } else if (review.sourceId !== sourceId) {
      push(errors, `source ${sourceId} source-review source ID does not match`);
    }
    return { review, bytes: supplied };
  } catch {
    push(errors, `source ${sourceId} source-review bytes are not valid JSON`);
    return {};
  }
}

function artifactBytesMap(value: unknown, sourceId: string, errors: string[]): Map<string, Uint8Array> | undefined {
  const map = new Map<string, Uint8Array>();
  if (isRecord(value)) {
    for (const [relativePath, raw] of Object.entries(value)) {
      if (!safeRelativePath(relativePath)) push(errors, `source ${sourceId} artifact byte path is unsafe`);
      if (!bytes(raw)) push(errors, `source ${sourceId} artifact bytes for ${relativePath} are invalid`);
      else if (map.has(relativePath)) push(errors, `source ${sourceId} artifact byte paths are duplicated`);
      else map.set(relativePath, raw);
    }
    return map;
  }
  if (!Array.isArray(value)) {
    push(errors, `source ${sourceId} artifact bytes must be a path map or entries`);
    return undefined;
  }
  for (const entry of value) {
    if (!isRecord(entry) || Object.keys(entry).sort().join('\u0000') !== 'bytes\u0000relativePath'
      || !safeRelativePath(entry.relativePath) || !bytes(entry.bytes)) {
      push(errors, `source ${sourceId} artifact byte entry is invalid`);
      continue;
    }
    if (map.has(entry.relativePath)) push(errors, `source ${sourceId} artifact byte paths are duplicated`);
    else map.set(entry.relativePath, entry.bytes);
  }
  return map;
}

function verifySource(
  sourceInput: unknown,
  sourceIndex: number,
  inputGeneration: CalibrationAdmissionInputGenerationV1,
  proposal: CalibrationAdmissionInputGenerationProposalV1,
  errors: string[],
): string | undefined {
  if (!isRecord(sourceInput)) {
    push(errors, `source ${sourceIndex} authority entry is invalid`);
    return undefined;
  }
  const sourceKeys = Object.keys(sourceInput).sort();
  const expectedSourceKeys = ['artifactBytes', 'current', 'currentBytes', 'sourceGeneration', 'sourceGenerationBytes', 'sourceReviewBytes'];
  if (sourceKeys.length !== expectedSourceKeys.length || sourceKeys.some((key, index) => key !== expectedSourceKeys[index])) {
    push(errors, `source ${sourceIndex} authority entry has unexpected keys`);
  }
  const sourceGeneration = isCalibrationAdmissionSourceGenerationV1(sourceInput.sourceGeneration)
    ? sourceInput.sourceGeneration
    : undefined;
  const current = isCalibrationAdmissionSourceCurrentV1(sourceInput.current)
    ? sourceInput.current
    : undefined;
  if (!sourceGeneration) push(errors, `source ${sourceIndex} generation is invalid`);
  if (!current) push(errors, `source ${sourceIndex} current pointer is invalid`);
  const sourceId = sourceGeneration?.sourceId ?? current?.sourceId;
  if (sourceId === undefined) return undefined;

  verifyCanonicalBytes(sourceInput.sourceGeneration, sourceInput.sourceGenerationBytes, `source ${sourceId} generation bytes`, errors);
  verifyCanonicalBytes(sourceInput.current, sourceInput.currentBytes, `source ${sourceId} current bytes`, errors);
  const reviewResult = verifySerializedSourceReview(sourceInput.sourceReviewBytes, sourceId, errors);
  const artifactMap = artifactBytesMap(sourceInput.artifactBytes, sourceId, errors);
  if (!sourceGeneration || !current) return sourceId;

  if (sourceGeneration.sourceId !== current.sourceId) push(errors, `source ${sourceId} generation/current source IDs do not match`);
  if (sourceGeneration.generationSha256 !== current.generationSha256) push(errors, `source ${sourceId} generation hash does not match current pointer`);
  if (current.generationRelativePath !== `sources/${sourceId}/generations/${sourceGeneration.generationSha256}`) {
    push(errors, `source ${sourceId} current generation path is not hash-derived`);
  }
  if (!safeRelativePath(current.generationRelativePath)) push(errors, `source ${sourceId} current generation path is unsafe`);
  if (!safeRelativePath(`review/admission/${current.generationRelativePath}`)) push(errors, `source ${sourceId} generation path is outside the contained admission root`);

  const sourceRef = inputGeneration.sourceGenerations.find((entry) => entry.sourceId === sourceId);
  if (!sourceRef) {
    push(errors, `source ${sourceId} is not referenced by the input generation`);
  } else {
    if (sourceRef.generationSha256 !== sourceGeneration.generationSha256) push(errors, `source ${sourceId} generation hash is not bound to input generation`);
    if (sourceRef.artifactSetSha256 !== sourceGeneration.artifactSetSha256) push(errors, `source ${sourceId} artifact-set hash is not bound to input generation`);
    if (sourceRef.relativePath !== `${ADMISSION_ROOT}${current.generationRelativePath}`) push(errors, `source ${sourceId} generation path is not bound to input generation`);
  }
  const proposalRef = proposal.sourceGenerationProposals.find((entry) => entry.sourceId === sourceId);
  if (!proposalRef) {
    push(errors, `source ${sourceId} is not referenced by the input-generation proposal`);
  } else {
    if (proposalRef.proposalId !== sourceGeneration.proposalId || proposalRef.proposalSha256 !== sourceGeneration.proposalSha256) {
      push(errors, `source ${sourceId} generation does not bind its exact proposal`);
    }
    if (proposalRef.proposalRelativePath !== `${ADMISSION_ROOT}sources/${sourceId}/proposals/${sourceGeneration.proposalId}.json`) {
      push(errors, `source ${sourceId} proposal path is not contained or hash-derived`);
    }
  }

  const sourceReviewArtifacts = sourceGeneration.artifacts.filter((artifact) => artifact.kind === 'source_review' && artifact.relativePath === 'source-review.json');
  if (sourceReviewArtifacts.length !== 1) {
    push(errors, `source ${sourceId} must contain exactly one fixed source-review artifact`);
  }
  if (artifactMap !== undefined) {
    const artifactPaths = sourceGeneration.artifacts.map((artifact) => artifact.relativePath);
    if (artifactMap.size !== artifactPaths.length || artifactPaths.some((path) => !artifactMap.has(path))) {
      push(errors, `source ${sourceId} artifact bytes do not exactly cover generation receipts`);
    }
    for (const artifact of sourceGeneration.artifacts) {
      const raw = artifactMap.get(artifact.relativePath);
      if (raw === undefined) continue;
      if (raw.byteLength !== artifact.bytes || hashBytes(raw) !== artifact.sha256) {
        push(errors, `source ${sourceId} artifact bytes do not match ${artifact.relativePath}`);
      }
    }
  }
  if (sourceReviewArtifacts.length === 1 && artifactMap !== undefined && reviewResult.bytes !== undefined) {
    const reviewArtifact = sourceReviewArtifacts[0]!;
    const raw = artifactMap.get(reviewArtifact.relativePath);
    if (raw !== undefined && (raw.byteLength !== reviewResult.bytes.byteLength
      || !raw.every((entry, index) => entry === reviewResult.bytes![index]))) {
      push(errors, `source ${sourceId} source-review artifact bytes differ from supplied review bytes`);
    }
  }
  if (reviewResult.review !== undefined && isCalibrationSourceReviewV103(reviewResult.review)
    && sourceGeneration.sourceReviewSha256 !== calibrationAdmissionSourceReviewSha256(reviewResult.review)) {
    push(errors, `source ${sourceId} generation source-review hash is not bound to canonical review bytes`);
  }
  return sourceId;
}

/** Validate the complete byte-backed proposal → source/input → static → current graph. */
export function validatePrebuiltAdmissionAuthorityGraph(input: unknown): PrebuiltAdmissionAuthorityGraphValidation {
  try {
    const errors: string[] = [];
    if (!isRecord(input)) return result(['prebuilt authority graph input is not an object']);
    const hasPriorCurrent = input.priorCurrent !== undefined;
    const hasPriorCurrentBytes = input.priorCurrentBytes !== undefined;
    const expectedTopLevelKeys = [
      'current',
      'currentBytes',
      'inputGeneration',
      'inputGenerationBytes',
      'proposal',
      'proposalBytes',
      'sources',
      'staticGeneration',
      'staticGenerationBytes',
      ...(hasPriorCurrent ? ['priorCurrent'] : []),
      ...(hasPriorCurrentBytes ? ['priorCurrentBytes'] : []),
    ].sort();
    const actualTopLevelKeys = Object.keys(input).sort();
    if (actualTopLevelKeys.length !== expectedTopLevelKeys.length
      || actualTopLevelKeys.some((key, index) => key !== expectedTopLevelKeys[index])) {
      push(errors, 'prebuilt authority graph input has unexpected top-level keys');
    }
    if (hasPriorCurrent !== hasPriorCurrentBytes) {
      push(errors, 'prebuilt authority prior current and prior current bytes must be supplied together');
    }
    const proposal = isCalibrationAdmissionInputGenerationProposalV1(input.proposal) ? input.proposal : undefined;
    const inputGeneration = isCalibrationAdmissionInputGenerationV1(input.inputGeneration) ? input.inputGeneration : undefined;
    const staticGeneration = isCalibrationAdmissionStaticAuthorityGenerationV1(input.staticGeneration) ? input.staticGeneration : undefined;
    const current = isCalibrationAdmissionAuthorityCurrentV1(input.current) ? input.current : undefined;
    if (!proposal) push(errors, 'prebuilt authority proposal is invalid');
    if (!inputGeneration) push(errors, 'prebuilt authority input generation is invalid');
    if (!staticGeneration) push(errors, 'prebuilt authority static generation is invalid');
    if (!current) push(errors, 'prebuilt authority current pointer is invalid');
    if (input.priorCurrent !== undefined && !isCalibrationAdmissionAuthorityCurrentV1(input.priorCurrent)) {
      push(errors, 'prebuilt authority prior current pointer is invalid');
    }
    if (!proposal || !inputGeneration || !staticGeneration || !current) return result(errors);

    verifyCanonicalBytes(input.proposal, input.proposalBytes, 'proposal bytes', errors);
    verifyCanonicalBytes(input.inputGeneration, input.inputGenerationBytes, 'input generation bytes', errors);
    verifyCanonicalBytes(input.staticGeneration, input.staticGenerationBytes, 'static generation bytes', errors);
    verifyCanonicalBytes(input.current, input.currentBytes, 'current pointer bytes', errors);
    if (hasPriorCurrent) verifyCanonicalBytes(input.priorCurrent, input.priorCurrentBytes, 'prior current pointer bytes', errors);
    if (inputGeneration.generationSha256 !== calibrationAdmissionInputGenerationSha256(inputGeneration)) push(errors, 'input generation self-hash does not match canonical object');
    if (staticGeneration.generationSha256 !== calibrationAdmissionStaticAuthorityGenerationSha256(staticGeneration)) push(errors, 'static generation self-hash does not match canonical object');
    if (current.currentSha256 !== calibrationAdmissionAuthorityCurrentSha256(current)) push(errors, 'current pointer self-hash does not match canonical object');

    const staticGraph = validateCalibrationAdmissionStaticAuthorityGraphV1({
      proposal,
      inputGeneration,
      staticGeneration,
      priorCurrent: input.priorCurrent,
      current,
    });
    if (!staticGraph.ok) for (const error of staticGraph.errors) push(errors, error);

    const sourceInputs = input.sources;
    if (!Array.isArray(sourceInputs)) {
      push(errors, 'prebuilt authority sources must be an array');
      return result(errors);
    }
    if (sourceInputs.length !== inputGeneration.sourceGenerations.length) push(errors, 'prebuilt authority sources do not exactly cover input-generation sources');
    const sourceIds = new Set<string>();
    const sourceIdsInOrder: string[] = [];
    for (let index = 0; index < sourceInputs.length; index += 1) {
      const sourceId = verifySource(sourceInputs[index], index, inputGeneration, proposal, errors);
      if (sourceId !== undefined) {
        if (sourceIds.has(sourceId)) push(errors, `source ${sourceId} appears more than once`);
        sourceIds.add(sourceId);
        sourceIdsInOrder.push(sourceId);
      }
    }
    for (const source of inputGeneration.sourceGenerations) if (!sourceIds.has(source.sourceId)) push(errors, `input-generation source ${source.sourceId} has no byte-backed authority entry`);
    const expectedSourceIds = inputGeneration.sourceGenerations.map((source) => source.sourceId);
    if (sourceIdsInOrder.length === expectedSourceIds.length
      && sourceIdsInOrder.some((sourceId, index) => sourceId !== expectedSourceIds[index])) {
      push(errors, 'prebuilt authority source entries are not in input-generation order');
    }
    return result(errors);
  } catch {
    return result(['prebuilt authority graph validation failed closed']);
  }
}
