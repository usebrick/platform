// AUTO-GENERATED from calibration-acquisition-receipt.schema.json. Do not hand-edit.

export type Sha256 = string;
export type Slug = string;
export type MaterializationId = string;
export type HttpsUrl = string;
export type Transport =
  | {
      kind: "git_https";
      commitSha: string;
      treeSha: Sha256;
      observedPackBytes: number;
      observedNetworkBytes: "not_observable_exactly";
    }
  | {
      kind: "release_https";
      materialization: ReleaseArchiveMaterialization;
      extractionReceipt: ExtractionReceipt;
      observedTransferBytes: number;
      redirectChain: HttpsUrl[];
    };
export type RelativePath = string;
export type Id = string;

/**
 * Observed immutable source-acquisition receipt bound to one approved source authorization and one round transaction.
 */
export interface CalibrationAcquisitionReceiptV1 {
  version: "v10.3-acquisition-receipt-v1";
  receiptId: Sha256;
  authorizationId: Sha256;
  roundId: Sha256;
  authorizationSha256: Sha256;
  sourceId: Slug;
  repositoryId: Slug;
  materializationId: MaterializationId;
  originUrl: HttpsUrl;
  transport: Transport;
  materializedBytes: number;
  inventorySha256: Sha256;
  licenseSha256: Sha256;
  materializationReceiptId: Id;
  materializationReceiptSha256: Sha256;
  networkObservation: NetworkObservation;
  resolvedPublicAddressesSha256: Sha256;
  connectedPeerEvidenceSha256: Sha256;
  transactionId: Sha256;
  toolReceiptId: Sha256;
  toolReceiptSha256: Sha256;
  receiptSha256: Sha256;
}
export interface ReleaseArchiveMaterialization {
  kind: "release_archive";
  assetUrl: string;
  assetSha256: string;
  assetBytes: number;
  archiveFormat: "zip";
  /**
   * Archive-relative directory prefix that becomes the verified materialization root. Release-archive file normalizedPath values are relative to this root.
   */
  rootPrefix: string;
  extractionPolicy: "safe-zip-v1";
}
export interface ExtractionReceipt {
  receiptVersion: "v1";
  extractionPolicy: "safe-zip-v1";
  assetSha256: Sha256;
  assetBytes: number;
  inventorySha256: Sha256;
  entries: (
    | {
        path: RelativePath;
        kind: "directory";
      }
    | {
        path: RelativePath;
        kind: "file";
        bytes: number;
        sha256: Sha256;
      }
  )[];
}
export interface NetworkObservation {
  requestUrl: HttpsUrl;
  redirectChain: HttpsUrl[];
  /**
   * @minItems 1
   */
  resolvedPublicAddresses: [string, ...string[]];
  connectedPeerAddress: string;
}
