// AUTO-GENERATED from calibration-admission-adjudicator-assignment.schema.json. Do not hand-edit.

export type Sha256 = string;
export type Id = string;

/**
 * A dedicated assignment for resolving disagreement between two prior blind peer decisions.
 */
export interface CalibrationAdmissionAdjudicatorAssignmentV1 {
  version: "v10.3-admission-adjudicator-assignment-v1";
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
  /**
   * @minItems 2
   * @maxItems 2
   */
  priorDecisionIds: [Sha256, Sha256];
  priorBlindReviewReceiptId: Sha256;
  /**
   * @minItems 2
   */
  evidenceIds: [Id, Id, ...Id[]];
  evidenceSetSha256: Sha256;
  protocolEvidenceId: Id;
  adjudicatorId: Id;
  priorPeerReceiptRequired: true;
}
