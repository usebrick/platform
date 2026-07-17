// AUTO-GENERATED from calibration-admission-manifest-prerequisite-staging-set.schema.json. Do not hand-edit.

export type Id = string;
export type Path = string;
export type Sha256 = string;

/**
 * Hash-bound staging projection for prerequisite artifacts.
 */
export interface CalibrationAdmissionManifestPrerequisiteStagingSetV1 {
  version: "v10.3-admission-manifest-prerequisite-staging-set-v1";
  /**
   * @minItems 1
   */
  entries: [Entry, ...Entry[]];
  stagingSetSha256: Sha256;
}
export interface Entry {
  artifactId: Id;
  kind:
    | "release_plan"
    | "release_plan_approval"
    | "score_wire_closure_receipt"
    | "run_init_receipt"
    | "post_scan_receipt"
    | "packed_runtime_receipt"
    | "package_tarball"
    | "manifest_builder";
  mediaType: "text/markdown" | "application/json" | "application/gzip" | "application/javascript";
  normalizedRelativePath: Path;
  bytes: number;
  sha256: Sha256;
}
