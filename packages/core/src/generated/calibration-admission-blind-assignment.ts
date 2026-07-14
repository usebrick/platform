// AUTO-GENERATED from calibration-admission-blind-assignment.schema.json. Do not hand-edit.

export type Sha256 = string;
export type Id = string;

/**
 * A pre-decision, two-reviewer assignment. It deliberately contains no decision or receipt identifiers.
 */
export interface CalibrationAdmissionBlindAssignmentV1 {
  version: "v10.3-admission-blind-assignment-v1";
  assignmentId: Sha256;
  target:
    | {
        kind: "source";
        sourceId: Id;
      }
    | {
        kind: "record";
        recordId: Sha256;
      }
    | {
        kind: "temporal_attestation";
        temporalAttestationId: Sha256;
        exactBlobOrContentSha256: Sha256;
      }
    | {
        kind: "provider_revision_exception";
        recordId: Sha256;
        providerVersioningEvidenceId: Id;
      }
    | {
        kind: "witness";
        witnessSha256: Sha256;
        eligibilitySnapshotSha256: Sha256;
        verifiedContextSha256: Sha256;
      };
  evidenceSetSha256: Sha256;
  protocolEvidenceId: Id;
  /**
   * @minItems 2
   * @maxItems 2
   */
  reviewerIds: [Id, Id];
  peerMaterialHiddenUntilBothSealed: true;
}
