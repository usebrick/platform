// AUTO-GENERATED from calibration-evidence-acquisition-reservation.schema.json. Do not hand-edit.

export type Sha256 = string;
export type Id = string;

export interface CalibrationEvidenceAcquisitionReservationV1 {
  version: "v10.3-evidence-acquisition-reservation-v1";
  reservationId: Sha256;
  authorizationId: Id;
  invocationIntentId: Sha256;
  recoveryNonce: Sha256;
  reservationSha256: Sha256;
}
