// AUTO-GENERATED from calibration-admission-source-generation-approval.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;

/**
 * Post-proposal approval bound to a pre-existing blind assignment, two decisions, and a post-decision blind receipt.
 */
export interface CalibrationAdmissionSourceGenerationApprovalV1 {
  version: "v10.3-admission-source-generation-approval-v1";
  approvalId: Id;
  proposalId: Id;
  proposalSha256: Sha256;
  blindAssignmentId: Sha256;
  /**
   * @minItems 2
   * @maxItems 2
   */
  reviewerDecisionIds: [Sha256, Sha256];
  blindReviewReceiptId: Sha256;
  approvalSha256: Sha256;
}
