// AUTO-GENERATED from calibration-admission-search-receipt.schema.json. Do not hand-edit.

export type Sha256 = string;

/**
 * Post-execution deterministic witness-search receipt. The witness or certificate is created before this receipt.
 */
export interface AdmissionSearchReceiptV1 {
  version: "v10.3-admission-search-receipt-v1";
  receiptId: Sha256;
  gate: "smoke" | "canary";
  witnessPolicySha256: Sha256;
  eligibilitySnapshotSha256: Sha256;
  candidateOrderSha256: Sha256;
  visitedNodes: number;
  prunedNodes: number;
  terminal: "witness" | "proven_capacity_cut" | "proven_exhaustive" | "indeterminate_limit";
  terminalArtifactSha256: Sha256;
  toolReceiptSha256: Sha256;
}
