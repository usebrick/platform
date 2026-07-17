/**
 * Pure v10.3.2 admission-manifest construction.
 *
 * The two arguments are deliberately private, runtime-branded values.  This
 * module does not read the corpus, inspect a checkout, or discover files.  It
 * projects only the exact witness units from the verified context and binds
 * every output identity to the source, lineage, evidence, and prerequisite
 * graphs already verified by their owning boundaries.
 */
import {
  calibrationAdmissionBindingSha256,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionSha256,
  calibrationAdmissionToolReceiptSha256,
  calibrationCorpusSourceId,
  isCalibrationCorpusManifestV103,
  type CalibrationAdmissionMaterializationReceiptV1,
  type CalibrationAdmissionRecordV103,
  type CalibrationAdmissionWitnessReviewBundleV1,
  type CalibrationSourceReviewV103,
  type SlopbrickCalibrationCorpusManifestV103,
} from '@usebrick/core';

import {
  deriveAdmissionDisposition,
  isVerifiedAdmissionContext,
  listVerifiedAdmissionRecords,
  type VerifiedAdmissionContextV1,
} from './admission-context';
import {
  isVerifiedAdmissionManifestPrerequisites,
  type VerifiedAdmissionManifestPrerequisitesV1,
} from './admission-manifest-prerequisites';
import {
  isVerifiedReadyAdmissionCensus,
  type VerifiedReadyAdmissionCensusV1,
} from './admission-ready-census';

const SHA256 = /^[a-f0-9]{64}$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const COMMIT = /^[a-f0-9]{40,64}$/u;

export interface BuildCorpusManifestFromAdmissionInputV1 {
  readonly ready: VerifiedReadyAdmissionCensusV1;
  readonly prerequisites: VerifiedAdmissionManifestPrerequisitesV1;
}

function isSha(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(compare);
}

function latestIso(values: readonly unknown[], label: string): string {
  const timestamps = values.filter((value): value is string => typeof value === 'string' && ISO_DATE.test(value));
  if (timestamps.length === 0) throw new Error(`${label} has no verified ISO timestamp`);
  return [...timestamps].sort(compare).at(-1)!;
}

function shaSet(values: readonly string[]): string {
  return calibrationAdmissionSha256(uniqueSorted(values));
}

function sourceReviewMap(context: VerifiedAdmissionContextV1): ReadonlyMap<string, CalibrationSourceReviewV103> {
  return new Map(context.durable.sourceReviews.map((review) => [review.sourceId, review]));
}

function materializationMap(context: VerifiedAdmissionContextV1): ReadonlyMap<string, CalibrationAdmissionMaterializationReceiptV1> {
  return new Map(context.durable.materializationReceipts.map((receipt) => [receipt.materializationId, receipt]));
}

function evidenceReference(context: VerifiedAdmissionContextV1, record: CalibrationAdmissionRecordV103): string {
  const evidenceIds = record.authorship.evidenceIds;
  const item = evidenceIds
    .map((id) => context.durable.evidenceIndex.items.find((candidate) => candidate.evidenceId === id))
    .find((candidate) => candidate !== undefined);
  if (item === undefined || item.locator.kind !== 'immutable_https') {
    throw new Error(`record ${record.recordId} has no immutable HTTPS evidence reference`);
  }
  return item.locator.url;
}

function manifestEvidence(context: VerifiedAdmissionContextV1, record: CalibrationAdmissionRecordV103): SlopbrickCalibrationCorpusManifestV103['files'][number]['evidence'] {
  const reference = evidenceReference(context, record);
  const authorship = record.authorship;
  if (authorship.kind === 'generator_record') {
    return {
      kind: 'generator_record',
      reference,
      model: authorship.model,
      promptTaskId: authorship.promptTaskId,
      generatedAt: authorship.generatedAt,
      humanEditStatus: authorship.humanEditStatus,
    };
  }
  if (authorship.kind === 'benchmark_attestation') {
    return {
      kind: 'benchmark',
      reference,
      benchmarkId: authorship.benchmarkId,
      benchmarkVersion: authorship.benchmarkVersion,
    };
  }
  // The manifest evidence union intentionally has no historical or repository
  // attestation variant.  A reviewed protocol URL remains the lossless public
  // pointer for those accepted units; the authoritative details stay in the
  // admission record and its evidence graph.
  return {
    kind: 'manual_protocol',
    reference,
    protocolId: authorship.evidenceIds[0] ?? record.recordId,
  };
}

type RepositoryProjection = SlopbrickCalibrationCorpusManifestV103['repositories'][number];

function rightsLicense(review: CalibrationSourceReviewV103, materializationId: string): string {
  const rights = review.materialization.kind === 'release_archive_set'
    ? review.materialization.assets.find((asset) => asset.materializationId === materializationId)?.rights
    : review.sourceRights;
  if (rights === undefined || rights.status !== 'reviewed' || typeof rights.spdx !== 'string' || rights.spdx.length === 0
    || rights.analysisUse !== 'approved' || rights.redistribution !== 'approved'
    || !['complete', 'not_applicable'].includes(rights.thirdPartyChain)) {
    throw new Error(`source ${review.sourceId} has no redistributable reviewed license for ${materializationId}`);
  }
  return rights.spdx;
}

function repositoryFor(
  review: CalibrationSourceReviewV103,
  materialization: CalibrationAdmissionMaterializationReceiptV1,
  lineageFamilyId: string,
  locatorMaterializationId: string,
): RepositoryProjection {
  if (review.decision !== 'candidate' || review.origin.kind !== 'https') {
    throw new Error(`source ${review.sourceId} is not an admitted HTTPS candidate`);
  }
  if (materialization.materializationId !== locatorMaterializationId || materialization.sourceId !== review.sourceId) {
    throw new Error(`source ${review.sourceId} materialization identity is not bound`);
  }
  const materializationValue = review.materialization;
  if (materializationValue.kind === 'git') {
    if (materialization.payload.kind !== 'git') {
      throw new Error(`source ${review.sourceId} git materialization receipt is not bound`);
    }
    if (materializationValue.materializationId !== locatorMaterializationId
      || materializationValue.repositoryId !== materialization.repositoryId
      || materializationValue.commitSha !== materialization.payload.commitSha
      || materialization.payload.originUrl !== review.origin.url
      || !COMMIT.test(materializationValue.commitSha)) {
      throw new Error(`source ${review.sourceId} git materialization is not bound`);
    }
    return {
      repositoryId: materialization.repositoryId,
      familyId: lineageFamilyId,
      originUrl: review.origin.url,
      commitSha: materializationValue.commitSha,
      acquiredAt: review.reviewedAt,
      license: rightsLicense(review, locatorMaterializationId),
    };
  }
  if (materializationValue.kind !== 'release_archive_set' || materialization.payload.kind !== 'release_archive') {
    throw new Error(`source ${review.sourceId} uses an unsupported materialization`);
  }
  const asset = materializationValue.assets.find((candidate) => candidate.materializationId === locatorMaterializationId);
  if (asset === undefined || asset.repositoryId !== materialization.repositoryId
    || materialization.payload.originUrl !== review.origin.url
    || materialization.payload.assetSha256 !== asset.materialization.assetSha256
    || materialization.payload.assetBytes !== asset.materialization.assetBytes
    || !COMMIT.test(materializationValue.upstreamCommitSha)) {
    throw new Error(`source ${review.sourceId} release materialization is not bound`);
  }
  return {
    repositoryId: materialization.repositoryId,
    familyId: lineageFamilyId,
    originUrl: review.origin.url,
    commitSha: materializationValue.upstreamCommitSha,
    acquiredAt: review.reviewedAt,
    license: rightsLicense(review, locatorMaterializationId),
    materialization: asset.materialization,
  };
}

function packedRuntimeReceiptSetSha256(prerequisites: VerifiedAdmissionManifestPrerequisitesV1): string {
  const artifacts = new Map(prerequisites.bundle.referencedArtifacts.map((artifact) => [artifact.artifactId, artifact]));
  const receipts = prerequisites.bundle.packedRuntimes
    .slice()
    .sort((left, right) => left.nodeMajor - right.nodeMajor)
    .map((runtime) => {
      const artifact = artifacts.get(runtime.receiptArtifactId);
      if (artifact === undefined || artifact.kind !== 'packed_runtime_receipt' || !isSha(artifact.sha256)) {
        throw new Error(`packed runtime receipt artifact ${runtime.receiptArtifactId} is not verified`);
      }
      return artifact.sha256;
    });
  if (receipts.length !== 2) throw new Error('Node 22 and Node 24 packed runtime receipts are required');
  return shaSet(receipts);
}

function witnessReviewReceiptSetSha256(bundle: CalibrationAdmissionWitnessReviewBundleV1): string {
  const receiptHashes = [
    bundle.searchResultBundle.searchReceipt.receiptId,
    ...bundle.searchResultBundle.toolReceipts.map((receipt) => calibrationAdmissionToolReceiptSha256(receipt)),
    ...bundle.regenerations.map((regeneration) => calibrationAdmissionToolReceiptSha256(regeneration.toolReceipt)),
    calibrationAdmissionToolReceiptSha256(bundle.constraintCheck.toolReceipt),
    bundle.blindReviewReceipt.receiptId,
    bundle.witnessReviewReceipt.receiptId,
  ];
  if (!receiptHashes.every(isSha)) throw new Error('witness review receipt set contains an invalid hash');
  return shaSet(receiptHashes);
}

function lineageFor(context: VerifiedAdmissionContextV1, record: CalibrationAdmissionRecordV103): {
  readonly familyId: string;
  readonly exactClusterId: string;
  readonly pairGroupId?: string;
  readonly split: 'train' | 'validation' | 'test';
} {
  const lineageLedger = context.durable.lineageLedger;
  if (!isRecord(lineageLedger) || !Array.isArray(lineageLedger.results)) {
    throw new Error(`record ${record.recordId} has no verified lineage ledger`);
  }
  const result = lineageLedger.results.find((candidate) => candidate.recordId === record.recordId);
  if (result === undefined || result.contentSha256 !== record.contentSha256 || result.split === 'unassigned') {
    throw new Error(`record ${record.recordId} has no verified lineage result`);
  }
  if (result.familyId !== record.claimedLineage.familyId || result.exactClusterId !== record.claimedLineage.exactClusterId
    || (result.pairGroupId ?? undefined) !== (record.claimedLineage.pairGroupId ?? undefined)) {
    throw new Error(`record ${record.recordId} lineage claims disagree with the verified ledger`);
  }
  return {
    familyId: result.familyId,
    exactClusterId: result.exactClusterId,
    ...(result.pairGroupId === null ? {} : { pairGroupId: result.pairGroupId }),
    split: result.split,
  };
}

function assertSelectedRecord(
  context: VerifiedAdmissionContextV1,
  unit: Record<string, unknown>,
  record: CalibrationAdmissionRecordV103,
): ReturnType<typeof lineageFor> {
  if (unit.label !== record.proposedLabel || unit.materialSourceId !== record.materialSourceId
    || unit.language !== record.language || unit.familyId !== record.claimedLineage.familyId
    || unit.recordId !== record.recordId || unit.contentClusterId !== record.claimedLineage.exactClusterId
    || unit.pairGroupId !== (record.claimedLineage.pairGroupId ?? undefined)) {
    throw new Error(`witness unit ${record.recordId} does not match its verified record`);
  }
  const lineage = lineageFor(context, record);
  if (unit.split !== lineage.split) throw new Error(`witness unit ${record.recordId} split is not bound to the lineage ledger`);
  if (deriveAdmissionDisposition(context, record.recordId).disposition !== 'eligible_gold') {
    throw new Error(`witness unit ${record.recordId} is not eligible gold`);
  }
  return lineage;
}

function selectedRepositories(
  context: VerifiedAdmissionContextV1,
  records: ReadonlyMap<string, CalibrationAdmissionRecordV103>,
  units: readonly Record<string, unknown>[],
): { readonly repositories: readonly RepositoryProjection[]; readonly files: readonly SlopbrickCalibrationCorpusManifestV103['files'][number][] } {
  const reviews = sourceReviewMap(context);
  const materializations = materializationMap(context);
  const repositories = new Map<string, RepositoryProjection>();
  const files: SlopbrickCalibrationCorpusManifestV103['files'][number][] = [];
  for (const unit of units) {
    const recordId = typeof unit.recordId === 'string' ? unit.recordId : '';
    const record = records.get(recordId);
    if (record === undefined) throw new Error(`witness record ${recordId} is absent from the verified admission stream`);
    const lineage = assertSelectedRecord(context, unit, record);
    if (record.locator.kind === 'record_container') throw new Error(`record ${record.recordId} is not a scannable file`);
    const review = reviews.get(record.materialSourceId);
    if (review === undefined) throw new Error(`record ${record.recordId} source review is missing`);
    const materialization = materializations.get(record.locator.materializationId);
    if (materialization === undefined) throw new Error(`record ${record.recordId} materialization receipt is missing`);
    const expectedLocatorKind = review.materialization.kind === 'git' ? 'git_file' : review.materialization.kind === 'release_archive_set' ? 'release_archive_file' : undefined;
    if (expectedLocatorKind === undefined || record.locator.kind !== expectedLocatorKind) {
      throw new Error(`record ${record.recordId} locator kind is not bound to its source materialization`);
    }
    const repository = repositoryFor(review, materialization, lineage.familyId, record.locator.materializationId);
    if (unit.repositoryId !== repository.repositoryId) throw new Error(`witness unit ${record.recordId} repository is not bound to its materialization`);
    const existing = repositories.get(repository.repositoryId);
    if (existing !== undefined && calibrationAdmissionCanonicalJson(existing) !== calibrationAdmissionCanonicalJson(repository)) {
      throw new Error(`repository ${repository.repositoryId} has conflicting immutable metadata`);
    }
    repositories.set(repository.repositoryId, repository);
    const sourceId = calibrationCorpusSourceId(repository.repositoryId, repository.commitSha, record.locator.normalizedPath, repository.materialization);
    files.push({
      sourceId,
      repositoryId: repository.repositoryId,
      familyId: lineage.familyId,
      normalizedPath: record.locator.normalizedPath,
      contentSha256: record.contentSha256,
      language: record.language,
      stratum: record.stratum,
      clusterId: lineage.exactClusterId,
      ...(lineage.pairGroupId === undefined ? {} : { pairGroupId: lineage.pairGroupId }),
      label: record.proposedLabel,
      tier: 'gold',
      split: lineage.split,
      admissionRecordId: record.recordId,
      materializationId: record.locator.materializationId,
      evidence: manifestEvidence(context, record),
    });
  }
  const uniqueFiles = new Map(files.map((file) => [file.sourceId, file]));
  if (uniqueFiles.size !== files.length) throw new Error('witness selected duplicate source identities');
  return {
    repositories: [...repositories.values()].sort((left, right) => compare(left.repositoryId, right.repositoryId)),
    files: [...uniqueFiles.values()].sort((left, right) => compare(left.sourceId, right.sourceId)),
  };
}

function reviewMetadata(context: VerifiedAdmissionContextV1, review: CalibrationAdmissionWitnessReviewBundleV1): { readonly generatedAt: string; readonly reviewedAt: string; readonly reviewerIds: readonly [string, ...string[]] } {
  const sourceTimes = context.durable.sourceReviews.map((source) => source.reviewedAt);
  const decisionTimes = review.reviewerDecisions.map((decision) => decision.decidedAt);
  const reviewedAt = latestIso([...sourceTimes, ...decisionTimes], 'admission review graph');
  const reviewerIds = uniqueSorted(review.reviewerDecisions.map((decision) => decision.reviewerId));
  if (reviewerIds.length === 0) throw new Error('witness review has no independent reviewer IDs');
  return { generatedAt: reviewedAt, reviewedAt, reviewerIds: reviewerIds as [string, ...string[]] };
}

function censusSha(census: Record<string, unknown>, key: string): string {
  const value = census[key];
  if (!isSha(value)) throw new Error(`census field ${key} is not a verified SHA-256`);
  return value;
}

export function buildCorpusManifestFromAdmission(
  input: BuildCorpusManifestFromAdmissionInputV1,
): SlopbrickCalibrationCorpusManifestV103 {
  if (!isVerifiedReadyAdmissionCensus(input?.ready)) throw new Error('verified ready census is required');
  if (!isVerifiedAdmissionManifestPrerequisites(input?.prerequisites)) throw new Error('verified prerequisite graph is required');
  const ready = input.ready;
  const prerequisites = input.prerequisites;
  const context = ready.context;
  if (!isVerifiedAdmissionContext(context)) throw new Error('verified ready census context is not verified');
  const review = ready.witnessReviewBundle;
  if (review.gate !== ready.gate || review.searchResultBundle.result.kind !== 'witness') throw new Error('ready census does not contain a reviewed witness');
  const witness = review.searchResultBundle.result.witness;
  const records = new Map(listVerifiedAdmissionRecords(context).map((entry) => [entry.record.recordId, entry.record]));
  const selected = selectedRepositories(context, records, witness.units as unknown as Record<string, unknown>[]);
  if (selected.files.length !== witness.units.length) throw new Error('manifest file count does not match the exact witness');

  const metadata = reviewMetadata(context, review);
  const census = ready.census as unknown as Record<string, unknown>;
  const bindingBody = {
    version: 'v10.3-admission-manifest-binding-v1' as const,
    verifiedContextSha256: context.contextSha256,
    eligibilitySnapshotSha256: censusSha(census, 'eligibilitySnapshotSha256'),
    censusSha256: calibrationAdmissionSha256(census),
    admissionRecordsSha256: censusSha(census, 'admissionRecordsSha256'),
    sourceReviewSetSha256: censusSha(census, 'sourceReviewSetSha256'),
    witnessSha256: witness.witnessSha256,
    searchResultBundleSha256: review.searchResultBundle.bundleSha256,
    searchResultPublicationCompletionSha256: ready.searchPublicationAuthority.publication.completion.completionSha256,
    witnessReviewBundleSha256: review.bundleSha256,
    witnessReviewPublicationCompletionSha256: ready.witnessReviewPublicationAuthority.publication.completion.completionSha256,
    witnessReviewReceiptSetSha256: witnessReviewReceiptSetSha256(review),
    evidenceIndexSha256: censusSha(census, 'evidenceIndexSha256'),
    evidencePayloadSetSha256: censusSha(census, 'evidencePayloadSetSha256'),
    evidenceReceiptSetSha256: censusSha(census, 'evidenceReceiptSetSha256'),
    toolProfileSetSha256: censusSha(census, 'toolProfileSetSha256'),
    toolReceiptSetSha256: censusSha(census, 'toolReceiptSetSha256'),
    blindReviewReceiptSetSha256: censusSha(census, 'blindReviewReceiptSetSha256'),
    temporalAttestationSetSha256: censusSha(census, 'temporalAttestationSetSha256'),
    materializationReceiptSetSha256: censusSha(census, 'materializationReceiptSetSha256'),
    prerequisiteBundleSha256: prerequisites.bundle.bundleSha256,
    manifestBuilderBehaviorSha256: prerequisites.bundle.manifestBuilder.behaviorSha256,
    packedRuntimeReceiptSetSha256: packedRuntimeReceiptSetSha256(prerequisites),
  };
  const manifest: SlopbrickCalibrationCorpusManifestV103 = {
    version: 'v10.3',
    generatedAt: metadata.generatedAt,
    methodVersion: 'v10.3.2',
    admissionBinding: { ...bindingBody, bindingSha256: calibrationAdmissionBindingSha256(bindingBody) },
    leakageReview: {
      protocolVersion: 'v10.3-admission-leakage-review-v1',
      reviewedAt: metadata.reviewedAt,
      reviewerIds: [...metadata.reviewerIds] as [string, ...string[]],
      noCrossPolarityFamilyOrCluster: true,
    },
    repositories: selected.repositories as [RepositoryProjection, ...RepositoryProjection[]],
    files: selected.files as [SlopbrickCalibrationCorpusManifestV103['files'][number], ...SlopbrickCalibrationCorpusManifestV103['files'][number][]],
  };
  if (!isCalibrationCorpusManifestV103(manifest)) throw new Error('constructed admission manifest failed Core semantic validation');
  return manifest;
}
