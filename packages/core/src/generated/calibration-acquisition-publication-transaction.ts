// AUTO-GENERATED from calibration-acquisition-publication-transaction.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;
export type ExpectedCurrentState =
  | {
      kind: "absent";
    }
  | {
      kind: "existing";
      indexSha256: Sha256;
    };
export type RelativePath = string;
export type State =
  | {
      phase:
        | "intent_fsynced"
        | "artifacts_staged_fsynced"
        | "artifacts_promoted"
        | "index_generation_fsynced"
        | "next_index_temporary_fsynced"
        | "index_promoted"
        | "output_directories_fsynced";
    }
  | {
      phase: "publication_tool_receipt_indexed" | "complete";
      publicationToolReceiptId: Id;
      publicationToolReceiptSha256: Sha256;
      toolAuthorityIndexSha256: Sha256;
    };

/**
 * Recoverable state machine for publishing an acquisition index generation.
 */
export interface CalibrationAcquisitionPublicationTransactionV1 {
  version: "v10.3-acquisition-publication-transaction-v1";
  transactionId: Id;
  lockSha256: Sha256;
  invocationIntentId: Id;
  operation: "create" | "replace";
  expectedCurrentState: ExpectedCurrentState;
  nextIndexSha256: Sha256;
  artifacts: Artifact[];
  immutableIndexGenerationRelativePath: RelativePath;
  nextIndexTemporaryRelativePath: RelativePath;
  state: State;
  transactionSha256: Sha256;
}
export interface Artifact {
  stagedRelativePath: RelativePath;
  finalRelativePath: RelativePath;
  bytes: number;
  sha256: Sha256;
}
