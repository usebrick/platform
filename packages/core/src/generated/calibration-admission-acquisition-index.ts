// AUTO-GENERATED from calibration-admission-acquisition-index.schema.json. Do not hand-edit.

export type Sha256 = string;
export type Id = string;
export type RelativePath = string;

/**
 * Hash-linked immutable acquisition artifact index generation.
 */
export interface CalibrationAdmissionAcquisitionIndexV1 {
  version: "v10.3-admission-acquisition-index-v1";
  generation: number;
  parentIndexSha256?: Sha256;
  artifacts: Artifact[];
  indexSha256: Sha256;
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
  objectId: Id;
  relativePath: RelativePath;
  sha256: Sha256;
}
