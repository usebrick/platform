// AUTO-GENERATED from calibration-admission-tool-profile.schema.json. Do not hand-edit.

export type Network =
  | {
      mode: "deny";
    }
  | {
      mode: "exact_authorized_https";
      transport: "git" | "release_asset" | "evidence";
    };
export type Sha256 = string;

/**
 * Frozen task-scoped authority profile. Runtime validation owns the exact twelve IDs and action/network ownership table.
 */
export interface CalibrationAdmissionToolProfileV1 {
  version: "v10.3-admission-tool-profile-v1";
  profileId:
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
   * @minItems 1
   */
  allowedExecutableIds: [string, ...string[]];
  /**
   * @minItems 1
   */
  allowedActions: [string, ...string[]];
  candidateByteAccess: "none" | "read_only";
  network: Network;
  resourceLimits: {
    [k: string]: number | string;
  };
  profileSha256: Sha256;
}
