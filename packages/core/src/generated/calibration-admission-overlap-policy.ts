// AUTO-GENERATED from calibration-admission-overlap-policy.schema.json. Do not hand-edit.

export type Sha256 = string;

/**
 * Frozen resource and exact-similarity policy for the v10.3 global overlap authority.
 */
export interface AdmissionOverlapPolicyV1 {
  version: "v10.3-admission-overlap-policy-v1";
  method: "prefix-filter-exact-jaccard-0.80-v1";
  maxUnitBytes: 33554432;
  maxShardBytes: 67108864;
  maxOpenFiles: 64;
  maxHeapBytes: 4294967296;
  maxRssBytes: 6442450944;
  maxWorkBytes: 214748364800;
  maxWallMilliseconds: 86400000;
  policySha256: Sha256;
}
