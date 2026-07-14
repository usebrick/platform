// AUTO-GENERATED from calibration-acquisition-round-authorization.schema.json. Do not hand-edit.

export type Sha256 = string;
export type NonEmptyString = string;

/**
 * Owner-approved, deficit-bound authorization for one bounded one- or two-source acquisition round.
 */
export interface CalibrationAcquisitionRoundAuthorizationV1 {
  version: "v10.3-acquisition-round-authorization-v1";
  roundId: Sha256;
  approvedBy: NonEmptyString;
  approvedAt: string;
  parentCensusSha256: Sha256;
  measuredDeficitsSha256: Sha256;
  /**
   * @minItems 1
   * @maxItems 2
   */
  sourceAuthorizationIds: [Sha256] | [Sha256, Sha256];
  maxSources: 2;
  maxTotalMaterializedBytes: number;
  authorizationSha256: Sha256;
}
