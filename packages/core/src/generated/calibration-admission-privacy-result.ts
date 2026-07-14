// AUTO-GENERATED from calibration-admission-privacy-result.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;

/**
 * Hash-bound privacy and secret scan result for one admission record.
 */
export interface AdmissionPrivacyResultV1 {
  version: "v10.3-admission-privacy-result-v1";
  recordId: Id;
  contentSha256: Sha256;
  privacyStatus: "pass" | "review" | "fail";
  secretStatus: "pass" | "review" | "fail";
  /**
   * @maxItems 1024
   */
  findings: {
    kind: string;
    confidence: "high" | "low";
    findingFingerprintSha256: Sha256;
  }[];
  /**
   * @maxItems 2
   */
  reviewerDecisionIds: [] | [Id] | [Id, Id];
  toolReceiptSha256: Sha256;
  resultSha256: Sha256;
}
