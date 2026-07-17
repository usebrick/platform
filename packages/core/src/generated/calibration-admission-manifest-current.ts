// AUTO-GENERATED from calibration-admission-manifest-current.schema.json. Do not hand-edit.

export type ManifestId = "v10.3-admission-smoke" | "v10.3-admission-canary";
export type Sha256 = string;
export type Path = string;

/**
 * Self-hashed current pointer for one admission manifest generation.
 */
export interface CalibrationAdmissionManifestCurrentV1 {
  version: "v10.3-admission-manifest-current-v1";
  manifestId: ManifestId;
  generation: number;
  generationSha256: Sha256;
  generationRelativePath: Path;
  currentSha256: Sha256;
}
