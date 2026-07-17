// AUTO-GENERATED from calibration-admission-manifest-publication-lock.schema.json. Do not hand-edit.

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

/**
 * CAS lock for one smoke or canary manifest publication.
 */
export interface CalibrationAdmissionManifestPublicationLockV1 {
  version: "v10.3-admission-manifest-publication-lock-v1";
  lockId: Id;
  intendedTransactionId: Id;
  invocationIntentId: Sha256;
  manifestId: ManifestId;
  operation: "create" | "replace";
  expectedCurrentState: ExpectedCurrentState;
  manifestSha256: Sha256;
  prerequisiteBundleSha256: Sha256;
  recoveryNonce: Sha256;
  lockSha256: Sha256;
}
