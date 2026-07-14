// AUTO-GENERATED from calibration-admission-bounded-shard-receipt.schema.json. Do not hand-edit.

export type Id = string;
export type RelativePath = string;
export type Key = string;
export type NonNegativeInteger = number;
export type Sha256 = string;

/**
 * Hash and ordered-range receipt for one generation-local overlap shard.
 */
export interface AdmissionBoundedShardReceiptV1 {
  shardId: Id;
  pathBase: "generation_local";
  relativePath: RelativePath;
  firstKey: Key;
  lastKey: Key;
  rowCount: NonNegativeInteger;
  bytes: number;
  sha256: Sha256;
}
