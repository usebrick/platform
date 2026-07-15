import {
  calibrationAdmissionSearchReceiptSha256,
  calibrationAdmissionSearchResultBundleId,
  calibrationAdmissionSearchResultBundleSha256,
  calibrationAdmissionSha256,
  calibrationAdmissionToolReceiptSha256,
  isCalibrationAdmissionSearchResultBundleV1,
  isCalibrationAdmissionWitnessReviewBundleV1,
  type AdmissionCohortInfeasibilityCertificateV1,
  type AdmissionCohortWitnessV1,
  type AdmissionSearchReceiptV1,
  type CalibrationAdmissionCensusV103,
  type CalibrationAdmissionInvocationIntentV1,
  type CalibrationAdmissionSearchResultBundleV1,
  type CalibrationAdmissionToolReceiptV1,
  type CalibrationAdmissionWitnessReviewBundleV1,
} from '@usebrick/core';
import {
  deriveAdmissionDisposition,
  listVerifiedAdmissionRecords,
  type VerifiedAdmissionContextV1,
} from './admission-context';
import {
  projectEligibleWitnessCandidates,
  searchAdmissionWitness,
  type AdmissionWitnessCandidateV1,
  type AdmissionWitnessGateV1,
  type AdmissionWitnessSearchResultV1,
} from './admission-cohort-witness';

export interface AdmissionSearchPublicationInputV1 {
  readonly bundle: CalibrationAdmissionSearchResultBundleV1;
  readonly publicationCompletionSha256: string;
  readonly publicationCompletionRelativePath: string;
}

export interface AdmissionCensusBuildInputV1 {
  readonly context: VerifiedAdmissionContextV1;
  readonly search: Readonly<{ smoke: AdmissionSearchPublicationInputV1; canary: AdmissionSearchPublicationInputV1 }>;
  readonly witnessReviews?: Readonly<{ smoke?: CalibrationAdmissionWitnessReviewBundleV1; canary?: CalibrationAdmissionWitnessReviewBundleV1 }>;
  readonly witnessPolicySha256s?: Readonly<{ smoke?: string; canary?: string }>;
}

export type AdmissionCensusBuildResultV1 =
  | { readonly ok: true; readonly census: CalibrationAdmissionCensusV103; readonly eligibilitySnapshotSha256: string }
  | { readonly ok: false; readonly errors: readonly string[] };

type JsonObject = Record<string, unknown>;
type CensusLabel = 'verified_ai' | 'verified_human' | 'mixed' | 'quarantine';
type CensusDisposition = 'eligible_gold' | 'eligible_sensitivity' | 'mixed_evaluation' | 'quarantine';

const LABELS: readonly CensusLabel[] = ['verified_ai', 'verified_human', 'mixed', 'quarantine'];
const DISPOSITIONS: readonly CensusDisposition[] = ['eligible_gold', 'eligible_sensitivity', 'mixed_evaluation', 'quarantine'];
const H = '0'.repeat(64);

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function emptyCountPair(): { records: number; uniqueUnits: number } {
  return { records: 0, uniqueUnits: 0 };
}

function emptyMatrix(): Record<CensusDisposition, { total: { records: number; uniqueUnits: number }; byLabel: Record<CensusLabel, { records: number; uniqueUnits: number }> }> {
  return Object.fromEntries(DISPOSITIONS.map((disposition) => [disposition, {
    total: emptyCountPair(),
    byLabel: Object.fromEntries(LABELS.map((label) => [label, emptyCountPair()])),
  }])) as Record<CensusDisposition, { total: { records: number; uniqueUnits: number }; byLabel: Record<CensusLabel, { records: number; uniqueUnits: number }> }>;
}

function addMatrix(matrix: ReturnType<typeof emptyMatrix>, disposition: CensusDisposition, label: CensusLabel, contentSha256: string): void {
  const cell = matrix[disposition];
  cell.total.records += 1;
  cell.byLabel[label].records += 1;
  const totalContents = (cell.total as unknown as { readonly _contents?: Set<string> })._contents;
  const labelContents = (cell.byLabel[label] as unknown as { readonly _contents?: Set<string> })._contents;
  if (totalContents === undefined) Object.defineProperty(cell.total, '_contents', { value: new Set<string>(), configurable: true, enumerable: false, writable: true });
  if (labelContents === undefined) Object.defineProperty(cell.byLabel[label], '_contents', { value: new Set<string>(), configurable: true, enumerable: false, writable: true });
  (cell.total as unknown as { _contents: Set<string> })._contents.add(contentSha256);
  (cell.byLabel[label] as unknown as { _contents: Set<string> })._contents.add(contentSha256);
}

function finalizeMatrix(matrix: ReturnType<typeof emptyMatrix>): ReturnType<typeof emptyMatrix> {
  for (const disposition of DISPOSITIONS) {
    const cell = matrix[disposition];
    cell.total.uniqueUnits = (cell.total as unknown as { _contents?: Set<string> })._contents?.size ?? 0;
    delete (cell.total as unknown as { _contents?: Set<string> })._contents;
    for (const label of LABELS) {
      cell.byLabel[label].uniqueUnits = (cell.byLabel[label] as unknown as { _contents?: Set<string> })._contents?.size ?? 0;
      delete (cell.byLabel[label] as unknown as { _contents?: Set<string> })._contents;
    }
  }
  return matrix;
}

function countHash(values: readonly string[]): string {
  return calibrationAdmissionSha256([...values].sort(compareStrings));
}

function buildSearchBundle(
  gate: AdmissionWitnessGateV1,
  eligibilitySnapshotSha256: string,
  context: VerifiedAdmissionContextV1,
  searchResult: AdmissionWitnessSearchResultV1,
  input: Readonly<{ invocationIntents?: readonly CalibrationAdmissionInvocationIntentV1[]; toolReceipts?: readonly CalibrationAdmissionToolReceiptV1[]; witnessPolicySha256?: string; candidateOrderSha256?: string; toolReceiptSha256?: string }>,
): CalibrationAdmissionSearchResultBundleV1 {
  const result: CalibrationAdmissionSearchResultBundleV1['result'] = searchResult.kind === 'witness'
    ? { kind: 'witness', witness: searchResult.witness }
    : { kind: 'infeasibility', certificate: searchResult.certificate };
  const searchReceiptBody = {
    version: 'v10.3-admission-search-receipt-v1' as const,
    gate,
    witnessPolicySha256: input.witnessPolicySha256 ?? H,
    eligibilitySnapshotSha256,
    candidateOrderSha256: input.candidateOrderSha256 ?? H,
    visitedNodes: searchResult.visitedNodes,
    prunedNodes: searchResult.prunedNodes,
    terminal: searchResult.terminal,
    terminalArtifactSha256: searchResult.kind === 'witness' ? searchResult.witness.witnessSha256 : searchResult.certificate.certificateSha256,
    toolReceiptSha256: input.toolReceiptSha256 ?? H,
  };
  const searchReceipt: AdmissionSearchReceiptV1 = { ...searchReceiptBody, receiptId: calibrationAdmissionSearchReceiptSha256(searchReceiptBody) };
  const body = {
    version: 'v10.3-admission-search-result-bundle-v1' as const,
    gate,
    verifiedContextSha256: context.contextSha256,
    eligibilitySnapshotSha256,
    invocationIntents: [...(input.invocationIntents ?? [])].sort((left, right) => compareStrings(left.intentId, right.intentId)),
    toolReceipts: [...(input.toolReceipts ?? [])].sort((left, right) => compareStrings(left.receiptId, right.receiptId)),
    result,
    searchReceipt,
  };
  const withId = { ...body, bundleId: calibrationAdmissionSearchResultBundleId(body) };
  return { ...withId, bundleSha256: calibrationAdmissionSearchResultBundleSha256(withId) };
}

function sourceMatrixRows(
  context: VerifiedAdmissionContextV1,
  records: readonly ReturnType<typeof listVerifiedAdmissionRecords>[number][],
): readonly JsonObject[] {
  const register = context.durable.sourceRegister;
  const reviews = new Map(context.durable.sourceReviews.map((review) => [review.sourceId, review]));
  const bySource = new Map<string, typeof records[number][]>();
  for (const entry of register.entries) bySource.set(entry.sourceId, []);
  for (const verified of records) {
    const list = bySource.get(verified.record.materialSourceId);
    if (list !== undefined) list.push(verified);
  }
  const rows: JsonObject[] = [];
  for (const entry of register.entries) {
    const review = reviews.get(entry.sourceId);
    const childIds = entry.kind === 'aggregate_inventory' ? entry.childMaterialSourceIds : [];
    const sourceRecords = entry.kind === 'aggregate_inventory'
      ? childIds.flatMap((childId) => bySource.get(childId) ?? [])
      : (bySource.get(entry.sourceId) ?? []);
    const matrix = emptyMatrix();
    const contents = new Set<string>();
    for (const verified of sourceRecords) {
      const disposition = deriveAdmissionDisposition(context, verified.record.recordId).disposition as CensusDisposition;
      const label = LABELS.includes(verified.record.proposedLabel as CensusLabel) ? verified.record.proposedLabel as CensusLabel : 'quarantine';
      addMatrix(matrix, disposition, label, verified.record.contentSha256);
      contents.add(verified.record.contentSha256);
    }
    const inventoryUnits = entry.kind === 'aggregate_inventory'
      ? childIds.reduce((sum, childId) => sum + (register.entries.find((candidate) => candidate.sourceId === childId)?.inventoryCandidateUnits ?? 0), 0)
      : entry.inventoryCandidateUnits;
    rows.push({
      sourceId: entry.sourceId,
      sourceKind: entry.kind,
      contributesToAdditiveCounts: entry.contributesToAdditiveCounts,
      sourceInventoryClosed: review?.inventory.closedWorld ?? false,
      sourceInventoryCandidateUnits: inventoryUnits,
      admissionRecords: sourceRecords.length,
      unrepresentedCandidateUnits: Math.max(0, inventoryUnits - sourceRecords.length),
      uniqueContentUnits: contents.size,
      dispositions: finalizeMatrix(matrix),
      sourceDecision: review?.decision ?? 'source_quarantine',
      sourceReasons: [...(review?.reasons ?? ['review_incomplete'])].sort(compareStrings),
    });
  }
  return rows.sort((left, right) => compareStrings(String(left.sourceId), String(right.sourceId)));
}

function familyRows(context: VerifiedAdmissionContextV1, records: readonly ReturnType<typeof listVerifiedAdmissionRecords>[number][]): readonly JsonObject[] {
  const groups = new Map<string, typeof records[number][]>();
  for (const verified of records) {
    const familyId = verified.record.claimedLineage.familyId;
    const list = groups.get(familyId) ?? [];
    list.push(verified);
    groups.set(familyId, list);
  }
  return [...groups.entries()].sort(([left], [right]) => compareStrings(left, right)).map(([familyId, familyRecords]) => {
    const matrix = emptyMatrix();
    const countsByLabel = Object.fromEntries(LABELS.map((label) => [label, emptyCountPair()]));
    const contentSets = new Map<CensusLabel, Set<string>>(LABELS.map((label) => [label, new Set<string>()]));
    const sourceIds = new Set<string>();
    const pairIds = new Set<string>();
    const polarities = new Set<CensusLabel>();
    for (const verified of familyRecords) {
      const disposition = deriveAdmissionDisposition(context, verified.record.recordId).disposition as CensusDisposition;
      const label = LABELS.includes(verified.record.proposedLabel as CensusLabel) ? verified.record.proposedLabel as CensusLabel : 'quarantine';
      addMatrix(matrix, disposition, label, verified.record.contentSha256);
      const pair = countsByLabel[label] as { records: number; uniqueUnits: number };
      pair.records += 1;
      contentSets.get(label)!.add(verified.record.contentSha256);
      sourceIds.add(verified.record.materialSourceId);
      polarities.add(label);
      if (verified.record.claimedLineage.pairGroupId !== undefined) pairIds.add(verified.record.claimedLineage.pairGroupId);
    }
    for (const label of LABELS) (countsByLabel[label] as { uniqueUnits: number }).uniqueUnits = contentSets.get(label)!.size;
    const crossPolarity = polarities.has('verified_ai') && polarities.has('verified_human');
    const paired = crossPolarity && familyRecords.every((verified) => verified.record.claimedLineage.pairGroupId !== undefined);
    return {
      familyId,
      materialSourceIds: [...sourceIds].sort(compareStrings),
      polaritySet: [...polarities].sort(compareStrings),
      pairGroupIds: [...pairIds].sort(compareStrings),
      pairedCrossPolarity: crossPolarity ? (paired ? 'approved_paired' : 'unpaired_conflict') : 'not_cross_polarity',
      countsByLabel,
      dispositions: finalizeMatrix(matrix),
    };
  });
}

function gateSummary(
  gate: AdmissionWitnessGateV1,
  candidates: readonly AdmissionWitnessCandidateV1[],
  search: AdmissionSearchPublicationInputV1,
  review: CalibrationAdmissionWitnessReviewBundleV1 | undefined,
  eligibilitySnapshotSha256: string,
  verifiedContextSha256: string,
): JsonObject {
  const target = gate === 'smoke' ? 100 : 5000;
  const byLabel = (label: AdmissionWitnessCandidateV1['label']) => new Set(candidates.filter((candidate) => candidate.label === label).map((candidate) => candidate.contentClusterId)).size;
  const ai = byLabel('verified_ai');
  const human = byLabel('verified_human');
  const result = isObject(search.bundle.result) ? search.bundle.result : undefined;
  const witness = result?.kind === 'witness' && isObject(result.witness) ? result.witness : undefined;
  const gateFailures: string[] = [];
  if (ai < target) gateFailures.push('verified_ai_capacity_deficit');
  if (human < target) gateFailures.push('verified_human_capacity_deficit');
  if (!isCalibrationAdmissionSearchResultBundleV1(search.bundle)) gateFailures.push('search_result_bundle_invalid');
  const searchAuthorityComplete = search.bundle.invocationIntents.length > 0
    && search.bundle.toolReceipts.length > 0
    && search.bundle.verifiedContextSha256 === verifiedContextSha256
    && search.bundle.eligibilitySnapshotSha256 === eligibilitySnapshotSha256
    && search.bundle.searchReceipt.toolReceiptSha256 !== H
    && search.bundle.toolReceipts.some((receipt) => calibrationAdmissionToolReceiptSha256(receipt) === search.bundle.searchReceipt.toolReceiptSha256)
    && search.bundle.toolReceipts.every((receipt) => search.bundle.invocationIntents.some((intent) => intent.intentId === receipt.invocationIntentId));
  if (!searchAuthorityComplete) gateFailures.push('search_authority_incomplete');
  if (search.publicationCompletionSha256 === H) gateFailures.push('search_publication_incomplete');
  const reviewValid = review !== undefined && isCalibrationAdmissionWitnessReviewBundleV1(review);
  if (!reviewValid) gateFailures.push('witness_review_missing');
  else if (review.gate !== gate || review.verifiedContextSha256 !== verifiedContextSha256 || review.eligibilitySnapshotSha256 !== eligibilitySnapshotSha256 || review.searchResultBundle.bundleSha256 !== search.bundle.bundleSha256) gateFailures.push('witness_review_authority_mismatch');
  if (reviewValid && review.witnessReviewReceipt.decision !== 'approved') gateFailures.push('witness_review_not_approved');
  if (result?.kind === 'infeasibility') gateFailures.push('infeasibility_certificate');
  const summary: JsonObject = {
    targetVerifiedAi: target,
    targetVerifiedHuman: target,
    deficitVerifiedAi: Math.max(0, target - ai),
    deficitVerifiedHuman: Math.max(0, target - human),
    countReady: ai >= target && human >= target,
    ...(witness?.witnessSha256 === undefined ? {} : { witnessSha256: witness.witnessSha256 }),
    searchResultBundleSha256: search.bundle.bundleSha256,
    searchResultBundleRelativePath: `witnesses/${gate}/search-results/${search.bundle.bundleSha256}.json`,
    searchResultPublicationCompletionSha256: search.publicationCompletionSha256,
    searchResultPublicationCompletionRelativePath: search.publicationCompletionRelativePath,
    ...(review === undefined ? {} : { witnessReviewBundleSha256: review.bundleSha256, witnessReviewBundleRelativePath: `witnesses/${gate}/witness-reviews/${review.bundleSha256}.json` }),
    ready: ai >= target && human >= target && witness !== undefined && reviewValid && review?.witnessReviewReceipt.decision === 'approved' && gateFailures.length === 0,
    gateFailures: [...new Set(gateFailures)].sort(compareStrings),
  };
  if (gate === 'canary') {
    const sourceCapacity = (label: AdmissionWitnessCandidateV1['label']) => new Set(candidates.filter((candidate) => candidate.label === label).map((candidate) => candidate.materialSourceId)).size;
    summary.minimumSourceCheckoutsPerPolarity = 10;
    summary.availableSourceCapacityVerifiedAi = sourceCapacity('verified_ai');
    summary.availableSourceCapacityVerifiedHuman = sourceCapacity('verified_human');
    summary.sourceCapacityDeficitVerifiedAi = Math.max(0, 10 - Number(summary.availableSourceCapacityVerifiedAi));
    summary.sourceCapacityDeficitVerifiedHuman = Math.max(0, 10 - Number(summary.availableSourceCapacityVerifiedHuman));
  }
  return summary;
}

export function buildAdmissionCensus(input: AdmissionCensusBuildInputV1): AdmissionCensusBuildResultV1 {
  try {
    const context = input.context;
    const records = listVerifiedAdmissionRecords(context);
    const projection = projectEligibleWitnessCandidates(context);
    const recordIds = records.map((verified) => verified.record.recordId).sort(compareStrings);
    const candidateOrderSha256 = calibrationAdmissionSha256(projection.candidates.map((candidate) => candidate.selectionKey));
    const dispositionRows = records.map((verified) => {
      const disposition = deriveAdmissionDisposition(context, verified.record.recordId);
      return { recordId: verified.record.recordId, contentSha256: verified.record.contentSha256, proposedLabel: verified.record.proposedLabel, disposition: disposition.disposition, reasons: disposition.reasons };
    }).sort((left, right) => compareStrings(left.recordId, right.recordId));
    const eligibilitySnapshotSha256 = calibrationAdmissionSha256({ contextSha256: context.contextSha256, recordIds, candidateOrderSha256, candidates: projection.candidates, dispositions: dispositionRows });
    const sourceRows = sourceMatrixRows(context, records);
    const globalMatrix = emptyMatrix();
    for (const verified of records) {
      const disposition = deriveAdmissionDisposition(context, verified.record.recordId).disposition as CensusDisposition;
      const label = LABELS.includes(verified.record.proposedLabel as CensusLabel) ? verified.record.proposedLabel as CensusLabel : 'quarantine';
      addMatrix(globalMatrix, disposition, label, verified.record.contentSha256);
    }
    const byLanguageMap = new Map<string, AdmissionWitnessCandidateV1[]>();
    for (const candidate of projection.candidates) { const list = byLanguageMap.get(candidate.language) ?? []; list.push(candidate); byLanguageMap.set(candidate.language, list); }
    const byLanguage = [...byLanguageMap.entries()].sort(([left], [right]) => compareStrings(left, right)).map(([language, languageCandidates]) => ({
      language,
      eligibleGoldVerifiedAiUniqueUnits: new Set(languageCandidates.filter((candidate) => candidate.label === 'verified_ai').map((candidate) => candidate.contentClusterId)).size,
      eligibleGoldVerifiedHumanUniqueUnits: new Set(languageCandidates.filter((candidate) => candidate.label === 'verified_human').map((candidate) => candidate.contentClusterId)).size,
      aiFamilyCount: new Set(languageCandidates.filter((candidate) => candidate.label === 'verified_ai').map((candidate) => candidate.familyId)).size,
      humanFamilyCount: new Set(languageCandidates.filter((candidate) => candidate.label === 'verified_human').map((candidate) => candidate.familyId)).size,
    }));
    const searchBundles = input.search;
    const census: JsonObject = {
      version: 'v10.3-admission-census-v1',
      policyVersion: 'v10.3-admission-v1',
      policySha256: context.durable.policy.policySha256,
      smokeWitnessPolicySha256: input.witnessPolicySha256s?.smoke ?? H,
      canaryWitnessPolicySha256: input.witnessPolicySha256s?.canary ?? H,
      eligibilitySnapshotSha256,
      sourceRegisterSha256: context.durable.sourceRegister.registerSha256,
      verifiedContextSha256: context.contextSha256,
      evidenceIndexSha256: context.durable.evidenceIndex.indexSha256,
      evidencePayloadSetSha256: context.durable.evidencePayloadSet.payloadSetSha256,
      evidenceReceiptSetSha256: countHash(context.durable.evidenceReceipts.map((receipt) => receipt.receiptId)),
      toolProfileSetSha256: countHash(context.durable.toolProfiles.map((profile) => profile.profileSha256)),
      toolReceiptSetSha256: countHash(context.durable.toolReceipts.map((receipt) => receipt.receiptId)),
      blindReviewReceiptSetSha256: countHash(context.durable.preWitnessBlindReviewReceipts.map((receipt) => receipt.receiptId)),
      temporalAttestationSetSha256: countHash(context.durable.temporalAttestations.map((attestation) => attestation.attestationId)),
      materializationReceiptSetSha256: countHash(context.durable.materializationReceipts.map((receipt) => receipt.receiptId)),
      admissionRecordsSha256: context.durable.admissionRecordStream.recordsJsonlSha256,
      sourceReviewSetSha256: countHash(context.durable.sourceReviews.map((review) => calibrationAdmissionSha256(review))),
      overlapUniverseSha256: context.durable.overlapUniverse.universeSha256,
      overlapResourceReceiptSha256: context.durable.overlapResourceReceipt.receiptId,
      overlapLedgerSha256: context.durable.overlapLedger.ledgerSha256,
      privacyLedgerSha256: context.durable.privacyLedger.ledgerSha256,
      qualityLedgerSha256: context.durable.qualityLedger.ledgerSha256,
      lineageLedgerSha256: context.durable.lineageLedger.ledgerSha256,
      counts: {
        openSourceCount: sourceRows.filter((row) => row.sourceInventoryClosed !== true).length,
        sourceInventoryCandidateUnits: sourceRows.reduce((sum, row) => sum + Number(row.sourceInventoryCandidateUnits), 0),
        admissionRecords: records.length,
        unrepresentedCandidateUnits: sourceRows.reduce((sum, row) => sum + Number(row.unrepresentedCandidateUnits), 0),
        uniqueContentUnits: new Set(records.map((verified) => verified.record.contentSha256)).size,
        dispositions: finalizeMatrix(globalMatrix),
        bySource: sourceRows,
        byLanguage,
        byFamily: familyRows(context, records),
        recordRejectionReasons: Object.fromEntries(Object.entries(records.flatMap((verified) => deriveAdmissionDisposition(context, verified.record.recordId).reasons).reduce<Record<string, number>>((counts, reason) => { counts[reason] = (counts[reason] ?? 0) + 1; return counts; }, {})).sort(([left], [right]) => compareStrings(left, right))),
        sourceBlockerReasons: Object.fromEntries(Object.entries(sourceRows.flatMap((row) => row.sourceReasons as string[]).reduce<Record<string, number>>((counts, reason) => { counts[reason] = (counts[reason] ?? 0) + 1; return counts; }, {})).sort(([left], [right]) => compareStrings(left, right))),
      },
      smoke: gateSummary('smoke', projection.candidates, searchBundles.smoke, input.witnessReviews?.smoke, eligibilitySnapshotSha256, context.contextSha256),
      canary: gateSummary('canary', projection.candidates, searchBundles.canary, input.witnessReviews?.canary, eligibilitySnapshotSha256, context.contextSha256),
    };
    return { ok: true, census: census as unknown as CalibrationAdmissionCensusV103, eligibilitySnapshotSha256 };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}

/** Compute the non-circular eligibility snapshot that search bundles must bind. */
export function computeAdmissionEligibilitySnapshotSha256(context: VerifiedAdmissionContextV1): string {
  const records = listVerifiedAdmissionRecords(context);
  const projection = projectEligibleWitnessCandidates(context);
  const recordIds = records.map((verified) => verified.record.recordId).sort(compareStrings);
  const candidateOrderSha256 = calibrationAdmissionSha256(projection.candidates.map((candidate) => candidate.selectionKey));
  const dispositions = records.map((verified) => {
    const disposition = deriveAdmissionDisposition(context, verified.record.recordId);
    return { recordId: verified.record.recordId, contentSha256: verified.record.contentSha256, proposedLabel: verified.record.proposedLabel, disposition: disposition.disposition, reasons: disposition.reasons };
  }).sort((left, right) => compareStrings(left.recordId, right.recordId));
  return calibrationAdmissionSha256({ contextSha256: context.contextSha256, recordIds, candidateOrderSha256, candidates: projection.candidates, dispositions });
}

export function buildAdmissionSearchResultBundleFromCandidates(
  context: VerifiedAdmissionContextV1,
  gate: AdmissionWitnessGateV1,
  eligibilitySnapshotSha256: string,
  candidates: readonly AdmissionWitnessCandidateV1[],
  options: Readonly<{ invocationIntents?: readonly CalibrationAdmissionInvocationIntentV1[]; toolReceipts?: readonly CalibrationAdmissionToolReceiptV1[]; witnessPolicySha256?: string; toolReceiptSha256?: string }>,
): CalibrationAdmissionSearchResultBundleV1 {
  const searchResult = searchAdmissionWitness({ gate, eligibilitySnapshotSha256, verifiedContextSha256: context.contextSha256, candidates });
  return buildSearchBundle(gate, eligibilitySnapshotSha256, context, searchResult, { ...options, candidateOrderSha256: calibrationAdmissionSha256(candidates.map((candidate) => candidate.selectionKey)) });
}

export { projectEligibleWitnessCandidates } from './admission-cohort-witness';
