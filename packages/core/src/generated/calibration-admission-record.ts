// AUTO-GENERATED from calibration-admission-record.schema.json. Do not hand-edit.

export type Sha256 = string;
export type Id = string;
export type RelativePath = string;
/**
 * @minItems 1
 */
export type EvidenceIds = [Id, ...Id[]];
export type ModelRevision =
  | {
      status: "pinned";
      value: string;
    }
  | {
      status: "provider_not_exposed";
      hostedServiceProductId: string;
      provider: string;
      modelAlias: string;
      generationDate: string;
      providerVersioningEvidenceId: Id;
      /**
       * @minItems 2
       * @maxItems 2
       */
      acceptingReviewerDecisionIds: [Sha256, Sha256];
    };
export type HumanEditStatus = "none" | "light" | "substantial" | "unknown";

/**
 * One immutable code unit in the v10.3 admission record set.
 */
export interface CalibrationAdmissionRecordV103 {
  version: "v10.3-admission-record-v1";
  recordId: Sha256;
  materialSourceId: Id;
  aggregateSourceIds: Id[];
  sourceReviewSha256: Sha256;
  logicalUnitId: Id;
  locator:
    | {
        kind: "git_file";
        materializationId: Id;
        normalizedPath: RelativePath;
      }
    | {
        kind: "release_archive_file";
        materializationId: Id;
        normalizedPath: RelativePath;
      }
    | {
        kind: "record_container";
        materializationId: Id;
        containerSha256: Sha256;
        rowKey: string;
        field: string;
      };
  contentSha256: Sha256;
  contentBytes: number;
  language: string;
  stratum: "production" | "test" | "generated" | "vendor" | "minified" | "example" | "other";
  proposedLabel: "verified_ai" | "verified_human" | "mixed" | "quarantine";
  authorship:
    | GeneratorRecordAuthorship
    | BenchmarkAuthorship
    | RepositoryAuthorship
    | HistoricalAuthorship
    | UnprovenAuthorship;
  claimedLineage: ClaimedLineage;
  claimedAudits: ClaimedAudits;
  reviewerDecisionIds: Sha256[];
  declaredDisposition: "eligible_gold" | "eligible_sensitivity" | "mixed_evaluation" | "quarantine";
  rejectionReasons: (
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
    | "source_wide_quarantine"
  )[];
}
export interface GeneratorRecordAuthorship {
  kind: "generator_record";
  evidenceIds: EvidenceIds;
  generatorProvider: string;
  model: string;
  modelRevision: ModelRevision;
  generatorSource:
    | {
        kind: "source_commit";
        commitSha: Sha256;
      }
    | {
        kind: "hosted_service";
      };
  promptTaskId: string;
  promptSha256: Sha256;
  outputSha256: Sha256;
  generatedAt: string;
  humanEditStatus: HumanEditStatus;
}
export interface BenchmarkAuthorship {
  kind: "benchmark_attestation";
  evidenceIds: EvidenceIds;
  benchmarkId: string;
  benchmarkVersion: string;
  exactUnitBinding: string;
  attestedAuthorship: "ai_generated" | "human_written";
  generator?: GeneratorEvidence;
  humanEditStatus: "none" | "light" | "substantial" | "unknown" | "not_applicable";
}
export interface GeneratorEvidence {
  generatorProvider: string;
  model: string;
  modelRevision: ModelRevision;
  promptTaskId: string;
  promptSha256: Sha256;
  outputSha256: Sha256;
  generatedAt: string;
}
export interface RepositoryAuthorship {
  kind: "repository_attestation";
  evidenceIds: EvidenceIds;
  scope: "file" | "directory" | "repository";
  generatorFamily: string;
  humanEditStatus: HumanEditStatus;
}
export interface HistoricalAuthorship {
  kind: "historical_inference";
  evidenceIds: EvidenceIds;
  blobSha: Sha256;
  introducedAt: string;
  lastChangedAt: string;
  cutoff: "2020-01-01T00:00:00.000Z";
  temporalAttestationId?: Id;
}
export interface UnprovenAuthorship {
  kind: "unproven_claim";
  evidenceIds: EvidenceIds;
  declaredClaim: "ai" | "human" | "mixed" | "unknown";
  /**
   * @minItems 1
   */
  missingFields: [string, ...string[]];
}
export interface ClaimedLineage {
  familyId: Id;
  pairGroupId?: Id;
  originRecordId: Sha256;
  exactClusterId: Id;
  nearClusterId: Id;
}
export interface ClaimedAudits {
  syntax: "pass" | "fail" | "unsupported";
  scaffoldByteShare: number;
  privacy: "pass" | "review" | "fail";
  secrets: "pass" | "review" | "fail";
  exactOverlap: "pass" | "fail";
  nearOverlap: "pass" | "fail" | "unsupported";
  familyLeakage: "pass" | "fail";
  pairIntegrity: "pass" | "fail" | "not_applicable";
}
