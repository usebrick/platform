// AUTO-GENERATED from calibration-admission-manifest-publication-transaction.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;
export type ManifestId = "v10.3-admission-smoke" | "v10.3-admission-canary";
export type ExpectedCurrentState =
  | {
      kind: "absent";
    }
  | {
      kind: "existing";
      generationSha256: Sha256;
    };
export type Path = string;
export type State =
  | {
      phase: "intent_fsynced" | "manifest_staged_fsynced";
    }
  | {
      phase: "tool_receipt_publication_started";
      nestedHandoffSha256: Sha256;
      childTransactionId: Id;
      childRecoveryNonce: Sha256;
    }
  | {
      phase: "tool_receipt_indexed";
      nestedHandoffSha256: Sha256;
      childTransactionId: Id;
      childRecoveryNonce: Sha256;
      toolReceiptId: Id;
      toolReceiptSha256: Sha256;
      toolAuthorityIndexSha256: Sha256;
    }
  | {
      phase:
        | "build_receipt_staged_fsynced"
        | "generation_directory_staged_fsynced"
        | "generation_directory_promoted"
        | "generations_parent_fsynced"
        | "current_temporary_fsynced"
        | "current_promoted"
        | "output_directories_fsynced"
        | "complete";
      toolReceiptId: Id;
      toolReceiptSha256: Sha256;
      toolAuthorityIndexSha256: Sha256;
      nestedHandoffSha256: Sha256;
      childTransactionId: Id;
      childRecoveryNonce: Sha256;
      buildReceiptId: Id;
      buildReceiptSha256: Sha256;
      generationSha256: Sha256;
      generationDirectoryStagedRelativePath: Path;
      generationDirectoryFinalRelativePath: Path;
      currentTemporaryRelativePath: Path;
      currentFinalRelativePath: Path;
    };

/**
 * Recoverable smoke/canary manifest publication transaction.
 */
export interface CalibrationAdmissionManifestPublicationTransactionV1 {
  version: "v10.3-admission-manifest-publication-transaction-v1";
  transactionId: Id;
  lockSha256: Sha256;
  invocationIntentId: Sha256;
  manifestId: ManifestId;
  operation: "create" | "replace";
  expectedCurrentState: ExpectedCurrentState;
  manifestSha256: Sha256;
  prerequisiteBundleSha256: Sha256;
  manifestStagingRelativePath: Path;
  buildReceiptStagingRelativePath: Path;
  /**
   * @minItems 3
   * @maxItems 3
   */
  generationLeafNames: ["manifest.json", "build-receipt.json", "generation.json"];
  recoveryNonce: Sha256;
  state: State;
  transactionSha256: Sha256;
}
