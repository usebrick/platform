// AUTO-GENERATED from calibration-admission-overlap-checkpoint.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;

/**
 * Hash-bound resumable overlap phase checkpoint.
 */
export interface AdmissionOverlapCheckpointV1 {
  version: "v10.3-admission-overlap-checkpoint-v1";
  checkpointId: Id;
  universeSha256: Sha256;
  normalizerRegistrySha256: Sha256;
  overlapPolicySha256: Sha256;
  invocationIntentId: Sha256;
  phase: "postings" | "candidate_pairs" | "exact_edges" | "clusters";
  /**
   * @maxItems 65536
   */
  inputShardSha256s: Sha256[];
  /**
   * @maxItems 65536
   */
  outputShardSha256s: Sha256[];
  continuationCursorSha256: Sha256;
  checkpointSha256: Sha256;
}
