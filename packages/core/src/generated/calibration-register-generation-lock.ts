// AUTO-GENERATED from calibration-register-generation-lock.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;

/**
 * Fixed-path register-generation lock bound to a recovery transaction and nonce.
 */
export interface CalibrationRegisterGenerationLockV1 {
  version: "v10.3-register-generation-lock-v1";
  lockId: Id;
  intendedTransactionId: Id;
  invocationIntentId: Sha256;
  expectedCurrentRegisterSha256: Sha256;
  nextRegisterSha256: Sha256;
  deltaId: Id;
  recoveryNonce: Sha256;
  lockSha256: Sha256;
}
