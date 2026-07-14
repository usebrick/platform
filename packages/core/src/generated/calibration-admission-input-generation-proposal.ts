// AUTO-GENERATED from calibration-admission-input-generation-proposal.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;

/**
 * Reviewed, hash-bound proposal for publishing an immutable admission input generation.
 */
export interface CalibrationAdmissionInputGenerationProposalV1 {
  version: "v10.3-admission-input-generation-proposal-v1";
  proposalId: Id;
  operation: "create" | "replace";
  expectedCurrentState:
    | {
        kind: "absent";
      }
    | {
        kind: "existing";
        staticGenerationSha256: Sha256;
      };
  evidenceBundleSha256: Sha256;
  /**
   * @minItems 1
   * @maxItems 452382
   */
  sourceGenerationProposals: [
    {
      [k: string]: unknown;
    } & {
      [k: string]: unknown;
    },
    ...({
      [k: string]: unknown;
    } & {
      [k: string]: unknown;
    })[]
  ];
  admissionRecordStream: CalibrationAdmissionArtifactReceiptV1;
  overlapUniverse: CalibrationAdmissionArtifactReceiptV1;
  overlapUniverseRecords: CalibrationAdmissionArtifactReceiptV1;
  proposalSha256: Sha256;
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
