// AUTO-GENERATED from calibration-acquisition-round-lock.schema.json. Do not hand-edit.

export type Sha256 = string;

/**
 * Fixed-path lock for one bounded acquisition-round transaction.
 */
export interface CalibrationAcquisitionRoundLockV1 {
  version: "v10.3-acquisition-round-lock-v1";
  lockId: Sha256;
  intendedTransactionId: Sha256;
  roundId: Sha256;
  orchestratorInvocationIntentId: Sha256;
  /**
   * @minItems 1
   * @maxItems 2
   */
  sourceInvocations: [SourceInvocation] | [SourceInvocation, SourceInvocation];
  /**
   * @minItems 1
   * @maxItems 2
   */
  sourceAuthorizationIds: [Sha256] | [Sha256, Sha256];
  maxTotalMaterializedBytes: number;
  recoveryNonce: Sha256;
  lockSha256: Sha256;
}
export interface SourceInvocation {
  authorizationId: Sha256;
  invocationIntentId: Sha256;
  profileId: "admission-git-acquire-v1" | "admission-release-acquire-v1";
  profileSha256: Sha256;
}
