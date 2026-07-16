// AUTO-GENERATED from calibration-run-lifecycle-receipt.schema.json. Do not hand-edit.

export type Id = string;
export type CommitSha = string;
export type Sha256 = string;
/**
 * @minItems 2
 * @maxItems 2
 */
export type ReviewerIds = [Id, Id];

/**
 * Independently reviewed terminal receipt for v10.3 run initialization or post-scan lifecycle verification.
 */
export interface CalibrationRunLifecycleReceiptV1 {
  version: "v10.3-run-lifecycle-receipt-v1";
  receiptId: Id;
  kind: "run_init" | "post_scan";
  approvedCommitSha: CommitSha;
  behaviorSha256: Sha256;
  verificationEvidenceSha256: Sha256;
  reviewerIds: ReviewerIds;
  decision: "approved";
  receiptSha256: Sha256;
}
