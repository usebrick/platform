// AUTO-GENERATED from calibration-acquisition-publication-lock.schema.json. Do not hand-edit.

export type Id = string;
export type ExpectedCurrentState =
  | {
      kind: "absent";
    }
  | {
      kind: "existing";
      indexSha256: Sha256;
    };
export type Sha256 = string;

/**
 * Fixed-path lock for an acquisition index create or replace transaction.
 */
export interface CalibrationAcquisitionPublicationLockV1 {
  version: "v10.3-acquisition-publication-lock-v1";
  lockId: Id;
  intendedTransactionId: Id;
  invocationIntentId: Id;
  operation: "create" | "replace";
  expectedCurrentState: ExpectedCurrentState;
  nextIndexSha256: Sha256;
  artifactSetSha256: Sha256;
  recoveryNonce: Sha256;
  lockSha256: Sha256;
}
