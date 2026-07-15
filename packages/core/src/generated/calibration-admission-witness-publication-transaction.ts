// AUTO-GENERATED from calibration-admission-witness-publication-transaction.schema.json. Do not hand-edit.

export type Sha256 = string;
export type ReferenceState =
  | {
      kind: "absent";
    }
  | {
      kind: "existing";
      referenceSha256: Sha256;
    };
export type RelativePath = string;
export type State =
  | {
      phase: "intent_fsynced";
    }
  | {
      phase: "required_tool_receipts_indexed";
      requiredToolReceiptIds: Sha256[];
      requiredToolReceiptSha256s: Sha256[];
      toolAuthorityIndexSha256: Sha256;
    }
  | {
      phase: "bundle_staged_fsynced" | "bundle_promoted" | "output_directory_fsynced";
      requiredToolReceiptIds: Sha256[];
      requiredToolReceiptSha256s: Sha256[];
      toolAuthorityIndexSha256: Sha256;
    }
  | {
      phase: "publication_tool_receipt_started";
      requiredToolReceiptIds: Sha256[];
      requiredToolReceiptSha256s: Sha256[];
      toolAuthorityIndexSha256: Sha256;
      nestedHandoffSha256: Sha256;
      childTransactionId: Sha256;
      childRecoveryNonce: Sha256;
    }
  | {
      phase:
        | "publication_tool_receipt_indexed"
        | "completion_staged_fsynced"
        | "completion_promoted"
        | "completion_directory_fsynced"
        | "routing_reference_staged_fsynced"
        | "routing_reference_promoted"
        | "projections_directory_fsynced";
      requiredToolReceiptIds: Sha256[];
      requiredToolReceiptSha256s: Sha256[];
      toolAuthorityIndexSha256: Sha256;
      publicationToolReceiptId: Sha256;
      publicationToolReceiptSha256: Sha256;
      nestedHandoffSha256: Sha256;
      childTransactionId: Sha256;
      childRecoveryNonce: Sha256;
      publicationCompletionSha256: Sha256;
      publicationCompletionFinalRelativePath: RelativePath;
      nextRoutingReferenceSha256: Sha256;
    }
  | {
      phase: "complete";
      requiredToolReceiptIds: Sha256[];
      requiredToolReceiptSha256s: Sha256[];
      toolAuthorityIndexSha256: Sha256;
      publicationToolReceiptId: Sha256;
      publicationToolReceiptSha256: Sha256;
      nestedHandoffSha256: Sha256;
      childTransactionId: Sha256;
      childRecoveryNonce: Sha256;
      publicationCompletionSha256: Sha256;
      publicationCompletionFinalRelativePath: RelativePath;
      nextRoutingReferenceSha256: Sha256;
      completion: ReceiptSummary;
    };
export type ReceiptSummary =
  | {
      kind: "search_result";
      searchToolReceiptId: Sha256;
      searchToolReceiptSha256: Sha256;
      publicationToolReceiptId: Sha256;
      publicationToolReceiptSha256: Sha256;
    }
  | {
      kind: "witness_review";
      publicationToolReceiptId: Sha256;
      publicationToolReceiptSha256: Sha256;
    };

/**
 * Crash-recovery journal for one hash-addressed witness bundle publication.
 */
export interface CalibrationAdmissionWitnessPublicationTransactionV1 {
  version: "v10.3-admission-witness-publication-transaction-v1";
  transactionId: Sha256;
  lockSha256: Sha256;
  operation: "search_result" | "witness_review";
  gate: "smoke" | "canary";
  invocationIntentId: Sha256;
  bundleSha256: Sha256;
  bundleBytes: number;
  expectedRoutingReferenceState: ReferenceState;
  bundleTemporaryRelativePath: RelativePath;
  bundleFinalRelativePath: RelativePath;
  completionTemporaryRelativePath: RelativePath;
  routingReferenceTemporaryRelativePath: RelativePath;
  routingReferenceFinalRelativePath: RelativePath;
  recoveryNonce: Sha256;
  state: State;
  transactionSha256: Sha256;
}
