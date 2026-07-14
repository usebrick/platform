// AUTO-GENERATED from calibration-acquisition-publication-proposal.schema.json. Do not hand-edit.

export type Id = string;
export type ExpectedCurrentState =
  | {
      kind: "absent";
    }
  | {
      kind: "existing";
      indexSha256: Sha256;
    };
export type Sha256 = string;
export type RelativePath = string;

/**
 * Frozen artifact set and expected-current contract for an acquisition index publication.
 */
export interface CalibrationAcquisitionPublicationProposalV1 {
  version: "v10.3-acquisition-publication-proposal-v1";
  proposalId: Id;
  operation: "create" | "replace";
  expectedCurrentState: ExpectedCurrentState;
  nextIndex: CalibrationAdmissionAcquisitionIndexV1;
  artifacts: Artifact1[];
  proposalSha256: Sha256;
}
/**
 * Hash-linked immutable acquisition artifact index generation.
 */
export interface CalibrationAdmissionAcquisitionIndexV1 {
  version: "v10.3-admission-acquisition-index-v1";
  generation: number;
  parentIndexSha256?: string;
  artifacts: Artifact[];
  indexSha256: string;
}
export interface Artifact {
  kind:
    | "evidence_authorization"
    | "source_authorization"
    | "round_authorization"
    | "evidence_receipt"
    | "evidence_cas_primary_completion"
    | "source_receipt"
    | "round_receipt"
    | "materialization_receipt"
    | "materialization_receipt_ledger"
    | "evidence_envelope"
    | "evidence_index"
    | "evidence_payload_set"
    | "evidence_verification_receipt_ledger"
    | "evidence_bundle";
  objectId: string;
  relativePath: string;
  sha256: string;
}
export interface Artifact1 {
  kind:
    | "evidence_authorization"
    | "source_authorization"
    | "round_authorization"
    | "evidence_receipt"
    | "evidence_cas_primary_completion"
    | "source_receipt"
    | "round_receipt"
    | "materialization_receipt"
    | "materialization_receipt_ledger"
    | "evidence_envelope"
    | "evidence_index"
    | "evidence_payload_set"
    | "evidence_verification_receipt_ledger"
    | "evidence_bundle";
  objectId: Id;
  sourceRelativePath: RelativePath;
  finalRelativePath: RelativePath;
  bytes: number;
  sha256: Sha256;
}
