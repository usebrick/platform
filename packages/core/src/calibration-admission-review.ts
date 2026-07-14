import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionSha256,
} from './calibration-admission-evidence';
import type {
  CalibrationAdmissionSourceRegisterV1,
  Entry as CalibrationAdmissionSourceRegisterEntryV1,
} from './generated/calibration-admission-source-register';
import type {
  CalibrationSourceReviewV103,
  Reason as CalibrationAdmissionReason,
} from './generated/calibration-source-review';
import {
  exactKeys,
  isAdmissionId as id,
  isJsonRecord as isRecord,
  isSha256 as sha,
  sortedUniqueByPredicate,
  withoutJsonKey as withoutKey,
} from './calibration-admission-primitives';

const MATERIALIZATION_ID = /^sbm_[a-f0-9]{64}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const REASONS = new Set<CalibrationAdmissionReason>([
  'source_unregistered',
  'source_revision_mutable',
  'source_bytes_unbound',
  'source_inventory_open',
  'source_inventory_mismatch',
  'aggregate_material_conservation_failed',
  'material_source_conflict',
  'evidence_unresolved',
  'evidence_receipt_stale',
  'record_container_projection_unsupported',
  'materialization_unsupported',
  'materialization_unverified',
  'materialization_receipt_stale',
  'license_absent',
  'license_scope_ambiguous',
  'analysis_use_unresolved',
  'analysis_use_denied',
  'redistribution_unresolved',
  'redistribution_denied',
  'third_party_rights_unresolved',
  'authorship_unproven',
  'generator_identity_missing',
  'generator_revision_missing',
  'prompt_binding_missing',
  'output_binding_mismatch',
  'human_edit_unknown',
  'human_edit_substantial',
  'human_provenance_missing',
  'historical_cutoff_failed',
  'historical_attestation_missing',
  'historical_graph_incomplete',
  'mixed_authorship',
  'family_unknown',
  'pair_incomplete',
  'pair_content_unsafe',
  'exact_cross_polarity_overlap',
  'near_cross_polarity_overlap',
  'unpaired_family_cross_polarity',
  'split_leakage',
  'lineage_ledger_incomplete',
  'overlap_universe_incomplete',
  'overlap_authority_incomplete',
  'privacy_ledger_incomplete',
  'quality_ledger_incomplete',
  'adapter_audit_mismatch',
  'privacy_high_confidence',
  'secret_high_confidence',
  'privacy_review_unresolved',
  'syntax_invalid',
  'language_normalizer_unsupported',
  'scaffold_dominant',
  'trivial_or_inert_target',
  'duplicate_record',
  'blind_review_receipt_missing',
  'witness_review_receipt_missing',
  'review_incomplete',
  'review_disagreement',
  'source_wide_quarantine',
]);

export type CalibrationAdmissionReasonV1 = CalibrationAdmissionReason;

/** Pure reason-vocabulary guard shared by the admission authority contracts. */
export function isCalibrationAdmissionReasonV1(value: unknown): value is CalibrationAdmissionReasonV1 {
  return typeof value === 'string' && REASONS.has(value as CalibrationAdmissionReason);
}

export function isCalibrationAdmissionReasonListV1(value: unknown): value is readonly CalibrationAdmissionReasonV1[] {
  return sortedUniqueReasons(value);
}

export interface CalibrationAdmissionSourceReviewValidationV1 {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

export interface CalibrationAdmissionSourceRegisterReviewSetValidationV1
  extends CalibrationAdmissionSourceReviewValidationV1 {
  readonly registeredSourceCount: number;
  readonly reviewedSourceCount: number;
  /** Candidate claims only; this slice never proves eligibility. */
  readonly candidateSourceCount: number;
  readonly candidateClaimedUnits: number;
  readonly additiveMaterialUnits: number;
  readonly additiveMaterialRepresentedUnits: number;
  readonly additiveMaterialUnrepresentedUnits: number;
  readonly quarantineUnits: number;
}

export interface CalibrationAdmissionSourceCensusCountsV1 {
  readonly selectedCoverage: 452382;
  readonly baselineMaterialUnits: 58089;
  readonly repositoryMaterialUnits: 394293;
  readonly additiveRegisteredUnits: number;
  readonly additiveRepresentedUnits: number;
  readonly additiveUnrepresentedUnits: number;
  readonly quarantineUnits: number;
  readonly candidateUnits: number;
  /** Always zero until later static ledgers and witnesses exist. */
  readonly eligibleUnits: 0;
}

export interface CalibrationAdmissionSourceCensusSourceV1 {
  readonly sourceId: string;
  readonly kind: 'aggregate_inventory' | 'material_source';
  readonly registeredUnits: number;
  /** Units counted in global additive totals; aggregate views are always zero. */
  readonly additiveUnits: number;
  readonly representedUnits: number;
  readonly unrepresentedUnits: number;
  readonly quarantineUnits: number;
  readonly eligibleUnits: number;
  readonly decision: 'candidate' | 'source_quarantine' | 'unreviewed';
  readonly reasons: readonly string[];
}

function materializationId(value: unknown): value is string {
  return typeof value === 'string' && MATERIALIZATION_ID.test(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function strictDateTime(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_TIME.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function httpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || /\s/.test(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

function sortedUniqueIds(value: unknown): value is readonly string[] {
  return sortedUniqueByPredicate(value, id);
}

function sortedUniqueShas(value: unknown): value is readonly string[] {
  return sortedUniqueByPredicate(value, sha);
}

function sortedUniqueReasons(value: unknown): value is readonly CalibrationAdmissionReason[] {
  return sortedUniqueByPredicate(value, (entry) => typeof entry === 'string' && REASONS.has(entry as CalibrationAdmissionReason)) as boolean;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

/** Derive the content-addressed materialization identity required by v10.3. */
export function calibrationAdmissionMaterializationId(
  sourceId: string,
  repositoryId: string,
  materialization: unknown,
): string {
  if (!isRecord(materialization)) throw new TypeError('materialization must be an object');
  return `sbm_${calibrationAdmissionSha256({
    sourceId,
    repositoryId,
    materialization: withoutKey(materialization, 'materializationId'),
  })}`;
}

function sourceEntry(value: unknown): value is CalibrationAdmissionSourceRegisterEntryV1 {
  if (!isRecord(value) || !exactKeys(value, [
    'sourceId',
    'kind',
    'materialPartition',
    'contributesToAdditiveCounts',
    'childMaterialSourceIds',
    'registerEvidenceIds',
    'inventoryCandidateUnits',
    ...(value.acquisitionProvenance === undefined ? [] : ['acquisitionProvenance']),
  ])) return false;
  if (!id(value.sourceId)
    || (value.kind !== 'aggregate_inventory' && value.kind !== 'material_source')
    || (value.materialPartition !== 'aggregate' && value.materialPartition !== 'baseline' && value.materialPartition !== 'repository' && value.materialPartition !== 'non_selected')
    || typeof value.contributesToAdditiveCounts !== 'boolean'
    || !sortedUniqueIds(value.childMaterialSourceIds)
    || !sortedUniqueIds(value.registerEvidenceIds)
    || !nonNegativeInteger(value.inventoryCandidateUnits)) return false;
  if (value.acquisitionProvenance !== undefined) {
    const provenance = value.acquisitionProvenance;
    if (!isRecord(provenance) || !exactKeys(provenance, ['roundId', 'sourceAuthorizationId', 'sourceAcquisitionReceiptId', 'materializationReceiptId'])
      || !id(provenance.roundId) || !id(provenance.sourceAuthorizationId)
      || !id(provenance.sourceAcquisitionReceiptId) || !id(provenance.materializationReceiptId)) return false;
  }
  return true;
}

function sourceRegisterObject(value: unknown): value is CalibrationAdmissionSourceRegisterV1 {
  if (!isRecord(value) || !exactKeys(value, [
    'version',
    'generation',
    'initialSourceIdsSha256',
    ...(value.parentRegisterSha256 === undefined ? [] : ['parentRegisterSha256']),
    'appliedDeltaIds',
    'rawDiscoveryPopulation',
    'selectedCoverage',
    'entries',
    'registerSha256',
  ])) return false;
  if (value.version !== 'v10.3-admission-source-register-v1'
    || !nonNegativeInteger(value.generation)
    || !sha(value.initialSourceIdsSha256)
    || (value.parentRegisterSha256 !== undefined && !sha(value.parentRegisterSha256))
    || !Array.isArray(value.appliedDeltaIds)
    || !value.appliedDeltaIds.every(id)
    || !isRecord(value.rawDiscoveryPopulation)
    || !exactKeys(value.rawDiscoveryPopulation, ['declaredAi', 'declaredHuman', 'closedWorld'])
    || value.rawDiscoveryPopulation.declaredAi !== 635830
    || value.rawDiscoveryPopulation.declaredHuman !== 842520
    || value.rawDiscoveryPopulation.closedWorld !== false
    || !isRecord(value.selectedCoverage)
    || !exactKeys(value.selectedCoverage, ['total', 'baselineMaterialUnits', 'repositoryMaterialUnits'])
    || value.selectedCoverage.total !== 452382
    || value.selectedCoverage.baselineMaterialUnits !== 58089
    || value.selectedCoverage.repositoryMaterialUnits !== 394293
    || !Array.isArray(value.entries)
    || !value.entries.every(sourceEntry)
    || !sha(value.registerSha256)) return false;
  const entries = value.entries as readonly CalibrationAdmissionSourceRegisterEntryV1[];
  const sourceIds = entries.map((entry) => entry.sourceId);
  const appliedDeltaIds = value.appliedDeltaIds as readonly string[];
  if (!sortedUniqueIds(sourceIds)) return false;
  if (value.generation === 0
    ? value.parentRegisterSha256 !== undefined || appliedDeltaIds.length !== 0 || entries.length !== 329
    : value.parentRegisterSha256 === undefined || appliedDeltaIds.length !== value.generation) return false;
  if (value.generation > 0 && new Set(appliedDeltaIds).size !== appliedDeltaIds.length) return false;
  try {
    if (calibrationAdmissionSha256(sourceIds) !== value.initialSourceIdsSha256) return false;
    if (calibrationAdmissionSha256(withoutKey(value, 'registerSha256')) !== value.registerSha256) return false;
  } catch {
    return false;
  }

  const byId = new Map(sourceIds.map((sourceId, index) => [sourceId, entries[index]! as CalibrationAdmissionSourceRegisterEntryV1]));
  const materialIds = new Set(entries.filter((entry) => entry.kind === 'material_source').map((entry) => entry.sourceId));
  const materialOwners = new Map<string, number>();
  let additiveUnits = 0;
  let baselineUnits = 0;
  let repositoryUnits = 0;
  for (const entry of entries) {
    if (entry.kind === 'aggregate_inventory') {
      if (entry.contributesToAdditiveCounts || entry.materialPartition !== 'aggregate' || entry.childMaterialSourceIds.length === 0) return false;
      let childUnits = 0;
      for (const childId of entry.childMaterialSourceIds) {
        const child = byId.get(childId);
        if (!child || child.kind !== 'material_source' || !child.contributesToAdditiveCounts) return false;
        childUnits += child.inventoryCandidateUnits;
        materialOwners.set(childId, (materialOwners.get(childId) ?? 0) + 1);
      }
      if (childUnits !== entry.inventoryCandidateUnits) return false;
    } else {
      if (!entry.contributesToAdditiveCounts || entry.materialPartition === 'aggregate' || entry.childMaterialSourceIds.length !== 0) return false;
      if (entry.materialPartition === 'baseline') baselineUnits += entry.inventoryCandidateUnits;
      else if (entry.materialPartition === 'repository') repositoryUnits += entry.inventoryCandidateUnits;
      else if (entry.inventoryCandidateUnits !== 0) return false;
      additiveUnits += entry.inventoryCandidateUnits;
    }
  }
  if (additiveUnits !== value.selectedCoverage.total
    || baselineUnits !== value.selectedCoverage.baselineMaterialUnits
    || repositoryUnits !== value.selectedCoverage.repositoryMaterialUnits) return false;
  for (const ownerCount of materialOwners.values()) if (ownerCount > 1) return false;
  // Every child listed by an aggregate must be a material row; the set may be
  // a proper subset because later source generations may add unrelated source
  // material, but no source may have two aggregate owners.
  if ([...materialOwners.keys()].some((sourceId) => !materialIds.has(sourceId))) return false;
  return true;
}

/** Hash a register entry without adding a second mutable identity field. */
export function calibrationAdmissionSourceRegisterEntrySha256(value: unknown): string {
  return calibrationAdmissionSha256(value);
}

/** Hash the initial source ID set in its canonical sorted representation. */
export function calibrationAdmissionInitialSourceIdsSha256(sourceIds: readonly string[]): string {
  return calibrationAdmissionSha256([...sourceIds].sort());
}

/** Hash a complete source register without its self-hash field. */
export function calibrationAdmissionSourceRegisterSha256(value: unknown): string {
  return calibrationAdmissionSha256(withoutKey(value, 'registerSha256'));
}

/** Hash a source review; the review intentionally has no inline self-hash. */
export function calibrationAdmissionSourceReviewSha256(value: unknown): string {
  return calibrationAdmissionSha256(value);
}

export function isCalibrationAdmissionSourceRegisterV1(value: unknown): value is CalibrationAdmissionSourceRegisterV1 {
  return sourceRegisterObject(value);
}

function rights(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, [
    'status',
    ...(value.spdx === undefined ? [] : ['spdx']),
    'scope',
    'analysisUse',
    'redistribution',
    'thirdPartyChain',
    'evidenceIds',
  ])) return false;
  return (value.status === 'reviewed' || value.status === 'absent' || value.status === 'ambiguous')
    && (value.scope === 'code' || value.scope === 'dataset' || value.scope === 'code_and_dataset' || value.scope === 'generated_outputs')
    && (value.analysisUse === 'approved' || value.analysisUse === 'denied' || value.analysisUse === 'unresolved')
    && (value.redistribution === 'approved' || value.redistribution === 'denied' || value.redistribution === 'unresolved' || value.redistribution === 'not_needed')
    && (value.thirdPartyChain === 'complete' || value.thirdPartyChain === 'incomplete' || value.thirdPartyChain === 'not_applicable')
    && sortedUniqueIds(value.evidenceIds)
    && (value.spdx === undefined || nonEmptyString(value.spdx));
}

function materialization(value: unknown, sourceId?: string): boolean {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'aggregate_only') {
    return exactKeys(value, ['kind', 'childMaterialSourceIds']) && sortedUniqueIds(value.childMaterialSourceIds) && value.childMaterialSourceIds.length > 0;
  }
  if (value.kind === 'git') {
    return exactKeys(value, ['kind', 'materializationId', 'repositoryId', 'commitSha'])
      && materializationId(value.materializationId) && id(value.repositoryId)
      && typeof value.commitSha === 'string' && /^[a-f0-9]{40,64}$/.test(value.commitSha)
      && (sourceId === undefined || value.materializationId === calibrationAdmissionMaterializationId(sourceId, value.repositoryId, value));
  }
  if (value.kind === 'release_archive_set') {
    if (!exactKeys(value, ['kind', 'upstreamCommitSha', 'assets'])
      || typeof value.upstreamCommitSha !== 'string' || !/^[a-f0-9]{40,64}$/.test(value.upstreamCommitSha)
      || !Array.isArray(value.assets) || value.assets.length === 0) return false;
    let previous = '';
    for (const asset of value.assets) {
      if (!isRecord(asset) || !exactKeys(asset, ['materializationId', 'repositoryId', 'materialization', 'rights'])
        || !materializationId(asset.materializationId) || !id(asset.repositoryId) || !rights(asset.rights)) return false;
      if (asset.materializationId <= previous) return false;
      previous = asset.materializationId;
      const descriptor = asset.materialization;
      if (!isRecord(descriptor) || !exactKeys(descriptor, ['kind', 'assetUrl', 'assetSha256', 'assetBytes', 'archiveFormat', 'rootPrefix', 'extractionPolicy'])
        || descriptor.kind !== 'release_archive' || !httpsUrl(descriptor.assetUrl)
        || !sha(descriptor.assetSha256) || !nonNegativeInteger(descriptor.assetBytes) || descriptor.archiveFormat !== 'zip'
        || !nonEmptyString(descriptor.rootPrefix) || descriptor.extractionPolicy !== 'safe-zip-v1'
        || sourceId === undefined || asset.materializationId !== calibrationAdmissionMaterializationId(sourceId, asset.repositoryId, descriptor)) return false;
    }
    return true;
  }
  if (value.kind === 'record_container') {
    if (!exactKeys(value, ['kind', 'materializationId', 'containers', 'projectionPolicy'])
      || !materializationId(value.materializationId) || !Array.isArray(value.containers) || value.containers.length === 0 || !nonEmptyString(value.projectionPolicy)) return false;
    let previous = '';
    for (const container of value.containers) {
      if (!isRecord(container) || !exactKeys(container, ['normalizedPath', 'bytes', 'sha256'])
        || !nonEmptyString(container.normalizedPath) || container.normalizedPath.startsWith('/') || container.normalizedPath.includes('..')
        || !nonNegativeInteger(container.bytes) || !sha(container.sha256) || container.normalizedPath <= previous) return false;
      previous = container.normalizedPath;
    }
    return sourceId === undefined || value.materializationId === calibrationAdmissionMaterializationId(sourceId, sourceId, value);
  }
  if (value.kind === 'unpublished_bundle') {
    return exactKeys(value, ['kind', 'bundleId', 'bundleInventorySha256']) && id(value.bundleId) && sha(value.bundleInventorySha256);
  }
  return false;
}

function sourceReviewObject(value: unknown): value is CalibrationSourceReviewV103 {
  if (!isRecord(value) || !exactKeys(value, [
    'version',
    'sourceId',
    'sourceKind',
    'contributesToAdditiveCounts',
    'sourceRegisterEntrySha256',
    'originEvidenceId',
    'origin',
    'materialization',
    'sourceRights',
    'inventory',
    'reviewerDecisionIds',
    'reviewedAt',
    'decision',
    'reasons',
  ])) return false;
  if (value.version !== 'v10.3-source-review-v1'
    || !id(value.sourceId)
    || (value.sourceKind !== 'aggregate_inventory' && value.sourceKind !== 'material_source')
    || typeof value.contributesToAdditiveCounts !== 'boolean'
    || !sha(value.sourceRegisterEntrySha256)
    || !id(value.originEvidenceId)
    || !isRecord(value.origin)
    || !materialization(value.materialization, value.sourceId)
    || !rights(value.sourceRights)
    || !isRecord(value.inventory)
    || !exactKeys(value.inventory, ['physicalMemberCount', 'candidateCodeUnitCount', 'inventorySha256', 'closedWorld'])
    || !nonNegativeInteger(value.inventory.physicalMemberCount)
    || !nonNegativeInteger(value.inventory.candidateCodeUnitCount)
    || !sha(value.inventory.inventorySha256)
    || typeof value.inventory.closedWorld !== 'boolean'
    || !sortedUniqueShas(value.reviewerDecisionIds)
    || !strictDateTime(value.reviewedAt)
    || (value.decision !== 'candidate' && value.decision !== 'source_quarantine')
    || !sortedUniqueReasons(value.reasons)) return false;
  if (!exactKeys(value.origin, value.origin.kind === 'https' ? ['kind', 'url'] : ['kind', 'localSourceId'])
    || (value.origin.kind === 'https'
      ? !httpsUrl(value.origin.url)
      : value.origin.kind !== 'local_unpublished' || !id(value.origin.localSourceId))) return false;
  if (value.sourceKind === 'aggregate_inventory') {
    if (value.contributesToAdditiveCounts || !isRecord(value.materialization) || value.materialization.kind !== 'aggregate_only') return false;
    if (value.decision === 'candidate') return false;
  } else if (!value.contributesToAdditiveCounts || (isRecord(value.materialization) && value.materialization.kind === 'aggregate_only')) return false;
  if (value.decision === 'source_quarantine' && value.reasons.length === 0) return false;
  if (value.decision === 'candidate' && value.reviewerDecisionIds.length < 2) return false;
  if (value.decision === 'candidate' && (value.origin.kind === 'local_unpublished' || (isRecord(value.materialization) && value.materialization.kind === 'unpublished_bundle'))) return false;
  return true;
}

export function isCalibrationSourceReviewV103(value: unknown): value is CalibrationSourceReviewV103 {
  return sourceReviewObject(value);
}

export function validateCalibrationAdmissionSourceRegisterReviewSet(
  registerValue: unknown,
  reviewValues: readonly unknown[],
): CalibrationAdmissionSourceRegisterReviewSetValidationV1 {
  const errors: string[] = [];
  const reviewList = Array.isArray(reviewValues) ? reviewValues : [];
  if (!Array.isArray(reviewValues)) errors.push('source reviews must be an array');
  if (!sourceRegisterObject(registerValue)) errors.push('source register failed shape, hash, generation, or conservation validation');
  const register = sourceRegisterObject(registerValue) ? registerValue : undefined;
  const entries = register?.entries ?? [];
  const entryById = new Map(entries.map((entry) => [entry.sourceId, entry]));
  const reviewIds: string[] = [];
  const reviews: CalibrationSourceReviewV103[] = [];
  for (const value of reviewList) {
    if (!sourceReviewObject(value)) {
      errors.push('source review failed shape or semantic validation');
      continue;
    }
    reviews.push(value);
    reviewIds.push(value.sourceId);
  }
  const duplicateReviewIds = reviewIds.filter((sourceId, index) => reviewIds.indexOf(sourceId) !== index);
  if (duplicateReviewIds.length > 0) errors.push(`duplicate source review IDs: ${[...new Set(duplicateReviewIds)].sort().join(',')}`);
  const expectedIds = entries.map((entry) => entry.sourceId);
  const actualIds = [...new Set(reviewIds)].sort();
  if (!sameIds(expectedIds, actualIds)) {
    const expected = new Set(expectedIds);
    const actual = new Set(actualIds);
    errors.push(`source register/review ID set mismatch (missing=${expectedIds.filter((entry) => !actual.has(entry)).join(',')}; extra=${actualIds.filter((entry) => !expected.has(entry)).join(',')})`);
  }
  let candidateSourceCount = 0;
  let candidateClaimedUnits = 0;
  let additiveMaterialUnits = 0;
  let additiveMaterialRepresentedUnits = 0;
  let additiveMaterialUnrepresentedUnits = 0;
  let quarantineUnits = 0;
  for (const review of reviews) {
    const entry = entryById.get(review.sourceId);
    if (!entry) {
      errors.push(`source review ${review.sourceId} has no register entry`);
      continue;
    }
    if (review.sourceRegisterEntrySha256 !== calibrationAdmissionSourceRegisterEntrySha256(entry)) errors.push(`source review ${review.sourceId} is not bound to the exact register entry`);
    if (!entry.registerEvidenceIds.includes(review.originEvidenceId)) errors.push(`source review ${review.sourceId} origin evidence is not bound to its register entry`);
    if (review.sourceKind !== entry.kind || review.contributesToAdditiveCounts !== entry.contributesToAdditiveCounts) errors.push(`source review ${review.sourceId} kind/additive ownership mismatch`);
    if (review.inventory.candidateCodeUnitCount !== entry.inventoryCandidateUnits) errors.push(`source review ${review.sourceId} inventory count does not match its register row`);
    if (entry.kind === 'aggregate_inventory') {
      const materialization = review.materialization;
      if (!isRecord(materialization) || materialization.kind !== 'aggregate_only' || !sameIds(materialization.childMaterialSourceIds, entry.childMaterialSourceIds)) errors.push(`aggregate source review ${review.sourceId} child ownership mismatch`);
    } else {
      additiveMaterialUnits += entry.inventoryCandidateUnits;
      additiveMaterialRepresentedUnits += entry.inventoryCandidateUnits;
      if (review.decision === 'source_quarantine') quarantineUnits += entry.inventoryCandidateUnits;
    }
    if (review.decision === 'candidate' && entry.kind === 'material_source') {
      candidateSourceCount += 1;
      candidateClaimedUnits += entry.inventoryCandidateUnits;
    }
  }
  if (register && additiveMaterialUnits !== register.selectedCoverage.total) errors.push(`material ownership conservation failed: ${additiveMaterialUnits} != ${register.selectedCoverage.total}`);
  if (register && register.selectedCoverage.total !== register.selectedCoverage.baselineMaterialUnits + register.selectedCoverage.repositoryMaterialUnits) errors.push('selected coverage does not equal baseline plus repository material units');
  // A material row is represented by a register-owned byte source even when
  // its review is quarantined; no row is silently treated as eligible.
  additiveMaterialUnrepresentedUnits = Math.max(0, additiveMaterialUnits - additiveMaterialRepresentedUnits);
  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    registeredSourceCount: entries.length,
    reviewedSourceCount: reviews.length,
    candidateSourceCount,
    candidateClaimedUnits,
    additiveMaterialUnits,
    additiveMaterialRepresentedUnits,
    additiveMaterialUnrepresentedUnits,
    quarantineUnits,
  };
}

export function sourceRegisterEntryIds(register: CalibrationAdmissionSourceRegisterV1): readonly string[] {
  return register.entries.map((entry) => entry.sourceId);
}

/** Record-derived coverage used by source:census.  Inventory rows are not
 * admission records: callers must provide the count of material-source
 * records actually represented in the structured record stream. */
export type CalibrationAdmissionRecordCountMapV1 =
  | Readonly<Record<string, number>>
  | ReadonlyMap<string, number>;

function representedRecordCount(
  counts: CalibrationAdmissionRecordCountMapV1 | undefined,
  sourceId: string,
): number {
  const value = counts instanceof Map
    ? counts.get(sourceId)
    : (counts === undefined ? undefined : (counts as Readonly<Record<string, number>>)[sourceId]);
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function sourceRegisterReviewCensusCounts(
  register: CalibrationAdmissionSourceRegisterV1,
  reviews: readonly CalibrationSourceReviewV103[],
  validation: CalibrationAdmissionSourceRegisterReviewSetValidationV1,
  recordCounts?: CalibrationAdmissionRecordCountMapV1,
): CalibrationAdmissionSourceCensusCountsV1 {
  const additiveRepresentedUnits = register.entries
    .filter((entry) => entry.kind === 'material_source')
    .reduce((sum, entry) => sum + representedRecordCount(recordCounts, entry.sourceId), 0);
  return {
    selectedCoverage: register.selectedCoverage.total,
    baselineMaterialUnits: register.selectedCoverage.baselineMaterialUnits,
    repositoryMaterialUnits: register.selectedCoverage.repositoryMaterialUnits,
    additiveRegisteredUnits: validation.additiveMaterialUnits,
    additiveRepresentedUnits,
    additiveUnrepresentedUnits: Math.max(0, validation.additiveMaterialUnits - additiveRepresentedUnits),
    quarantineUnits: validation.quarantineUnits,
    candidateUnits: reviews.filter((review) => review.decision === 'candidate' && review.sourceKind === 'material_source').reduce((sum, review) => sum + review.inventory.candidateCodeUnitCount, 0),
    eligibleUnits: 0,
  };
}
