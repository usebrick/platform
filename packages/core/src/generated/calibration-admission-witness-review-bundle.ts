import type { CalibrationAdmissionDecisionV103 } from './calibration-admission-decision';
// AUTO-GENERATED from calibration-admission-witness-review-bundle.schema.json. Do not hand-edit.

export type Sha256 = string;
/**
 * Deterministic, exact-size v10.3 admission cohort witness produced before search receipts or witness review.
 */
export type AdmissionCohortWitnessV1 = {
  [k: string]: unknown;
} & {
  version: "v10.3-admission-cohort-witness-v1";
  gate: "smoke" | "canary";
  policyId: "v10.3-admission-v1";
  algorithm: "lexicographic-bnb-feasibility-v1";
  seed: "slopbrick-v10.3-admission-review-v1";
  eligibilitySnapshotSha256: string;
  verifiedContextSha256: string;
  /**
   * @maxItems 10000
   */
  units: Unit[];
  constraintProof: ConstraintProof;
  witnessSha256: string;
};
/**
 * Deterministic v10.3 witness-search infeasibility certificate; search-limit certificates are explicitly non-proven.
 */
export type AdmissionCohortInfeasibilityCertificateV1 = {
  [k: string]: unknown;
} & {
  version: "v10.3-admission-infeasibility-v1";
  gate: "smoke" | "canary";
  eligibilitySnapshotSha256: string;
  verifiedContextSha256: string;
  algorithm: "lexicographic-bnb-feasibility-v1";
  proven: boolean;
  proofKind: "capacity_cut" | "exhaustive_search" | "indeterminate_search_limit";
  /**
   * @minItems 1
   * @maxItems 128
   */
  violatedConstraints: [string, ...string[]];
  certificateSha256: string;
};

/**
 * Complete acyclic witness-review authority bundle. It contains no source, record, or temporal review targets.
 */
export interface CalibrationAdmissionWitnessReviewBundleV1 {
  version: "v10.3-admission-witness-review-bundle-v1";
  bundleId: Sha256;
  gate: "smoke" | "canary";
  verifiedContextSha256: Sha256;
  eligibilitySnapshotSha256: Sha256;
  searchResultBundle: CalibrationAdmissionSearchResultBundleV1;
  /**
   * @minItems 2
   * @maxItems 2
   */
  regenerations: [WitnessRegeneration, WitnessRegeneration];
  constraintCheck: ConstraintCheck;
  blindAssignment: CalibrationAdmissionBlindAssignmentV1;
  /**
   * @minItems 2
   * @maxItems 2
   */
  reviewerDecisions: [CalibrationAdmissionDecisionV103, CalibrationAdmissionDecisionV103];
  blindReviewReceipt: CalibrationAdmissionBlindReviewReceiptV1;
  witnessReviewReceipt: CalibrationAdmissionWitnessReviewReceiptV1;
  bundleSha256: Sha256;
}
/**
 * Acyclic search result bundle: invocation intents and receipts bind the already-created witness or certificate and search receipt.
 */
export interface CalibrationAdmissionSearchResultBundleV1 {
  version: "v10.3-admission-search-result-bundle-v1";
  bundleId: string;
  gate: "smoke" | "canary";
  verifiedContextSha256: string;
  eligibilitySnapshotSha256: string;
  /**
   * @maxItems 452382
   */
  invocationIntents: CalibrationAdmissionInvocationIntentV1[];
  /**
   * @maxItems 452382
   */
  toolReceipts: CalibrationAdmissionToolReceiptV1[];
  result:
    | {
        kind: "witness";
        witness: AdmissionCohortWitnessV1;
      }
    | {
        kind: "infeasibility";
        certificate: AdmissionCohortInfeasibilityCertificateV1;
      };
  searchReceipt: AdmissionSearchReceiptV1;
  bundleSha256: string;
}
/**
 * Pre-execution, immutable authority intent. Runtime validation binds profile/action ownership and the self-derived intent ID/hash.
 */
export interface CalibrationAdmissionInvocationIntentV1 {
  version: "v10.3-admission-invocation-intent-v1";
  intentId: string;
  profileId:
    | "admission-core-contract-v1"
    | "admission-context-v1"
    | "admission-static-ledgers-v1"
    | "admission-census-v1"
    | "admission-manifest-v1"
    | "admission-acquisition-publication-v1"
    | "admission-source-node-v1"
    | "admission-source-parquet-v1"
    | "admission-acquisition-round-v1"
    | "admission-git-acquire-v1"
    | "admission-release-acquire-v1"
    | "admission-evidence-acquire-v1";
  profileSha256: string;
  action: string;
  canonicalArgvSha256: string;
  inputSetSha256: string;
  executableBehaviorSha256: string;
  networkAuthorizationSha256?: string;
  intentSha256: string;
}
/**
 * Post-execution receipt binding the pre-execution intent, profile, observed resource usage, exit status, and primary output hash.
 */
export interface CalibrationAdmissionToolReceiptV1 {
  version: "v10.3-admission-tool-receipt-v1";
  receiptId: string;
  invocationIntentId: string;
  profileId:
    | "admission-core-contract-v1"
    | "admission-context-v1"
    | "admission-static-ledgers-v1"
    | "admission-census-v1"
    | "admission-manifest-v1"
    | "admission-acquisition-publication-v1"
    | "admission-source-node-v1"
    | "admission-source-parquet-v1"
    | "admission-acquisition-round-v1"
    | "admission-git-acquire-v1"
    | "admission-release-acquire-v1"
    | "admission-evidence-acquire-v1";
  profileSha256: string;
  action: string;
  canonicalArgvSha256: string;
  inputSetSha256: string;
  executableBehaviorSha256: string;
  networkAuthorizationSha256?: string;
  observedResourceUsage: {
    [k: string]: number;
  };
  exitCode: number;
  outputSetSha256: string;
}
export interface Unit {
  recordId: string;
  contentClusterId: string;
  label: "verified_ai" | "verified_human";
  language: string;
  materialSourceId: string;
  repositoryId: string;
  familyId: string;
  pairGroupId?: string;
  split: "train" | "validation" | "test";
  selectionKey: string;
}
export interface ConstraintProof {
  verifiedAi: number;
  verifiedHuman: number;
  languageCountsSha256: string;
  sourceCountsSha256: string;
  familyCountsSha256: string;
  pairSplitChecksSha256: string;
}
/**
 * Post-execution deterministic witness-search receipt. The witness or certificate is created before this receipt.
 */
export interface AdmissionSearchReceiptV1 {
  version: "v10.3-admission-search-receipt-v1";
  receiptId: string;
  gate: "smoke" | "canary";
  witnessPolicySha256: string;
  eligibilitySnapshotSha256: string;
  candidateOrderSha256: string;
  visitedNodes: number;
  prunedNodes: number;
  terminal: "witness" | "proven_capacity_cut" | "proven_exhaustive" | "indeterminate_limit";
  terminalArtifactSha256: string;
  toolReceiptSha256: string;
}
export interface ConstraintCheck {
  invocationIntent: CalibrationAdmissionInvocationIntentV1;
  toolReceipt: CalibrationAdmissionToolReceiptV1;
  constraintChecksSha256: Sha256;
}
/**
 * A pre-decision, two-reviewer assignment. It deliberately contains no decision or receipt identifiers.
 */
export interface CalibrationAdmissionBlindAssignmentV1 {
  version: "v10.3-admission-blind-assignment-v1";
  assignmentId: string;
  target:
    | {
        kind: "source";
        sourceId: string;
      }
    | {
        kind: "record";
        recordId: string;
      }
    | {
        kind: "temporal_attestation";
        temporalAttestationId: string;
        exactBlobOrContentSha256: string;
      }
    | {
        kind: "provider_revision_exception";
        recordId: string;
        providerVersioningEvidenceId: string;
      }
    | {
        kind: "witness";
        witnessSha256: string;
        eligibilitySnapshotSha256: string;
        verifiedContextSha256: string;
      };
  evidenceSetSha256: string;
  protocolEvidenceId: string;
  /**
   * @minItems 2
   * @maxItems 2
   */
  reviewerIds: [unknown, unknown];
  peerMaterialHiddenUntilBothSealed: true;
}
/**
 * Post-decision receipt proving that two assigned reviewers sealed independently while peer material was hidden.
 */
export interface CalibrationAdmissionBlindReviewReceiptV1 {
  version: "v10.3-admission-blind-review-receipt-v1";
  receiptId: string;
  assignmentId: string;
  evidenceSetSha256: string;
  /**
   * @minItems 2
   * @maxItems 2
   */
  sealedDecisions: [unknown, unknown];
  unsealedOnlyAfterBothDecisionIdsExisted: true;
  protocolAuditorId: string;
  protocolAuditEvidenceIds: string[];
}
/**
 * Post-witness review receipt binding two independent byte-identical regenerations, constraint checks, and blinded decisions.
 */
export interface CalibrationAdmissionWitnessReviewReceiptV1 {
  version: "v10.3-admission-witness-review-receipt-v1";
  receiptId: string;
  witnessSha256: string;
  eligibilitySnapshotSha256: string;
  verifiedContextSha256: string;
  blindReviewReceiptId: string;
  /**
   * @minItems 2
   * @maxItems 2
   */
  independentlyRegeneratedWitnessSha256s: [unknown, unknown];
  /**
   * @minItems 2
   * @maxItems 2
   */
  regenerationToolReceiptSha256s: [unknown, unknown];
  constraintChecksSha256: string;
  constraintCheckToolReceiptSha256: string;
  /**
   * @minItems 2
   * @maxItems 2
   */
  reviewerDecisionIds: [unknown, unknown];
  decision: "approved" | "rejected";
}

export interface WitnessRegeneration {
  invocationIntent: CalibrationAdmissionInvocationIntentV1;
  toolReceipt: CalibrationAdmissionToolReceiptV1;
  witnessSha256: Sha256;
}
