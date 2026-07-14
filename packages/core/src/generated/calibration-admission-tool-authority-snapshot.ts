// AUTO-GENERATED from calibration-admission-tool-authority-snapshot.schema.json. Do not hand-edit.

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
 * Content-addressed projection of one immutable tool-authority index generation.
 */
export interface CalibrationAdmissionToolAuthoritySnapshotV1 {
  version: "v10.3-admission-tool-authority-snapshot-v1";
  indexGenerationSha256: Sha256;
  profileIds: ProfileId[];
  invocationIntentIds: Sha256[];
  receiptIds: Sha256[];
  snapshotSha256: Sha256;
}
