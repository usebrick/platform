// AUTO-GENERATED from calibration-admission-manifest-prerequisite-publication-current.schema.json. Do not hand-edit.

export type Path = string;
export type Sha256 = string;

/**
 * Self-hashed current pointer for the published prerequisite bundle.
 */
export interface CalibrationAdmissionManifestPrerequisitePublicationCurrentV1 {
  version: "v10.3-admission-manifest-prerequisite-publication-current-v1";
  bundleRelativePath: Path;
  bundleSha256: Sha256;
  completionRelativePath: Path;
  completionSha256: Sha256;
  currentSha256: Sha256;
}
