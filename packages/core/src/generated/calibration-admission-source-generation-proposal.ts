// AUTO-GENERATED from calibration-admission-source-generation-proposal.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;

/**
 * Frozen source-generation input. Approval and future register hashes are intentionally absent.
 */
export interface CalibrationAdmissionSourceGenerationProposalV1 {
  version: "v10.3-admission-source-generation-proposal-v1";
  proposalId: Id;
  sourceId: Id;
  operation: "create" | "replace";
  expectedCurrentState:
    | {
        kind: "absent";
      }
    | {
        kind: "existing";
        generationSha256: Sha256;
      };
  sourceReviewSha256: Sha256;
  materializationAuthority:
    | {
        kind: "genesis";
        evidenceBundleSha256: Sha256;
      }
    | {
        kind: "acquired";
        acquisitionIndexGenerationSha256: Sha256;
        materializationReceiptId: Id;
        materializationReceiptSha256: Sha256;
      };
  /**
   * @minItems 1
   */
  artifacts: [CalibrationAdmissionArtifactReceiptV1, ...CalibrationAdmissionArtifactReceiptV1[]];
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
