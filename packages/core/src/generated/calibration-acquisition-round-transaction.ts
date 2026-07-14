// AUTO-GENERATED from calibration-acquisition-round-transaction.schema.json. Do not hand-edit.

export type Sha256 = string;
export type RelativePath = string;
export type SourceState =
  | {
      phase: "not_started" | "transport_complete";
    }
  | {
      phase:
        | "network_observation_fsynced"
        | "tree_verified"
        | "temporary_fsynced"
        | "destination_promoted"
        | "destination_directory_fsynced";
      networkObservationSha256: Sha256;
    }
  | {
      phase: "materialization_receipt_staged_fsynced";
      networkObservationSha256: Sha256;
      childToolReceiptId: Sha256;
      childToolReceiptSha256: Sha256;
      toolAuthorityIndexSha256: Sha256;
      materializationReceiptId: Id;
      materializationReceiptSha256: Sha256;
    }
  | {
      phase: "source_receipt_staged_fsynced";
      networkObservationSha256: Sha256;
      childToolReceiptId: Sha256;
      childToolReceiptSha256: Sha256;
      toolAuthorityIndexSha256: Sha256;
      materializationReceiptId: Id;
      materializationReceiptSha256: Sha256;
      sourceReceiptId: Sha256;
      sourceReceiptSha256: Sha256;
    };
export type Id = string;
export type State =
  | {
      phase: "intent_fsynced" | "all_sources_verified" | "all_destinations_promoted";
    }
  | {
      phase: "orchestrator_tool_receipt_indexed";
      orchestratorToolReceiptId: Sha256;
      orchestratorToolReceiptSha256: Sha256;
      toolAuthorityIndexSha256: Sha256;
    }
  | {
      phase: "round_receipt_staged_fsynced";
      orchestratorToolReceiptId: Sha256;
      orchestratorToolReceiptSha256: Sha256;
      toolAuthorityIndexSha256: Sha256;
      roundReceiptId: Sha256;
      roundReceiptSha256: Sha256;
      roundReceiptTemporaryRelativePath: RelativePath;
    }
  | {
      phase: "metadata_publication_complete" | "complete";
      orchestratorToolReceiptId: Sha256;
      orchestratorToolReceiptSha256: Sha256;
      toolAuthorityIndexSha256: Sha256;
      roundReceiptId: Sha256;
      roundReceiptSha256: Sha256;
      roundReceiptTemporaryRelativePath: RelativePath;
      acquisitionIndexSha256: Sha256;
      acquisitionPublicationTransactionId: Id;
      materializationReceiptLedgerSha256: Sha256;
      evidenceBundleSha256: Sha256;
    };

/**
 * Recoverable one- or two-source acquisition-round transaction with explicit paths, child receipts, and phase transitions.
 */
export interface CalibrationAcquisitionRoundTransactionV1 {
  version: "v10.3-acquisition-round-transaction-v1";
  transactionId: Sha256;
  lockSha256: Sha256;
  roundId: Sha256;
  orchestratorInvocationIntentId: Sha256;
  /**
   * @minItems 1
   * @maxItems 2
   */
  sourceInvocations: [SourceInvocation] | [SourceInvocation, SourceInvocation];
  maxTotalMaterializedBytes: number;
  reservedMaterializedBytes: number;
  recoveryNonce: Sha256;
  /**
   * @minItems 1
   * @maxItems 2
   */
  sources: [Source] | [Source, Source];
  state: State;
  transactionSha256: Sha256;
}
export interface SourceInvocation {
  authorizationId: Sha256;
  invocationIntentId: Sha256;
  profileId: "admission-git-acquire-v1" | "admission-release-acquire-v1";
  profileSha256: Sha256;
}
export interface Source {
  authorizationId: Sha256;
  temporaryRelativePath: RelativePath;
  finalRelativePath: RelativePath;
  expectedIdentitySha256: Sha256;
  maxMaterializedBytes: number;
  networkObservationRelativePath: RelativePath;
  sourceReceiptTemporaryRelativePath: RelativePath;
  sourceReceiptFinalRelativePath: RelativePath;
  materializationReceiptTemporaryRelativePath: RelativePath;
  materializationReceiptFinalRelativePath: RelativePath;
  toolReceiptTemporaryRelativePath: RelativePath;
  state: SourceState;
}
