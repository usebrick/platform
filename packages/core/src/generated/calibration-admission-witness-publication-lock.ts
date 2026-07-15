// AUTO-GENERATED from calibration-admission-witness-publication-lock.schema.json. Do not hand-edit.

export type Sha256 = string;
export type RelativePath = string;
export type ReferenceState =
  | {
      kind: "absent";
    }
  | {
      kind: "existing";
      referenceSha256: Sha256;
    };

/**
 * CAS lock for one hash-addressed witness publication transaction.
 */
export interface CalibrationAdmissionWitnessPublicationLockV1 {
  version: "v10.3-admission-witness-publication-lock-v1";
  lockId: Sha256;
  intendedTransactionId: Sha256;
  operation: "search_result" | "witness_review";
  gate: "smoke" | "canary";
  invocationIntentId: Sha256;
  bundleSha256: Sha256;
  bundleRelativePath: RelativePath;
  expectedRoutingReferenceState: ReferenceState;
  recoveryNonce: Sha256;
  lockSha256: Sha256;
}
