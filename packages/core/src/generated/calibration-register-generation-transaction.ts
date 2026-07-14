// AUTO-GENERATED from calibration-register-generation-transaction.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;
export type RelativePath = string;

/**
 * Recoverable source-register generation transaction with explicit staged/final paths and phases.
 */
export interface CalibrationRegisterGenerationTransactionV1 {
  version: "v10.3-register-generation-transaction-v1";
  transactionId: Id;
  lockSha256: Sha256;
  invocationIntentId: Sha256;
  expectedCurrentRegisterSha256: Sha256;
  nextRegisterSha256: Sha256;
  deltaId: Id;
  /**
   * @minItems 1
   * @maxItems 2
   */
  sourceGenerations: [SourceGeneration] | [SourceGeneration, SourceGeneration];
  immutableGenerationRelativePath: RelativePath;
  currentRegisterTemporaryRelativePath: RelativePath;
  state: BasicState | ToolReceiptState | GenerationReceiptState;
  transactionSha256: Sha256;
}
export interface SourceGeneration {
  sourceId: Id;
  proposalId: Id;
  generationSha256: Sha256;
  artifactSetSha256: Sha256;
  generationStagingRelativePath: RelativePath;
  generationFinalRelativePath: RelativePath;
  generationsParentRelativePath: RelativePath;
  priorGenerationRelativePath?: RelativePath;
  currentPointerTemporaryRelativePath: RelativePath;
  currentPointerFinalRelativePath: RelativePath;
}
export interface BasicState {
  phase:
    | "intent_fsynced"
    | "source_generation_directories_staged_fsynced"
    | "source_generation_directories_promoted"
    | "source_generation_parents_fsynced"
    | "generation_file_fsynced"
    | "source_current_pointers_promoted"
    | "current_register_temporary_fsynced"
    | "current_register_promoted"
    | "output_directory_fsynced";
}
export interface ToolReceiptState {
  phase: "tool_receipt_indexed";
  toolReceiptId: Id;
  toolReceiptSha256: Sha256;
  toolAuthorityIndexSha256: Sha256;
  toolAuthorityPublicationTransactionId: Id;
}
export interface GenerationReceiptState {
  phase:
    | "generation_receipt_staged_fsynced"
    | "generation_receipt_promoted"
    | "receipt_directories_fsynced"
    | "complete";
  toolReceiptId: Id;
  toolReceiptSha256: Sha256;
  toolAuthorityIndexSha256: Sha256;
  toolAuthorityPublicationTransactionId: Id;
  generationReceiptId: Id;
  generationReceiptSha256: Sha256;
  generationReceiptTemporaryRelativePath: RelativePath;
  generationReceiptFinalRelativePath: RelativePath;
}
