// AUTO-GENERATED from calibration-admission-register-delta.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;

/**
 * Hash-bound one- or two-source addition to a v10.3 admission register.
 */
export interface CalibrationAdmissionRegisterDeltaV1 {
  version: "v10.3-admission-register-delta-v1";
  deltaId: Id;
  generation: number;
  parentRegisterSha256: Sha256;
  acquisitionRoundId: Id;
  acquisitionRoundReceiptSha256: Sha256;
  /**
   * @minItems 1
   * @maxItems 2
   */
  addedSources: [AddedSource] | [AddedSource, AddedSource];
  deltaSha256: Sha256;
}
export interface AddedSource {
  sourceId: Id;
  sourceGenerationSha256: Sha256;
  registerEntrySha256: Sha256;
  sourceReviewSha256: Sha256;
  sourceAcquisitionAuthorizationId: Id;
  sourceAcquisitionReceiptId: Id;
  sourceAcquisitionReceiptSha256: Sha256;
  materializationReceiptId: Id;
  materializationReceiptSha256: Sha256;
}
