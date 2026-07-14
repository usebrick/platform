// AUTO-GENERATED from calibration-admission-source-current.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;

/**
 * Self-hashed source current projection; the generation path is derived from source and generation hashes.
 */
export interface CalibrationAdmissionSourceCurrentV1 {
  version: "v10.3-admission-source-current-v1";
  sourceId: Id;
  generationSha256: Sha256;
  generationRelativePath: string;
  currentSha256: Sha256;
}
