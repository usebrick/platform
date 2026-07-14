// AUTO-GENERATED from calibration-tool-authority-publication-transaction.schema.json. Do not hand-edit.

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

/**
 * Recoverable state machine for publishing one immutable tool-authority index generation.
 */
export interface CalibrationToolAuthorityPublicationTransactionV1 {
  version: "v10.3-tool-authority-publication-transaction-v1";
  transactionId: Sha256;
  lockSha256: Sha256;
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
export interface State {
  phase:
    | "intent_fsynced"
    | "artifacts_staged_fsynced"
    | "artifacts_promoted"
    | "index_generation_fsynced"
    | "next_index_temporary_fsynced"
    | "index_promoted"
    | "output_directories_fsynced"
    | "complete";
}
