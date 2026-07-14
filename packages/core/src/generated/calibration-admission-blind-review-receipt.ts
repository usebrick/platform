// AUTO-GENERATED from calibration-admission-blind-review-receipt.schema.json. Do not hand-edit.

export type Sha256 = string;
export type Id = string;

/**
 * Post-decision receipt proving that two assigned reviewers sealed independently while peer material was hidden.
 */
export interface CalibrationAdmissionBlindReviewReceiptV1 {
  version: "v10.3-admission-blind-review-receipt-v1";
  receiptId: Sha256;
  assignmentId: Sha256;
  evidenceSetSha256: Sha256;
  /**
   * @minItems 2
   * @maxItems 2
   */
  sealedDecisions: [{ reviewerId: Id; decisionId: Sha256; peerDecisionVisibleBeforeSeal: false }, { reviewerId: Id; decisionId: Sha256; peerDecisionVisibleBeforeSeal: false }];
  unsealedOnlyAfterBothDecisionIdsExisted: true;
  protocolAuditorId: Id;
  protocolAuditEvidenceIds: Id[];
}
