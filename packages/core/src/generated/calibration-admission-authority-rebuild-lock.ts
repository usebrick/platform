// AUTO-GENERATED from calibration-admission-authority-rebuild-lock.schema.json. Do not hand-edit.

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

/**
 * Fixed-path lock for a create or replace static admission-authority rebuild transaction.
 */
export interface CalibrationAdmissionAuthorityRebuildLockV1 {
  version: "v10.3-admission-authority-rebuild-lock-v1";
  lockId: Id;
  intendedTransactionId: Id;
  invocationIntentId: Sha256;
  inputGenerationProposalId: Id;
  inputGenerationProposalSha256: Sha256;
  operation: "create" | "replace";
  expectedCurrentState: ExpectedCurrentState;
  recoveryNonce: Sha256;
  lockSha256: Sha256;
}
