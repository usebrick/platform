// AUTO-GENERATED from calibration-packed-runtime-receipt.schema.json. Do not hand-edit.

export type Id = string;
export type CommitSha = string;
export type Sha256 = string;
/**
 * @minItems 2
 * @maxItems 2
 */
export type ReviewerIds = [Id, Id];

/**
 * Independently reviewed Node 22 or Node 24 packed-runtime verification receipt for the v0.45.0 package.
 */
export interface CalibrationPackedRuntimeReceiptV1 {
  version: "v10.3-packed-runtime-receipt-v1";
  receiptId: Id;
  approvedCommitSha: CommitSha;
  nodeMajor: 22 | 24;
  packageVersion: "0.45.0";
  tarballSha256: Sha256;
  manifestBuilderBehaviorSha256: Sha256;
  installCommandSha256: Sha256;
  verificationCommandSha256: Sha256;
  outputSetSha256: Sha256;
  reviewerIds: ReviewerIds;
  decision: "approved";
  exitCode: 0;
  receiptSha256: Sha256;
}
