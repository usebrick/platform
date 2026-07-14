// AUTO-GENERATED from calibration-admission-pre-witness-boundary.schema.json. Do not hand-edit.

export type Sha256 = string;

/**
 * Hash-bound static admission inputs. This provisional boundary is intentionally witness-free; the richer pre-witness bundle remains a separate contract.
 */
export interface AdmissionPreWitnessBoundaryV1 {
  version: "v10.3-admission-pre-witness-boundary-v1";
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
  artifacts: [{ kind: "lineage_ledger"; relativePath: "static/lineage.json"; sha256: Sha256 }, { kind: "overlap_generation"; relativePath: "static/overlap.json"; sha256: Sha256 }, { kind: "privacy_ledger"; relativePath: "static/privacy.json"; sha256: Sha256 }, { kind: "quality_ledger"; relativePath: "static/quality.json"; sha256: Sha256 }, { kind: "record_stream"; relativePath: "static/records.jsonl"; sha256: Sha256 }];
  preWitnessSha256: Sha256;
}
