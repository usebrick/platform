// AUTO-GENERATED from calibration-admission-evidence-receipt.schema.json. Do not hand-edit.

export type Sha256 = string;
export type Id = string;

export interface CalibrationAdmissionEvidenceReceiptV1 {
  version: "v10.3-admission-evidence-receipt-v1";
  receiptId: Sha256;
  evidenceId: Id;
  evidenceIndexSha256: Sha256;
  payloadId: Id;
  payloadSetSha256: Sha256;
  verificationMethod:
    | "offline-materialization-file-v1"
    | "offline-evidence-cas-v1"
    | "offline-local-unpublished-reference-v1";
  observedBytes: number;
  observedSha256: Sha256;
  toolReceiptSha256: Sha256;
  status: "verified" | "mismatch" | "unavailable";
}
