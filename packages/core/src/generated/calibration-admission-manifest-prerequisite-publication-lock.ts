// AUTO-GENERATED from calibration-admission-manifest-prerequisite-publication-lock.schema.json. Do not hand-edit.

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

/**
 * CAS lock for prerequisite bundle publication.
 */
export interface CalibrationAdmissionManifestPrerequisitePublicationLockV1 {
  version: "v10.3-admission-manifest-prerequisite-publication-lock-v1";
  lockId: Id;
  intendedTransactionId: Id;
  invocationIntentId: Sha256;
  requestId: Id;
  requestSha256: Sha256;
  operation: "create" | "replace";
  expectedCurrentState: ExpectedCurrentState;
  nextBundleSha256: Sha256;
  artifactSetSha256: Sha256;
  recoveryNonce: Sha256;
  lockSha256: Sha256;
}
