/** Offline-only v10.3 admission commands. */
import { createReadStream } from 'node:fs';
import { lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import { calibrationAdmissionCanonicalJson } from '@usebrick/core';
import { buildVerifiedAdmissionEvidenceContext } from '../../src/calibration/v103/admission-evidence-context';
import { buildAdmissionSourceCensus } from '../../src/calibration/v103/admission-source-census';
import { buildAdmissionSearchResultBundleFromCandidates, buildAdmissionCensus, computeAdmissionEligibilitySnapshotSha256 } from '../../src/calibration/v103/admission-census';
import { projectEligibleWitnessCandidates } from '../../src/calibration/v103/admission-cohort-witness';
import {
  AdmissionWitnessPublicationContendedError,
  AdmissionWitnessPublicationPendingError,
  publishAdmissionWitness,
  recoverAdmissionWitnessPublication,
} from '../../src/calibration/v103/admission-witness-publication';
import { requireContainedAdmissionPath } from '../../src/calibration/v103/admission-path';
import {
  PrebuiltAuthorityRebuildVerificationError,
  rebuildPrebuiltAdmissionAuthority,
  recoverPrebuiltAdmissionAuthorityWithVerification,
} from '../../src/calibration/v103/admission-authority-rebuild-adapter';
import { loadPrebuiltAdmissionAuthorityGraph } from '../../src/calibration/v103/admission-authority-rebuild-loader';
import { materializePrebuiltAdmissionAuthority } from '../../src/calibration/v103/admission-authority-materializer';
import { PrebuiltAuthorityPublicationPendingError } from '../../src/calibration/v103/admission-authority-rebuild-publication';
import type { PrebuiltAdmissionAuthorityGraphInput } from '../../src/calibration/v103/admission-authority-rebuild';
import type { PrebuiltAdmissionAuthorityPublicationPlanInput } from '../../src/calibration/v103/admission-authority-publication-plan';
import {
  AcquisitionPublicationPendingError,
  publishAdmissionToolInvocationIntent,
  publishAdmissionToolReceipt,
  publishAcquisitionPublication,
  recoverAcquisitionPublication,
  recoverToolAuthorityPublication,
  resolveAdmissionToolAuthorityReceipt,
} from '../../src/calibration/v103/admission-publication';
import {
  RegisterPublicationPendingError,
  publishRegisterGeneration,
  recoverRegisterGeneration,
} from '../../src/calibration/v103/admission-register-publication';
import { buildAdmissionOverlapLedger } from '../../src/calibration/v103/admission-overlap';
import { openAdmissionOverlapUniverseStream } from '../../src/calibration/v103/admission-overlap-stream';
import {
  OverlapPublicationContendedError,
  OverlapPublicationPendingError,
  OverlapPublicationPostCompletionError,
  publishAdmissionOverlap,
  recoverAdmissionOverlap,
  verifyAdmissionOverlap,
} from '../../src/calibration/v103/admission-overlap-publication';
import {
  materializeAdmissionSmokeInputGeneration,
  type AdmissionSmokeInputMaterializerRequestV1,
} from '../../src/calibration/v103/admission-smoke-input-materializer';

function output(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

/** Emit a machine result with Core's deterministic JSON key ordering. */
function outputCanonical(value: unknown): void {
  process.stdout.write(`${calibrationAdmissionCanonicalJson(value)}\n`);
}

function toolAuthorityRootFor(root: string): string {
  return /(?:^|[\\/])review[\\/]admission[\\/]?$/.test(root)
    ? join(root, 'tool-authority')
    : join(root, 'review', 'admission', 'tool-authority');
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} is not an object`);
  return value as Record<string, unknown>;
}

function outerPlanInput(
  args: ParsedArguments,
  graph: PrebuiltAdmissionAuthorityGraphInput,
): PrebuiltAdmissionAuthorityPublicationPlanInput {
  const proposal = record(graph.proposal, 'input-generation proposal');
  const inputGeneration = record(graph.inputGeneration, 'input generation');
  const staticGeneration = record(graph.staticGeneration, 'static generation');
  const operation = args.operation ?? (proposal.operation === 'create' || proposal.operation === 'replace' ? proposal.operation : undefined);
  if (operation === undefined) throw new Error('authority graph proposal operation is invalid');
  if (args.operation !== undefined && proposal.operation !== args.operation) throw new Error('CLI --operation does not match input-generation proposal');
  const proposalId = proposal.proposalId;
  const proposalSha256 = proposal.proposalSha256;
  if (typeof proposalId !== 'string' || typeof proposalSha256 !== 'string') throw new Error('authority graph proposal identity is invalid');
  const generation = inputGeneration.generation;
  const generationSha256 = inputGeneration.generationSha256;
  const staticNumber = staticGeneration.generation;
  const staticSha256 = staticGeneration.generationSha256;
  if (typeof generation !== 'number' || !Number.isSafeInteger(generation) || typeof generationSha256 !== 'string'
    || typeof staticNumber !== 'number' || !Number.isSafeInteger(staticNumber) || typeof staticSha256 !== 'string') {
    throw new Error('authority graph generation metadata is invalid');
  }
  const priorCurrent = graph.priorCurrent === undefined ? undefined : record(graph.priorCurrent, 'prior current');
  const expectedStaticSha256 = args.expectedCurrentStaticGenerationSha256
    ?? (typeof priorCurrent?.staticGenerationSha256 === 'string' ? priorCurrent.staticGenerationSha256 : undefined)
    ?? (typeof staticGeneration.parentStaticGenerationSha256 === 'string' ? staticGeneration.parentStaticGenerationSha256 : undefined);
  if (operation === 'replace' && expectedStaticSha256 === undefined) throw new Error('replace authority graph requires expected current static-generation hash');
  const parentInputSha256 = inputGeneration.parentInputGenerationSha256;
  if (operation === 'replace' && (typeof parentInputSha256 !== 'string' || generation < 1)) {
    throw new Error('replace authority graph requires a prior input-generation hash');
  }
  const sources = graph.sources.map((source) => {
    const sourceGeneration = record(source.sourceGeneration, 'source generation');
    if (typeof sourceGeneration.sourceId !== 'string' || typeof sourceGeneration.generationSha256 !== 'string' || typeof sourceGeneration.artifactSetSha256 !== 'string') {
      throw new Error('authority graph source generation metadata is invalid');
    }
    return {
      sourceId: sourceGeneration.sourceId,
      generationSha256: sourceGeneration.generationSha256,
      artifactSetSha256: sourceGeneration.artifactSetSha256,
      ...(typeof sourceGeneration.parentGenerationSha256 === 'string' ? { priorGenerationSha256: sourceGeneration.parentGenerationSha256 } : {}),
    };
  });
  const plan: PrebuiltAdmissionAuthorityPublicationPlanInput = {
    operation,
    invocationIntentId: args.invocationIntentId!,
    inputGenerationProposalId: proposalId,
    inputGenerationProposalSha256: proposalSha256,
    expectedCurrentState: operation === 'create'
      ? { kind: 'absent' }
      : { kind: 'existing', staticGenerationSha256: expectedStaticSha256! },
    inputGeneration: {
      generation,
      generationSha256,
      ...(typeof parentInputSha256 === 'string' ? { parentInputGenerationSha256: parentInputSha256 } : {}),
    },
    staticGeneration: {
      generation: staticNumber,
      generationSha256: staticSha256,
      ...(typeof staticGeneration.parentStaticGenerationSha256 === 'string' ? { parentStaticGenerationSha256: staticGeneration.parentStaticGenerationSha256 } : {}),
    },
    sources,
    ...(operation === 'replace'
      ? { priorInputGeneration: { generation: generation - 1, generationSha256: parentInputSha256! } }
      : {}),
    ...(args.recoveryNonce === undefined ? {} : { recoveryNonce: args.recoveryNonce }),
  };
  return plan;
}

function outerToolAuthority(args: ParsedArguments): {
  readonly authorityRoot: string;
  readonly authorityIndexSha256: string;
  readonly receiptId: string;
  readonly receiptSha256: string;
  readonly invocationIntentId: string;
  readonly profileId: 'admission-static-ledgers-v1';
  readonly action: 'authority:overlap';
  readonly outputSetSha256: string;
} {
  return {
    authorityRoot: toolAuthorityRootFor(args.root!),
    authorityIndexSha256: args.toolAuthorityIndexSha256!,
    receiptId: args.toolReceiptId!,
    receiptSha256: args.toolReceiptSha256!,
    invocationIntentId: args.invocationIntentId!,
    profileId: 'admission-static-ledgers-v1',
    action: 'authority:overlap',
    outputSetSha256: args.outputSetSha256!,
  };
}

function outerResult(command: string, result: Awaited<ReturnType<typeof rebuildPrebuiltAdmissionAuthority>>) {
  return {
    ok: true,
    command,
    complete: result.publication.complete,
    recoveryRequired: result.publication.recoveryRequired,
    status: result.publication.status,
    transactionId: result.publication.transactionId,
    recoveryNonce: result.publication.recoveryNonce,
    generationSha256: result.publication.generationSha256,
    lockPath: result.publication.lockPath,
    transactionPath: result.publication.transactionPath,
    currentPath: result.publication.currentPath,
    verificationSha256: result.verificationSha256,
    authorityIndexSha256: result.toolAuthority.authorityIndexSha256,
    receiptId: result.toolAuthority.receiptId,
    receiptSha256: result.toolAuthority.receiptSha256,
    invocationIntentId: result.toolAuthority.invocationIntentId,
    outputSetSha256: result.toolAuthority.outputSetSha256,
    realScaleReceiptVerified: false,
    authorityScope: 'prebuilt-diagnostic',
    durableGraphVerified: result.durableGraphVerified,
    ready: false,
    authorityEligible: false,
    diagnosticOnly: true,
  };
}

async function readCanonicalOuterInput(root: string, requested: string, label: string): Promise<{ readonly value: unknown; readonly bytes: Buffer }> {
  const containedPath = await requireContainedAdmissionPath(root, requested);
  const metadata = await lstat(containedPath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`${label} must be a regular file`);
  const bytes = await readFile(containedPath);
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (calibrationAdmissionCanonicalJson(value) !== bytes.toString('utf8')) {
    throw new Error(`${label} is not exact canonical JSON`);
  }
  return { value, bytes };
}

/**
 * The smoke-input CLI is intentionally a path loader, not a discovery tool.
 * Every path comes from one caller-supplied, canonical manifest and is
 * resolved through the same root-contained/symlink-aware guard used by the
 * other admission commands.  The manifest carries no authority by itself;
 * the materializer always returns a diagnostic-only generation.
 */
interface AdmissionSmokeInputManifestV1 {
  readonly version: 'v10.3-admission-smoke-input-manifest-v1';
  readonly outputDirectory: string;
  readonly transactionId: string;
  readonly proposalId: string;
  readonly evidenceBundleSha256: string;
  readonly registerDeltaPath: string;
  readonly recordsPath: string;
  readonly overlapUniversePath: string;
  readonly normalizerRegistryPath: string;
  readonly overlapUniverseRecordsPath: string;
  readonly sources: readonly {
    readonly sourceId: string;
    readonly sourceGenerationPath: string;
    readonly sourceProposalPath: string;
    readonly approvalPath: string;
    readonly sourceReviewPath: string;
    readonly semanticAuthorityPath: string;
  }[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function manifestPath(value: unknown, label: string, allowCurrentDirectory = false): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096 || value.startsWith('/') || value.includes('\\')
    || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${label} must be a non-empty root-relative path`);
  }
  const parts = value.split('/');
  if (parts.some((part) => part.length === 0 || part === '..' || (part === '.' && !(allowCurrentDirectory && value === '.')))) {
    throw new Error(`${label} must be a canonical root-relative path`);
  }
  return value;
}

function manifestString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} is invalid`);
  return value;
}

function smokeManifest(value: unknown): AdmissionSmokeInputManifestV1 {
  if (!isObject(value) || value.version !== 'v10.3-admission-smoke-input-manifest-v1') {
    throw new Error('smoke input manifest version is invalid');
  }
  if (!Array.isArray(value.sources) || value.sources.length !== 2) {
    throw new Error('smoke input manifest requires exactly two sources');
  }
  const sources = value.sources.map((candidate, index) => {
    if (!isObject(candidate)) throw new Error(`smoke input manifest source ${index} is invalid`);
    return {
      sourceId: manifestString(candidate.sourceId, `smoke input manifest source ${index} id`),
      sourceGenerationPath: manifestPath(candidate.sourceGenerationPath, `source ${index} generation`),
      sourceProposalPath: manifestPath(candidate.sourceProposalPath, `source ${index} proposal`),
      approvalPath: manifestPath(candidate.approvalPath, `source ${index} approval`),
      sourceReviewPath: manifestPath(candidate.sourceReviewPath, `source ${index} review`),
      semanticAuthorityPath: manifestPath(candidate.semanticAuthorityPath, `source ${index} semantic authority`),
    };
  });
  return {
    version: value.version,
    // `.` is the canonical spelling for the explicit root itself; all other
    // manifest paths must contain no dot/empty segments or control bytes.
    outputDirectory: manifestPath(value.outputDirectory, 'output directory', true),
    transactionId: manifestString(value.transactionId, 'smoke input manifest transaction id'),
    proposalId: manifestString(value.proposalId, 'smoke input manifest proposal id'),
    evidenceBundleSha256: manifestString(value.evidenceBundleSha256, 'smoke input manifest evidence bundle hash'),
    registerDeltaPath: manifestPath(value.registerDeltaPath, 'register delta'),
    recordsPath: manifestPath(value.recordsPath, 'admission records'),
    overlapUniversePath: manifestPath(value.overlapUniversePath, 'overlap universe'),
    normalizerRegistryPath: manifestPath(value.normalizerRegistryPath, 'normalizer registry'),
    overlapUniverseRecordsPath: manifestPath(value.overlapUniverseRecordsPath, 'overlap universe records'),
    sources,
  };
}

async function readRawContained(root: string, requested: string, label: string): Promise<Buffer> {
  try {
    const containedPath = await requireContainedAdmissionPath(root, requested);
    const metadata = await lstat(containedPath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`${label} must be a regular file`);
    return await readFile(containedPath);
  } catch (error: unknown) {
    throw new Error(`${label} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function loadSmokeInputManifest(root: string, requested: string): Promise<AdmissionSmokeInputMaterializerRequestV1> {
  const manifestInput = await readCanonicalOuterInput(root, manifestPath(requested, 'smoke input manifest'), 'smoke input manifest');
  const manifest = smokeManifest(manifestInput.value);
  const readObject = async (path: string, label: string): Promise<{ readonly value: unknown; readonly bytes: Buffer }> => {
    return readCanonicalOuterInput(root, path, label);
  };
  const registerDelta = await readObject(manifest.registerDeltaPath, 'register delta');
  const overlapUniverse = await readObject(manifest.overlapUniversePath, 'overlap universe');
  const normalizerRegistry = await readObject(manifest.normalizerRegistryPath, 'normalizer registry');
  const records = await readRawContained(root, manifest.recordsPath, 'admission records');
  const overlapUniverseRecords = await readRawContained(root, manifest.overlapUniverseRecordsPath, 'overlap universe records');
  const sources = await Promise.all(manifest.sources.map(async (source) => {
    const generation = await readObject(source.sourceGenerationPath, `source ${source.sourceId} generation`);
    const proposal = await readObject(source.sourceProposalPath, `source ${source.sourceId} proposal`);
    const approval = await readObject(source.approvalPath, `source ${source.sourceId} approval`);
    const sourceReviewBytes = await readRawContained(root, source.sourceReviewPath, `source ${source.sourceId} review`);
    const semanticAuthority = await readObject(source.semanticAuthorityPath, `source ${source.sourceId} semantic authority`);
    return {
      sourceId: source.sourceId,
      sourceGeneration: generation.value,
      sourceGenerationBytes: generation.bytes,
      sourceProposal: proposal.value,
      sourceProposalBytes: proposal.bytes,
      approval: approval.value,
      approvalBytes: approval.bytes,
      sourceReviewBytes,
      semanticAuthority: semanticAuthority.value,
      semanticAuthorityBytes: semanticAuthority.bytes,
    };
  }));
  return {
    outputDirectory: await requireContainedAdmissionPath(root, manifest.outputDirectory),
    transactionId: manifest.transactionId,
    proposalId: manifest.proposalId,
    evidenceBundleSha256: manifest.evidenceBundleSha256,
    registerDelta: registerDelta.value,
    registerDeltaBytes: registerDelta.bytes,
    sources,
    records,
    overlapUniverse: overlapUniverse.value,
    normalizerRegistry: normalizerRegistry.value,
    overlapUniverseRecords,
  };
}

async function runWitnessSearchCommand(args: ParsedArguments): Promise<void> {
  const verified = await buildVerifiedAdmissionEvidenceContext(args.root, {
    expectedProfileId: args.toolProfile,
    expectedInvocationIntentId: args.invocationIntentId,
  });
  if (!verified.ok) {
    outputCanonical({ ok: false, command: args.command, diagnosticOnly: true, authorityEligible: false, blockers: verified.errors });
    process.exitCode = 2;
    return;
  }
  const admission = await (await import('../../src/calibration/v103/admission-context')).buildVerifiedAdmissionContext(args.root, verified.context);
  if (!admission.ok) {
    outputCanonical({ ok: false, command: args.command, diagnosticOnly: true, authorityEligible: false, blockers: admission.errors });
    process.exitCode = 2;
    return;
  }
  const projection = projectEligibleWitnessCandidates(admission.context);
  const eligibilitySnapshotSha256 = computeAdmissionEligibilitySnapshotSha256(admission.context);
  const bundle = buildAdmissionSearchResultBundleFromCandidates(admission.context, args.witnessGate!, eligibilitySnapshotSha256, projection.candidates, {});
  outputCanonical({
    ok: true,
    command: args.command,
    gate: args.witnessGate,
    kind: 'search_result',
    bundle,
    candidateCount: projection.candidates.length,
    diagnosticOnly: true,
    authorityEligible: false,
    ready: false,
  });
}

async function runWitnessPublicationCommand(args: ParsedArguments): Promise<void> {
  const bundleInput = await readCanonicalOuterInput(args.root, args.witnessBundlePath!, 'witness bundle');
  const handoffInput = await readCanonicalOuterInput(args.root, args.witnessNestedHandoffPath!, 'nested publication handoff');
  const action = args.witnessKind === 'search_result' ? 'witness:publish-search' : 'witness:publish-review';
  const resolved = await resolveAdmissionToolAuthorityReceipt({
    authorityRoot: toolAuthorityRootFor(args.root),
    authorityIndexSha256: args.toolAuthorityIndexSha256!,
    receiptId: args.toolReceiptId!,
    receiptSha256: args.toolReceiptSha256!,
    invocationIntentId: args.invocationIntentId!,
    profileId: 'admission-census-v1',
    action,
  });
  const request = {
    root: args.root,
    gate: args.witnessGate!,
    kind: args.witnessKind!,
    bundle: bundleInput.value,
    invocationIntentId: args.invocationIntentId!,
    namedPrimaryOutputProjectionSha256: args.namedPrimaryOutputProjectionSha256!,
    publicationToolReceipt: {
      receiptId: resolved.receipt.receiptId,
      receiptSha256: resolved.receiptSha256,
      authorityIndexSha256: resolved.authorityIndexSha256,
    },
    nestedHandoff: handoffInput.value,
    ...(args.recoveryNonce === undefined ? {} : { recoveryNonce: args.recoveryNonce }),
  } as const;
  if (args.command === 'witness:recover-publication') {
    const result = await recoverAdmissionWitnessPublication({
      ...request,
      recoveryNonce: args.recoveryNonce!,
      transactionId: args.transactionId,
      fromLock: args.fromLock,
      acknowledgeNoLiveWriter: true,
    });
    outputCanonical({ ok: true, command: args.command, ...result });
    return;
  }
  const result = await publishAdmissionWitness(request);
  outputCanonical({ ok: true, command: args.command, ...result });
}

async function runSmokeInputMaterializationCommand(args: ParsedArguments): Promise<void> {
  try {
    const request = await loadSmokeInputManifest(args.root, args.smokeInputManifestPath!);
    const result = await materializeAdmissionSmokeInputGeneration(request);
    if (!result.ok) {
      outputCanonical({
        ok: false,
        command: args.command,
        diagnosticOnly: true,
        authorityEligible: false,
        ready: false,
        errors: result.errors,
      });
      process.exitCode = 2;
      return;
    }
    outputCanonical({
      ok: true,
      command: args.command,
      diagnosticOnly: true,
      authorityEligible: false,
      ready: false,
      proposalSha256: result.value.proposal.proposalSha256,
      generationSha256: result.value.inputGeneration.generationSha256,
      finalDirectory: result.value.finalDirectory,
      receipt: result.value.receipt,
    });
  } catch (error) {
    outputCanonical({
      ok: false,
      command: args.command,
      diagnosticOnly: true,
      authorityEligible: false,
      ready: false,
      errors: [error instanceof Error ? error.message : String(error)],
    });
    process.exitCode = 2;
  }
}

async function materializeOuterAuthority(
  args: ParsedArguments,
  graph: PrebuiltAdmissionAuthorityGraphInput,
): Promise<Readonly<{ readonly verificationSha256: string; readonly materializerExpectationVerified: true }>> {
  const selection = args;
  const selected = [
    ['--pre-witness-bundle', selection.preWitnessBundlePath],
    ['--overlap-generation', selection.overlapGenerationPath],
    ['--overlap-index', selection.overlapIndexPath],
    ['--overlap-resource-receipt', selection.overlapResourceReceiptPath],
    ['--overlap-ledger', selection.overlapLedgerPath],
    ['--real-scale-record-count', selection.realScaleRecordCount],
    ['--real-scale-universe-sha256', selection.realScaleUniverseSha256],
    ['--real-scale-records-jsonl-sha256', selection.realScaleRecordsJsonlSha256],
  ] as const;
  const missing = selected.filter(([, value]) => value === undefined).map(([label]) => label);
  if (missing.length > 0) throw new Error(`materializer inputs must be supplied together; missing ${missing.join(', ')}`);
  const bundle = await readCanonicalOuterInput(args.root, selection.preWitnessBundlePath!, 'pre-witness bundle');
  const overlapGeneration = await readCanonicalOuterInput(args.root, selection.overlapGenerationPath!, 'overlap generation');
  const overlapIndex = await readCanonicalOuterInput(args.root, selection.overlapIndexPath!, 'overlap index envelope');
  const overlapResource = await readCanonicalOuterInput(args.root, selection.overlapResourceReceiptPath!, 'overlap resource envelope');
  const overlapLedger = await readCanonicalOuterInput(args.root, selection.overlapLedgerPath!, 'overlap ledger envelope');
  const overlapGenerationObject = record(overlapGeneration.value, 'overlap generation');
  if (!Array.isArray(overlapGenerationObject.artifacts)) throw new Error('overlap generation artifacts are missing');
  const overlapArtifactBytes: Record<string, Buffer> = {};
  for (const candidate of overlapGenerationObject.artifacts) {
    const artifact = record(candidate, 'overlap generation artifact');
    if (typeof artifact.relativePath !== 'string') throw new Error('overlap generation artifact path is invalid');
    const requestedArtifact = join(dirname(selection.overlapGenerationPath!), artifact.relativePath);
    overlapArtifactBytes[artifact.relativePath] = await readFile(await requireContainedAdmissionPath(args.root, requestedArtifact));
  }
  const toolSelector = outerToolAuthority(args);
  const staticGeneration = record(graph.staticGeneration, 'static generation');
  const toolAuthority = await resolveAdmissionToolAuthorityReceipt({
    authorityRoot: toolSelector.authorityRoot,
    authorityIndexSha256: toolSelector.authorityIndexSha256,
    receiptId: toolSelector.receiptId,
    receiptSha256: toolSelector.receiptSha256,
    invocationIntentId: toolSelector.invocationIntentId,
    profileId: toolSelector.profileId,
    action: toolSelector.action,
    outputSetSha256: toolSelector.outputSetSha256,
    expectedSnapshot: staticGeneration.toolAuthoritySnapshot,
  });
  const materialized = materializePrebuiltAdmissionAuthority({
    graph,
    preWitnessBundle: bundle.value,
    preWitnessBundleBytes: bundle.bytes,
    overlap: {
      generation: overlapGeneration.value,
      generationBytes: overlapGeneration.bytes,
      artifactBytes: overlapArtifactBytes,
      index: { value: overlapIndex.value, bytes: overlapIndex.bytes },
      resourceReceipt: { value: overlapResource.value, bytes: overlapResource.bytes },
      ledger: { value: overlapLedger.value, bytes: overlapLedger.bytes },
      toolAuthority,
    },
    realScaleExpectation: {
      recordCount: selection.realScaleRecordCount!,
      universeSha256: selection.realScaleUniverseSha256!,
      recordsJsonlSha256: selection.realScaleRecordsJsonlSha256!,
    },
  });
  if (!materialized.ok) throw new Error(materialized.errors.join('; '));
  return { verificationSha256: materialized.value.verificationSha256, materializerExpectationVerified: true };
}

async function runOuterAuthorityCommand(args: ParsedArguments): Promise<void> {
  const loaded = await loadPrebuiltAdmissionAuthorityGraph({
    projectRoot: args.root!,
    proposalPath: args.inputGenerationProposalPath!,
    inputGenerationPath: args.inputGenerationPath!,
    currentPath: args.currentPath!,
    ...(args.priorCurrentPath === undefined ? {} : { priorCurrentPath: args.priorCurrentPath }),
    requireSourceProposalBytes: true,
    requireSourceSemanticAuthorityBytes: true,
  });
  if (!loaded.ok) throw new Error(loaded.errors.join('; '));
  const graph = loaded.graph;
  const materialized = await materializeOuterAuthority(args, graph);
  const planInput = outerPlanInput(args, graph);
  const publication = {
    root: args.root!,
    graph,
    planInput,
  };
  const graphRead = args.priorCurrentPath === undefined ? undefined : { priorCurrentPath: args.priorCurrentPath };
  const toolAuthority = outerToolAuthority(args);
  if (args.command === 'rebuild:pre-witness') {
    const result = await rebuildPrebuiltAdmissionAuthority({ publication, graphRead, sourceAuthorityMode: 'candidate-aware', toolAuthority });
    outputCanonical({
      ...outerResult(args.command, result),
      materializerVerificationSha256: materialized.verificationSha256,
      realScaleReceiptVerified: false,
      materializerExpectationVerified: materialized.materializerExpectationVerified,
    });
    return;
  }
  const result = await recoverPrebuiltAdmissionAuthorityWithVerification({
    publication: {
      ...publication,
      recoveryNonce: args.recoveryNonce!,
      ...(args.transactionId === undefined ? {} : { transactionId: args.transactionId }),
      ...(args.fromLock === undefined ? {} : { fromLock: args.fromLock }),
      acknowledgeNoLiveWriter: true,
    },
    graphRead,
    sourceAuthorityMode: 'candidate-aware',
    toolAuthority,
  });
  outputCanonical({
    ...outerResult(args.command, result),
    materializerVerificationSha256: materialized.verificationSha256,
    realScaleReceiptVerified: false,
    materializerExpectationVerified: materialized.materializerExpectationVerified,
  });
}

interface ParsedArguments {
  readonly command: string;
  readonly root: string;
  readonly proposalPath?: string;
  /** Planned authority rebuild proposal input (not an acquisition proposal). */
  readonly inputGenerationProposalPath?: string;
  /** Candidate input-generation object path used by the outer graph loader. */
  readonly inputGenerationPath?: string;
  /** Candidate authority-current object path used by the outer graph loader. */
  readonly currentPath?: string;
  /** Existing authority-current object path for replace CAS evidence. */
  readonly priorCurrentPath?: string;
  readonly operation?: 'create' | 'replace';
  readonly expectedCurrentIndexSha256?: string;
  readonly expectedCurrentStaticGenerationSha256?: string;
  readonly expectCurrentAbsent?: boolean;
  readonly requireRealScaleReceipt?: boolean;
  readonly preWitnessBundlePath?: string;
  readonly overlapGenerationPath?: string;
  readonly overlapIndexPath?: string;
  readonly overlapResourceReceiptPath?: string;
  readonly overlapLedgerPath?: string;
  readonly realScaleRecordCount?: number;
  readonly realScaleUniverseSha256?: string;
  readonly realScaleRecordsJsonlSha256?: string;
  readonly toolProfile?: string;
  readonly action?: string;
  readonly canonicalArgvSha256?: string;
  readonly inputSetSha256?: string;
  readonly executableBehaviorSha256?: string;
  readonly networkAuthorizationSha256?: string;
  readonly invocationIntentId?: string;
  readonly transactionId?: string;
  readonly fromLock?: boolean;
  readonly recoveryNonce?: string;
  readonly acknowledgeNoLiveWriter?: boolean;
  readonly sourceRegisterPath?: string;
  readonly sourceReviewsPath?: string;
  readonly registerDeltaPath?: string;
  readonly nextRegisterPath?: string;
  readonly sourceGenerationsPath?: string;
  readonly toolReceiptId?: string;
  readonly toolReceiptSha256?: string;
  readonly toolAuthorityIndexSha256?: string;
  readonly toolAuthorityTransactionId?: string;
  readonly overlapUniversePath?: string;
  readonly overlapRecordsPath?: string;
  readonly overlapPolicyPath?: string;
  readonly overlapNormalizersPath?: string;
  readonly overlapBytesRoot?: string;
  readonly overlapToolSnapshotPath?: string;
  readonly generation?: number;
  readonly inputGenerationSha256?: string;
  readonly expectedCurrentGenerationSha256?: string;
  readonly selectedGenerationSha256?: string;
  readonly outputSetSha256?: string;
  readonly exitCode?: number;
  readonly observedResourceUsage?: string;
  readonly joinStaticAuthority?: boolean;
  readonly witnessBundlePath?: string;
  readonly witnessGate?: 'smoke' | 'canary';
  readonly witnessKind?: 'search_result' | 'witness_review';
  readonly witnessNestedHandoffPath?: string;
  readonly namedPrimaryOutputProjectionSha256?: string;
  /** Explicit root-relative smoke-input manifest; no discovery is performed. */
  readonly smokeInputManifestPath?: string;
}

function parse(argv: readonly string[]): ParsedArguments {
  const forwarded = argv[0] === '--' ? argv.slice(1) : argv;
  const [command, ...rest] = forwarded;
  if (command !== 'evidence:verify' && command !== 'source:census' && command !== 'census:preview' && command !== 'census' && command !== 'census:stdout' && command !== 'acquisition:publish' && command !== 'acquisition:recover-publication' && command !== 'tool-authority:intent' && command !== 'tool-authority:receipt' && command !== 'tool-authority:resolve' && command !== 'tool-authority:recover' && command !== 'register:publish-round' && command !== 'register:recover' && command !== 'authority:overlap' && command !== 'authority:overlap:recover' && command !== 'authority:overlap:verify' && command !== 'rebuild:pre-witness' && command !== 'static-authority:recover' && command !== 'witness:search' && command !== 'witness:publish-search' && command !== 'witness:publish-review' && command !== 'witness:recover-publication' && command !== 'admission:smoke-input') throw new Error('Unknown admission command');
  let root: string | undefined;
  let proposalPath: string | undefined;
  let inputGenerationProposalPath: string | undefined;
  let inputGenerationPath: string | undefined;
  let currentPath: string | undefined;
  let priorCurrentPath: string | undefined;
  let operation: 'create' | 'replace' | undefined;
  let expectedCurrentIndexSha256: string | undefined;
  let expectedCurrentStaticGenerationSha256: string | undefined;
  let expectCurrentAbsent = false;
  let requireRealScaleReceipt = false;
  let preWitnessBundlePath: string | undefined;
  let overlapGenerationPath: string | undefined;
  let overlapIndexPath: string | undefined;
  let overlapResourceReceiptPath: string | undefined;
  let overlapLedgerPath: string | undefined;
  let realScaleRecordCount: number | undefined;
  let realScaleUniverseSha256: string | undefined;
  let realScaleRecordsJsonlSha256: string | undefined;
  let toolProfile: string | undefined;
  let action: string | undefined;
  let canonicalArgvSha256: string | undefined;
  let inputSetSha256: string | undefined;
  let executableBehaviorSha256: string | undefined;
  let networkAuthorizationSha256: string | undefined;
  let invocationIntentId: string | undefined;
  let transactionId: string | undefined;
  let fromLock = false;
  let recoveryNonce: string | undefined;
  let acknowledgeNoLiveWriter = false;
  let sourceRegisterPath: string | undefined;
  let sourceReviewsPath: string | undefined;
  let registerDeltaPath: string | undefined;
  let nextRegisterPath: string | undefined;
  let sourceGenerationsPath: string | undefined;
  let toolReceiptId: string | undefined;
  let toolReceiptSha256: string | undefined;
  let toolAuthorityIndexSha256: string | undefined;
  let toolAuthorityTransactionId: string | undefined;
  let overlapUniversePath: string | undefined;
  let overlapRecordsPath: string | undefined;
  let overlapPolicyPath: string | undefined;
  let overlapNormalizersPath: string | undefined;
  let overlapBytesRoot: string | undefined;
  let overlapToolSnapshotPath: string | undefined;
  let generation: number | undefined;
  let inputGenerationSha256: string | undefined;
  let expectedCurrentGenerationSha256: string | undefined;
  let selectedGenerationSha256: string | undefined;
  let outputSetSha256: string | undefined;
  let exitCode: number | undefined;
  let observedResourceUsage: string | undefined;
  let joinStaticAuthority = false;
  let witnessBundlePath: string | undefined;
  let witnessGate: 'smoke' | 'canary' | undefined;
  let witnessKind: 'search_result' | 'witness_review' | undefined;
  let witnessNestedHandoffPath: string | undefined;
  let namedPrimaryOutputProjectionSha256: string | undefined;
  let smokeInputManifestPath: string | undefined;
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (flag === '--expect-current-absent' || flag === '--require-real-scale-receipt') {
      if (flag === '--expect-current-absent') {
        if (expectCurrentAbsent) throw new Error('--expect-current-absent may only be supplied once');
        expectCurrentAbsent = true;
      } else {
        if (requireRealScaleReceipt) throw new Error('--require-real-scale-receipt may only be supplied once');
        requireRealScaleReceipt = true;
      }
      continue;
    }
    if (flag === '--join-static-authority') {
      if (command !== 'authority:overlap:verify') throw new Error('--join-static-authority is only valid for authority:overlap:verify');
      if (joinStaticAuthority) throw new Error('--join-static-authority may only be supplied once');
      joinStaticAuthority = true;
      continue;
    }
    if (flag === '--from-lock' || flag === '--acknowledge-no-live-writer') {
      if (command !== 'acquisition:recover-publication' && command !== 'tool-authority:recover' && command !== 'register:recover' && command !== 'authority:overlap:recover' && command !== 'static-authority:recover' && command !== 'witness:recover-publication') throw new Error(`${flag} is only valid for a recovery command`);
      if (flag === '--from-lock') {
        if (fromLock) throw new Error('--from-lock may only be supplied once');
        fromLock = true;
      } else {
        if (acknowledgeNoLiveWriter) throw new Error('--acknowledge-no-live-writer may only be supplied once');
        acknowledgeNoLiveWriter = true;
      }
      continue;
    }
    const takesValue = new Set(['--root', '--publication-proposal', '--input-generation-proposal', '--input-generation', '--current', '--prior-current', '--pre-witness-bundle', '--overlap-generation', '--overlap-index', '--overlap-resource-receipt', '--overlap-ledger', '--real-scale-record-count', '--real-scale-universe-sha256', '--real-scale-records-jsonl-sha256', '--operation', '--expected-current-index-sha256', '--expected-current-static-generation-sha256', '--tool-profile', '--action', '--canonical-argv-sha256', '--input-set-sha256', '--executable-behavior-sha256', '--network-authorization-sha256', '--invocation-intent', '--transaction-id', '--recovery-nonce', '--source-register', '--source-reviews', '--register-delta', '--next-register', '--source-generations', '--tool-receipt-id', '--tool-receipt-sha256', '--tool-authority-index-sha256', '--tool-authority-transaction-id', '--universe', '--records', '--policy', '--normalizers', '--bytes-root', '--tool-snapshot', '--generation', '--input-generation-sha256', '--expected-current-generation-sha256', '--generation-sha256', '--output-set-sha256', '--exit-code', '--observed-resource-usage', '--bundle', '--gate', '--kind', '--nested-handoff', '--named-primary-output-sha256', '--manifest']);
    if (!flag || !takesValue.has(flag)) throw new Error(`Unexpected option for ${command}`);
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    if (flag === '--root') {
      if (root !== undefined) throw new Error('--root may only be supplied once');
      root = value;
    } else if (flag === '--publication-proposal') {
      if (proposalPath !== undefined) throw new Error('--publication-proposal may only be supplied once');
      proposalPath = value;
    } else if (flag === '--input-generation-proposal') {
      if (inputGenerationProposalPath !== undefined) throw new Error('--input-generation-proposal may only be supplied once');
      inputGenerationProposalPath = value;
    } else if (flag === '--input-generation') {
      if (inputGenerationPath !== undefined) throw new Error('--input-generation may only be supplied once');
      inputGenerationPath = value;
    } else if (flag === '--current') {
      if (currentPath !== undefined) throw new Error('--current may only be supplied once');
      currentPath = value;
    } else if (flag === '--prior-current') {
      if (priorCurrentPath !== undefined) throw new Error('--prior-current may only be supplied once');
      priorCurrentPath = value;
    } else if (flag === '--pre-witness-bundle') {
      if (preWitnessBundlePath !== undefined) throw new Error('--pre-witness-bundle may only be supplied once');
      preWitnessBundlePath = value;
    } else if (flag === '--overlap-generation') {
      if (overlapGenerationPath !== undefined) throw new Error('--overlap-generation may only be supplied once');
      overlapGenerationPath = value;
    } else if (flag === '--overlap-index') {
      if (overlapIndexPath !== undefined) throw new Error('--overlap-index may only be supplied once');
      overlapIndexPath = value;
    } else if (flag === '--overlap-resource-receipt') {
      if (overlapResourceReceiptPath !== undefined) throw new Error('--overlap-resource-receipt may only be supplied once');
      overlapResourceReceiptPath = value;
    } else if (flag === '--overlap-ledger') {
      if (overlapLedgerPath !== undefined) throw new Error('--overlap-ledger may only be supplied once');
      overlapLedgerPath = value;
    } else if (flag === '--real-scale-record-count') {
      if (realScaleRecordCount !== undefined || !/^\d+$/.test(value)) throw new Error('--real-scale-record-count must be a positive safe integer');
      realScaleRecordCount = Number(value);
      if (!Number.isSafeInteger(realScaleRecordCount) || realScaleRecordCount <= 0) throw new Error('--real-scale-record-count must be a positive safe integer');
    } else if (flag === '--real-scale-universe-sha256') {
      if (realScaleUniverseSha256 !== undefined || !/^[a-f0-9]{64}$/.test(value)) throw new Error('--real-scale-universe-sha256 must be a lowercase SHA-256');
      realScaleUniverseSha256 = value;
    } else if (flag === '--real-scale-records-jsonl-sha256') {
      if (realScaleRecordsJsonlSha256 !== undefined || !/^[a-f0-9]{64}$/.test(value)) throw new Error('--real-scale-records-jsonl-sha256 must be a lowercase SHA-256');
      realScaleRecordsJsonlSha256 = value;
    } else if (flag === '--operation') {
      if (operation !== undefined || (value !== 'create' && value !== 'replace')) throw new Error('--operation must be create or replace');
      operation = value;
    } else if (flag === '--expected-current-index-sha256') {
      if (expectedCurrentIndexSha256 !== undefined) throw new Error('--expected-current-index-sha256 may only be supplied once');
      expectedCurrentIndexSha256 = value;
    } else if (flag === '--expected-current-static-generation-sha256') {
      if (expectedCurrentStaticGenerationSha256 !== undefined || !/^[a-f0-9]{64}$/.test(value)) throw new Error('--expected-current-static-generation-sha256 must be a lowercase SHA-256');
      expectedCurrentStaticGenerationSha256 = value;
    } else if (flag === '--tool-profile') {
      if (toolProfile !== undefined) throw new Error('--tool-profile may only be supplied once');
      toolProfile = value;
    } else if (flag === '--action') {
      if (action !== undefined) throw new Error('--action may only be supplied once');
      action = value;
    } else if (flag === '--canonical-argv-sha256') {
      if (canonicalArgvSha256 !== undefined || !/^[a-f0-9]{64}$/.test(value)) throw new Error('--canonical-argv-sha256 must be a lowercase SHA-256');
      canonicalArgvSha256 = value;
    } else if (flag === '--input-set-sha256') {
      if (inputSetSha256 !== undefined || !/^[a-f0-9]{64}$/.test(value)) throw new Error('--input-set-sha256 must be a lowercase SHA-256');
      inputSetSha256 = value;
    } else if (flag === '--executable-behavior-sha256') {
      if (executableBehaviorSha256 !== undefined || !/^[a-f0-9]{64}$/.test(value)) throw new Error('--executable-behavior-sha256 must be a lowercase SHA-256');
      executableBehaviorSha256 = value;
    } else if (flag === '--network-authorization-sha256') {
      if (networkAuthorizationSha256 !== undefined || !/^[a-f0-9]{64}$/.test(value)) throw new Error('--network-authorization-sha256 must be a lowercase SHA-256');
      networkAuthorizationSha256 = value;
    } else if (flag === '--invocation-intent') {
      if (invocationIntentId !== undefined) throw new Error('--invocation-intent may only be supplied once');
      if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('--invocation-intent must be a lowercase SHA-256');
      invocationIntentId = value;
    } else if (flag === '--transaction-id') {
      if (transactionId !== undefined) throw new Error('--transaction-id may only be supplied once');
      transactionId = value;
    } else if (flag === '--recovery-nonce') {
      if (recoveryNonce !== undefined) throw new Error('--recovery-nonce may only be supplied once');
      recoveryNonce = value;
    } else if (flag === '--source-register') {
      if (sourceRegisterPath !== undefined) throw new Error('--source-register may only be supplied once');
      sourceRegisterPath = value;
    } else if (flag === '--source-reviews') {
      if (sourceReviewsPath !== undefined) throw new Error('--source-reviews may only be supplied once');
      sourceReviewsPath = value;
    } else if (flag === '--register-delta') {
      if (registerDeltaPath !== undefined) throw new Error('--register-delta may only be supplied once');
      registerDeltaPath = value;
    } else if (flag === '--next-register') {
      if (nextRegisterPath !== undefined) throw new Error('--next-register may only be supplied once');
      nextRegisterPath = value;
    } else if (flag === '--source-generations') {
      if (sourceGenerationsPath !== undefined) throw new Error('--source-generations may only be supplied once');
      sourceGenerationsPath = value;
    } else if (flag === '--tool-receipt-id') {
      if (toolReceiptId !== undefined) throw new Error('--tool-receipt-id may only be supplied once');
      toolReceiptId = value;
    } else if (flag === '--tool-receipt-sha256') {
      if (toolReceiptSha256 !== undefined) throw new Error('--tool-receipt-sha256 may only be supplied once');
      toolReceiptSha256 = value;
    } else if (flag === '--tool-authority-index-sha256') {
      if (toolAuthorityIndexSha256 !== undefined) throw new Error('--tool-authority-index-sha256 may only be supplied once');
      toolAuthorityIndexSha256 = value;
    } else if (flag === '--tool-authority-transaction-id') {
      if (toolAuthorityTransactionId !== undefined) throw new Error('--tool-authority-transaction-id may only be supplied once');
      toolAuthorityTransactionId = value;
    } else if (flag === '--universe') {
      if (overlapUniversePath !== undefined) throw new Error('--universe may only be supplied once');
      overlapUniversePath = value;
    } else if (flag === '--records') {
      if (overlapRecordsPath !== undefined) throw new Error('--records may only be supplied once');
      overlapRecordsPath = value;
    } else if (flag === '--policy') {
      if (overlapPolicyPath !== undefined) throw new Error('--policy may only be supplied once');
      overlapPolicyPath = value;
    } else if (flag === '--normalizers') {
      if (overlapNormalizersPath !== undefined) throw new Error('--normalizers may only be supplied once');
      overlapNormalizersPath = value;
    } else if (flag === '--bytes-root') {
      if (overlapBytesRoot !== undefined) throw new Error('--bytes-root may only be supplied once');
      overlapBytesRoot = value;
    } else if (flag === '--tool-snapshot') {
      if (overlapToolSnapshotPath !== undefined) throw new Error('--tool-snapshot may only be supplied once');
      overlapToolSnapshotPath = value;
    } else if (flag === '--generation') {
      if (generation !== undefined || !/^\d+$/.test(value)) throw new Error('--generation must be a non-negative integer');
      generation = Number(value);
      if (!Number.isSafeInteger(generation)) throw new Error('--generation is too large');
    } else if (flag === '--input-generation-sha256') {
      if (inputGenerationSha256 !== undefined || !/^[a-f0-9]{64}$/.test(value)) throw new Error('--input-generation-sha256 must be a lowercase SHA-256');
      inputGenerationSha256 = value;
    } else if (flag === '--expected-current-generation-sha256') {
      if (expectedCurrentGenerationSha256 !== undefined || !/^[a-f0-9]{64}$/.test(value)) throw new Error('--expected-current-generation-sha256 must be a lowercase SHA-256');
      expectedCurrentGenerationSha256 = value;
    } else if (flag === '--generation-sha256') {
      if (selectedGenerationSha256 !== undefined || !/^[a-f0-9]{64}$/.test(value)) throw new Error('--generation-sha256 must be a lowercase SHA-256');
      selectedGenerationSha256 = value;
    } else if (flag === '--output-set-sha256') {
      if (outputSetSha256 !== undefined || !/^[a-f0-9]{64}$/.test(value)) throw new Error('--output-set-sha256 must be a lowercase SHA-256');
      outputSetSha256 = value;
    } else if (flag === '--exit-code') {
      if (exitCode !== undefined || !/^\d+$/.test(value)) throw new Error('--exit-code must be an integer from 0 to 255');
      exitCode = Number(value);
      if (!Number.isSafeInteger(exitCode) || exitCode > 255) throw new Error('--exit-code must be an integer from 0 to 255');
    } else if (flag === '--observed-resource-usage') {
      if (observedResourceUsage !== undefined) throw new Error('--observed-resource-usage may only be supplied once');
      observedResourceUsage = value;
    } else if (flag === '--bundle') {
      if (witnessBundlePath !== undefined) throw new Error('--bundle may only be supplied once');
      witnessBundlePath = value;
    } else if (flag === '--gate') {
      if (witnessGate !== undefined || (value !== 'smoke' && value !== 'canary')) throw new Error('--gate must be smoke or canary');
      witnessGate = value;
    } else if (flag === '--kind') {
      if (witnessKind !== undefined || (value !== 'search_result' && value !== 'witness_review')) throw new Error('--kind must be search_result or witness_review');
      witnessKind = value;
    } else if (flag === '--nested-handoff') {
      if (witnessNestedHandoffPath !== undefined) throw new Error('--nested-handoff may only be supplied once');
      witnessNestedHandoffPath = value;
    } else if (flag === '--named-primary-output-sha256') {
      if (namedPrimaryOutputProjectionSha256 !== undefined || !/^[a-f0-9]{64}$/.test(value)) throw new Error('--named-primary-output-sha256 must be a lowercase SHA-256');
      namedPrimaryOutputProjectionSha256 = value;
    } else if (flag === '--manifest') {
      if (smokeInputManifestPath !== undefined) throw new Error('--manifest may only be supplied once');
      smokeInputManifestPath = value;
    }
    index += 1;
  }
  if (!root) throw new Error(`${command ?? 'admission command'} requires --root <v10.3-root or review/admission>`);
  if (smokeInputManifestPath !== undefined && command !== 'admission:smoke-input') throw new Error('--manifest is only valid for admission:smoke-input');
  const authorityGraphOption = inputGenerationProposalPath !== undefined
    || inputGenerationPath !== undefined
    || currentPath !== undefined
    || priorCurrentPath !== undefined
    || expectedCurrentStaticGenerationSha256 !== undefined
    || expectCurrentAbsent;
  const materializerOption = preWitnessBundlePath !== undefined
    || overlapGenerationPath !== undefined
    || overlapIndexPath !== undefined
    || overlapResourceReceiptPath !== undefined
    || overlapLedgerPath !== undefined
    || realScaleRecordCount !== undefined
    || realScaleUniverseSha256 !== undefined
    || realScaleRecordsJsonlSha256 !== undefined;
  if (authorityGraphOption && command !== 'rebuild:pre-witness' && command !== 'static-authority:recover') {
    throw new Error(`Unexpected authority rebuild option for ${command}`);
  }
  if (materializerOption && command !== 'rebuild:pre-witness' && command !== 'static-authority:recover') {
    throw new Error(`Unexpected outer authority materializer option for ${command}`);
  }
  if (requireRealScaleReceipt
    && command !== 'rebuild:pre-witness'
    && command !== 'static-authority:recover'
    && command !== 'authority:overlap'
    && command !== 'authority:overlap:verify') {
    throw new Error(`--require-real-scale-receipt is not valid for ${command}`);
  }
  if (command === 'admission:smoke-input') {
    if (!smokeInputManifestPath
      || proposalPath || inputGenerationProposalPath || inputGenerationPath || currentPath || priorCurrentPath || operation
      || expectedCurrentIndexSha256 || expectedCurrentStaticGenerationSha256 || expectCurrentAbsent || requireRealScaleReceipt
      || preWitnessBundlePath || overlapGenerationPath || overlapIndexPath || overlapResourceReceiptPath || overlapLedgerPath
      || realScaleRecordCount !== undefined || realScaleUniverseSha256 || realScaleRecordsJsonlSha256
      || toolProfile || action || canonicalArgvSha256 || inputSetSha256 || executableBehaviorSha256 || networkAuthorizationSha256
      || invocationIntentId || transactionId || fromLock || recoveryNonce || acknowledgeNoLiveWriter
      || sourceRegisterPath || sourceReviewsPath || registerDeltaPath || nextRegisterPath || sourceGenerationsPath
      || toolReceiptId || toolReceiptSha256 || toolAuthorityIndexSha256 || toolAuthorityTransactionId
      || overlapUniversePath || overlapRecordsPath || overlapPolicyPath || overlapNormalizersPath || overlapBytesRoot || overlapToolSnapshotPath
      || generation !== undefined || inputGenerationSha256 || expectedCurrentGenerationSha256 || selectedGenerationSha256 || outputSetSha256
      || exitCode !== undefined || observedResourceUsage || joinStaticAuthority || witnessBundlePath || witnessGate || witnessKind
      || witnessNestedHandoffPath || namedPrimaryOutputProjectionSha256) {
      throw new Error('admission:smoke-input requires only --root and --manifest');
    }
  } else if (command === 'tool-authority:intent') {
    if (!toolProfile || !action || !canonicalArgvSha256 || !inputSetSha256 || !executableBehaviorSha256 || invocationIntentId || outputSetSha256 || exitCode !== undefined || observedResourceUsage !== undefined || proposalPath || operation || expectedCurrentIndexSha256 || transactionId || fromLock || recoveryNonce || acknowledgeNoLiveWriter || sourceRegisterPath || sourceReviewsPath || registerDeltaPath || nextRegisterPath || sourceGenerationsPath || toolReceiptId || toolReceiptSha256 || toolAuthorityIndexSha256 || toolAuthorityTransactionId || overlapUniversePath || overlapRecordsPath || overlapPolicyPath || overlapNormalizersPath || overlapBytesRoot || overlapToolSnapshotPath || generation !== undefined || inputGenerationSha256 || expectedCurrentGenerationSha256 || selectedGenerationSha256) throw new Error('tool-authority:intent requires --tool-profile, --action, and the three input hashes only');
  } else if (command === 'tool-authority:receipt') {
    if (!invocationIntentId || !outputSetSha256 || exitCode === undefined || !observedResourceUsage || toolProfile || action || canonicalArgvSha256 || inputSetSha256 || executableBehaviorSha256 || networkAuthorizationSha256 || proposalPath || operation || expectedCurrentIndexSha256 || transactionId || fromLock || recoveryNonce || acknowledgeNoLiveWriter || sourceRegisterPath || sourceReviewsPath || registerDeltaPath || nextRegisterPath || sourceGenerationsPath || toolReceiptId || toolReceiptSha256 || toolAuthorityIndexSha256 || toolAuthorityTransactionId || overlapUniversePath || overlapRecordsPath || overlapPolicyPath || overlapNormalizersPath || overlapBytesRoot || overlapToolSnapshotPath || generation !== undefined || inputGenerationSha256 || expectedCurrentGenerationSha256 || selectedGenerationSha256) throw new Error('tool-authority:receipt requires --invocation-intent, --output-set-sha256, --exit-code, and --observed-resource-usage only');
  } else if (command === 'tool-authority:resolve') {
    if (!toolProfile || !action || !invocationIntentId || !toolReceiptId || !toolReceiptSha256 || !toolAuthorityIndexSha256
      || proposalPath || operation || expectedCurrentIndexSha256 || transactionId || fromLock || recoveryNonce || acknowledgeNoLiveWriter
      || canonicalArgvSha256 || inputSetSha256 || executableBehaviorSha256 || networkAuthorizationSha256
      || sourceRegisterPath || sourceReviewsPath || registerDeltaPath || nextRegisterPath || sourceGenerationsPath
      || toolAuthorityTransactionId || overlapUniversePath || overlapRecordsPath || overlapPolicyPath || overlapNormalizersPath || overlapBytesRoot
      || generation !== undefined || inputGenerationSha256 || expectedCurrentGenerationSha256 || selectedGenerationSha256 || outputSetSha256 || exitCode !== undefined || observedResourceUsage) {
      throw new Error('tool-authority:resolve requires profile, action, invocation intent, receipt ID/hash, and authority-index hash only (plus optional --tool-snapshot)');
    }
    if (!/^[a-f0-9]{64}$/.test(invocationIntentId) || !/^[a-f0-9]{64}$/.test(toolReceiptId) || !/^[a-f0-9]{64}$/.test(toolReceiptSha256) || !/^[a-f0-9]{64}$/.test(toolAuthorityIndexSha256)) {
      throw new Error('tool-authority:resolve selectors must be lowercase SHA-256 values');
    }
  } else if (command === 'evidence:verify' || command === 'source:census' || command === 'census:preview' || command === 'census' || command === 'census:stdout') {
    if (proposalPath || operation || expectedCurrentIndexSha256 || transactionId || fromLock || recoveryNonce || acknowledgeNoLiveWriter) throw new Error(`Unexpected acquisition option for ${command}`);
    if (toolProfile !== 'admission-context-v1' || !invocationIntentId) throw new Error(`${command} requires --tool-profile admission-context-v1 and --invocation-intent`);
    if ((command === 'source:census' || command === 'census:preview') && (!sourceRegisterPath || !sourceReviewsPath)) throw new Error(`${command} requires --source-register and --source-reviews`);
    if ((command === 'census' || command === 'census:stdout') && (sourceRegisterPath || sourceReviewsPath)) throw new Error(`${command} derives source/register inputs from the verified admission context`);
    if (command === 'evidence:verify' && (sourceRegisterPath || sourceReviewsPath)) throw new Error('Unexpected source census option for evidence:verify');
    if (inputGenerationProposalPath || expectedCurrentStaticGenerationSha256 || expectCurrentAbsent || requireRealScaleReceipt || materializerOption) throw new Error(`Unexpected authority rebuild option for ${command}`);
  } else if (command === 'rebuild:pre-witness') {
    if (/(?:^|[\\/])review[\\/]admission[\\/]?$/u.test(root)) {
      throw new Error('rebuild:pre-witness requires the project root; pass the parent of review/admission, not review/admission itself');
    }
    if (action !== undefined) {
      throw new Error('rebuild:pre-witness accepts explicit graph paths, operation/CAS, static-ledgers profile, indexed tool selectors, and real-scale receipt requirement; its outer action is fixed to rebuild:pre-witness');
    }
    if (!inputGenerationProposalPath || !inputGenerationPath || !currentPath || !operation || !toolProfile || toolProfile !== 'admission-static-ledgers-v1' || !requireRealScaleReceipt
      || !preWitnessBundlePath || !overlapGenerationPath || !overlapIndexPath || !overlapResourceReceiptPath || !overlapLedgerPath
      || realScaleRecordCount === undefined || !realScaleUniverseSha256 || !realScaleRecordsJsonlSha256) {
      throw new Error('rebuild:pre-witness requires explicit graph paths (--input-generation-proposal, --input-generation, --current), --pre-witness-bundle, all overlap generation/envelope paths, positive real-scale selectors, --operation, --tool-profile admission-static-ledgers-v1, and --require-real-scale-receipt');
    }
    if (operation === 'create' && (!expectCurrentAbsent || expectedCurrentStaticGenerationSha256 !== undefined)) {
      throw new Error('rebuild:pre-witness create requires --expect-current-absent and forbids --expected-current-static-generation-sha256');
    }
    if (operation === 'create' && priorCurrentPath !== undefined) {
      throw new Error('rebuild:pre-witness create forbids --prior-current');
    }
    if (resolve(root!, currentPath!) === resolve(root!, 'review/admission/authority/current.json')) {
      throw new Error('rebuild:pre-witness requires a candidate --current path distinct from the published authority/current.json');
    }
    if (operation === 'replace' && (expectCurrentAbsent || expectedCurrentStaticGenerationSha256 === undefined || priorCurrentPath === undefined)) {
      throw new Error('rebuild:pre-witness replace requires --expected-current-static-generation-sha256, --prior-current, and forbids --expect-current-absent');
    }
    for (const [label, value] of [['--invocation-intent', invocationIntentId], ['--tool-receipt-id', toolReceiptId], ['--tool-receipt-sha256', toolReceiptSha256], ['--tool-authority-index-sha256', toolAuthorityIndexSha256], ['--output-set-sha256', outputSetSha256]] as const) {
      if (value === undefined || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} is required and must be a lowercase SHA-256`);
    }
    if (proposalPath || expectedCurrentIndexSha256 || action || canonicalArgvSha256 || inputSetSha256 || executableBehaviorSha256 || networkAuthorizationSha256
      || transactionId || fromLock || recoveryNonce || acknowledgeNoLiveWriter || sourceRegisterPath || sourceReviewsPath
      || registerDeltaPath || nextRegisterPath || sourceGenerationsPath
      || toolAuthorityTransactionId || overlapUniversePath || overlapRecordsPath || overlapPolicyPath || overlapNormalizersPath || overlapBytesRoot
      || overlapToolSnapshotPath || generation !== undefined || inputGenerationSha256 || expectedCurrentGenerationSha256 || selectedGenerationSha256
      || exitCode !== undefined || observedResourceUsage || joinStaticAuthority
      || !invocationIntentId || !toolReceiptId || !toolReceiptSha256 || !toolAuthorityIndexSha256 || !outputSetSha256) {
      throw new Error('rebuild:pre-witness accepts explicit graph paths, operation/CAS, static-ledgers profile, indexed tool selectors, and real-scale receipt requirement; its outer action is fixed to rebuild:pre-witness');
    }
  } else if (command === 'static-authority:recover') {
    if (/(?:^|[\\/])review[\\/]admission[\\/]?$/u.test(root)) {
      throw new Error('static-authority:recover requires the project root; pass the parent of review/admission, not review/admission itself');
    }
    if (!inputGenerationProposalPath || !inputGenerationPath || !currentPath || !toolProfile || toolProfile !== 'admission-static-ledgers-v1' || !recoveryNonce || (!transactionId && !fromLock) || (transactionId && fromLock) || !acknowledgeNoLiveWriter
      || !requireRealScaleReceipt || !preWitnessBundlePath || !overlapGenerationPath || !overlapIndexPath || !overlapResourceReceiptPath || !overlapLedgerPath
      || realScaleRecordCount === undefined || !realScaleUniverseSha256 || !realScaleRecordsJsonlSha256) {
      throw new Error('static-authority:recover requires explicit graph paths (--input-generation-proposal, --input-generation, --current), --pre-witness-bundle, all overlap generation/envelope paths, positive real-scale selectors, exactly one recovery selector, --recovery-nonce, --acknowledge-no-live-writer, --tool-profile admission-static-ledgers-v1, and --require-real-scale-receipt');
    }
    if (!/^[a-f0-9]{64}$/.test(recoveryNonce)) throw new Error('--recovery-nonce must be a lowercase SHA-256');
    for (const [label, value] of [['--invocation-intent', invocationIntentId], ['--tool-receipt-id', toolReceiptId], ['--tool-receipt-sha256', toolReceiptSha256], ['--tool-authority-index-sha256', toolAuthorityIndexSha256], ['--output-set-sha256', outputSetSha256]] as const) {
      if (value === undefined || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} is required and must be a lowercase SHA-256`);
    }
    if (resolve(root!, currentPath!) === resolve(root!, 'review/admission/authority/current.json')) {
      throw new Error('static-authority:recover requires a candidate --current path distinct from the published authority/current.json');
    }
    if (proposalPath || operation || expectedCurrentIndexSha256 || expectedCurrentStaticGenerationSha256 || expectCurrentAbsent
      || action || canonicalArgvSha256 || inputSetSha256 || executableBehaviorSha256 || networkAuthorizationSha256
      || sourceRegisterPath || sourceReviewsPath || registerDeltaPath || nextRegisterPath || sourceGenerationsPath
      || toolAuthorityTransactionId || overlapUniversePath || overlapRecordsPath
      || overlapPolicyPath || overlapNormalizersPath || overlapBytesRoot || overlapToolSnapshotPath || generation !== undefined
      || inputGenerationSha256 || expectedCurrentGenerationSha256 || selectedGenerationSha256 || exitCode !== undefined
      || observedResourceUsage || joinStaticAuthority) {
      throw new Error('static-authority:recover accepts explicit graph paths, transaction selector, nonce/no-live-writer acknowledgement, static-ledgers profile, and indexed tool selectors; its outer action is fixed to static-authority:recover');
    }
  } else if (command === 'authority:overlap') {
    if (!overlapUniversePath || !overlapRecordsPath || !overlapPolicyPath || !overlapNormalizersPath || !overlapBytesRoot || !overlapToolSnapshotPath || generation === undefined || !inputGenerationSha256 || !toolProfile || toolProfile !== 'admission-static-ledgers-v1' || !invocationIntentId || !toolReceiptId || !toolReceiptSha256 || !toolAuthorityIndexSha256) throw new Error('authority:overlap requires --universe, --records, --policy, --normalizers, --bytes-root, --tool-snapshot, --generation, --input-generation-sha256, static-ledgers profile, invocation intent, and tool receipt fields');
    if (!/^[a-f0-9]{64}$/.test(toolReceiptSha256) || !/^[a-f0-9]{64}$/.test(toolAuthorityIndexSha256)) throw new Error('Overlap tool receipt hashes must be lowercase SHA-256');
    if (operation === 'create' && expectedCurrentGenerationSha256 !== undefined) throw new Error('create cannot use --expected-current-generation-sha256');
    if (operation === 'replace' && !expectedCurrentGenerationSha256) throw new Error('replace requires --expected-current-generation-sha256');
    if (proposalPath || expectedCurrentIndexSha256 || sourceRegisterPath || sourceReviewsPath || registerDeltaPath || nextRegisterPath || sourceGenerationsPath || transactionId || fromLock || recoveryNonce || acknowledgeNoLiveWriter || selectedGenerationSha256 || toolAuthorityTransactionId) throw new Error('Unexpected option for authority:overlap');
  } else if (command === 'authority:overlap:recover') {
    if (overlapUniversePath || overlapRecordsPath || overlapPolicyPath || overlapNormalizersPath || overlapBytesRoot || overlapToolSnapshotPath || operation || expectedCurrentIndexSha256 || generation !== undefined || inputGenerationSha256 || expectedCurrentGenerationSha256 || selectedGenerationSha256 || toolAuthorityTransactionId || !toolProfile || toolProfile !== 'admission-static-ledgers-v1' || invocationIntentId || !toolReceiptId || !toolReceiptSha256 || !toolAuthorityIndexSha256 || !recoveryNonce || (!transactionId && !fromLock) || (transactionId && fromLock) || !acknowledgeNoLiveWriter) throw new Error('authority:overlap:recover requires a selector, static-ledgers tool profile, recovery nonce, tool receipt fields, and --acknowledge-no-live-writer');
    if (!/^[a-f0-9]{64}$/.test(recoveryNonce) || !/^[a-f0-9]{64}$/.test(toolReceiptSha256) || !/^[a-f0-9]{64}$/.test(toolAuthorityIndexSha256)) throw new Error('Overlap recovery hashes/nonces must be lowercase SHA-256');
  } else if (command === 'authority:overlap:verify') {
    if (proposalPath || operation || expectedCurrentIndexSha256 || overlapUniversePath || overlapRecordsPath || overlapPolicyPath || overlapNormalizersPath || overlapBytesRoot || overlapToolSnapshotPath || generation !== undefined || inputGenerationSha256 || expectedCurrentGenerationSha256 || transactionId || fromLock || recoveryNonce || acknowledgeNoLiveWriter || sourceRegisterPath || sourceReviewsPath || registerDeltaPath || nextRegisterPath || sourceGenerationsPath || toolAuthorityTransactionId || action || canonicalArgvSha256 || inputSetSha256 || executableBehaviorSha256 || networkAuthorizationSha256 || outputSetSha256 || exitCode !== undefined || observedResourceUsage !== undefined || !toolProfile || toolProfile !== 'admission-static-ledgers-v1') throw new Error('authority:overlap:verify requires --tool-profile admission-static-ledgers-v1 and no publication options');
    if (joinStaticAuthority) {
      if (!invocationIntentId || !toolReceiptId || !toolReceiptSha256 || !toolAuthorityIndexSha256) throw new Error('authority:overlap:verify --join-static-authority requires invocation intent and indexed tool receipt selectors');
      if (!/^[a-f0-9]{64}$/.test(toolReceiptId) || !/^[a-f0-9]{64}$/.test(toolReceiptSha256) || !/^[a-f0-9]{64}$/.test(toolAuthorityIndexSha256)) throw new Error('authority:overlap:verify join selectors must be lowercase SHA-256');
    } else if (invocationIntentId || toolReceiptId || toolReceiptSha256 || toolAuthorityIndexSha256) {
      throw new Error('authority:overlap:verify tool selectors require --join-static-authority');
    }
  } else if (command === 'witness:search' || command === 'witness:publish-search' || command === 'witness:publish-review' || command === 'witness:recover-publication') {
    if (!witnessGate || !witnessKind || !toolProfile || toolProfile !== 'admission-census-v1' || !invocationIntentId) {
      throw new Error(`${command} requires --gate, --kind, --tool-profile admission-census-v1, and --invocation-intent`);
    }
    if (command === 'witness:search') {
      if (witnessKind !== 'search_result' || witnessBundlePath || witnessNestedHandoffPath || namedPrimaryOutputProjectionSha256 || toolReceiptId || toolReceiptSha256 || toolAuthorityIndexSha256 || recoveryNonce || transactionId || fromLock || acknowledgeNoLiveWriter || action || proposalPath || operation || expectedCurrentIndexSha256 || sourceRegisterPath || sourceReviewsPath || registerDeltaPath || nextRegisterPath || sourceGenerationsPath || overlapUniversePath || overlapRecordsPath || overlapPolicyPath || overlapNormalizersPath || overlapBytesRoot || overlapToolSnapshotPath || generation !== undefined || inputGenerationSha256 || expectedCurrentGenerationSha256 || selectedGenerationSha256 || outputSetSha256 || exitCode !== undefined || observedResourceUsage) {
        throw new Error('witness:search accepts only --root, --gate smoke/canary, --kind search_result, --tool-profile admission-census-v1, and --invocation-intent');
      }
    } else {
      const expectedKind = command === 'witness:publish-search' ? 'search_result' : command === 'witness:publish-review' ? 'witness_review' : witnessKind;
      if (command !== 'witness:recover-publication' && witnessKind !== expectedKind) throw new Error(`${command} requires --kind ${expectedKind}`);
      if (!witnessBundlePath || !witnessNestedHandoffPath || !namedPrimaryOutputProjectionSha256 || !toolReceiptId || !toolReceiptSha256 || !toolAuthorityIndexSha256 || action || proposalPath || operation || expectedCurrentIndexSha256 || sourceRegisterPath || sourceReviewsPath || registerDeltaPath || nextRegisterPath || sourceGenerationsPath || overlapUniversePath || overlapRecordsPath || overlapPolicyPath || overlapNormalizersPath || overlapBytesRoot || overlapToolSnapshotPath || generation !== undefined || inputGenerationSha256 || expectedCurrentGenerationSha256 || selectedGenerationSha256 || outputSetSha256 || exitCode !== undefined || observedResourceUsage) {
        throw new Error(`${command} requires --bundle, --nested-handoff, --named-primary-output-sha256, and indexed publication tool receipt selectors only`);
      }
      if (!/^[a-f0-9]{64}$/.test(toolReceiptId) || !/^[a-f0-9]{64}$/.test(toolReceiptSha256) || !/^[a-f0-9]{64}$/.test(toolAuthorityIndexSha256)) throw new Error('witness publication tool selectors must be lowercase SHA-256 values');
      if (command === 'witness:recover-publication') {
        if (!recoveryNonce || (!transactionId && !fromLock) || (transactionId && fromLock) || !acknowledgeNoLiveWriter) throw new Error('witness:recover-publication requires exactly one recovery selector, --recovery-nonce, and --acknowledge-no-live-writer');
        if (!/^[a-f0-9]{64}$/.test(recoveryNonce)) throw new Error('--recovery-nonce must be a lowercase SHA-256');
      } else if (transactionId || fromLock || acknowledgeNoLiveWriter) {
        throw new Error(`${command} does not accept recovery selectors`);
      }
    }
  } else if (command === 'acquisition:publish') {
    if (!proposalPath || !operation || !toolProfile || !invocationIntentId || transactionId || fromLock || recoveryNonce || acknowledgeNoLiveWriter) throw new Error('acquisition:publish requires --publication-proposal, --operation, --tool-profile, and --invocation-intent');
    if (toolProfile !== 'admission-acquisition-publication-v1') throw new Error('--tool-profile must be admission-acquisition-publication-v1');
    if (operation === 'create' && expectedCurrentIndexSha256 !== undefined) throw new Error('create cannot use --expected-current-index-sha256');
    if (operation === 'replace' && (!expectedCurrentIndexSha256 || !/^[a-f0-9]{64}$/.test(expectedCurrentIndexSha256))) throw new Error('replace requires a lowercase --expected-current-index-sha256');
  } else if (command === 'acquisition:recover-publication') {
    if (proposalPath || operation || expectedCurrentIndexSha256 || !toolProfile || !invocationIntentId || !recoveryNonce || (!transactionId && !fromLock) || (transactionId && fromLock) || !acknowledgeNoLiveWriter) throw new Error('acquisition:recover-publication requires exactly one of --from-lock or --transaction-id, --recovery-nonce, --tool-profile, --invocation-intent, and --acknowledge-no-live-writer');
    if (toolProfile !== 'admission-acquisition-publication-v1') throw new Error('--tool-profile must be admission-acquisition-publication-v1');
    if (!/^[a-f0-9]{64}$/.test(recoveryNonce)) throw new Error('--recovery-nonce must be a lowercase SHA-256');
  } else if (command === 'tool-authority:recover') {
    if (proposalPath || operation || expectedCurrentIndexSha256 || toolProfile || invocationIntentId || !recoveryNonce || (!transactionId && !fromLock) || (transactionId && fromLock) || !acknowledgeNoLiveWriter) throw new Error('tool-authority:recover requires exactly one of --from-lock or --transaction-id, --recovery-nonce, and --acknowledge-no-live-writer');
    if (!/^[a-f0-9]{64}$/.test(recoveryNonce)) throw new Error('--recovery-nonce must be a lowercase SHA-256');
  } else if (command === 'register:publish-round') {
    if (!registerDeltaPath || !nextRegisterPath || !sourceGenerationsPath || !toolProfile || toolProfile !== 'admission-acquisition-publication-v1' || !invocationIntentId || !toolReceiptId || !toolReceiptSha256 || !toolAuthorityIndexSha256 || !toolAuthorityTransactionId || proposalPath || operation || expectedCurrentIndexSha256 || transactionId || fromLock || recoveryNonce || acknowledgeNoLiveWriter) throw new Error('register:publish-round requires register inputs, invocation intent, publication profile, and tool receipt fields');
    if (!/^[a-f0-9]{64}$/.test(toolReceiptSha256) || !/^[a-f0-9]{64}$/.test(toolAuthorityIndexSha256)) throw new Error('Register tool receipt hashes must be lowercase SHA-256');
  } else {
    if (proposalPath || operation || expectedCurrentIndexSha256 || !toolProfile || toolProfile !== 'admission-acquisition-publication-v1' || !recoveryNonce || (!transactionId && !fromLock) || (transactionId && fromLock) || !acknowledgeNoLiveWriter || !toolReceiptId || !toolReceiptSha256 || !toolAuthorityIndexSha256 || !toolAuthorityTransactionId) throw new Error('register:recover requires --from-lock, recovery nonce, profile, tool receipt fields, and --acknowledge-no-live-writer');
    if (!/^[a-f0-9]{64}$/.test(recoveryNonce) || !/^[a-f0-9]{64}$/.test(toolReceiptSha256) || !/^[a-f0-9]{64}$/.test(toolAuthorityIndexSha256)) throw new Error('Register recovery hashes/nonces must be lowercase SHA-256');
  }
  return { command, root, proposalPath, inputGenerationProposalPath, inputGenerationPath, currentPath, priorCurrentPath, operation, expectedCurrentIndexSha256, expectedCurrentStaticGenerationSha256, expectCurrentAbsent: expectCurrentAbsent || undefined, requireRealScaleReceipt: requireRealScaleReceipt || undefined, preWitnessBundlePath, overlapGenerationPath, overlapIndexPath, overlapResourceReceiptPath, overlapLedgerPath, realScaleRecordCount, realScaleUniverseSha256, realScaleRecordsJsonlSha256, toolProfile, action, canonicalArgvSha256, inputSetSha256, executableBehaviorSha256, networkAuthorizationSha256, invocationIntentId, transactionId, fromLock: fromLock || undefined, recoveryNonce, acknowledgeNoLiveWriter: acknowledgeNoLiveWriter || undefined, sourceRegisterPath, sourceReviewsPath, registerDeltaPath, nextRegisterPath, sourceGenerationsPath, toolReceiptId, toolReceiptSha256, toolAuthorityIndexSha256, toolAuthorityTransactionId, overlapUniversePath, overlapRecordsPath, overlapPolicyPath, overlapNormalizersPath, overlapBytesRoot, overlapToolSnapshotPath, generation, inputGenerationSha256, expectedCurrentGenerationSha256, selectedGenerationSha256, outputSetSha256, exitCode, observedResourceUsage, joinStaticAuthority: joinStaticAuthority || undefined, witnessBundlePath, witnessGate, witnessKind, witnessNestedHandoffPath, namedPrimaryOutputProjectionSha256, smokeInputManifestPath };
}

async function main(): Promise<void> {
  let requestedCommand = 'evidence:verify';
  try {
    requestedCommand = process.argv[2] ?? requestedCommand;
    const args = parse(process.argv.slice(2));
    if (args.command === 'admission:smoke-input') {
      await runSmokeInputMaterializationCommand(args);
      return;
    }
    if (args.command === 'rebuild:pre-witness' || args.command === 'static-authority:recover') {
      await runOuterAuthorityCommand(args);
      return;
    }
    if (args.requireRealScaleReceipt && (args.command === 'authority:overlap' || args.command === 'authority:overlap:verify')) {
      throw new Error(`--require-real-scale-receipt is not satisfied by the fixture-scale ${args.command} path; real-corpus resource receipt enforcement is not implemented`);
    }
    if (args.command === 'tool-authority:intent') {
      const result = await publishAdmissionToolInvocationIntent({
        toolAuthorityRoot: toolAuthorityRootFor(args.root),
        profileId: args.toolProfile!,
        action: args.action!,
        canonicalArgvSha256: args.canonicalArgvSha256!,
        inputSetSha256: args.inputSetSha256!,
        executableBehaviorSha256: args.executableBehaviorSha256!,
        networkAuthorizationSha256: args.networkAuthorizationSha256,
      });
      output({ ok: true, command: args.command, ...result });
      return;
    }
    if (args.command === 'tool-authority:receipt') {
      let observedResourceUsage: unknown;
      try { observedResourceUsage = JSON.parse(args.observedResourceUsage!); } catch { throw new Error('--observed-resource-usage must be a JSON object'); }
      if (!observedResourceUsage || typeof observedResourceUsage !== 'object' || Array.isArray(observedResourceUsage)) throw new Error('--observed-resource-usage must be a JSON object');
      const result = await publishAdmissionToolReceipt({
        toolAuthorityRoot: toolAuthorityRootFor(args.root),
        invocationIntentId: args.invocationIntentId!,
        observedResourceUsage: observedResourceUsage as Readonly<Record<string, number>>,
        exitCode: args.exitCode!,
        outputSetSha256: args.outputSetSha256!,
      });
      output({ ok: true, command: args.command, ...result });
      return;
    }
    if (args.command === 'tool-authority:resolve') {
      let expectedSnapshot: unknown;
      if (args.overlapToolSnapshotPath !== undefined) {
        const snapshotPath = await requireContainedAdmissionPath(args.root, args.overlapToolSnapshotPath);
        const snapshotBytes = await readFile(snapshotPath);
        try { expectedSnapshot = JSON.parse(snapshotBytes.toString('utf8')) as unknown; } catch { throw new Error('--tool-snapshot is not valid JSON'); }
        if (calibrationAdmissionCanonicalJson(expectedSnapshot) !== snapshotBytes.toString('utf8')) throw new Error('--tool-snapshot is not canonical JSON');
      }
      const resolved = await resolveAdmissionToolAuthorityReceipt({
        authorityRoot: args.root,
        authorityIndexSha256: args.toolAuthorityIndexSha256!,
        receiptId: args.toolReceiptId!,
        receiptSha256: args.toolReceiptSha256!,
        invocationIntentId: args.invocationIntentId!,
        profileId: args.toolProfile!,
        action: args.action!,
        expectedSnapshot,
      });
      output({
        ok: true,
        command: args.command,
        authorityIndexSha256: resolved.authorityIndexSha256,
        receiptId: resolved.receipt.receiptId,
        receiptSha256: resolved.receiptSha256,
        invocationIntentId: resolved.invocationIntent.intentId,
        profileId: resolved.profile.profileId,
        action: resolved.receipt.action,
        exitCode: resolved.receipt.exitCode,
        outputSetSha256: resolved.receipt.outputSetSha256,
        snapshot: resolved.snapshot,
      });
      return;
    }
    if (args.command === 'witness:search') {
      await runWitnessSearchCommand(args);
      return;
    }
    if (args.command === 'witness:publish-search' || args.command === 'witness:publish-review' || args.command === 'witness:recover-publication') {
      await runWitnessPublicationCommand(args);
      return;
    }
    if (args.command === 'authority:overlap:verify') {
      const result = await verifyAdmissionOverlap(
        args.root,
        args.selectedGenerationSha256,
        args.joinStaticAuthority
          ? {
            staticAuthorityJoin: {
              receiptId: args.toolReceiptId!,
              receiptSha256: args.toolReceiptSha256!,
              authorityIndexSha256: args.toolAuthorityIndexSha256!,
              invocationIntentId: args.invocationIntentId!,
            },
          }
          : undefined,
      );
      output({ ok: result.ok, command: args.command, ...result });
      if (!result.ok) process.exitCode = 2;
      return;
    }
    if (args.command === 'authority:overlap:recover') {
      const result = await recoverAdmissionOverlap({
        root: args.root,
        transactionId: args.transactionId,
        fromLock: args.fromLock,
        recoveryNonce: args.recoveryNonce!,
        toolReceipt: { receiptId: args.toolReceiptId!, receiptSha256: args.toolReceiptSha256!, authorityIndexSha256: args.toolAuthorityIndexSha256! },
        acknowledgeNoLiveWriter: true,
      });
      if (!result.complete) {
        process.stderr.write(`${JSON.stringify({ ok: false, command: args.command, ...result })}\n`);
        process.exitCode = 2;
        return;
      }
      output({ ok: true, command: args.command, ...result });
      return;
    }
    if (args.command === 'authority:overlap') {
      const readJsonInput = async (path: string): Promise<unknown> => {
        const bytes = await readFile(await requireContainedAdmissionPath(args.root, path));
        try { return JSON.parse(bytes.toString('utf8')) as unknown; } catch { throw new Error(`Overlap input is not valid JSON: ${path}`); }
      };
      const universe = await readJsonInput(args.overlapUniversePath!);
      const policy = await readJsonInput(args.overlapPolicyPath!);
      const normalizerRegistry = await readJsonInput(args.overlapNormalizersPath!);
      const toolAuthoritySnapshot = await readJsonInput(args.overlapToolSnapshotPath!);
      const recordsPath = await requireContainedAdmissionPath(args.root, args.overlapRecordsPath!);
      await requireContainedAdmissionPath(args.root, args.overlapBytesRoot!);
      const stream = openAdmissionOverlapUniverseStream(createReadStream(recordsPath), universe as never, normalizerRegistry as never);
      const workDirectory = await mkdtemp(join(args.root, '.overlap-builder-'));
      try {
        const buildResult = await buildAdmissionOverlapLedger(
          universe as never,
          stream.records,
          async (record) => {
            const locator = (record as unknown as { locator?: { normalizedPath?: unknown } }).locator;
            if (typeof locator?.normalizedPath !== 'string') throw new Error('Overlap record locator has no normalized path');
            return readFile(await requireContainedAdmissionPath(args.root, join(args.overlapBytesRoot!, locator.normalizedPath)));
          },
          workDirectory,
          policy as never,
          normalizerRegistry as never,
        );
        const streamStats = await stream.complete;
        if (!streamStats.ok) throw new Error(`Overlap record stream is not authoritative: ${streamStats.errors.join('; ')}`);
        const result = await publishAdmissionOverlap({
          root: args.root,
          generationLocalRoot: workDirectory,
          buildResult,
          universe: universe as never,
          policy: policy as never,
          normalizerRegistry: normalizerRegistry as never,
          generation: args.generation!,
          inputGenerationSha256: args.inputGenerationSha256!,
          invocationIntentId: args.invocationIntentId!,
          toolAuthoritySnapshot: toolAuthoritySnapshot as never,
          toolReceipt: { receiptId: args.toolReceiptId!, receiptSha256: args.toolReceiptSha256!, authorityIndexSha256: args.toolAuthorityIndexSha256! },
          operation: args.operation,
          expectedCurrentGenerationSha256: args.expectedCurrentGenerationSha256,
          recoveryNonce: args.recoveryNonce,
        });
        if (result.complete) await rm(workDirectory, { recursive: true, force: true });
        output({ ok: true, command: args.command, ...result });
        return;
      } catch (error) {
        // Publication journals contain a complete transaction-owned staging
        // tree before any pending boundary; the builder scratch directory is
        // never needed for recovery and must not accumulate as an orphan.
        await rm(workDirectory, { recursive: true, force: true });
        throw error;
      }
    }
    if (args.command === 'acquisition:publish') {
      const proposalPath = args.proposalPath!;
      const proposalBytes = await readFile(await requireContainedAdmissionPath(args.root, proposalPath));
      let proposal: unknown;
      try { proposal = JSON.parse(proposalBytes.toString('utf8')) as unknown; } catch { throw new Error('Publication proposal is not valid JSON'); }
      if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) throw new Error('Publication proposal must be a JSON object');
      const record = proposal as Record<string, unknown>;
      if (record.operation !== args.operation) throw new Error('CLI --operation does not match publication proposal');
      const expected = args.expectedCurrentIndexSha256;
      if (args.operation === 'create' && (record.expectedCurrentState as Record<string, unknown> | undefined)?.kind !== 'absent') throw new Error('create requires an absent expected-current state in the proposal');
      if (args.operation === 'replace' && ((record.expectedCurrentState as Record<string, unknown> | undefined)?.indexSha256 !== expected)) throw new Error('CLI expected-current hash does not match proposal');
      const result = await publishAcquisitionPublication({ root: args.root, proposal, proposalPath, invocationIntentId: args.invocationIntentId });
      if (!result.complete) {
        process.stderr.write(`${JSON.stringify({ ok: false, command: args.command, ...result })}\n`);
        process.exitCode = 2;
        return;
      }
      output({ ok: true, command: args.command, ...result });
      return;
    }
    if (args.command === 'acquisition:recover-publication') {
      const result = await recoverAcquisitionPublication({ root: args.root, transactionId: args.transactionId, fromLock: args.fromLock, recoveryNonce: args.recoveryNonce!, invocationIntentId: args.invocationIntentId, acknowledgeNoLiveWriter: true });
      if (!result.complete) {
        process.stderr.write(`${JSON.stringify({ ok: false, command: args.command, ...result })}\n`);
        process.exitCode = 2;
        return;
      }
      output({ ok: true, command: args.command, ...result });
      return;
    }
    if (args.command === 'tool-authority:recover') {
      const result = await recoverToolAuthorityPublication({
        root: args.root,
        transactionId: args.transactionId,
        fromLock: args.fromLock,
        recoveryNonce: args.recoveryNonce!,
        acknowledgeNoLiveWriter: true,
      });
      if (!result.complete) {
        process.stderr.write(`${JSON.stringify({ ok: false, command: args.command, ...result })}\n`);
        process.exitCode = 2;
        return;
      }
      output({ ok: true, command: args.command, ...result });
      return;
    }
    if (args.command === 'register:publish-round') {
      const readJsonInput = async (path: string): Promise<unknown> => {
        const bytes = await readFile(await requireContainedAdmissionPath(args.root, path));
        try { return JSON.parse(bytes.toString('utf8')) as unknown; } catch { throw new Error(`Register input is not valid JSON: ${path}`); }
      };
      const delta = await readJsonInput(args.registerDeltaPath!);
      const nextRegister = await readJsonInput(args.nextRegisterPath!);
      const sourceValue = await readJsonInput(args.sourceGenerationsPath!);
      if (!Array.isArray(sourceValue)) throw new Error('Register source generations must be a JSON array');
      const sourceGenerations = sourceValue.map((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Register source generation rows must be objects');
        const row = entry as Record<string, unknown>;
        if (typeof row.sourceId !== 'string' || typeof row.bytesBase64 !== 'string') throw new Error('Register source generation rows require sourceId and bytesBase64');
        return { sourceId: row.sourceId, bytes: Buffer.from(row.bytesBase64, 'base64'), proposalId: typeof row.proposalId === 'string' ? row.proposalId : undefined, artifactSetSha256: typeof row.artifactSetSha256 === 'string' ? row.artifactSetSha256 : undefined };
      });
      const result = await publishRegisterGeneration({
        root: args.root,
        delta,
        nextRegister,
        sourceGenerations,
        invocationIntentId: args.invocationIntentId!,
        toolReceipt: { receiptId: args.toolReceiptId!, receiptSha256: args.toolReceiptSha256!, authorityIndexSha256: args.toolAuthorityIndexSha256!, publicationTransactionId: args.toolAuthorityTransactionId! },
      });
      output({ ok: true, command: args.command, ...result });
      return;
    }
    if (args.command === 'register:recover') {
      const result = await recoverRegisterGeneration({
        root: args.root,
        transactionId: args.transactionId,
        recoveryNonce: args.recoveryNonce!,
        toolReceipt: { receiptId: args.toolReceiptId!, receiptSha256: args.toolReceiptSha256!, authorityIndexSha256: args.toolAuthorityIndexSha256!, publicationTransactionId: args.toolAuthorityTransactionId! },
        acknowledgeNoLiveWriter: true,
      });
      output({ ok: true, command: args.command, ...result });
      return;
    }
    const verified = await buildVerifiedAdmissionEvidenceContext(args.root, { expectedProfileId: args.toolProfile, expectedInvocationIntentId: args.invocationIntentId });
    if (!verified.ok) {
      output({ ok: false, command: args.command, errors: verified.errors });
      process.exitCode = 2;
      return;
    }
    if (args.command === 'source:census' || args.command === 'census:preview') {
      const registerBytes = await readFile(await requireContainedAdmissionPath(args.root, args.sourceRegisterPath!));
      const reviewBytes = await readFile(await requireContainedAdmissionPath(args.root, args.sourceReviewsPath!));
      let sourceRegister: unknown;
      let sourceReviews: unknown;
      try {
        sourceRegister = JSON.parse(registerBytes.toString('utf8')) as unknown;
        sourceReviews = JSON.parse(reviewBytes.toString('utf8')) as unknown;
      } catch {
        throw new Error('source:census register/reviews input is not valid JSON');
      }
      if (!Array.isArray(sourceReviews)) throw new Error('source:census source reviews must be a JSON array');
      const diagnostic = buildAdmissionSourceCensus({ context: verified.context, sourceRegister, sourceReviews });
      const result = { ok: true, command: args.command, ...diagnostic };
      if (args.command === 'census:preview') outputCanonical(result);
      else output(result);
      return;
    }
    if (args.command === 'census' || args.command === 'census:stdout') {
      const admission = await (await import('../../src/calibration/v103/admission-context')).buildVerifiedAdmissionContext(args.root, verified.context);
      if (!admission.ok) {
        outputCanonical({ ok: false, command: args.command, ready: false, authorityEligible: false, diagnosticOnly: true, blockers: admission.errors });
        process.exitCode = 2;
        return;
      }
      const projection = projectEligibleWitnessCandidates(admission.context);
      const eligibilitySnapshotSha256 = computeAdmissionEligibilitySnapshotSha256(admission.context);
      const smokeSearch = buildAdmissionSearchResultBundleFromCandidates(admission.context, 'smoke', eligibilitySnapshotSha256, projection.candidates, {});
      const canarySearch = buildAdmissionSearchResultBundleFromCandidates(admission.context, 'canary', eligibilitySnapshotSha256, projection.candidates, {});
      const census = buildAdmissionCensus({
        context: admission.context,
        search: {
          smoke: { bundle: smokeSearch, publicationCompletionSha256: '0'.repeat(64), publicationCompletionRelativePath: 'witnesses/smoke/search-results/diagnostic-completion.json' },
          canary: { bundle: canarySearch, publicationCompletionSha256: '0'.repeat(64), publicationCompletionRelativePath: 'witnesses/canary/search-results/diagnostic-completion.json' },
        },
      });
      if (!census.ok) {
        outputCanonical({ ok: false, command: args.command, ready: false, authorityEligible: false, diagnosticOnly: true, blockers: census.errors });
        process.exitCode = 2;
        return;
      }
      outputCanonical({ ok: true, command: args.command, diagnosticOnly: true, authorityEligible: false, ...census.census });
      return;
    }
    output({
      ok: true,
      command: args.command,
      evidenceContextSha256: verified.context.evidenceContextSha256,
      bundleSha256: verified.context.bundle.bundleSha256,
      verifiedEvidenceIds: verified.context.verifiedEvidenceIds,
      unavailableEvidenceIds: verified.context.unavailableEvidenceIds,
    });
  } catch (error) {
    if (error instanceof AdmissionWitnessPublicationPendingError) {
      process.stderr.write(`${JSON.stringify({ ok: false, command: requestedCommand, code: 'publication_pending', ...error.result, errors: [error.message] })}\n`);
      process.exitCode = 2;
      return;
    }
    if (error instanceof AdmissionWitnessPublicationContendedError) {
      process.stderr.write(`${JSON.stringify({ ok: false, command: requestedCommand, code: 'publication_contended', ...error.result, errors: [error.message] })}\n`);
      process.exitCode = 2;
      return;
    }
    if (error instanceof PrebuiltAuthorityPublicationPendingError) {
      process.stderr.write(`${JSON.stringify({ ok: false, command: requestedCommand, code: 'publication_pending', ...error.result, errors: [error.message] })}\n`);
      process.exitCode = 2;
      return;
    }
    if (error instanceof PrebuiltAuthorityRebuildVerificationError) {
      process.stderr.write(`${JSON.stringify({ ok: false, command: requestedCommand, code: 'post_publication_verification_failed', ...error.publication, errors: error.errors })}\n`);
      process.exitCode = 2;
      return;
    }
    if (error instanceof OverlapPublicationPostCompletionError) {
      output({ ok: true, command: requestedCommand, ...error.result, warning: error.message });
      return;
    }
    if (error instanceof OverlapPublicationContendedError) {
      process.stderr.write(`${JSON.stringify({ ok: false, command: requestedCommand, ...error.result, error: error.message })}\n`);
      process.exitCode = 2;
      return;
    }
    if (error instanceof AcquisitionPublicationPendingError || error instanceof RegisterPublicationPendingError || error instanceof OverlapPublicationPendingError) {
      process.stderr.write(`${JSON.stringify({ ok: false, command: requestedCommand, ...error.result })}\n`);
      process.exitCode = 2;
      return;
    }
    const failure = JSON.stringify({ ok: false, command: requestedCommand, errors: [error instanceof Error ? error.message : String(error)] });
    if (requestedCommand.startsWith('acquisition:') || requestedCommand.startsWith('register:') || requestedCommand === 'tool-authority:recover' || requestedCommand === 'rebuild:pre-witness' || requestedCommand === 'static-authority:recover') process.stderr.write(`${failure}\n`);
    else output(JSON.parse(failure));
    process.exitCode = 2;
  }
}

void main();
