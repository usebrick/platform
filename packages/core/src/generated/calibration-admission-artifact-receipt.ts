// AUTO-GENERATED from calibration-admission-artifact-receipt.schema.json. Do not hand-edit.

export type Sha256 = string;

/**
 * Content-addressed receipt for one source-generation artifact.
 */
export interface CalibrationAdmissionArtifactReceiptV1 {
  pathBase: "generation_local" | "admission_root_content_addressed";
  relativePath: string;
  kind:
    | "source_review"
    | "review_sample"
    | "review_decisions"
    | "admission_records"
    | "record_stream"
    | "overlap_universe"
    | "overlap_universe_stream"
    | "shard"
    | "checkpoint"
    | "index"
    | "receipt"
    | "ledger"
    | "bundle"
    | "current_pointer";
  bytes: number;
  sha256: Sha256;
}
