// AUTO-GENERATED from calibration-checkout-map.schema.json. Do not hand-edit.

export type Identifier = string;
export type Sha = string;
export type Sha256 = string;

export interface SlopBrickV103CalibrationCheckoutMapLocalOnly {
  version: "v10.3";
  runId: Identifier;
  /**
   * @minItems 1
   */
  entries: [Entry, ...Entry[]];
}
export interface Entry {
  repositoryId: Identifier;
  commitSha: Sha;
  checkoutPath: string;
  materialization?: ReleaseArchiveCheckoutBinding;
}
export interface ReleaseArchiveCheckoutBinding {
  kind: "release_archive";
  assetSha256: Sha256;
  extractionPolicy: "safe-zip-v1";
}
