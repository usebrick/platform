// AUTO-GENERATED from calibration-approved-evidence-acquisition.schema.json. Do not hand-edit.

export type Id = string;
export type Https = string;
export type NonNegativeInteger = number;
export type Sha256 = string;
export type PositiveInteger = number;

export interface CalibrationApprovedEvidenceAcquisitionV1 {
  version: "v10.3-approved-evidence-acquisition-v1";
  authorizationId: Id;
  approvedBy: string;
  approvedAt: string;
  evidenceId: Id;
  url: Https;
  approvedRedirectUrls: Https[];
  expectedBytes: NonNegativeInteger;
  expectedSha256: Sha256;
  expectedMediaType: string;
  maxTransferBytes: PositiveInteger;
  authorizationSha256: Sha256;
}
