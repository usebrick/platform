// AUTO-GENERATED from calibration-admission-tool-authority-index.schema.json. Do not hand-edit.

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
export type RelativePath = string;

/**
 * Hash-linked immutable index of admission tool profiles, invocation intents, and receipts.
 */
export interface CalibrationAdmissionToolAuthorityIndexV1 {
  version: "v10.3-admission-tool-authority-index-v1";
  generation: number;
  parentIndexSha256?: Sha256;
  profiles: ProfileReference[];
  invocationIntents: InvocationIntentReference[];
  receipts: ReceiptReference[];
  indexSha256: Sha256;
}
export interface ProfileReference {
  profileId: ProfileId;
  relativePath: RelativePath;
  sha256: Sha256;
}
export interface InvocationIntentReference {
  intentId: Sha256;
  relativePath: RelativePath;
  sha256: Sha256;
}
export interface ReceiptReference {
  receiptId: Sha256;
  relativePath: RelativePath;
  sha256: Sha256;
}
