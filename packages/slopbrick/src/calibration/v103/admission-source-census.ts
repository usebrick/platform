import {
  calibrationAdmissionSourceRegisterSha256,
  isCalibrationAdmissionSourceRegisterV1,
  type CalibrationAdmissionSourceRegisterV1,
  type CalibrationAdmissionSourceCensusSourceV1,
  type CalibrationSourceReviewV103,
} from '@usebrick/core';
import {
  isVerifiedAdmissionEvidenceContext,
  type VerifiedAdmissionEvidenceContextV1,
} from './admission-evidence-context';
import {
  reviewAdmissionSources,
  type AdmissionReviewInputV1,
  type AdmissionStructuredAuthoritySummaryV1,
} from './admission-review';

export interface AdmissionSourceCensusInputV1 extends AdmissionReviewInputV1 {}

export interface AdmissionSourceCensusResultV1 {
  readonly version: 'v10.3-admission-source-census-v1';
  readonly ready: false;
  readonly authorityEligible: false;
  readonly witnessAuthority: 'unavailable';
  readonly evidenceContextSha256?: string;
  readonly sourceRegisterSha256?: string;
  readonly registeredSourceCount: number;
  readonly reviewedSourceCount: number;
  readonly candidateSourceCount: number;
  readonly counts: {
    readonly selectedCoverage: number;
    readonly baselineMaterialUnits: number;
    readonly repositoryMaterialUnits: number;
    readonly additiveRegisteredUnits: number;
    readonly additiveRepresentedUnits: number;
    readonly additiveUnrepresentedUnits: number;
    readonly candidateUnits: number;
    readonly quarantineUnits: number;
    readonly eligibleUnits: 0;
  };
  readonly sources: readonly CalibrationAdmissionSourceCensusSourceV1[];
  readonly structured: AdmissionStructuredAuthoritySummaryV1;
  readonly blockers: readonly string[];
}

function sourceRows(
  register: CalibrationAdmissionSourceRegisterV1,
  reviews: readonly CalibrationSourceReviewV103[],
  recordCounts: Readonly<Record<string, number>> = {},
): readonly CalibrationAdmissionSourceCensusSourceV1[] {
  const reviewById = new Map(reviews.map((review) => [review.sourceId, review]));
  const rows: CalibrationAdmissionSourceCensusSourceV1[] = [];
  for (const entry of register.entries) {
    const review = reviewById.get(entry.sourceId);
    const reasons = review === undefined
      ? ['source_unregistered', 'review_incomplete']
      : [...review.reasons, ...(review.decision === 'candidate' ? ['candidate_not_yet_eligible'] : [])].sort();
    const representedUnits = entry.kind === 'aggregate_inventory'
      ? entry.childMaterialSourceIds.reduce((sum, childId) => {
        return sum + (recordCounts[childId] ?? 0);
      }, 0)
      : (recordCounts[entry.sourceId] ?? 0);
    rows.push({
      sourceId: entry.sourceId,
      kind: entry.kind,
      registeredUnits: entry.inventoryCandidateUnits,
      additiveUnits: entry.kind === 'material_source' ? entry.inventoryCandidateUnits : 0,
      representedUnits,
      unrepresentedUnits: Math.max(0, entry.inventoryCandidateUnits - representedUnits),
      // This slice has no static ledgers, so even a candidate review remains
      // quarantined and reports zero final eligible units.
      quarantineUnits: entry.kind === 'material_source' ? entry.inventoryCandidateUnits : 0,
      eligibleUnits: 0,
      decision: review?.decision ?? 'unreviewed',
      reasons,
    });
  }
  for (const review of reviews) {
    if (register.entries.some((entry) => entry.sourceId === review.sourceId)) continue;
    rows.push({
      sourceId: review.sourceId,
      kind: review.sourceKind,
      registeredUnits: 0,
      additiveUnits: 0,
      representedUnits: 0,
      unrepresentedUnits: review.inventory.candidateCodeUnitCount,
      quarantineUnits: 0,
      eligibleUnits: 0,
      decision: review.decision,
      reasons: ['source_unregistered', ...review.reasons].sort(),
    });
  }
  return rows.sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

function nonAuthorityDiagnostic(
  blockers: readonly string[],
  context?: VerifiedAdmissionEvidenceContextV1,
  structured: AdmissionStructuredAuthoritySummaryV1 = {
    present: false,
    valid: true,
    recordCount: 0,
    reviewSampleCount: 0,
    decisionCount: 0,
    decisionLedgerCount: 0,
    adjudicatorAssignmentCount: 0,
    adjudicatorReceiptCount: 0,
  },
): AdmissionSourceCensusResultV1 {
  return {
    version: 'v10.3-admission-source-census-v1',
    ready: false,
    authorityEligible: false,
    witnessAuthority: 'unavailable',
    evidenceContextSha256: context?.evidenceContextSha256,
    sourceRegisterSha256: undefined,
    registeredSourceCount: 0,
    reviewedSourceCount: 0,
    candidateSourceCount: 0,
    counts: {
      selectedCoverage: 0,
      baselineMaterialUnits: 0,
      repositoryMaterialUnits: 0,
      additiveRegisteredUnits: 0,
      additiveRepresentedUnits: 0,
      additiveUnrepresentedUnits: 0,
      quarantineUnits: 0,
      candidateUnits: 0,
      eligibleUnits: 0,
    },
    sources: [],
    structured,
    blockers: [...new Set(blockers)],
  };
}

/**
 * Emit a canonical, stdout-safe diagnostic for the current source authority.
 * This function is intentionally non-persisting and cannot produce an
 * eligible claim: record ledgers, static authorities, and witnesses belong to
 * later Task 1B/2A/2B slices.
 */
export function buildAdmissionSourceCensus(input: AdmissionSourceCensusInputV1): AdmissionSourceCensusResultV1 {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return nonAuthorityDiagnostic(['admission_source_census_input_invalid']);
  const context = isVerifiedAdmissionEvidenceContext(input.context) ? input.context : undefined;
  if (!context) return nonAuthorityDiagnostic(['verified_evidence_context_required']);
  const review = reviewAdmissionSources(input);
  const register = isCalibrationAdmissionSourceRegisterV1(input.sourceRegister) ? input.sourceRegister : undefined;
  if (!register || review.sources.length === 0 || !review.structured.valid) return nonAuthorityDiagnostic(review.blockers, context, review.structured);
  const reviews = input.sourceReviews as readonly CalibrationSourceReviewV103[];
  return {
    version: 'v10.3-admission-source-census-v1',
    ready: false,
    authorityEligible: false,
    witnessAuthority: 'unavailable',
    evidenceContextSha256: context?.evidenceContextSha256,
    sourceRegisterSha256: calibrationAdmissionSourceRegisterSha256(register),
    registeredSourceCount: review.registeredSourceCount,
    reviewedSourceCount: review.reviewedSourceCount,
    candidateSourceCount: review.candidateSourceCount,
    counts: review.counts,
    sources: sourceRows(register, reviews, review.recordCounts),
    structured: review.structured,
    blockers: [...new Set(review.blockers)],
  };
}
