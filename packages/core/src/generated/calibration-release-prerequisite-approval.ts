// AUTO-GENERATED from calibration-release-prerequisite-approval.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;
export type CommitSha = string;
/**
 * @minItems 2
 * @maxItems 2
 */
export type ReviewerIds = [Id, Id];

/**
 * Independently reviewed approval of the release-plan prerequisite commit and evidence summary.
 */
export interface CalibrationReleasePrerequisiteApprovalV1 {
  version: "v10.3-release-prerequisite-approval-v1";
  receiptId: Id;
  planSha256: Sha256;
  approvedCommitSha: CommitSha;
  taskEvidenceSummarySha256: Sha256;
  reviewerIds: ReviewerIds;
  decision: "approved";
  receiptSha256: Sha256;
}
