// AUTO-GENERATED from calibration-admission-census.schema.json. Do not hand-edit.

export type Sha256 = string;
export type Id = string;
export type Reason = string;
export type Label = "verified_ai" | "verified_human" | "mixed" | "quarantine";
export type GateFailures = Reason[];

/**
 * Canonical v10.3 source and disposition census. Marginal count readiness never substitutes for a verified witness.
 */
export interface CalibrationAdmissionCensusV103 {
  version: "v10.3-admission-census-v1";
  policyVersion: "v10.3-admission-v1";
  policySha256: Sha256;
  smokeWitnessPolicySha256: Sha256;
  canaryWitnessPolicySha256: Sha256;
  eligibilitySnapshotSha256: Sha256;
  sourceRegisterSha256: Sha256;
  verifiedContextSha256: Sha256;
  evidenceIndexSha256: Sha256;
  evidencePayloadSetSha256: Sha256;
  evidenceReceiptSetSha256: Sha256;
  toolProfileSetSha256: Sha256;
  toolReceiptSetSha256: Sha256;
  blindReviewReceiptSetSha256: Sha256;
  temporalAttestationSetSha256: Sha256;
  materializationReceiptSetSha256: Sha256;
  admissionRecordsSha256: Sha256;
  sourceReviewSetSha256: Sha256;
  overlapUniverseSha256: Sha256;
  overlapResourceReceiptSha256: Sha256;
  overlapLedgerSha256: Sha256;
  privacyLedgerSha256: Sha256;
  qualityLedgerSha256: Sha256;
  lineageLedgerSha256: Sha256;
  counts: Counts;
  smoke: Smoke;
  canary: Canary;
}
export interface Counts {
  openSourceCount: number;
  sourceInventoryCandidateUnits: number;
  admissionRecords: number;
  unrepresentedCandidateUnits: number;
  uniqueContentUnits: number;
  dispositions: Dispositions;
  /**
   * @maxItems 452382
   */
  bySource: SourceRow[];
  /**
   * @maxItems 452382
   */
  byLanguage: LanguageRow[];
  /**
   * @maxItems 452382
   */
  byFamily: FamilyRow[];
  recordRejectionReasons: {
    [k: string]: number;
  };
  sourceBlockerReasons: {
    [k: string]: number;
  };
}
export interface Dispositions {
  eligible_gold: DispositionCell;
  eligible_sensitivity: DispositionCell;
  mixed_evaluation: DispositionCell;
  quarantine: DispositionCell;
}
export interface DispositionCell {
  total: CountPair;
  byLabel: {
    verified_ai: CountPair;
    verified_human: CountPair;
    mixed: CountPair;
    quarantine: CountPair;
  };
}
export interface CountPair {
  records: number;
  uniqueUnits: number;
}
export interface SourceRow {
  sourceId: Id;
  sourceKind: "aggregate_inventory" | "material_source";
  contributesToAdditiveCounts: boolean;
  sourceInventoryClosed: boolean;
  sourceInventoryCandidateUnits: number;
  admissionRecords: number;
  unrepresentedCandidateUnits: number;
  uniqueContentUnits: number;
  dispositions: Dispositions;
  sourceDecision: "candidate" | "source_quarantine";
  sourceReasons: Reason[];
}
export interface LanguageRow {
  language: string;
  eligibleGoldVerifiedAiUniqueUnits: number;
  eligibleGoldVerifiedHumanUniqueUnits: number;
  aiFamilyCount: number;
  humanFamilyCount: number;
}
export interface FamilyRow {
  familyId: Id;
  materialSourceIds: Id[];
  polaritySet: Label[];
  pairGroupIds: Id[];
  pairedCrossPolarity: "not_cross_polarity" | "approved_paired" | "unpaired_conflict";
  countsByLabel: {
    verified_ai: CountPair;
    verified_human: CountPair;
    mixed: CountPair;
    quarantine: CountPair;
  };
  dispositions: Dispositions;
}
export interface Smoke {
  targetVerifiedAi: 100;
  targetVerifiedHuman: 100;
  deficitVerifiedAi: number;
  deficitVerifiedHuman: number;
  countReady: boolean;
  witnessSha256?: Sha256;
  searchResultBundleSha256: Sha256;
  searchResultBundleRelativePath: string;
  searchResultPublicationCompletionSha256: Sha256;
  searchResultPublicationCompletionRelativePath: string;
  witnessReviewBundleSha256?: Sha256;
  witnessReviewBundleRelativePath?: string;
  witnessReviewPublicationCompletionSha256?: Sha256;
  witnessReviewPublicationCompletionRelativePath?: string;
  infeasibilityCertificateSha256?: Sha256;
  ready: boolean;
  gateFailures: GateFailures;
}
export interface Canary {
  targetVerifiedAi: 5000;
  targetVerifiedHuman: 5000;
  deficitVerifiedAi: number;
  deficitVerifiedHuman: number;
  minimumSourceCheckoutsPerPolarity: 10;
  availableSourceCapacityVerifiedAi: number;
  availableSourceCapacityVerifiedHuman: number;
  sourceCapacityDeficitVerifiedAi: number;
  sourceCapacityDeficitVerifiedHuman: number;
  countReady: boolean;
  witnessSha256?: Sha256;
  searchResultBundleSha256: Sha256;
  searchResultBundleRelativePath: string;
  searchResultPublicationCompletionSha256: Sha256;
  searchResultPublicationCompletionRelativePath: string;
  witnessReviewBundleSha256?: Sha256;
  witnessReviewBundleRelativePath?: string;
  witnessReviewPublicationCompletionSha256?: Sha256;
  witnessReviewPublicationCompletionRelativePath?: string;
  infeasibilityCertificateSha256?: Sha256;
  ready: boolean;
  gateFailures: GateFailures;
}
