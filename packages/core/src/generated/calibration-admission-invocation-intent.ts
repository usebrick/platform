// AUTO-GENERATED from calibration-admission-invocation-intent.schema.json. Do not hand-edit.

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
 * Pre-execution, immutable authority intent. Runtime validation binds profile/action ownership and the self-derived intent ID/hash.
 */
export interface CalibrationAdmissionInvocationIntentV1 {
  version: "v10.3-admission-invocation-intent-v1";
  intentId: Sha256;
  profileId: ProfileId;
  profileSha256: Sha256;
  action: string;
  canonicalArgvSha256: Sha256;
  inputSetSha256: Sha256;
  executableBehaviorSha256: Sha256;
  networkAuthorizationSha256?: Sha256;
  intentSha256: Sha256;
}
