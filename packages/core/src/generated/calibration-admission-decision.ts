// AUTO-GENERATED from calibration-admission-decision.schema.json. Do not hand-edit.

export type Sha256 = string;
export type Target =
  | {
      kind: "source";
      sourceId: Id;
    }
  | {
      kind: "record";
      recordId: Sha256;
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
    }
  | {
      kind: "temporal_attestation";
      temporalAttestationId: Sha256;
      exactBlobOrContentSha256: Sha256;
    };
export type Id = string;
export type Reason =
  | "source_unregistered"
  | "source_revision_mutable"
  | "source_bytes_unbound"
  | "source_inventory_open"
  | "source_inventory_mismatch"
  | "aggregate_material_conservation_failed"
  | "material_source_conflict"
  | "evidence_unresolved"
  | "evidence_receipt_stale"
  | "record_container_projection_unsupported"
  | "materialization_unsupported"
  | "materialization_unverified"
  | "materialization_receipt_stale"
  | "license_absent"
  | "license_scope_ambiguous"
  | "analysis_use_unresolved"
  | "analysis_use_denied"
  | "redistribution_unresolved"
  | "redistribution_denied"
  | "third_party_rights_unresolved"
  | "authorship_unproven"
  | "generator_identity_missing"
  | "generator_revision_missing"
  | "prompt_binding_missing"
  | "output_binding_mismatch"
  | "human_edit_unknown"
  | "human_edit_substantial"
  | "human_provenance_missing"
  | "historical_cutoff_failed"
  | "historical_attestation_missing"
  | "historical_graph_incomplete"
  | "mixed_authorship"
  | "family_unknown"
  | "pair_incomplete"
  | "pair_content_unsafe"
  | "exact_cross_polarity_overlap"
  | "near_cross_polarity_overlap"
  | "unpaired_family_cross_polarity"
  | "split_leakage"
  | "lineage_ledger_incomplete"
  | "overlap_universe_incomplete"
  | "overlap_authority_incomplete"
  | "privacy_ledger_incomplete"
  | "quality_ledger_incomplete"
  | "adapter_audit_mismatch"
  | "privacy_high_confidence"
  | "secret_high_confidence"
  | "privacy_review_unresolved"
  | "syntax_invalid"
  | "language_normalizer_unsupported"
  | "scaffold_dominant"
  | "trivial_or_inert_target"
  | "duplicate_record"
  | "blind_review_receipt_missing"
  | "witness_review_receipt_missing"
  | "review_incomplete"
  | "review_disagreement"
  | "source_wide_quarantine";

/**
 * One independently authored, blind-assignment-bound admission decision.
 */
export interface CalibrationAdmissionDecisionV103 {
  version: "v10.3-admission-decision-v1";
  decisionId: Sha256;
  target: Target;
  reviewerId: Id;
  /**
   * @minItems 1
   */
  reviewerRoles: [
    "authorship" | "rights" | "leakage_privacy" | "calibration" | "provenance",
    ...("authorship" | "rights" | "leakage_privacy" | "calibration" | "provenance")[]
  ];
  /**
   * @minItems 1
   */
  evidenceIds: [Id, ...Id[]];
  blindAssignmentId: Sha256;
  /**
   * @minItems 2
   * @maxItems 2
   */
  adjudicatesDecisionIds?: [Sha256, Sha256];
  result:
    | {
        kind: "admission";
        proposedLabel: "verified_ai" | "verified_human" | "mixed" | "quarantine";
        humanEditStatus: "none" | "light" | "substantial" | "unknown" | "not_applicable";
        disposition: "eligible_gold" | "eligible_sensitivity" | "mixed_evaluation" | "quarantine";
      }
    | {
        kind: "provider_revision_exception";
        decision: "accepted" | "rejected";
      }
    | {
        kind: "temporal_attestation";
        decision: "accepted" | "rejected";
      }
    | {
        kind: "witness";
        decision: "approved" | "rejected";
      };
  reasons: Reason[];
  decidedAt: string;
}
