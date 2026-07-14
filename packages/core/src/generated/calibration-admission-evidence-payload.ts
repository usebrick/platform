// AUTO-GENERATED from calibration-admission-evidence-payload.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;
export type Storage =
  | {
      kind: "materialization_reference";
      materializationReceiptId: Id;
      materializationId: Id;
      normalizedPath: RelativePath;
    }
  | {
      kind: "evidence_cas";
      casAlgorithm: "sha256";
      casRelativePath: RelativePath;
      authorizationId: Id;
    }
  | {
      kind: "local_unpublished_reference";
      localEvidenceId: Id;
    };
export type RelativePath = string;

export interface CalibrationAdmissionEvidencePayloadV1 {
  version: "v10.3-admission-evidence-payload-v1";
  payloadId: Id;
  evidenceId: Id;
  bytes: number;
  sha256: Sha256;
  mediaType: string;
  sourceLocatorSha256: Sha256;
  storage: Storage;
}
