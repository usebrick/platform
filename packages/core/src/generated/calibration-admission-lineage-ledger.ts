// AUTO-GENERATED from calibration-admission-lineage-ledger.schema.json. Do not hand-edit.

export type Sha256 = string;
export type Id = string;

/**
 * Hash-bound family, pair, split, and overlap-cluster lineage for every admission record or explicitly unresolved record.
 */
export interface AdmissionLineageLedgerV1 {
  version: "v10.3-admission-lineage-ledger-v1";
  admissionRecordSetSha256: Sha256;
  /**
   * @maxItems 452382
   */
  results: {
    version: "v10.3-admission-lineage-result-v1";
    recordId: Id;
    contentSha256: Sha256;
    polarity: "ai_side" | "human_side" | "unassigned";
    familyId: Id;
    pairGroupId: Id | null;
    split: "train" | "validation" | "test" | "unassigned";
    exactClusterId: Id;
    nearClusterId: Id;
    toolReceiptSha256: Sha256;
    lineageSha256: Sha256;
  }[];
  /**
   * @maxItems 452382
   */
  coveredRecordIds: Id[];
  /**
   * @maxItems 452382
   */
  unresolvedRecordIds: Id[];
  ledgerSha256: Sha256;
}
