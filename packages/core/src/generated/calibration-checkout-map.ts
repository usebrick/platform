// AUTO-GENERATED from calibration-checkout-map.schema.json. Do not hand-edit.

export type Identifier = string;
export type Sha = string;

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
}
