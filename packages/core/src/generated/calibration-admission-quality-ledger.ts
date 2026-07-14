// AUTO-GENERATED from calibration-admission-quality-ledger.schema.json. Do not hand-edit.

export type Sha256 = string;
export type Id = string;

/**
 * Hash-bound syntax, scaffold, and triviality outcomes for every admission record or explicitly unresolved record.
 */
export interface AdmissionQualityLedgerV1 {
  version: "v10.3-admission-quality-ledger-v1";
  admissionRecordSetSha256: Sha256;
  /**
   * @maxItems 452382
   */
  results: {
    version: "v10.3-admission-quality-result-v1";
    recordId: Id;
    contentSha256: Sha256;
    syntaxStatus: "pass" | "fail" | "unsupported";
    scaffoldStatus: "pass" | "fail";
    scaffoldByteShare: number;
    trivialStatus: "pass" | "fail";
    toolReceiptSha256: Sha256;
    resultSha256: Sha256;
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
