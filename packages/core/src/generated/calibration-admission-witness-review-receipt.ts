// AUTO-GENERATED from calibration-admission-witness-review-receipt.schema.json. Do not hand-edit.

export type Sha256 = string;

/**
 * Post-witness review receipt binding two independent byte-identical regenerations, constraint checks, and blinded decisions.
 */
export interface CalibrationAdmissionWitnessReviewReceiptV1 {
  version: "v10.3-admission-witness-review-receipt-v1";
  receiptId: Sha256;
  witnessSha256: Sha256;
  eligibilitySnapshotSha256: Sha256;
  verifiedContextSha256: Sha256;
  blindReviewReceiptId: Sha256;
  /**
   * @minItems 2
   * @maxItems 2
   */
  independentlyRegeneratedWitnessSha256s: [Sha256, Sha256];
  /**
   * @minItems 2
   * @maxItems 2
   */
  regenerationToolReceiptSha256s: [Sha256, Sha256];
  constraintChecksSha256: Sha256;
  constraintCheckToolReceiptSha256: Sha256;
  /**
   * @minItems 2
   * @maxItems 2
   */
  reviewerDecisionIds: [Sha256, Sha256];
  decision: "approved" | "rejected";
}
