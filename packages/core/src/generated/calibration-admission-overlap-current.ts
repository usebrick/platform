// AUTO-GENERATED from calibration-admission-overlap-current.schema.json. Do not hand-edit.

export type NonNegativeInteger = number;
export type Sha256 = string;
export type RelativePath = string;

/**
 * Self-hashed current pointer for one published global overlap generation.
 */
export interface AdmissionOverlapCurrentV1 {
  version: "v10.3-admission-overlap-current-v1";
  generation: NonNegativeInteger;
  generationSha256: Sha256;
  generationRelativePath: RelativePath;
  currentSha256: Sha256;
}
