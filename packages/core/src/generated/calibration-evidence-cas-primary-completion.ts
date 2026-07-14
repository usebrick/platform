// AUTO-GENERATED from calibration-evidence-cas-primary-completion.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;
export type RelativePath = string;
export type NonNegativeInteger = number;
export type Https = string;

export interface CalibrationEvidenceCasPrimaryCompletionV1 {
  version: "v10.3-evidence-cas-primary-completion-v1";
  transactionId: Id;
  authorizationId: Id;
  reservationSha256: Sha256;
  evidenceId: Id;
  invocationIntentId: Sha256;
  finalRelativePath: RelativePath;
  observedBytes: NonNegativeInteger;
  observedSha256: Sha256;
  networkObservation: NetworkObservation;
  networkObservationSha256: Sha256;
  primaryCompletionSha256: Sha256;
}
export interface NetworkObservation {
  requestUrl: Https;
  redirectChain: Https[];
  resolvedPublicAddresses: string[];
  connectedPeerAddress: string;
  observedMediaType: string;
}
