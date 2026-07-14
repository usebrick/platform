// AUTO-GENERATED from calibration-acquisition-round-receipt.schema.json. Do not hand-edit.

export type Sha256 = string;

/**
 * Post-acquisition round receipt proving the exact one- or two-source set, orchestrator authority, and cumulative byte cap.
 */
export interface CalibrationAcquisitionRoundReceiptV1 {
  version: "v10.3-acquisition-round-receipt-v1";
  receiptId: Sha256;
  roundId: Sha256;
  parentCensusSha256: Sha256;
  /**
   * @minItems 1
   * @maxItems 2
   */
  sourceReceiptSha256s: [Sha256] | [Sha256, Sha256];
  /**
   * @minItems 1
   * @maxItems 2
   */
  sourceInvocationIntentIds: [Sha256] | [Sha256, Sha256];
  /**
   * @minItems 1
   * @maxItems 2
   */
  sourceProfileSha256s: [Sha256] | [Sha256, Sha256];
  /**
   * @minItems 1
   * @maxItems 2
   */
  sourceToolReceiptSha256s: [Sha256] | [Sha256, Sha256];
  orchestratorInvocationIntentId: Sha256;
  orchestratorToolReceiptId: Sha256;
  orchestratorToolReceiptSha256: Sha256;
  toolAuthoritySnapshot: CalibrationAdmissionToolAuthoritySnapshotV1;
  acquiredSourceCount: 1 | 2;
  totalMaterializedBytes: number;
  withinAuthorizedCountAndBytes: true;
  receiptSha256: Sha256;
}
/**
 * Content-addressed projection of one immutable tool-authority index generation.
 */
export interface CalibrationAdmissionToolAuthoritySnapshotV1 {
  version: "v10.3-admission-tool-authority-snapshot-v1";
  indexGenerationSha256: string;
  profileIds: (
    | "admission-core-contract-v1"
    | "admission-context-v1"
    | "admission-static-ledgers-v1"
    | "admission-census-v1"
    | "admission-manifest-v1"
    | "admission-acquisition-publication-v1"
    | "admission-source-node-v1"
    | "admission-source-parquet-v1"
    | "admission-acquisition-round-v1"
    | "admission-git-acquire-v1"
    | "admission-release-acquire-v1"
    | "admission-evidence-acquire-v1"
  )[];
  invocationIntentIds: string[];
  receiptIds: string[];
  snapshotSha256: string;
}
