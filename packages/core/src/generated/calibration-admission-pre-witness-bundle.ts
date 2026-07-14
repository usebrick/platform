// AUTO-GENERATED from calibration-admission-pre-witness-bundle.schema.json. Do not hand-edit.

export type Sha256 = string;

/**
 * Hash-bound static admission inputs. This boundary is intentionally witness-free: witness targets, decisions, and receipts are published only after this bundle is complete.
 */
export interface AdmissionPreWitnessBundleV1 {
  version: "v10.3-admission-pre-witness-bundle-v1";
  admissionRecordSetSha256: Sha256;
  recordStreamSha256: Sha256;
  privacyLedgerSha256: Sha256;
  qualityLedgerSha256: Sha256;
  lineageLedgerSha256: Sha256;
  overlapGenerationSha256: Sha256;
  toolReceiptSha256: Sha256;
  /**
   * @minItems 5
   * @maxItems 5
   */
  artifacts: [Artifact, Artifact, Artifact, Artifact, Artifact];
  preWitnessSha256: Sha256;
}
export interface Artifact {
  kind:
    "lineage_ledger" | "overlap_generation" | "privacy_ledger" | "quality_ledger" | "record_stream";
  relativePath: string;
  sha256: Sha256;
}
