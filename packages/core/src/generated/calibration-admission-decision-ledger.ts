// AUTO-GENERATED from calibration-admission-decision-ledger.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;

/**
 * Hash receipt joining admission decisions, blind assignments, post-decision receipts, and optional dedicated adjudication ledgers.
 */
export interface CalibrationAdmissionDecisionLedgerV1 {
  version: "v10.3-admission-decision-ledger-v1";
  ledgerId: Id;
  sourceId: Id;
  sourceReviewSha256: Sha256;
  admissionRecordSetSha256: Sha256;
  reviewSampleId?: Id;
  decisionJsonlSha256: Sha256;
  decisionIds: Sha256[];
  blindAssignmentJsonlSha256: Sha256;
  blindAssignmentIds: Sha256[];
  blindReviewReceiptJsonlSha256: Sha256;
  blindReviewReceiptIds: Sha256[];
  adjudicatorAssignmentJsonlSha256?: Sha256;
  adjudicatorAssignmentIds?: Sha256[];
  adjudicatorReceiptJsonlSha256?: Sha256;
  adjudicatorReceiptIds?: Sha256[];
  adjudicationDecisionIds: Sha256[];
  ledgerSha256: Sha256;
}
