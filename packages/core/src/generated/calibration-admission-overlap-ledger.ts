// AUTO-GENERATED from calibration-admission-overlap-ledger.schema.json. Do not hand-edit.

export type Sha256 = string;
export type Id = string;
export type NonNegativeInteger = number;

/**
 * Hash-bound summary of the complete global overlap authority.
 */
export interface AdmissionOverlapLedgerV1 {
  version: "v10.3-admission-overlap-v1";
  universeSha256: Sha256;
  method: "prefix-filter-exact-jaccard-0.80-v1";
  normalizerRegistrySha256: Sha256;
  overlapPolicySha256: Sha256;
  indexReceiptSha256: Sha256;
  coverageComplete: boolean;
  /**
   * @maxItems 452382
   */
  unresolvedCandidateUnitIds: Id[];
  /**
   * @maxItems 65536
   */
  edgeShards: AdmissionBoundedShardReceiptV1[];
  /**
   * @maxItems 65536
   */
  adjacencyShards: AdmissionBoundedShardReceiptV1[];
  /**
   * @maxItems 65536
   */
  clusterSummaryShards: AdmissionBoundedShardReceiptV1[];
  /**
   * @maxItems 65536
   */
  clusterMembershipShards: AdmissionBoundedShardReceiptV1[];
  edgeCount: NonNegativeInteger;
  adjacencyRowCount: NonNegativeInteger;
  exactClusterCount: NonNegativeInteger;
  nearClusterCount: NonNegativeInteger;
  crossSideEdgeCount: NonNegativeInteger;
  ledgerSha256: Sha256;
}
/**
 * Hash and ordered-range receipt for one generation-local overlap shard.
 */
export interface AdmissionBoundedShardReceiptV1 {
  shardId: string;
  pathBase: "generation_local";
  relativePath: string;
  firstKey: string;
  lastKey: string;
  rowCount: number;
  bytes: number;
  sha256: string;
}
