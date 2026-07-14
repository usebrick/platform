// AUTO-GENERATED from calibration-admission-overlap-publication-lock.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;
export type ExpectedCurrentState =
  | {
      kind: "absent";
    }
  | {
      kind: "existing";
      generationSha256: Sha256;
    };

/**
 * Fixed-path lock for a create or replace overlap-generation publication transaction.
 */
export interface AdmissionOverlapPublicationLockV1 {
  version: "v10.3-admission-overlap-publication-lock-v1";
  lockId: Id;
  intendedTransactionId: Id;
  invocationIntentId: Sha256;
  inputGenerationSha256: Sha256;
  universeSha256: Sha256;
  normalizerRegistrySha256: Sha256;
  overlapPolicySha256: Sha256;
  operation: "create" | "replace";
  expectedCurrentState: ExpectedCurrentState;
  recoveryNonce: Sha256;
  lockSha256: Sha256;
}
