// AUTO-GENERATED from calibration-admission-overlap-publication-transaction.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;
export type ExpectedCurrentState =
  | {
      kind: "absent";
    }
  | {
      kind: "existing";
      generationSha256: Sha256;
    };
export type RelativePath = string;
export type NonNegativeInteger = number;

/**
 * Recoverable state machine for publishing one immutable global overlap generation.
 */
export interface AdmissionOverlapPublicationTransactionV1 {
  version: "v10.3-admission-overlap-publication-transaction-v1";
  transactionId: Id;
  lockSha256: Sha256;
  invocationIntentId: Sha256;
  inputGenerationSha256: Sha256;
  universeSha256: Sha256;
  normalizerRegistrySha256: Sha256;
  overlapPolicySha256: Sha256;
  operation: "create" | "replace";
  expectedCurrentState: ExpectedCurrentState;
  recoveryNonce: Sha256;
  generationStagingRelativePath: RelativePath;
  currentGenerationTemporaryRelativePath: RelativePath;
  currentGenerationFinalRelativePath: "review/admission/global/overlap/current-generation.json";
  state: BasicState | PrimaryOutputState | ToolReceiptState | PublishedState;
  transactionSha256: Sha256;
}
export interface BasicState {
  phase: "intent_fsynced";
}
export interface PrimaryOutputState {
  phase: "primary_outputs_staged_fsynced";
  primaryOutputSetSha256: Sha256;
  /**
   * @maxItems 65536
   */
  primaryArtifacts: PrimaryArtifact[];
}
export interface PrimaryArtifact {
  generationLocalRelativePath: RelativePath;
  stagedRelativePath: RelativePath;
  bytes: NonNegativeInteger;
  sha256: Sha256;
}
export interface ToolReceiptState {
  phase: "tool_receipt_indexed";
  primaryOutputSetSha256: Sha256;
  toolReceiptId: Id;
  toolReceiptSha256: Sha256;
  toolAuthorityIndexSha256: Sha256;
}
export interface PublishedState {
  phase:
    | "generation_directory_staged_fsynced"
    | "generation_directory_promoted"
    | "generations_parent_fsynced"
    | "current_output_projections_staged_fsynced"
    | "current_output_projections_promoted"
    | "current_generation_promoted"
    | "output_directories_fsynced"
    | "complete";
  primaryOutputSetSha256: Sha256;
  toolReceiptId: Id;
  toolReceiptSha256: Sha256;
  toolAuthorityIndexSha256: Sha256;
  nextGenerationSha256: Sha256;
  generationDirectoryFinalRelativePath: RelativePath;
  artifactSetSha256: Sha256;
  /**
   * @maxItems 65536
   */
  generationArtifacts: PrimaryArtifact[];
  /**
   * @maxItems 65536
   */
  currentOutputProjections: Projection[];
}
export interface Projection {
  stagedRelativePath: RelativePath;
  finalRelativePath: RelativePath;
  priorGenerationRelativePath?: RelativePath;
  bytes: NonNegativeInteger;
  sha256: Sha256;
}
