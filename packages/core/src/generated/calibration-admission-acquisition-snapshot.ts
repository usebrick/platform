// AUTO-GENERATED from calibration-admission-acquisition-snapshot.schema.json. Do not hand-edit.

export type Sha256 = string;
export type Id = string;

/**
 * Content-addressed projection of an acquisition index generation.
 */
export interface CalibrationAdmissionAcquisitionSnapshotV1 {
  version: "v10.3-admission-acquisition-snapshot-v1";
  indexGenerationSha256: Sha256;
  artifactKeys: Id[];
  snapshotSha256: Sha256;
}
