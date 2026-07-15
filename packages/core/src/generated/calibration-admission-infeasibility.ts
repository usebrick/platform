// AUTO-GENERATED from calibration-admission-infeasibility.schema.json. Do not hand-edit.

/**
 * Deterministic v10.3 witness-search infeasibility certificate; search-limit certificates are explicitly non-proven.
 */
export type AdmissionCohortInfeasibilityCertificateV1 = {
  [k: string]: unknown;
} & {
  version: "v10.3-admission-infeasibility-v1";
  gate: "smoke" | "canary";
  eligibilitySnapshotSha256: Sha256;
  verifiedContextSha256: Sha256;
  algorithm: "lexicographic-bnb-feasibility-v1";
  proven: boolean;
  proofKind: "capacity_cut" | "exhaustive_search" | "indeterminate_search_limit";
  /**
   * @minItems 1
   * @maxItems 128
   */
  violatedConstraints: [string, ...string[]];
  certificateSha256: Sha256;
};
export type Sha256 = string;
