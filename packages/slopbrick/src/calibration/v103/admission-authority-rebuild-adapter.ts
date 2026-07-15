/**
 * Mutating Task 2B boundary for a prebuilt authority graph.
 *
 * The publisher owns the durable CAS transaction. This adapter resolves the
 * indexed overlap tool authority before the first mutation, wraps the
 * publisher's final durable boundary with a strict graph reopen, and performs
 * one defense-in-depth reopen after the transaction completes. It is a
 * fixture-scale library boundary, not a corpus builder or CLI.
 */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

import {
  calibrationAdmissionSha256,
} from '@usebrick/core';

import {
  resolveAdmissionToolAuthorityReceipt,
  type AdmissionToolAuthorityReceiptResolution,
} from './admission-publication';
import {
  publishPrebuiltAdmissionAuthority,
  recoverPrebuiltAdmissionAuthority,
  type PrebuiltAuthorityPublicationRecoveryRequest,
  type PrebuiltAuthorityPublicationRequest,
  type PrebuiltAuthorityPublicationResult,
} from './admission-authority-rebuild-publication';
import {
  loadPrebuiltAdmissionAuthorityGraph,
  type PrebuiltAdmissionAuthorityGraphLoadResult,
} from './admission-authority-rebuild-loader';
import {
  validatePrebuiltAdmissionAuthorityGraph,
  type PrebuiltAdmissionAuthorityGraphInput,
} from './admission-authority-rebuild';

export type PrebuiltAdmissionAuthorityToolAuthoritySelector = Readonly<{
  readonly authorityRoot: string;
  readonly authorityIndexSha256: string;
  readonly receiptId: string;
  readonly receiptSha256: string;
  readonly invocationIntentId: string;
  readonly profileId: 'admission-static-ledgers-v1';
  readonly action: 'authority:overlap';
  readonly outputSetSha256: string;
}>;

export type PrebuiltAdmissionAuthorityGraphRead = Readonly<{
  /** Exact contained prior-current object path for replace verification. */
  readonly priorCurrentPath?: string;
}>;

export type PrebuiltAdmissionAuthorityRebuildAdapterRequest = Readonly<{
  /** Publication input without caller-supplied hash-only tool receipt metadata. */
  readonly publication: Omit<PrebuiltAuthorityPublicationRequest, 'toolReceipt'>;
  /** The adapter is candidate-aware: genesis sources may be sidecar-free, but every independent-review source must carry its semantic sibling. */
  readonly sourceAuthorityMode: 'candidate-aware';
  readonly toolAuthority: PrebuiltAdmissionAuthorityToolAuthoritySelector;
  readonly graphRead?: PrebuiltAdmissionAuthorityGraphRead;
}>;

export type PrebuiltAdmissionAuthorityRecoveryAdapterRequest = Readonly<{
  readonly publication: Omit<PrebuiltAuthorityPublicationRecoveryRequest, 'toolReceipt'>;
  readonly sourceAuthorityMode: 'candidate-aware';
  readonly toolAuthority: PrebuiltAdmissionAuthorityToolAuthoritySelector;
  readonly graphRead?: PrebuiltAdmissionAuthorityGraphRead;
}>;

export type PrebuiltAdmissionAuthorityRebuildAdapterResult = Readonly<{
  readonly publication: PrebuiltAuthorityPublicationResult;
  readonly graph: PrebuiltAdmissionAuthorityGraphInput;
  /** Full raw-byte commitment to the reopened graph, not just semantic IDs. */
  readonly verificationSha256: string;
  /** False for a valid lock-only cleanup where no graph was published. */
  readonly durableGraphVerified: boolean;
  readonly toolAuthority: Readonly<{
    readonly authorityIndexSha256: string;
    readonly receiptId: string;
    readonly receiptSha256: string;
    readonly invocationIntentId: string;
    readonly outputSetSha256: string;
  }>;
}>;

export class PrebuiltAuthorityRebuildVerificationError extends Error {
  readonly publication: PrebuiltAuthorityPublicationResult;
  readonly errors: readonly string[];

  constructor(publication: PrebuiltAuthorityPublicationResult, errors: readonly string[]) {
    super(`prebuilt authority post-publication verification failed: ${errors.join('; ')}`);
    this.name = 'PrebuiltAuthorityRebuildVerificationError';
    this.publication = publication;
    this.errors = [...new Set(errors)];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const SHA256 = /^[a-f0-9]{64}$/u;

function assertToolAuthoritySelector(value: unknown): asserts value is PrebuiltAdmissionAuthorityToolAuthoritySelector {
  if (!isRecord(value)) throw new Error('prebuilt authority adapter tool-authority selector is invalid');
  const expectedKeys = [
    'action', 'authorityIndexSha256', 'authorityRoot', 'invocationIntentId',
    'outputSetSha256', 'profileId', 'receiptId', 'receiptSha256',
  ].sort();
  const actualKeys = Object.keys(value).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error('prebuilt authority adapter tool-authority selector keys are invalid');
  }
  if (typeof value.authorityRoot !== 'string' || value.authorityRoot.length === 0
    || typeof value.authorityIndexSha256 !== 'string' || !SHA256.test(value.authorityIndexSha256)
    || typeof value.receiptId !== 'string' || !SHA256.test(value.receiptId)
    || typeof value.receiptSha256 !== 'string' || !SHA256.test(value.receiptSha256)
    || typeof value.invocationIntentId !== 'string' || !SHA256.test(value.invocationIntentId)
    || value.profileId !== 'admission-static-ledgers-v1'
    || value.action !== 'authority:overlap'
    || typeof value.outputSetSha256 !== 'string' || !SHA256.test(value.outputSetSha256)) {
    throw new Error('prebuilt authority adapter tool-authority selector values are invalid');
  }
}

function rootFor(request: Readonly<{ readonly root?: string; readonly projectRoot?: string }>): string {
  const root = request.root ?? request.projectRoot;
  if (root === undefined) throw new Error('prebuilt authority adapter root is required');
  return root;
}

function assertContainedReadPath(root: string, requested: string, label: string): void {
  if (typeof requested !== 'string' || requested.length === 0 || requested.includes('\u0000') || requested.includes('\\')) {
    throw new Error(`prebuilt authority adapter ${label} is invalid`);
  }
  if (requested.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`prebuilt authority adapter ${label} contains unsafe traversal`);
  }
  const candidate = resolve(root, requested);
  const admissionRoot = resolve(root, 'review/admission');
  const child = relative(admissionRoot, candidate);
  if (child === '' || child === '..' || child.startsWith(`..${sep}`) || child.startsWith('/') || child.includes('\\')) {
    throw new Error(`prebuilt authority adapter ${label} escapes the admission root`);
  }
}

async function readContainedEvidence(root: string, requested: string, label: string): Promise<Buffer> {
  const candidate = resolve(root, requested);
  const parts = relative(root, candidate).split(sep).filter(Boolean);
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) throw new Error(`prebuilt authority adapter ${label} is a symlink`);
    if (index < parts.length - 1 && !metadata.isDirectory()) throw new Error(`prebuilt authority adapter ${label} has a non-directory parent`);
  }
  const handle = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function assertPriorCurrentEvidenceBeforeMutation(
  publication: Readonly<{ readonly root?: string; readonly projectRoot?: string }>,
  graph: PrebuiltAdmissionAuthorityGraphInput,
  graphRead: PrebuiltAdmissionAuthorityGraphRead | undefined,
): Promise<void> {
  if (graphRead?.priorCurrentPath !== undefined && graph.priorCurrentBytes === undefined) {
    throw new Error('prebuilt authority adapter prior-current path requires replace evidence');
  }
  if (graph.priorCurrentBytes === undefined) return;
  const priorCurrentPath = graphRead?.priorCurrentPath;
  if (priorCurrentPath === undefined) throw new Error('prebuilt authority adapter replace graph requires an explicit prior-current path');
  const bytes = await readContainedEvidence(rootFor(publication), priorCurrentPath, 'prior-current evidence');
  if (!Buffer.from(bytes).equals(Buffer.from(graph.priorCurrentBytes))) {
    throw new Error('prebuilt authority adapter prior-current evidence bytes differ from the publication graph');
  }
}

function graphPaths(
  publication: Readonly<{ readonly root?: string; readonly projectRoot?: string }>,
  graph: PrebuiltAdmissionAuthorityGraphInput,
  graphRead: PrebuiltAdmissionAuthorityGraphRead | undefined,
): { readonly projectRoot: string; readonly proposalPath: string; readonly inputGenerationPath: string; readonly priorCurrentPath?: string } {
  const proposal = graph.proposal;
  const inputGeneration = graph.inputGeneration;
  if (!isRecord(proposal) || typeof proposal.proposalId !== 'string') throw new Error('prebuilt authority adapter proposal ID is invalid');
  if (!isRecord(inputGeneration) || typeof inputGeneration.generationSha256 !== 'string') throw new Error('prebuilt authority adapter input-generation hash is invalid');
  const priorCurrentPath = graphRead?.priorCurrentPath;
  if (isRecord(graph.priorCurrent) && graph.priorCurrentBytes !== undefined && priorCurrentPath === undefined) {
    throw new Error('prebuilt authority adapter replace graph requires an explicit prior-current path');
  }
  if (priorCurrentPath !== undefined) assertContainedReadPath(rootFor(publication), priorCurrentPath, 'prior-current path');
  return {
    projectRoot: rootFor(publication),
    proposalPath: `review/admission/authority/proposals/${proposal.proposalId}.json`,
    inputGenerationPath: `review/admission/authority/input-generations/${inputGeneration.generationSha256}/generation.json`,
    ...(priorCurrentPath === undefined ? {} : { priorCurrentPath }),
  };
}

function bytesEntries(value: unknown, label: string): readonly { readonly path: string; readonly bytes: Uint8Array }[] {
  const entries: { readonly path: string; readonly bytes: Uint8Array }[] = [];
  if (isRecord(value)) {
    for (const [path, raw] of Object.entries(value)) {
      if (!(raw instanceof Uint8Array)) throw new Error(`${label} bytes are invalid`);
      entries.push({ path, bytes: raw });
    }
  } else if (Array.isArray(value)) {
    for (const entry of value) {
      if (!isRecord(entry) || typeof entry.relativePath !== 'string' || !(entry.bytes instanceof Uint8Array)) throw new Error(`${label} bytes are invalid`);
      entries.push({ path: entry.relativePath, bytes: entry.bytes });
    }
  } else {
    throw new Error(`${label} bytes are invalid`);
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function equalBytes(label: string, expected: Uint8Array | undefined, actual: Uint8Array | undefined): void {
  if (expected === undefined || actual === undefined || !Buffer.from(expected).equals(Buffer.from(actual))) {
    throw new Error(`reopened authority ${label} bytes differ from the publication graph`);
  }
}

function equalOptionalBytes(label: string, expected: Uint8Array | undefined, actual: Uint8Array | undefined): void {
  if ((expected === undefined) !== (actual === undefined)) throw new Error(`reopened authority ${label} presence differs from the publication graph`);
  if (expected !== undefined && actual !== undefined) equalBytes(label, expected, actual);
}

function equalArtifactMaps(label: string, expected: unknown, actual: unknown): void {
  const left = bytesEntries(expected, `${label} expected`);
  const right = bytesEntries(actual, `${label} actual`);
  if (left.length !== right.length) throw new Error(`reopened authority ${label} artifact count differs from the publication graph`);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index]!.path !== right[index]!.path) throw new Error(`reopened authority ${label} artifact paths differ from the publication graph`);
    equalBytes(`${label}/${left[index]!.path}`, left[index]!.bytes, right[index]!.bytes);
  }
}

function sourceId(source: PrebuiltAdmissionAuthorityGraphInput['sources'][number]): string {
  if (!isRecord(source.sourceGeneration) || typeof source.sourceGeneration.sourceId !== 'string') throw new Error('publication graph source ID is invalid');
  return source.sourceGeneration.sourceId;
}

/** Compare every object and declared artifact byte, not only self-hash IDs. */
function assertGraphEquivalent(expected: PrebuiltAdmissionAuthorityGraphInput, actual: PrebuiltAdmissionAuthorityGraphInput): void {
  equalBytes('proposal', expected.proposalBytes, actual.proposalBytes);
  equalBytes('input generation', expected.inputGenerationBytes, actual.inputGenerationBytes);
  equalBytes('current pointer', expected.currentBytes, actual.currentBytes);
  equalBytes('static generation', expected.staticGenerationBytes, actual.staticGenerationBytes);
  equalOptionalBytes('prior current', expected.priorCurrentBytes, actual.priorCurrentBytes);
  equalArtifactMaps('input generation', expected.inputGenerationArtifactBytes, actual.inputGenerationArtifactBytes);
  equalArtifactMaps('static generation', expected.staticGenerationArtifactBytes, actual.staticGenerationArtifactBytes);
  const expectedSources = [...expected.sources].sort((left, right) => sourceId(left).localeCompare(sourceId(right)));
  const actualSources = [...actual.sources].sort((left, right) => sourceId(left).localeCompare(sourceId(right)));
  if (expectedSources.length !== actualSources.length) throw new Error('reopened authority source count differs from the publication graph');
  for (let index = 0; index < expectedSources.length; index += 1) {
    const left = expectedSources[index]!;
    const right = actualSources[index]!;
    if (sourceId(left) !== sourceId(right)) throw new Error('reopened authority source IDs differ from the publication graph');
    equalBytes(`source ${sourceId(left)} current`, left.currentBytes, right.currentBytes);
    equalBytes(`source ${sourceId(left)} generation`, left.sourceGenerationBytes, right.sourceGenerationBytes);
    equalBytes(`source ${sourceId(left)} review`, left.sourceReviewBytes, right.sourceReviewBytes);
    equalArtifactMaps(`source ${sourceId(left)}`, left.artifactBytes, right.artifactBytes);
    equalOptionalBytes(`source ${sourceId(left)} proposal`, left.sourceProposalBytes, right.sourceProposalBytes);
    equalOptionalBytes(`source ${sourceId(left)} approval`, left.approvalBytes, right.approvalBytes);
    equalOptionalBytes(`source ${sourceId(left)} semantic authority`, left.semanticAuthorityBytes, right.semanticAuthorityBytes);
  }
}

function graphProof(graph: PrebuiltAdmissionAuthorityGraphInput): string {
  const objectBytes: [string, Uint8Array][] = [
    ['proposal', graph.proposalBytes],
    ['input-generation', graph.inputGenerationBytes],
    ['static-generation', graph.staticGenerationBytes],
    ['current', graph.currentBytes],
  ];
  if (graph.priorCurrentBytes !== undefined) objectBytes.push(['prior-current', graph.priorCurrentBytes]);
  const objectProof = objectBytes.map(([label, bytes]) => ({ label, bytes: hashBytes(bytes), length: bytes.byteLength }));
  const sourceBytes = [...graph.sources].sort((left, right) => sourceId(left).localeCompare(sourceId(right))).map((source) => ({
    sourceId: sourceId(source),
    current: { sha256: hashBytes(source.currentBytes), length: source.currentBytes.byteLength },
    generation: { sha256: hashBytes(source.sourceGenerationBytes), length: source.sourceGenerationBytes.byteLength },
    review: { sha256: hashBytes(source.sourceReviewBytes), length: source.sourceReviewBytes.byteLength },
    artifacts: bytesEntries(source.artifactBytes, `source ${sourceId(source)}`).map((entry) => ({ path: entry.path, sha256: hashBytes(entry.bytes), length: entry.bytes.byteLength })),
    ...(source.sourceProposalBytes === undefined ? {} : { proposal: { sha256: hashBytes(source.sourceProposalBytes), length: source.sourceProposalBytes.byteLength } }),
    ...(source.approvalBytes === undefined ? {} : { approval: { sha256: hashBytes(source.approvalBytes), length: source.approvalBytes.byteLength } }),
    ...(source.semanticAuthorityBytes === undefined ? {} : { semanticAuthority: { sha256: hashBytes(source.semanticAuthorityBytes), length: source.semanticAuthorityBytes.byteLength } }),
  }));
  return calibrationAdmissionSha256({
    objectBytes: objectProof,
    inputArtifacts: bytesEntries(graph.inputGenerationArtifactBytes, 'input generation').map((entry) => ({ path: entry.path, sha256: hashBytes(entry.bytes), length: entry.bytes.byteLength })),
    staticArtifacts: bytesEntries(graph.staticGenerationArtifactBytes, 'static generation').map((entry) => ({ path: entry.path, sha256: hashBytes(entry.bytes), length: entry.bytes.byteLength })),
    sourceBytes,
  });
}

function publicationToolReceipt(resolution: AdmissionToolAuthorityReceiptResolution) {
  return {
    receiptId: resolution.receipt.receiptId,
    receiptSha256: resolution.receiptSha256,
    authorityIndexSha256: resolution.authorityIndexSha256,
    primaryOutputSetSha256: resolution.receipt.outputSetSha256,
  };
}

async function prepare(
  request: PrebuiltAdmissionAuthorityRebuildAdapterRequest | PrebuiltAdmissionAuthorityRecoveryAdapterRequest,
): Promise<{
  readonly publication: PrebuiltAuthorityPublicationRequest | PrebuiltAuthorityPublicationRecoveryRequest;
  readonly graphRead: PrebuiltAdmissionAuthorityGraphRead | undefined;
  readonly resolution: AdmissionToolAuthorityReceiptResolution;
}> {
  assertToolAuthoritySelector(request.toolAuthority);
  if (request.sourceAuthorityMode !== 'candidate-aware') throw new Error('prebuilt authority adapter source-authority mode is invalid');
  const graph = request.publication.graph;
  const graphValidation = validatePrebuiltAdmissionAuthorityGraph(graph);
  if (!graphValidation.ok) throw new Error(graphValidation.errors.join('; '));
  const staticGeneration = graph.staticGeneration;
  if (!isRecord(staticGeneration) || !isRecord(staticGeneration.toolAuthoritySnapshot)) throw new Error('publication graph static tool-authority snapshot is invalid');
  const resolution = await resolveAdmissionToolAuthorityReceipt({
    authorityRoot: request.toolAuthority.authorityRoot,
    authorityIndexSha256: request.toolAuthority.authorityIndexSha256,
    receiptId: request.toolAuthority.receiptId,
    receiptSha256: request.toolAuthority.receiptSha256,
    invocationIntentId: request.toolAuthority.invocationIntentId,
    profileId: request.toolAuthority.profileId,
    action: request.toolAuthority.action,
    outputSetSha256: request.toolAuthority.outputSetSha256,
    expectedSnapshot: staticGeneration.toolAuthoritySnapshot,
  });
  const graphRead = request.graphRead;
  graphPaths(request.publication, graph, graphRead);
  await assertPriorCurrentEvidenceBeforeMutation(request.publication, graph, graphRead);
  // For candidate sources, requireSourceProposalBytes also requires the
  // semantic sibling in the strict loader. Genesis-quarantine sources remain
  // intentionally sidecar-free; mixed graphs are supported.
  const originalPhaseHook = request.publication.phaseHook;
  const verifier = async (): Promise<void> => {
    const reopened = await reopenCommittedGraph(request.publication, graph, graphRead);
    assertGraphEquivalent(graph, reopened.graph);
  };
  const phaseHook = async (phase: Parameters<NonNullable<typeof originalPhaseHook>>[0]): Promise<void> => {
    await originalPhaseHook?.(phase);
    if (phase === 'complete') await verifier();
  };
  const publication = {
    ...request.publication,
    toolReceipt: publicationToolReceipt(resolution),
    phaseHook,
  } as PrebuiltAuthorityPublicationRequest | PrebuiltAuthorityPublicationRecoveryRequest;
  return { publication, graphRead, resolution };
}

async function reopenCommittedGraph(
  publication: Readonly<{ readonly root?: string; readonly projectRoot?: string }>,
  graph: PrebuiltAdmissionAuthorityGraphInput,
  graphRead: PrebuiltAdmissionAuthorityGraphRead | undefined,
): Promise<{ readonly graph: PrebuiltAdmissionAuthorityGraphInput; readonly verificationSha256: string }> {
  const paths = graphPaths(publication, graph, graphRead);
  const loaded: PrebuiltAdmissionAuthorityGraphLoadResult = await loadPrebuiltAdmissionAuthorityGraph({
    projectRoot: paths.projectRoot,
    proposalPath: paths.proposalPath,
    inputGenerationPath: paths.inputGenerationPath,
    ...(paths.priorCurrentPath === undefined ? {} : { priorCurrentPath: paths.priorCurrentPath }),
    requireSourceProposalBytes: true,
  });
  if (!loaded.ok) throw new Error(loaded.errors.join('; '));
  assertGraphEquivalent(graph, loaded.graph);
  return { graph: loaded.graph, verificationSha256: graphProof(loaded.graph) };
}

function result(
  publication: PrebuiltAuthorityPublicationResult,
  reopened: { readonly graph: PrebuiltAdmissionAuthorityGraphInput; readonly verificationSha256: string },
  resolution: AdmissionToolAuthorityReceiptResolution,
): PrebuiltAdmissionAuthorityRebuildAdapterResult {
  return {
    publication,
    ...reopened,
    durableGraphVerified: true,
    toolAuthority: {
      authorityIndexSha256: resolution.authorityIndexSha256,
      receiptId: resolution.receipt.receiptId,
      receiptSha256: resolution.receiptSha256,
      invocationIntentId: resolution.invocationIntent.intentId,
      outputSetSha256: resolution.receipt.outputSetSha256,
    },
  };
}

/** Publish a graph and verify the exact committed bytes before returning. */
export async function rebuildPrebuiltAdmissionAuthority(
  request: PrebuiltAdmissionAuthorityRebuildAdapterRequest,
): Promise<PrebuiltAdmissionAuthorityRebuildAdapterResult> {
  const prepared = await prepare(request);
  // Pending publication errors intentionally escape unchanged so the caller
  // retains the transaction identity and can invoke the recovery adapter.
  const publication = await publishPrebuiltAdmissionAuthority(prepared.publication);
  if (!publication.complete) throw new Error('prebuilt authority publication did not complete');
  try {
    return result(publication, await reopenCommittedGraph(prepared.publication, request.publication.graph, prepared.graphRead), prepared.resolution);
  } catch (error) {
    throw new PrebuiltAuthorityRebuildVerificationError(publication, [error instanceof Error ? error.message : String(error)]);
  }
}

/** Recover a graph transaction and verify the exact committed bytes. */
export async function recoverPrebuiltAdmissionAuthorityWithVerification(
  request: PrebuiltAdmissionAuthorityRecoveryAdapterRequest,
): Promise<PrebuiltAdmissionAuthorityRebuildAdapterResult> {
  const prepared = await prepare(request);
  const publication = await recoverPrebuiltAdmissionAuthority(prepared.publication as PrebuiltAuthorityPublicationRecoveryRequest);
  if (!publication.complete) throw new Error('prebuilt authority recovery did not complete');
  if (publication.status === 'lock-only') {
    // A lock-only journal means the writer stopped before creating the
    // transaction. Recovery intentionally removes only that owned lock; no
    // durable graph exists to reopen, so report the cleanup as diagnostic
    // rather than manufacturing a persisted-graph verification claim.
    return {
      publication,
      graph: request.publication.graph,
      verificationSha256: graphProof(request.publication.graph),
      durableGraphVerified: false,
      toolAuthority: {
        authorityIndexSha256: prepared.resolution.authorityIndexSha256,
        receiptId: prepared.resolution.receipt.receiptId,
        receiptSha256: prepared.resolution.receiptSha256,
        invocationIntentId: prepared.resolution.invocationIntent.intentId,
        outputSetSha256: prepared.resolution.receipt.outputSetSha256,
      },
    };
  }
  try {
    return result(publication, await reopenCommittedGraph(prepared.publication, request.publication.graph, prepared.graphRead), prepared.resolution);
  } catch (error) {
    throw new PrebuiltAuthorityRebuildVerificationError(publication, [error instanceof Error ? error.message : String(error)]);
  }
}
