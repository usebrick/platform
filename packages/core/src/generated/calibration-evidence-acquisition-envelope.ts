// AUTO-GENERATED from calibration-evidence-acquisition-envelope.schema.json. Do not hand-edit.

export type Sha256 = string;
export type Id = string;
export type RelativePath = string;

export interface CalibrationEvidenceAcquisitionEnvelopeV1 {
  version: "v10.3-evidence-acquisition-envelope-v1";
  envelopeId: Sha256;
  authorizationId: Id;
  reservation: Reservation;
  invocationIntentId: Sha256;
  casTransactionId: Id;
  primaryCompletionRelativePath: RelativePath;
  primaryCompletionSha256: Sha256;
  acquisitionReceiptSha256: Sha256;
  payloadId: Id;
  toolReceiptSha256: Sha256;
  envelopeSha256: Sha256;
}
export interface Reservation {
  version: "v10.3-evidence-acquisition-reservation-v1";
  reservationId: Sha256;
  authorizationId: Id;
  invocationIntentId: Sha256;
  recoveryNonce: Sha256;
  reservationSha256: Sha256;
}
