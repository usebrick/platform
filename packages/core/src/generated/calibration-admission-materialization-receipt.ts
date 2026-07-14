// AUTO-GENERATED from calibration-admission-materialization-receipt.schema.json. Do not hand-edit.

export type Sha256 = string;
export type Id = string;
export type Payload =
  | {
      kind: "git";
      originUrl: Https;
      commitSha: string;
      treeSha: string;
      inventorySha256: Sha256;
    }
  | {
      kind: "release_archive";
      originUrl: Https;
      assetSha256: Sha256;
      assetBytes: number;
      inventorySha256: Sha256;
    };
export type Https = string;

export interface CalibrationAdmissionMaterializationReceiptV1 {
  version: "v10.3-admission-materialization-receipt-v1";
  receiptId: Sha256;
  materializationId: Id;
  sourceId: Id;
  repositoryId: Id;
  acquisitionAuthorizationId: Id;
  acquisitionAuthorizationSha256: Sha256;
  acquisitionTransactionId: Id;
  primaryMaterializedOutputSha256: Sha256;
  childToolReceiptSha256: Sha256;
  verifiedUnitSetSha256: Sha256;
  payload: Payload;
}
