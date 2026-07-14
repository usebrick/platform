// AUTO-GENERATED from calibration-admission-review-sample.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;

/**
 * Deterministic, hash-bound blind-review sample selection.
 */
export interface CalibrationAdmissionReviewSampleV1 {
  version: "v10.3-admission-review-sample-v1";
  sampleId: Id;
  sourceId: Id;
  seed: "slopbrick-v10.3-admission-review-v1";
  populationSha256: Sha256;
  populationCount: number;
  strata: Stratum[];
  selected: Selected[];
  selectionSha256: Sha256;
  presentationOrderSha256: Sha256;
  toolReceiptSha256: Sha256;
}
export interface Stratum {
  stratumId: string;
  populationCount: number;
  requestedCount: number;
}
export interface Selected {
  logicalUnitId: Id;
  stratumId: string;
  selectionKey: Sha256;
  presentationKey: Sha256;
}
