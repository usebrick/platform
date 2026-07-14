// AUTO-GENERATED from calibration-approved-acquisition.schema.json. Do not hand-edit.

export type Sha256 = string;
export type NonEmptyString = string;
export type Slug = string;
export type MaterializationId = string;
export type HttpsUrl = string;
export type Transport =
  | {
      kind: "git_https";
      commitSha: string;
      transportByteLimit: "not_enforceable_by_stock_git";
      ownerAcknowledgedUnboundedTransport: true;
    }
  | {
      kind: "release_https";
      materialization: ReleaseArchiveMaterialization;
      maxTransferBytes: number;
      approvedRedirectUrls: HttpsUrl[];
    };
export type Id = string;
export type RelativePath = string;

/**
 * Owner-approved immutable source acquisition authorization. It contains no filesystem path and permits only one exact transport identity.
 */
export interface CalibrationApprovedAcquisitionV1 {
  version: "v10.3-approved-acquisition-v1";
  authorizationId: Sha256;
  approvedBy: NonEmptyString;
  approvedAt: string;
  sourceId: Slug;
  repositoryId: Slug;
  materializationId: MaterializationId;
  originUrl: HttpsUrl;
  transport: Transport;
  maxMaterializedBytes: number;
  licenseEvidenceId: Id;
  licensePath: RelativePath;
  licenseSha256: Sha256;
  authorizationSha256: Sha256;
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
