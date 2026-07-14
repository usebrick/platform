// AUTO-GENERATED from calibration-admission-evidence-cas-transaction.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;
export type RelativePath = string;
export type NonNegativeInteger = number;
export type State =
  | {
      phase: "intent_fsynced";
    }
  | {
      phase:
        | "network_observation_fsynced"
        | "temporary_fsynced"
        | "object_promoted"
        | "cas_directories_fsynced"
        | "temporary_removed";
      networkObservationRelativePath: RelativePath;
      networkObservationSha256: Sha256;
    }
  | {
      phase: "cas_complete_waiting_metadata";
      networkObservationRelativePath: RelativePath;
      networkObservationSha256: Sha256;
      primaryCompletionRelativePath: RelativePath;
      primaryCompletionSha256: Sha256;
    };

export interface CalibrationAdmissionEvidenceCasTransactionV1 {
  version: "v10.3-admission-evidence-cas-transaction-v1";
  transactionId: Id;
  authorizationId: Id;
  reservationSha256: Sha256;
  evidenceId: Id;
  finalRelativePath: RelativePath;
  temporaryRelativePath: RelativePath;
  expectedBytes: NonNegativeInteger;
  expectedSha256: Sha256;
  invocationIntentId: Sha256;
  recoveryNonce: Sha256;
  state: State;
  transactionSha256: Sha256;
}
