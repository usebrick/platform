// AUTO-GENERATED from calibration-admission-static-authority-generation.schema.json. Do not hand-edit.

export type NonNegativeInteger = number;
export type Sha256 = string;

/**
 * Immutable, content-addressed static authority generation joining all pre-witness ledgers.
 */
export interface CalibrationAdmissionStaticAuthorityGenerationV1 {
  version: "v10.3-admission-static-authority-generation-v1";
  generation: NonNegativeInteger;
  parentStaticGenerationSha256?: Sha256;
  inputGenerationSha256: Sha256;
  overlapGenerationSha256: Sha256;
  privacyLedgerSha256: Sha256;
  qualityLedgerSha256: Sha256;
  lineageLedgerSha256: Sha256;
  preWitnessBundleSha256: Sha256;
  toolAuthoritySnapshot: CalibrationAdmissionToolAuthoritySnapshotV1;
  /**
   * @minItems 1
   * @maxItems 1000000
   */
  artifacts: [CalibrationAdmissionArtifactReceiptV1, ...CalibrationAdmissionArtifactReceiptV1[]];
  generationSha256: Sha256;
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
