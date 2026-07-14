// AUTO-GENERATED from calibration-admission-adjudicator-receipt.schema.json. Do not hand-edit.

export type Sha256 = string;
export type Id = string;

/**
 * A receipt binding one adjudication decision to the exact two-decision peer receipt it resolved.
 */
export interface CalibrationAdmissionAdjudicatorReceiptV1 {
  version: "v10.3-admission-adjudicator-receipt-v1";
  receiptId: Sha256;
  assignmentId: Sha256;
  /**
   * @minItems 2
   * @maxItems 2
   */
  priorDecisionIds: [Sha256, Sha256];
  priorBlindReviewReceiptId: Sha256;
  evidenceSetSha256: Sha256;
  adjudicationDecisionId: Sha256;
  adjudicatorId: Id;
  priorPeerReceiptObservedBeforeAdjudication: true;
  protocolAuditorId: Id;
  protocolAuditEvidenceIds: Id[];
}
