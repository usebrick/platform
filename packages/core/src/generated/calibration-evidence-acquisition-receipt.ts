// AUTO-GENERATED from calibration-evidence-acquisition-receipt.schema.json. Do not hand-edit.

export type Sha256 = string;
export type Id = string;
export type NonNegativeInteger = number;
export type Https = string;

export interface CalibrationEvidenceAcquisitionReceiptV1 {
  version: "v10.3-evidence-acquisition-receipt-v1";
  receiptId: Sha256;
  authorizationId: Id;
  authorizationSha256: Sha256;
  evidenceId: Id;
  observedBytes: NonNegativeInteger;
  observedSha256: Sha256;
  observedMediaType: string;
  redirectChain: Https[];
  resolvedPublicAddressesSha256: Sha256;
  casTransactionId: Id;
  primaryCompletionSha256: Sha256;
  toolReceiptSha256: Sha256;
  receiptSha256: Sha256;
}
