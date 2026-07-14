// AUTO-GENERATED from calibration-admission-source-generation.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;

/**
 * Immutable source review/artifact generation. The directory is content addressed by generationSha256.
 */
export interface CalibrationAdmissionSourceGenerationV1 {
  version: "v10.3-admission-source-generation-v1";
  sourceId: Id;
  generation: number;
  parentGenerationSha256?: Sha256;
  proposalId: Id;
  proposalSha256: Sha256;
  approval:
    | {
        kind: "genesis_quarantine";
        reason: "review_incomplete";
      }
    | {
        kind: "independent_review";
        approvalId: Id;
        approvalSha256: Sha256;
      };
  sourceReviewSha256: Sha256;
  /**
   * @minItems 1
   */
  artifacts: [CalibrationAdmissionArtifactReceiptV1, ...CalibrationAdmissionArtifactReceiptV1[]];
  artifactSetSha256: Sha256;
  generationSha256: Sha256;
}
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
  sha256: string;
}
