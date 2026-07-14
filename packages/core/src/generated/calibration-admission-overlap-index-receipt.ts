// AUTO-GENERATED from calibration-admission-overlap-index-receipt.schema.json. Do not hand-edit.

export type Sha256 = string;
export type NonNegativeInteger = number;

/**
 * Hash-bound postings and candidate-pair index receipt.
 */
export interface AdmissionOverlapIndexReceiptV1 {
  version: "v10.3-overlap-index-receipt-v1";
  universeSha256: Sha256;
  normalizerRegistrySha256: Sha256;
  overlapPolicySha256: Sha256;
  method: "prefix-filter-exact-jaccard-0.80-v1";
  /**
   * @maxItems 65536
   */
  postingShards: AdmissionBoundedShardReceiptV1[];
  /**
   * @maxItems 65536
   */
  candidatePairShards: AdmissionBoundedShardReceiptV1[];
  /**
   * @maxItems 65536
   */
  checkpoints: AdmissionOverlapCheckpointV1[];
  coveredCandidateUnits: NonNegativeInteger;
  complete: boolean;
  toolReceiptSha256: Sha256;
  receiptSha256: Sha256;
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
/**
 * Hash-bound resumable overlap phase checkpoint.
 */
export interface AdmissionOverlapCheckpointV1 {
  version: "v10.3-admission-overlap-checkpoint-v1";
  checkpointId: string;
  universeSha256: string;
  normalizerRegistrySha256: string;
  overlapPolicySha256: string;
  invocationIntentId: string;
  phase: "postings" | "candidate_pairs" | "exact_edges" | "clusters";
  /**
   * @maxItems 65536
   */
  inputShardSha256s: string[];
  /**
   * @maxItems 65536
   */
  outputShardSha256s: string[];
  continuationCursorSha256: string;
  checkpointSha256: string;
}
