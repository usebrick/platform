// AUTO-GENERATED from calibration-source-review.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;
export type MaterializationId = string;
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
 * One source review bound to one immutable register entry. A source_quarantine review may truthfully have no reviewer decisions.
 */
export interface CalibrationSourceReviewV103 {
  version: "v10.3-source-review-v1";
  sourceId: Id;
  sourceKind: "aggregate_inventory" | "material_source";
  contributesToAdditiveCounts: boolean;
  sourceRegisterEntrySha256: Sha256;
  originEvidenceId: Id;
  origin:
    | {
        kind: "https";
        url: string;
      }
    | {
        kind: "local_unpublished";
        localSourceId: Id;
      };
  materialization:
    | {
        kind: "aggregate_only";
        childMaterialSourceIds: Id[];
      }
    | {
        kind: "git";
        materializationId: MaterializationId;
        repositoryId: Id;
        commitSha: string;
      }
    | {
        kind: "release_archive_set";
        upstreamCommitSha: string;
        /**
         * @minItems 1
         */
        assets: [ReleaseAsset, ...ReleaseAsset[]];
      }
    | {
        kind: "record_container";
        materializationId: MaterializationId;
        /**
         * @minItems 1
         */
        containers: [Container, ...Container[]];
        projectionPolicy: string;
      }
    | {
        kind: "unpublished_bundle";
        bundleId: Id;
        bundleInventorySha256: Sha256;
      };
  sourceRights: Rights;
  inventory: {
    physicalMemberCount: number;
    candidateCodeUnitCount: number;
    inventorySha256: Sha256;
    closedWorld: boolean;
  };
  reviewerDecisionIds: Sha256[];
  reviewedAt: string;
  decision: "candidate" | "source_quarantine";
  reasons: Reason[];
}
export interface ReleaseAsset {
  materializationId: MaterializationId;
  repositoryId: Id;
  materialization: {
    kind: "release_archive";
    assetUrl: string;
    assetSha256: Sha256;
    assetBytes: number;
    archiveFormat: "zip";
    rootPrefix: string;
    extractionPolicy: "safe-zip-v1";
  };
  rights: Rights;
}
export interface Rights {
  status: "reviewed" | "absent" | "ambiguous";
  spdx?: string;
  scope: "code" | "dataset" | "code_and_dataset" | "generated_outputs";
  analysisUse: "approved" | "denied" | "unresolved";
  redistribution: "approved" | "denied" | "unresolved" | "not_needed";
  thirdPartyChain: "complete" | "incomplete" | "not_applicable";
  evidenceIds: Id[];
}
export interface Container {
  normalizedPath: string;
  bytes: number;
  sha256: Sha256;
}
