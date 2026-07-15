// AUTO-GENERATED from calibration-admission-witness-routing-reference.schema.json. Do not hand-edit.

export type RelativePath = string;
export type Sha256 = string;

/**
 * Hash-bound routing reference for one immutable witness bundle and its publication completion.
 */
export interface CalibrationAdmissionWitnessRoutingReferenceV1 {
  version: "v10.3-admission-witness-routing-reference-v1";
  gate: "smoke" | "canary";
  kind: "search_result" | "witness_review";
  bundleRelativePath: RelativePath;
  bundleSha256: Sha256;
  publicationCompletionRelativePath: RelativePath;
  publicationCompletionSha256: Sha256;
  referenceSha256: Sha256;
}
