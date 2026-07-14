// AUTO-GENERATED from calibration-admission-overlap-generation.schema.json. Do not hand-edit.

export type NonNegativeInteger = number;
export type Sha256 = string;

/**
 * Immutable, content-addressed generation of the v10.3 global overlap authority.
 */
export interface AdmissionOverlapGenerationV1 {
  version: "v10.3-admission-overlap-generation-v1";
  generation: NonNegativeInteger;
  parentGenerationSha256?: Sha256;
  inputGenerationSha256: Sha256;
  universeSha256: Sha256;
  overlapPolicySha256: Sha256;
  artifactSetSha256: Sha256;
  /**
   * @maxItems 65536
   */
  artifacts: CalibrationAdmissionArtifactReceiptV1[];
  toolAuthoritySnapshot: CalibrationAdmissionToolAuthoritySnapshotV1;
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
/**
 * Content-addressed projection of one immutable tool-authority index generation.
 */
export interface CalibrationAdmissionToolAuthoritySnapshotV1 {
  version: "v10.3-admission-tool-authority-snapshot-v1";
  indexGenerationSha256: string;
  profileIds: (
    | "admission-core-contract-v1"
    | "admission-context-v1"
    | "admission-static-ledgers-v1"
    | "admission-census-v1"
    | "admission-manifest-v1"
    | "admission-acquisition-publication-v1"
    | "admission-source-node-v1"
    | "admission-source-parquet-v1"
    | "admission-acquisition-round-v1"
    | "admission-git-acquire-v1"
    | "admission-release-acquire-v1"
    | "admission-evidence-acquire-v1"
  )[];
  invocationIntentIds: string[];
  receiptIds: string[];
  snapshotSha256: string;
}
