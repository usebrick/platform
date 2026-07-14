// AUTO-GENERATED from calibration-admission-privacy-ledger.schema.json. Do not hand-edit.

export type Sha256 = string;
export type Id = string;

/**
 * Hash-bound privacy authority ledger covering every admission record or explicitly unresolved record.
 */
export interface AdmissionPrivacyLedgerV1 {
  version: "v10.3-admission-privacy-ledger-v1";
  admissionRecordSetSha256: Sha256;
  /**
   * @maxItems 452382
   */
  results: AdmissionPrivacyResultV1[];
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
/**
 * Hash-bound privacy and secret scan result for one admission record.
 */
export interface AdmissionPrivacyResultV1 {
  version: "v10.3-admission-privacy-result-v1";
  recordId: string;
  contentSha256: string;
  privacyStatus: "pass" | "review" | "fail";
  secretStatus: "pass" | "review" | "fail";
  /**
   * @maxItems 1024
   */
  findings: {
    kind: string;
    confidence: "high" | "low";
    findingFingerprintSha256: string;
  }[];
  /**
   * @maxItems 2
   */
  reviewerDecisionIds: [] | [string] | [string, string];
  toolReceiptSha256: string;
  resultSha256: string;
}
