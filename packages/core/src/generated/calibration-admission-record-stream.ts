// AUTO-GENERATED from calibration-admission-record-stream.schema.json. Do not hand-edit.

export type Sha256 = string;

/**
 * Hash receipt for the canonical admission-record JSONL stream.
 */
export interface CalibrationAdmissionRecordStreamV1 {
  version: "v10.3-admission-record-stream-v1";
  relativePath: "review/admission/admission-records.jsonl";
  recordsJsonlSha256: Sha256;
  recordCount: number;
  recordIdSetSha256: Sha256;
  canonicalRecordHashesSha256: Sha256;
  streamSha256: Sha256;
}
