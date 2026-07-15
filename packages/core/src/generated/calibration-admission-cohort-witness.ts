// AUTO-GENERATED from calibration-admission-cohort-witness.schema.json. Do not hand-edit.

/**
 * Deterministic, exact-size v10.3 admission cohort witness produced before search receipts or witness review.
 */
export type AdmissionCohortWitnessV1 = {
  [k: string]: unknown;
} & {
  version: "v10.3-admission-cohort-witness-v1";
  gate: "smoke" | "canary";
  policyId: "v10.3-admission-v1";
  algorithm: "lexicographic-bnb-feasibility-v1";
  seed: "slopbrick-v10.3-admission-review-v1";
  eligibilitySnapshotSha256: Sha256;
  verifiedContextSha256: Sha256;
  /**
   * @maxItems 10000
   */
  units: Unit[];
  constraintProof: ConstraintProof;
  witnessSha256: Sha256;
};
export type Sha256 = string;
export type Id = string;
export type Printable = string;

export interface Unit {
  recordId: Id;
  contentClusterId: Id;
  label: "verified_ai" | "verified_human";
  language: Printable;
  materialSourceId: Id;
  repositoryId: Id;
  familyId: Id;
  pairGroupId?: Id;
  split: "train" | "validation" | "test";
  selectionKey: Printable;
}
export interface ConstraintProof {
  verifiedAi: number;
  verifiedHuman: number;
  languageCountsSha256: Sha256;
  sourceCountsSha256: Sha256;
  familyCountsSha256: Sha256;
  pairSplitChecksSha256: Sha256;
}
