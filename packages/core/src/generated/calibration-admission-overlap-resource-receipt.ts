// AUTO-GENERATED from calibration-admission-overlap-resource-receipt.schema.json. Do not hand-edit.

export type Sha256 = string;
export type NonNegativeInteger = number;

/**
 * Observed resource and coverage receipt for the overlap authority.
 */
export interface AdmissionOverlapResourceReceiptV1 {
  version: "v10.3-overlap-resource-receipt-v1";
  receiptId: Sha256;
  universeSha256: Sha256;
  recordsJsonlSha256: Sha256;
  overlapPolicySha256: Sha256;
  realContentDistributionSha256: Sha256;
  recordCount: NonNegativeInteger;
  tokenCount: NonNegativeInteger;
  shingleCount: NonNegativeInteger;
  configuredLimits: ConfiguredLimits;
  observed: Observed;
  coverageComplete: boolean;
  withinAllLimits: boolean;
  toolReceiptSha256: Sha256;
}
export interface ConfiguredLimits {
  maxUnitBytes: 33554432;
  maxHeapBytes: 4294967296;
  maxRssBytes: 6442450944;
  maxWorkBytes: 214748364800;
  maxOpenFiles: 64;
  maxShardBytes: 67108864;
  maxWallMilliseconds: 86400000;
}
export interface Observed {
  maxUnitBytes: NonNegativeInteger;
  maxHeapBytes: NonNegativeInteger;
  maxRssBytes: NonNegativeInteger;
  maxWorkBytes: NonNegativeInteger;
  maxOpenFiles: NonNegativeInteger;
  maxShardBytes: NonNegativeInteger;
  wallMilliseconds: NonNegativeInteger;
}
