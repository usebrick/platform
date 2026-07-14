// AUTO-GENERATED from calibration-tool-authority-publication-lock.schema.json. Do not hand-edit.

export type Sha256 = string;
export type ExpectedCurrentState =
  | {
      kind: "absent";
    }
  | {
      kind: "existing";
      indexSha256: Sha256;
    };

/**
 * Fixed-path lock for a tool-authority index create or replace transaction.
 */
export interface CalibrationToolAuthorityPublicationLockV1 {
  version: "v10.3-tool-authority-publication-lock-v1";
  lockId: Sha256;
  intendedTransactionId: Sha256;
  operation: "create" | "replace";
  expectedCurrentState: ExpectedCurrentState;
  nextIndexSha256: Sha256;
  artifactSetSha256: Sha256;
  recoveryNonce: Sha256;
  lockSha256: Sha256;
}
