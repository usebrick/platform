// AUTO-GENERATED from calibration-admission-authority-rebuild-transaction.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;
export type ExpectedCurrentState =
  | {
      kind: "absent";
    }
  | {
      kind: "existing";
      staticGenerationSha256: Sha256;
    };
export type RelativePath = string;

/**
 * Recoverable state machine for publishing one immutable static admission-authority generation.
 */
export interface CalibrationAdmissionAuthorityRebuildTransactionV1 {
  version: "v10.3-admission-authority-rebuild-transaction-v1";
  transactionId: Id;
  lockSha256: Sha256;
  invocationIntentId: Sha256;
  inputGenerationProposalId: Id;
  inputGenerationProposalSha256: Sha256;
  operation: "create" | "replace";
  expectedCurrentState: ExpectedCurrentState;
  recoveryNonce: Sha256;
  inputGenerationRelativePath: RelativePath;
  staticGenerationStagingRelativePath: RelativePath;
  authorityCurrentTemporaryRelativePath: RelativePath;
  authorityCurrentFinalRelativePath: "review/admission/authority/current.json";
  /**
   * @minItems 1
   * @maxItems 452382
   */
  sourceGenerationDirectories: [SourceGenerationDirectory, ...SourceGenerationDirectory[]];
  state: IntentState | InputState | PrimaryStaticOutputsState | ToolReceiptState | PublishedState;
  transactionSha256: Sha256;
}
export interface SourceGenerationDirectory {
  sourceId: Id;
  generationSha256: Sha256;
  artifactSetSha256: Sha256;
  generationStagingRelativePath: RelativePath;
  generationFinalRelativePath: RelativePath;
  generationsParentRelativePath: RelativePath;
  priorGenerationRelativePath?: RelativePath;
  currentPointerTemporaryRelativePath: RelativePath;
  currentPointerFinalRelativePath: RelativePath;
}
export interface IntentState {
  phase: "intent_fsynced";
}
export interface InputState {
  phase:
    | "source_generation_directories_staged_fsynced"
    | "source_generation_directories_promoted"
    | "source_generation_parents_fsynced"
    | "input_generation_fsynced"
    | "overlap_generation_verified";
  inputGenerationSha256: Sha256;
}
export interface PrimaryStaticOutputsState {
  phase: "primary_static_outputs_fsynced";
  inputGenerationSha256: Sha256;
  overlapGenerationSha256: Sha256;
  primaryOutputSetSha256: Sha256;
}
export interface ToolReceiptState {
  phase: "tool_receipt_indexed";
  inputGenerationSha256: Sha256;
  overlapGenerationSha256: Sha256;
  primaryOutputSetSha256: Sha256;
  toolReceiptId: Id;
  toolReceiptSha256: Sha256;
  toolAuthorityIndexSha256: Sha256;
}
export interface PublishedState {
  phase:
    | "static_generation_staged_fsynced"
    | "static_generation_promoted"
    | "static_generations_parent_fsynced"
    | "source_current_pointers_promoted"
    | "authority_current_promoted"
    | "output_directories_fsynced"
    | "complete";
  inputGenerationSha256: Sha256;
  overlapGenerationSha256: Sha256;
  primaryOutputSetSha256: Sha256;
  toolReceiptId: Id;
  toolReceiptSha256: Sha256;
  toolAuthorityIndexSha256: Sha256;
  staticGenerationSha256: Sha256;
  staticGenerationRelativePath: RelativePath;
}
