// AUTO-GENERATED from calibration-admission-manifest-prerequisite-publication-transaction.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;
export type ExpectedCurrentState =
  | {
      kind: "absent";
    }
  | {
      kind: "existing";
      bundleSha256: Sha256;
      currentSha256: Sha256;
    };
export type Path = string;
export type State =
  | {
      phase:
        | "intent_fsynced"
        | "request_staged_fsynced"
        | "request_promoted"
        | "request_directory_fsynced"
        | "artifacts_staged_fsynced"
        | "artifacts_promoted"
        | "artifact_directories_fsynced"
        | "bundle_staged_fsynced"
        | "bundle_promoted"
        | "bundle_directory_fsynced"
        | "projection_staged_fsynced"
        | "projection_promoted";
    }
  | {
      phase: "publication_tool_receipt_started";
      nestedHandoffSha256: Sha256;
      childTransactionId: Id;
      childRecoveryNonce: Sha256;
    }
  | {
      phase:
        | "publication_tool_receipt_indexed"
        | "completion_staged_fsynced"
        | "completion_promoted"
        | "completion_directory_fsynced"
        | "publication_current_staged_fsynced"
        | "publication_current_promoted"
        | "publication_current_directory_fsynced"
        | "complete";
      nestedHandoffSha256: Sha256;
      childTransactionId: Id;
      childRecoveryNonce: Sha256;
      publicationToolReceiptId: Id;
      publicationToolReceiptSha256: Sha256;
      toolAuthorityIndexSha256: Sha256;
      completionSha256: Sha256;
      completionFinalRelativePath: Path;
      publicationCurrentSha256: Sha256;
    };

/**
 * Recoverable prerequisite publication transaction with fixed output topology.
 */
export interface CalibrationAdmissionManifestPrerequisitePublicationTransactionV1 {
  version: "v10.3-admission-manifest-prerequisite-publication-transaction-v1";
  transactionId: Id;
  lockSha256: Sha256;
  invocationIntentId: Sha256;
  requestId: Id;
  requestSha256: Sha256;
  operation: "create" | "replace";
  expectedCurrentState: ExpectedCurrentState;
  nextBundleSha256: Sha256;
  artifactSetSha256: Sha256;
  requestTemporaryRelativePath: Path;
  requestFinalRelativePath: Path;
  /**
   * @minItems 1
   */
  artifacts: [Artifact, ...Artifact[]];
  bundleTemporaryRelativePath: Path;
  bundleFinalRelativePath: Path;
  projectionTemporaryRelativePath: Path;
  projectionFinalRelativePath: "review/admission/manifest-prerequisites/bundle.json";
  completionTemporaryRelativePath: Path;
  publicationCurrentTemporaryRelativePath: Path;
  publicationCurrentFinalRelativePath: "review/admission/manifest-prerequisites/publications/current.json";
  recoveryNonce: Sha256;
  state: State;
  transactionSha256: Sha256;
}
export interface Artifact {
  artifactId: Id;
  stagedRelativePath: Path;
  finalRelativePath: Path;
  bytes: number;
  sha256: Sha256;
}
