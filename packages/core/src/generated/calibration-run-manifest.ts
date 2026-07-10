// AUTO-GENERATED from calibration-run-manifest.schema.json. Do not hand-edit.

export type Identifier = string;
export type Sha = string;
export type Sha256 = string;

export interface SlopBrickV103CalibrationRunManifest {
  version: "v10.3";
  runId: Identifier;
  createdAt: string;
  git: {
    sha: Sha;
    dirty: boolean;
  };
  package: {
    name: "slopbrick";
    version: string;
  };
  runtime: {
    node: string;
    pnpm: string;
    platform: string;
    arch: string;
  };
  schemaVersion: "v10.3";
  methodVersion: string;
  inputHashes: InputHashes;
  selection: Selection;
  expected: Expected;
  settings: Settings;
  /**
   * @minItems 1
   */
  commandArgs: [string, ...string[]];
}
export interface InputHashes {
  registrySha256: Sha256;
  signalTableSha256: Sha256;
  configSha256: Sha256;
  corpusManifestSha256: Sha256;
  selectionSha256: Sha256;
  checkoutMapSha256: Sha256;
}
export interface Selection {
  seed: string;
  policy: {
    /**
     * @minItems 1
     */
    eligibleLabels: ["verified_ai" | "verified_human", ...("verified_ai" | "verified_human")[]];
    /**
     * @minItems 1
     */
    eligibleTiers: ["gold" | "silver", ...("gold" | "silver")[]];
    /**
     * @minItems 1
     */
    eligibleStrata: [string, ...string[]];
    maxPerStratum: number;
  };
}
export interface Expected {
  fileIdsByPolarity: PolarityIds;
  chunkIdsByPolarity: PolarityIds;
}
export interface PolarityIds {
  /**
   * @minItems 1
   */
  verified_ai: [string, ...string[]];
  /**
   * @minItems 1
   */
  verified_human: [string, ...string[]];
}
export interface Settings {
  includeRuleIds: string[];
  excludeRuleIds: string[];
  maxFileBytes: number;
  chunkSize: number;
  chunkTimeoutMs: number;
  retryTimeoutMs: number;
  workerCount: number;
}
