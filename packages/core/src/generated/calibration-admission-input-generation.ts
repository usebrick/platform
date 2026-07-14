// AUTO-GENERATED from calibration-admission-input-generation.schema.json. Do not hand-edit.

export type NonNegativeInteger = number;
export type Sha256 = string;
export type Id = string;
export type RelativePath = string;

/**
 * Immutable, content-addressed input generation joining source generations and overlap inputs.
 */
export interface CalibrationAdmissionInputGenerationV1 {
  version: "v10.3-admission-input-generation-v1";
  generation: NonNegativeInteger;
  parentInputGenerationSha256?: Sha256;
  evidenceBundleSha256: Sha256;
  /**
   * @minItems 1
   * @maxItems 452382
   */
  sourceGenerations: [
    {
      sourceId: Id;
      generationSha256: Sha256;
      relativePath: RelativePath;
      artifactSetSha256: Sha256;
    },
    ...{
      sourceId: Id;
      generationSha256: Sha256;
      relativePath: RelativePath;
      artifactSetSha256: Sha256;
    }[]
  ];
  admissionRecordStreamSha256: Sha256;
  overlapUniverseSha256: Sha256;
  overlapUniverseRecordsSha256: Sha256;
  /**
   * @minItems 1
   * @maxItems 65536
   */
  artifacts: [CalibrationAdmissionArtifactReceiptV1, ...CalibrationAdmissionArtifactReceiptV1[]];
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
