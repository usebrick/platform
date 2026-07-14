// AUTO-GENERATED from calibration-register-generation-receipt.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;

/**
 * Post-publication receipt binding a register generation to its delta, lock, transaction, and tool receipt.
 */
export interface CalibrationRegisterGenerationReceiptV1 {
  version: "v10.3-register-generation-receipt-v1";
  receiptId: Id;
  generation: number;
  deltaId: Id;
  /**
   * @minItems 1
   * @maxItems 2
   */
  sourceGenerationSha256s: [Sha256] | [Sha256, Sha256];
  parentRegisterSha256: Sha256;
  nextRegisterSha256: Sha256;
  lockSha256: Sha256;
  transactionId: Id;
  toolReceiptSha256: Sha256;
  receiptSha256: Sha256;
}
