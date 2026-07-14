// AUTO-GENERATED from calibration-admission-witness-policy.schema.json. Do not hand-edit.

export type Sha256 = string;

/**
 * Durable search constraints derived losslessly from the v10.3 admission policy. Runtime validation recomputes the expansion and both self-hashes.
 */
export interface AdmissionWitnessPolicyV1 {
  version: "v10.3-admission-witness-policy-v1";
  policyId: "v10.3-admission-v1";
  gate: "smoke" | "canary";
  algorithm: "lexicographic-bnb-feasibility-v1";
  seed: "slopbrick-v10.3-admission-review-v1";
  maxSearchNodes: 10000000 | 50000000;
  /**
   * @minItems 1
   */
  constraints: [Constraint, ...Constraint[]];
  constraintsSha256: Sha256;
  witnessPolicySha256: Sha256;
}
export interface Constraint {
  constraintId: string;
  kind: "exact" | "minimum" | "maximum" | "same_split";
  integerValue?: number;
}
