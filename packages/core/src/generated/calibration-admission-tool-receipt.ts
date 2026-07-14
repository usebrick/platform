// AUTO-GENERATED from calibration-admission-tool-receipt.schema.json. Do not hand-edit.

export type Sha256 = string;
export type ProfileId =
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

/**
 * Post-execution receipt binding the pre-execution intent, profile, observed resource usage, exit status, and primary output hash.
 */
export interface CalibrationAdmissionToolReceiptV1 {
  version: "v10.3-admission-tool-receipt-v1";
  receiptId: Sha256;
  invocationIntentId: Sha256;
  profileId: ProfileId;
  profileSha256: Sha256;
  action: string;
  canonicalArgvSha256: Sha256;
  inputSetSha256: Sha256;
  executableBehaviorSha256: Sha256;
  networkAuthorizationSha256?: Sha256;
  observedResourceUsage: {
    [k: string]: number;
  };
  exitCode: number;
  outputSetSha256: Sha256;
}
