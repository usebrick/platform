// AUTO-GENERATED from calibration-admission-authority-current.schema.json. Do not hand-edit.

export type NonNegativeInteger = number;
export type Sha256 = string;
export type RelativePath = string;

/**
 * Self-hashed current pointer for the published static admission authority generation.
 */
export interface CalibrationAdmissionAuthorityCurrentV1 {
  version: "v10.3-admission-authority-current-v1";
  generation: NonNegativeInteger;
  staticGenerationSha256: Sha256;
  staticGenerationRelativePath: RelativePath;
  currentSha256: Sha256;
}
