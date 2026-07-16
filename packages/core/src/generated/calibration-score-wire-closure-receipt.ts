// AUTO-GENERATED from calibration-score-wire-closure-receipt.schema.json. Do not hand-edit.

export type Id = string;
export type CommitSha = string;
export type Sha256 = string;
/**
 * @minItems 2
 * @maxItems 2
 */
export type ReviewerIds = [Id, Id];

/**
 * Independently reviewed receipt closing the v10.3 score/wire contract at one implementation commit.
 */
export interface CalibrationScoreWireClosureReceiptV1 {
  version: "v10.3-score-wire-closure-receipt-v1";
  receiptId: Id;
  approvedCommitSha: CommitSha;
  scoreContractSha256: Sha256;
  verificationEvidenceSha256: Sha256;
  reviewerIds: ReviewerIds;
  decision: "approved";
  receiptSha256: Sha256;
}
