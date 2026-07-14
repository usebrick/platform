import type { AdmissionWitnessPolicyV1 } from './calibration-admission-witness-policy';
// AUTO-GENERATED from calibration-admission-pre-witness-bundle.schema.json. Do not hand-edit.

export type Sha256 = string;

/**
 * Hash-bound rich pre-witness admission inputs. Witness search and review authority is persisted separately and never embedded here.
 */
export interface CalibrationAdmissionPreWitnessBundleV1 {
  version: "v10.3-admission-pre-witness-bundle-v1";
  policy: CalibrationAdmissionPolicyV1;
  /**
   * @minItems 2
   * @maxItems 2
   */
  witnessPolicies: [AdmissionWitnessPolicyV1, AdmissionWitnessPolicyV1];
  /**
   * @maxItems 12
   */
  toolProfiles: CalibrationAdmissionToolProfileV1[];
  /**
   * @maxItems 452382
   */
  invocationIntents: CalibrationAdmissionInvocationIntentV1[];
  /**
   * @maxItems 452382
   */
  toolReceipts: CalibrationAdmissionToolReceiptV1[];
  toolAuthoritySnapshot: CalibrationAdmissionToolAuthoritySnapshotV1;
  sourceRegister: CalibrationAdmissionSourceRegisterV1;
  /**
   * @maxItems 452382
   */
  registerDeltas: CalibrationAdmissionRegisterDeltaV1[];
  /**
   * @maxItems 452382
   */
  registerGenerationReceipts: CalibrationRegisterGenerationReceiptV1[];
  /**
   * @maxItems 452382
   */
  sourceReviews: CalibrationSourceReviewV103[];
  /**
   * @maxItems 452382
   */
  reviewSamples: CalibrationAdmissionReviewSampleV1[];
  /**
   * @maxItems 452382
   */
  decisionLedgers: CalibrationAdmissionDecisionLedgerV1[];
  admissionRecordStream: CalibrationAdmissionRecordStreamV1;
  /**
   * @maxItems 452382
   */
  preWitnessDecisions: CalibrationAdmissionDecisionV103[];
  /**
   * @maxItems 452382
   */
  preWitnessBlindAssignments: CalibrationAdmissionBlindAssignmentV1[];
  /**
   * @maxItems 452382
   */
  preWitnessBlindReviewReceipts: CalibrationAdmissionBlindReviewReceiptV1[];
  /**
   * @maxItems 452382
   */
  temporalAttestations: CalibrationHistoricalTemporalAttestationV1[];
  evidenceIndex: CalibrationAdmissionEvidenceIndexV1;
  evidencePayloadSet: CalibrationAdmissionEvidencePayloadSetV1;
  /**
   * @maxItems 452382
   */
  approvedEvidenceAcquisitions: CalibrationApprovedEvidenceAcquisitionV1[];
  /**
   * @maxItems 452382
   */
  evidenceAcquisitionReceipts: CalibrationEvidenceAcquisitionReceiptV1[];
  /**
   * @maxItems 452382
   */
  evidenceAcquisitionEnvelopes: CalibrationEvidenceAcquisitionEnvelopeV1[];
  acquisitionAuthoritySnapshot: CalibrationAdmissionAcquisitionSnapshotV1;
  /**
   * @maxItems 452382
   */
  evidenceReceipts: CalibrationAdmissionEvidenceReceiptV1[];
  /**
   * @maxItems 452382
   */
  approvedSourceAcquisitions: CalibrationApprovedAcquisitionV1[];
  /**
   * @maxItems 452382
   */
  approvedSourceAcquisitionRounds: CalibrationAcquisitionRoundAuthorizationV1[];
  /**
   * @maxItems 452382
   */
  sourceAcquisitionReceipts: CalibrationAcquisitionReceiptV1[];
  /**
   * @maxItems 452382
   */
  sourceAcquisitionRoundReceipts: CalibrationAcquisitionRoundReceiptV1[];
  /**
   * @maxItems 452382
   */
  materializationReceipts: CalibrationAdmissionMaterializationReceiptV1[];
  normalizerRegistry: AdmissionNormalizerRegistryV1;
  overlapPolicy: AdmissionOverlapPolicyV1;
  overlapUniverse: AdmissionOverlapUniverseV1;
  overlapIndexReceipt: AdmissionOverlapIndexReceiptV1;
  overlapResourceReceipt: AdmissionOverlapResourceReceiptV1;
  overlapLedger: AdmissionOverlapLedgerV1;
  privacyLedger: AdmissionPrivacyLedgerV1;
  qualityLedger: AdmissionQualityLedgerV1;
  lineageLedger: AdmissionLineageLedgerV1;
  preWitnessBundleSha256: Sha256;
}
/**
 * Durable, immutable v10.3 admission policy. Runtime validation additionally binds the policy self-hash and the exact frozen tool-profile set.
 */
export interface CalibrationAdmissionPolicyV1 {
  version: "v10.3-admission-policy-v1";
  policyId: "v10.3-admission-v1";
  initialRegisterEntryCount: 329;
  selectedCoverage: 452382;
  baselineMaterialUnits: 58089;
  repositoryMaterialUnits: 394293;
  labels: {
    positive: "verified_ai";
    negative: "verified_human";
  };
  evidenceCasPolicy: "sha256-wx-fsync-v1";
  overlapPolicy: "prefix-filter-exact-jaccard-0.80-v1";
  reasonVocabularySha256: string;
  /**
   * @minItems 1
   */
  toolProfileSha256s: [string, ...string[]];
  smoke: Smoke;
  canary: Canary;
  policySha256: string;
}
export interface Smoke {
  unitsPerPolarity: 100;
  maxSourceOrFamilyUnitsPerPolarity: 50;
  minimumSourcesPerPolarity: 2;
  minimumFamiliesPerPolarity: 3;
  minimumLanguages: 2;
  minimumUnitsPerRepresentedLanguagePerPolarity: 20;
}
export interface Canary {
  unitsPerPolarity: 5000;
  maxSourceUnitsPerPolarity: 500;
  maxFamilyUnitsPerPolarity: 1000;
  minimumSourcesPerPolarity: 10;
  minimumFamiliesPerPolarity: 5;
  minimumLanguages: 3;
  minimumUnitsPerLanguagePerPolarity: 250;
  minimumFamiliesPerLanguagePerPolarity: 3;
  minimumAiGeneratorFamilies: 3;
}
/**
 * Frozen task-scoped authority profile. Runtime validation owns the exact twelve IDs and action/network ownership table.
 */
export interface CalibrationAdmissionToolProfileV1 {
  version: "v10.3-admission-tool-profile-v1";
  profileId:
    | "admission-core-contract-v1"
    | "admission-context-v1"
    | "admission-static-ledgers-v1"
    | "admission-census-v1"
    | "admission-manifest-v1"
    | "admission-acquisition-publication-v1"
    | "admission-source-node-v1"
    | "admission-source-parquet-v1"
    | "admission-acquisition-round-v1"
    | "admission-git-acquire-v1"
    | "admission-release-acquire-v1"
    | "admission-evidence-acquire-v1";
  /**
   * @minItems 1
   */
  allowedExecutableIds: [string, ...string[]];
  /**
   * @minItems 1
   */
  allowedActions: [string, ...string[]];
  candidateByteAccess: "none" | "read_only";
  network:
    | {
        mode: "deny";
      }
    | {
        mode: "exact_authorized_https";
        transport: "git" | "release_asset" | "evidence";
      };
  resourceLimits: {
    [k: string]: number | string;
  };
  profileSha256: string;
}
/**
 * Pre-execution, immutable authority intent. Runtime validation binds profile/action ownership and the self-derived intent ID/hash.
 */
export interface CalibrationAdmissionInvocationIntentV1 {
  version: "v10.3-admission-invocation-intent-v1";
  intentId: string;
  profileId:
    | "admission-core-contract-v1"
    | "admission-context-v1"
    | "admission-static-ledgers-v1"
    | "admission-census-v1"
    | "admission-manifest-v1"
    | "admission-acquisition-publication-v1"
    | "admission-source-node-v1"
    | "admission-source-parquet-v1"
    | "admission-acquisition-round-v1"
    | "admission-git-acquire-v1"
    | "admission-release-acquire-v1"
    | "admission-evidence-acquire-v1";
  profileSha256: string;
  action: string;
  canonicalArgvSha256: string;
  inputSetSha256: string;
  executableBehaviorSha256: string;
  networkAuthorizationSha256?: string;
  intentSha256: string;
}
/**
 * Post-execution receipt binding the pre-execution intent, profile, observed resource usage, exit status, and primary output hash.
 */
export interface CalibrationAdmissionToolReceiptV1 {
  version: "v10.3-admission-tool-receipt-v1";
  receiptId: string;
  invocationIntentId: string;
  profileId:
    | "admission-core-contract-v1"
    | "admission-context-v1"
    | "admission-static-ledgers-v1"
    | "admission-census-v1"
    | "admission-manifest-v1"
    | "admission-acquisition-publication-v1"
    | "admission-source-node-v1"
    | "admission-source-parquet-v1"
    | "admission-acquisition-round-v1"
    | "admission-git-acquire-v1"
    | "admission-release-acquire-v1"
    | "admission-evidence-acquire-v1";
  profileSha256: string;
  action: string;
  canonicalArgvSha256: string;
  inputSetSha256: string;
  executableBehaviorSha256: string;
  networkAuthorizationSha256?: string;
  observedResourceUsage: {
    [k: string]: number;
  };
  exitCode: number;
  outputSetSha256: string;
}
/**
 * Content-addressed projection of one immutable tool-authority index generation.
 */
export interface CalibrationAdmissionToolAuthoritySnapshotV1 {
  version: "v10.3-admission-tool-authority-snapshot-v1";
  indexGenerationSha256: string;
  profileIds: (
    | "admission-core-contract-v1"
    | "admission-context-v1"
    | "admission-static-ledgers-v1"
    | "admission-census-v1"
    | "admission-manifest-v1"
    | "admission-acquisition-publication-v1"
    | "admission-source-node-v1"
    | "admission-source-parquet-v1"
    | "admission-acquisition-round-v1"
    | "admission-git-acquire-v1"
    | "admission-release-acquire-v1"
    | "admission-evidence-acquire-v1"
  )[];
  invocationIntentIds: string[];
  receiptIds: string[];
  snapshotSha256: string;
}
/**
 * Hash-bound v10.3 source register. Aggregate rows describe coverage; material rows own candidate bytes exactly once.
 */
export interface CalibrationAdmissionSourceRegisterV1 {
  version: "v10.3-admission-source-register-v1";
  generation: number;
  initialSourceIdsSha256: string;
  parentRegisterSha256?: string;
  appliedDeltaIds: string[];
  rawDiscoveryPopulation: {
    declaredAi: 635830;
    declaredHuman: 842520;
    closedWorld: false;
  };
  selectedCoverage: {
    total: 452382;
    baselineMaterialUnits: 58089;
    repositoryMaterialUnits: 394293;
  };
  entries: Entry[];
  registerSha256: string;
}
export interface Entry {
  sourceId: string;
  kind: "aggregate_inventory" | "material_source";
  materialPartition: "aggregate" | "baseline" | "repository" | "non_selected";
  contributesToAdditiveCounts: boolean;
  childMaterialSourceIds: string[];
  registerEvidenceIds: string[];
  inventoryCandidateUnits: number;
  acquisitionProvenance?: {
    roundId: string;
    sourceAuthorizationId: string;
    sourceAcquisitionReceiptId: string;
    materializationReceiptId: string;
  };
}
/**
 * Hash-bound one- or two-source addition to a v10.3 admission register.
 */
export interface CalibrationAdmissionRegisterDeltaV1 {
  version: "v10.3-admission-register-delta-v1";
  deltaId: string;
  generation: number;
  parentRegisterSha256: string;
  acquisitionRoundId: string;
  acquisitionRoundReceiptSha256: string;
  /**
   * @minItems 1
   * @maxItems 2
   */
  addedSources: [AddedSource] | [AddedSource, AddedSource];
  deltaSha256: string;
}
export interface AddedSource {
  sourceId: string;
  sourceGenerationSha256: string;
  registerEntrySha256: string;
  sourceReviewSha256: string;
  sourceAcquisitionAuthorizationId: string;
  sourceAcquisitionReceiptId: string;
  sourceAcquisitionReceiptSha256: string;
  materializationReceiptId: string;
  materializationReceiptSha256: string;
}
/**
 * Post-publication receipt binding a register generation to its delta, lock, transaction, and tool receipt.
 */
export interface CalibrationRegisterGenerationReceiptV1 {
  version: "v10.3-register-generation-receipt-v1";
  receiptId: string;
  generation: number;
  deltaId: string;
  /**
   * @minItems 1
   * @maxItems 2
   */
  sourceGenerationSha256s: [string] | [string, string];
  parentRegisterSha256: string;
  nextRegisterSha256: string;
  lockSha256: string;
  transactionId: string;
  toolReceiptSha256: string;
  receiptSha256: string;
}
/**
 * One source review bound to one immutable register entry. A source_quarantine review may truthfully have no reviewer decisions.
 */
export interface CalibrationSourceReviewV103 {
  version: "v10.3-source-review-v1";
  sourceId: string;
  sourceKind: "aggregate_inventory" | "material_source";
  contributesToAdditiveCounts: boolean;
  sourceRegisterEntrySha256: string;
  originEvidenceId: string;
  origin:
    | {
        kind: "https";
        url: string;
      }
    | {
        kind: "local_unpublished";
        localSourceId: string;
      };
  materialization:
    | {
        kind: "aggregate_only";
        childMaterialSourceIds: string[];
      }
    | {
        kind: "git";
        materializationId: string;
        repositoryId: string;
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
        materializationId: string;
        /**
         * @minItems 1
         */
        containers: [Container, ...Container[]];
        projectionPolicy: string;
      }
    | {
        kind: "unpublished_bundle";
        bundleId: string;
        bundleInventorySha256: string;
      };
  sourceRights: Rights;
  inventory: {
    physicalMemberCount: number;
    candidateCodeUnitCount: number;
    inventorySha256: string;
    closedWorld: boolean;
  };
  reviewerDecisionIds: string[];
  reviewedAt: string;
  decision: "candidate" | "source_quarantine";
  reasons: (
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
export interface ReleaseAsset {
  materializationId: string;
  repositoryId: string;
  materialization: {
    kind: "release_archive";
    assetUrl: string;
    assetSha256: string;
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
  evidenceIds: string[];
}
export interface Container {
  normalizedPath: string;
  bytes: number;
  sha256: string;
}
/**
 * Deterministic, hash-bound blind-review sample selection.
 */
export interface CalibrationAdmissionReviewSampleV1 {
  version: "v10.3-admission-review-sample-v1";
  sampleId: string;
  sourceId: string;
  seed: "slopbrick-v10.3-admission-review-v1";
  populationSha256: string;
  populationCount: number;
  strata: Stratum[];
  selected: Selected[];
  selectionSha256: string;
  presentationOrderSha256: string;
  toolReceiptSha256: string;
}
export interface Stratum {
  stratumId: string;
  populationCount: number;
  requestedCount: number;
}
export interface Selected {
  logicalUnitId: string;
  stratumId: string;
  selectionKey: string;
  presentationKey: string;
}
/**
 * Hash receipt joining admission decisions, blind assignments, post-decision receipts, and optional dedicated adjudication ledgers.
 */
export interface CalibrationAdmissionDecisionLedgerV1 {
  version: "v10.3-admission-decision-ledger-v1";
  ledgerId: string;
  sourceId: string;
  sourceReviewSha256: string;
  admissionRecordSetSha256: string;
  reviewSampleId?: string;
  decisionJsonlSha256: string;
  decisionIds: string[];
  blindAssignmentJsonlSha256: string;
  blindAssignmentIds: string[];
  blindReviewReceiptJsonlSha256: string;
  blindReviewReceiptIds: string[];
  adjudicatorAssignmentJsonlSha256?: string;
  adjudicatorAssignmentIds?: string[];
  adjudicatorReceiptJsonlSha256?: string;
  adjudicatorReceiptIds?: string[];
  adjudicationDecisionIds: string[];
  ledgerSha256: string;
}
/**
 * Hash receipt for the canonical admission-record JSONL stream.
 */
export interface CalibrationAdmissionRecordStreamV1 {
  version: "v10.3-admission-record-stream-v1";
  relativePath: "review/admission/admission-records.jsonl";
  recordsJsonlSha256: string;
  recordCount: number;
  recordIdSetSha256: string;
  canonicalRecordHashesSha256: string;
  streamSha256: string;
}
/**
 * One independently authored, blind-assignment-bound admission decision.
 */
export interface CalibrationAdmissionDecisionV103 {
  version: "v10.3-admission-decision-v1";
  decisionId: string;
  target:
    | {
        kind: "source";
        sourceId: string;
      }
    | {
        kind: "record";
        recordId: string;
      }
    | {
        kind: "provider_revision_exception";
        recordId: string;
        providerVersioningEvidenceId: string;
      }
    | {
        kind: "witness";
        witnessSha256: string;
        eligibilitySnapshotSha256: string;
        verifiedContextSha256: string;
      }
    | {
        kind: "temporal_attestation";
        temporalAttestationId: string;
        exactBlobOrContentSha256: string;
      };
  reviewerId: string;
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
  evidenceIds: [string, ...string[]];
  blindAssignmentId: string;
  /**
   * @minItems 2
   * @maxItems 2
   */
  adjudicatesDecisionIds?: [unknown, unknown];
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
  reasons: (
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
  decidedAt: string;
}
/**
 * A pre-decision, two-reviewer assignment. It deliberately contains no decision or receipt identifiers.
 */
export interface CalibrationAdmissionBlindAssignmentV1 {
  version: "v10.3-admission-blind-assignment-v1";
  assignmentId: string;
  target:
    | {
        kind: "source";
        sourceId: string;
      }
    | {
        kind: "record";
        recordId: string;
      }
    | {
        kind: "temporal_attestation";
        temporalAttestationId: string;
        exactBlobOrContentSha256: string;
      }
    | {
        kind: "provider_revision_exception";
        recordId: string;
        providerVersioningEvidenceId: string;
      }
    | {
        kind: "witness";
        witnessSha256: string;
        eligibilitySnapshotSha256: string;
        verifiedContextSha256: string;
      };
  evidenceSetSha256: string;
  protocolEvidenceId: string;
  /**
   * @minItems 2
   * @maxItems 2
   */
  reviewerIds: [unknown, unknown];
  peerMaterialHiddenUntilBothSealed: true;
}
/**
 * Post-decision receipt proving that two assigned reviewers sealed independently while peer material was hidden.
 */
export interface CalibrationAdmissionBlindReviewReceiptV1 {
  version: "v10.3-admission-blind-review-receipt-v1";
  receiptId: string;
  assignmentId: string;
  evidenceSetSha256: string;
  /**
   * @minItems 2
   * @maxItems 2
   */
  sealedDecisions: [unknown, unknown];
  unsealedOnlyAfterBothDecisionIdsExisted: true;
  protocolAuditorId: string;
  protocolAuditEvidenceIds: string[];
}
/**
 * Git-history and independently observed exact-byte evidence for a historical human-provenance route.
 */
export interface CalibrationHistoricalTemporalAttestationV1 {
  version: "v10.3-historical-temporal-attestation-v1";
  attestationId: string;
  repositoryId: string;
  immutableCommitSha: string;
  normalizedPath: string;
  blobSha: string;
  completeCommitGraphSha256: string;
  shallowRepository: false;
  graftsOrReplaceRefsPresent: false;
  introducedCommitSha: string;
  lastChangedCommitSha: string;
  introducedAt: string;
  lastChangedAt: string;
  cutoff: "2020-01-01T00:00:00.000Z";
  bulkImportOrigin: "ruled_out" | "indeterminate";
  independentExternalObservation: {
    kind:
      | "timestamped_source_archive"
      | "package_registry_artifact"
      | "release_transparency_log"
      | "independent_content_archive";
    observedAt: string;
    exactBlobOrContentSha256: string;
    /**
     * @minItems 1
     */
    evidenceIds: [string, ...string[]];
    /**
     * @minItems 1
     */
    evidenceReceiptIds: [string, ...string[]];
  };
  toolReceiptSha256: string;
}
export interface CalibrationAdmissionEvidenceIndexV1 {
  version: "v10.3-admission-evidence-index-v1";
  items: Item[];
  indexSha256: string;
}
export interface Item {
  evidenceId: string;
  kind:
    | "source_origin"
    | "license_terms"
    | "rights_chain"
    | "authorship_attestation"
    | "generation_record"
    | "provider_versioning_contract"
    | "review_protocol";
  locator:
    | {
        kind: "immutable_https";
        url: string;
        immutability: "commit_pinned_git_blob" | "content_addressed_release_asset";
      }
    | {
        kind: "materialized_file";
        materializationId: string;
        normalizedPath: string;
      }
    | {
        kind: "local_unpublished";
        localEvidenceId: string;
      };
  bytes: number;
  mediaType: string;
  sha256: string;
  /**
   * @minItems 1
   */
  claimScopes: [string, ...string[]];
}
export interface CalibrationAdmissionEvidencePayloadSetV1 {
  version: "v10.3-admission-evidence-payload-set-v1";
  casPolicy: "sha256-wx-fsync-v1";
  payloads: Payload[];
  payloadSetSha256: string;
}
export interface Payload {
  version: "v10.3-admission-evidence-payload-v1";
  payloadId: string;
  evidenceId: string;
  bytes: number;
  sha256: string;
  mediaType: string;
  sourceLocatorSha256: string;
  storage:
    | {
        kind: "materialization_reference";
        materializationReceiptId: string;
        materializationId: string;
        normalizedPath: string;
      }
    | {
        kind: "evidence_cas";
        casAlgorithm: "sha256";
        casRelativePath: string;
        authorizationId: string;
      }
    | {
        kind: "local_unpublished_reference";
        localEvidenceId: string;
      };
}
export interface CalibrationApprovedEvidenceAcquisitionV1 {
  version: "v10.3-approved-evidence-acquisition-v1";
  authorizationId: string;
  approvedBy: string;
  approvedAt: string;
  evidenceId: string;
  url: string;
  approvedRedirectUrls: string[];
  expectedBytes: number;
  expectedSha256: string;
  expectedMediaType: string;
  maxTransferBytes: number;
  authorizationSha256: string;
}
export interface CalibrationEvidenceAcquisitionReceiptV1 {
  version: "v10.3-evidence-acquisition-receipt-v1";
  receiptId: string;
  authorizationId: string;
  authorizationSha256: string;
  evidenceId: string;
  observedBytes: number;
  observedSha256: string;
  observedMediaType: string;
  redirectChain: string[];
  resolvedPublicAddressesSha256: string;
  casTransactionId: string;
  primaryCompletionSha256: string;
  toolReceiptSha256: string;
  receiptSha256: string;
}
export interface CalibrationEvidenceAcquisitionEnvelopeV1 {
  version: "v10.3-evidence-acquisition-envelope-v1";
  envelopeId: string;
  authorizationId: string;
  reservation: Reservation;
  invocationIntentId: string;
  casTransactionId: string;
  primaryCompletionRelativePath: string;
  primaryCompletionSha256: string;
  acquisitionReceiptSha256: string;
  payloadId: string;
  toolReceiptSha256: string;
  envelopeSha256: string;
}
export interface Reservation {
  version: "v10.3-evidence-acquisition-reservation-v1";
  reservationId: string;
  authorizationId: string;
  invocationIntentId: string;
  recoveryNonce: string;
  reservationSha256: string;
}
/**
 * Content-addressed projection of an acquisition index generation.
 */
export interface CalibrationAdmissionAcquisitionSnapshotV1 {
  version: "v10.3-admission-acquisition-snapshot-v1";
  indexGenerationSha256: string;
  artifactKeys: string[];
  snapshotSha256: string;
}
export interface CalibrationAdmissionEvidenceReceiptV1 {
  version: "v10.3-admission-evidence-receipt-v1";
  receiptId: string;
  evidenceId: string;
  evidenceIndexSha256: string;
  payloadId: string;
  payloadSetSha256: string;
  verificationMethod:
    | "offline-materialization-file-v1"
    | "offline-evidence-cas-v1"
    | "offline-local-unpublished-reference-v1";
  observedBytes: number;
  observedSha256: string;
  toolReceiptSha256: string;
  status: "verified" | "mismatch" | "unavailable";
}
/**
 * Owner-approved immutable source acquisition authorization. It contains no filesystem path and permits only one exact transport identity.
 */
export interface CalibrationApprovedAcquisitionV1 {
  version: "v10.3-approved-acquisition-v1";
  authorizationId: string;
  approvedBy: string;
  approvedAt: string;
  sourceId: string;
  repositoryId: string;
  materializationId: string;
  originUrl: string;
  transport:
    | {
        kind: "git_https";
        commitSha: string;
        transportByteLimit: "not_enforceable_by_stock_git";
        ownerAcknowledgedUnboundedTransport: true;
      }
    | {
        kind: "release_https";
        materialization: ReleaseArchiveMaterialization;
        maxTransferBytes: number;
        approvedRedirectUrls: string[];
      };
  maxMaterializedBytes: number;
  licenseEvidenceId: string;
  licensePath: string;
  licenseSha256: string;
  authorizationSha256: string;
}
export interface ReleaseArchiveMaterialization {
  kind: "release_archive";
  assetUrl: string;
  assetSha256: string;
  assetBytes: number;
  archiveFormat: "zip";
  /**
   * Archive-relative directory prefix that becomes the verified materialization root. Release-archive file normalizedPath values are relative to this root.
   */
  rootPrefix: string;
  extractionPolicy: "safe-zip-v1";
}
/**
 * Owner-approved, deficit-bound authorization for one bounded one- or two-source acquisition round.
 */
export interface CalibrationAcquisitionRoundAuthorizationV1 {
  version: "v10.3-acquisition-round-authorization-v1";
  roundId: string;
  approvedBy: string;
  approvedAt: string;
  parentCensusSha256: string;
  measuredDeficitsSha256: string;
  /**
   * @minItems 1
   * @maxItems 2
   */
  sourceAuthorizationIds: [string] | [string, string];
  maxSources: 2;
  maxTotalMaterializedBytes: number;
  authorizationSha256: string;
}
/**
 * Observed immutable source-acquisition receipt bound to one approved source authorization and one round transaction.
 */
export interface CalibrationAcquisitionReceiptV1 {
  version: "v10.3-acquisition-receipt-v1";
  receiptId: string;
  authorizationId: string;
  roundId: string;
  authorizationSha256: string;
  sourceId: string;
  repositoryId: string;
  materializationId: string;
  originUrl: string;
  transport:
    | {
        kind: "git_https";
        commitSha: string;
        treeSha: string;
        observedPackBytes: number;
        observedNetworkBytes: "not_observable_exactly";
      }
    | {
        kind: "release_https";
        materialization: ReleaseArchiveMaterialization;
        extractionReceipt: ExtractionReceipt;
        observedTransferBytes: number;
        redirectChain: string[];
      };
  materializedBytes: number;
  inventorySha256: string;
  licenseSha256: string;
  materializationReceiptId: string;
  materializationReceiptSha256: string;
  networkObservation: NetworkObservation;
  resolvedPublicAddressesSha256: string;
  connectedPeerEvidenceSha256: string;
  transactionId: string;
  toolReceiptId: string;
  toolReceiptSha256: string;
  receiptSha256: string;
}
export interface ExtractionReceipt {
  receiptVersion: "v1";
  extractionPolicy: "safe-zip-v1";
  assetSha256: string;
  assetBytes: number;
  inventorySha256: string;
  entries: (
    | {
        path: string;
        kind: "directory";
      }
    | {
        path: string;
        kind: "file";
        bytes: number;
        sha256: string;
      }
  )[];
}
export interface NetworkObservation {
  requestUrl: string;
  redirectChain: string[];
  /**
   * @minItems 1
   */
  resolvedPublicAddresses: [string, ...string[]];
  connectedPeerAddress: string;
}
/**
 * Post-acquisition round receipt proving the exact one- or two-source set, orchestrator authority, and cumulative byte cap.
 */
export interface CalibrationAcquisitionRoundReceiptV1 {
  version: "v10.3-acquisition-round-receipt-v1";
  receiptId: string;
  roundId: string;
  parentCensusSha256: string;
  /**
   * @minItems 1
   * @maxItems 2
   */
  sourceReceiptSha256s: [string] | [string, string];
  /**
   * @minItems 1
   * @maxItems 2
   */
  sourceInvocationIntentIds: [string] | [string, string];
  /**
   * @minItems 1
   * @maxItems 2
   */
  sourceProfileSha256s: [string] | [string, string];
  /**
   * @minItems 1
   * @maxItems 2
   */
  sourceToolReceiptSha256s: [string] | [string, string];
  orchestratorInvocationIntentId: string;
  orchestratorToolReceiptId: string;
  orchestratorToolReceiptSha256: string;
  toolAuthoritySnapshot: CalibrationAdmissionToolAuthoritySnapshotV1;
  acquiredSourceCount: 1 | 2;
  totalMaterializedBytes: number;
  withinAuthorizedCountAndBytes: true;
  receiptSha256: string;
}
export interface CalibrationAdmissionMaterializationReceiptV1 {
  version: "v10.3-admission-materialization-receipt-v1";
  receiptId: string;
  materializationId: string;
  sourceId: string;
  repositoryId: string;
  acquisitionAuthorizationId: string;
  acquisitionAuthorizationSha256: string;
  acquisitionTransactionId: string;
  primaryMaterializedOutputSha256: string;
  childToolReceiptSha256: string;
  verifiedUnitSetSha256: string;
  payload:
    | {
        kind: "git";
        originUrl: string;
        commitSha: string;
        treeSha: string;
        inventorySha256: string;
      }
    | {
        kind: "release_archive";
        originUrl: string;
        assetSha256: string;
        assetBytes: number;
        inventorySha256: string;
      };
}
/**
 * Versioned language normalizer and shingle implementation registry for the v10.3 overlap authority.
 */
export interface AdmissionNormalizerRegistryV1 {
  version: "v10.3-admission-normalizers-v1";
  /**
   * @minItems 1
   */
  entries: [Entry1, ...Entry1[]];
  registrySha256: string;
}
export interface Entry1 {
  language: string;
  normalizerId: string;
  implementationSha256: string;
  fixturesSha256: string;
  utf8Policy: "strict";
  shingleSize: 5;
}
/**
 * Frozen resource and exact-similarity policy for the v10.3 global overlap authority.
 */
export interface AdmissionOverlapPolicyV1 {
  version: "v10.3-admission-overlap-policy-v1";
  method: "prefix-filter-exact-jaccard-0.80-v1";
  maxUnitBytes: 33554432;
  maxShardBytes: 67108864;
  maxOpenFiles: 64;
  maxHeapBytes: 4294967296;
  maxRssBytes: 6442450944;
  maxWorkBytes: 214748364800;
  maxWallMilliseconds: 86400000;
  policySha256: string;
}
/**
 * Hash-bound summary for the canonical v10.3 global overlap universe stream.
 */
export interface AdmissionOverlapUniverseV1 {
  version: "v10.3-admission-overlap-universe-v1";
  registerSha256: string;
  recordsJsonlSha256: string;
  selectedAggregateCoverage: number;
  baselineMaterialUnits: number;
  repositoryMaterialUnits: number;
  newCandidateUnits: number;
  covered: number;
  unsupported: number;
  unreadable: number;
  unresolvedCandidateUnitIds: string[];
  normalizerRegistrySha256: string;
  universeSha256: string;
}
/**
 * Hash-bound postings and candidate-pair index receipt.
 */
export interface AdmissionOverlapIndexReceiptV1 {
  version: "v10.3-overlap-index-receipt-v1";
  universeSha256: string;
  normalizerRegistrySha256: string;
  overlapPolicySha256: string;
  method: "prefix-filter-exact-jaccard-0.80-v1";
  /**
   * @maxItems 65536
   */
  postingShards: AdmissionBoundedShardReceiptV1[];
  /**
   * @maxItems 65536
   */
  candidatePairShards: AdmissionBoundedShardReceiptV1[];
  /**
   * @maxItems 65536
   */
  checkpoints: AdmissionOverlapCheckpointV1[];
  coveredCandidateUnits: number;
  complete: boolean;
  toolReceiptSha256: string;
  receiptSha256: string;
}
/**
 * Hash and ordered-range receipt for one generation-local overlap shard.
 */
export interface AdmissionBoundedShardReceiptV1 {
  shardId: string;
  pathBase: "generation_local";
  relativePath: string;
  firstKey: string;
  lastKey: string;
  rowCount: number;
  bytes: number;
  sha256: string;
}
/**
 * Hash-bound resumable overlap phase checkpoint.
 */
export interface AdmissionOverlapCheckpointV1 {
  version: "v10.3-admission-overlap-checkpoint-v1";
  checkpointId: string;
  universeSha256: string;
  normalizerRegistrySha256: string;
  overlapPolicySha256: string;
  invocationIntentId: string;
  phase: "postings" | "candidate_pairs" | "exact_edges" | "clusters";
  /**
   * @maxItems 65536
   */
  inputShardSha256s: string[];
  /**
   * @maxItems 65536
   */
  outputShardSha256s: string[];
  continuationCursorSha256: string;
  checkpointSha256: string;
}
/**
 * Observed resource and coverage receipt for the overlap authority.
 */
export interface AdmissionOverlapResourceReceiptV1 {
  version: "v10.3-overlap-resource-receipt-v1";
  receiptId: string;
  universeSha256: string;
  recordsJsonlSha256: string;
  overlapPolicySha256: string;
  realContentDistributionSha256: string;
  recordCount: number;
  tokenCount: number;
  shingleCount: number;
  configuredLimits: ConfiguredLimits;
  observed: Observed;
  coverageComplete: boolean;
  withinAllLimits: boolean;
  toolReceiptSha256: string;
}
export interface ConfiguredLimits {
  maxUnitBytes: 33554432;
  maxHeapBytes: 4294967296;
  maxRssBytes: 6442450944;
  maxWorkBytes: 214748364800;
  maxOpenFiles: 64;
  maxShardBytes: 67108864;
  maxWallMilliseconds: 86400000;
}
export interface Observed {
  maxUnitBytes: number;
  maxHeapBytes: number;
  maxRssBytes: number;
  maxWorkBytes: number;
  maxOpenFiles: number;
  maxShardBytes: number;
  wallMilliseconds: number;
}
/**
 * Hash-bound summary of the complete global overlap authority.
 */
export interface AdmissionOverlapLedgerV1 {
  version: "v10.3-admission-overlap-v1";
  universeSha256: string;
  method: "prefix-filter-exact-jaccard-0.80-v1";
  normalizerRegistrySha256: string;
  overlapPolicySha256: string;
  indexReceiptSha256: string;
  coverageComplete: boolean;
  /**
   * @maxItems 452382
   */
  unresolvedCandidateUnitIds: string[];
  /**
   * @maxItems 65536
   */
  edgeShards: AdmissionBoundedShardReceiptV1[];
  /**
   * @maxItems 65536
   */
  adjacencyShards: AdmissionBoundedShardReceiptV1[];
  /**
   * @maxItems 65536
   */
  clusterSummaryShards: AdmissionBoundedShardReceiptV1[];
  /**
   * @maxItems 65536
   */
  clusterMembershipShards: AdmissionBoundedShardReceiptV1[];
  edgeCount: number;
  adjacencyRowCount: number;
  exactClusterCount: number;
  nearClusterCount: number;
  crossSideEdgeCount: number;
  ledgerSha256: string;
}
/**
 * Hash-bound privacy authority ledger covering every admission record or explicitly unresolved record.
 */
export interface AdmissionPrivacyLedgerV1 {
  version: "v10.3-admission-privacy-ledger-v1";
  admissionRecordSetSha256: string;
  /**
   * @maxItems 452382
   */
  results: AdmissionPrivacyResultV1[];
  /**
   * @maxItems 452382
   */
  coveredRecordIds: string[];
  /**
   * @maxItems 452382
   */
  unresolvedRecordIds: string[];
  ledgerSha256: string;
}
/**
 * Hash-bound privacy and secret scan result for one admission record.
 */
export interface AdmissionPrivacyResultV1 {
  version: "v10.3-admission-privacy-result-v1";
  recordId: string;
  contentSha256: string;
  privacyStatus: "pass" | "review" | "fail";
  secretStatus: "pass" | "review" | "fail";
  /**
   * @maxItems 1024
   */
  findings: {
    kind: string;
    confidence: "high" | "low";
    findingFingerprintSha256: string;
  }[];
  /**
   * @maxItems 2
   */
  reviewerDecisionIds: [] | [string] | [string, string];
  toolReceiptSha256: string;
  resultSha256: string;
}
/**
 * Hash-bound syntax, scaffold, and triviality outcomes for every admission record or explicitly unresolved record.
 */
export interface AdmissionQualityLedgerV1 {
  version: "v10.3-admission-quality-ledger-v1";
  admissionRecordSetSha256: string;
  /**
   * @maxItems 452382
   */
  results: {
    version: "v10.3-admission-quality-result-v1";
    recordId: string;
    contentSha256: string;
    syntaxStatus: "pass" | "fail" | "unsupported";
    scaffoldStatus: "pass" | "fail";
    scaffoldByteShare: number;
    trivialStatus: "pass" | "fail";
    toolReceiptSha256: string;
    resultSha256: string;
  }[];
  /**
   * @maxItems 452382
   */
  coveredRecordIds: string[];
  /**
   * @maxItems 452382
   */
  unresolvedRecordIds: string[];
  ledgerSha256: string;
}
/**
 * Hash-bound family, pair, split, and overlap-cluster lineage for every admission record or explicitly unresolved record.
 */
export interface AdmissionLineageLedgerV1 {
  version: "v10.3-admission-lineage-ledger-v1";
  admissionRecordSetSha256: string;
  /**
   * @maxItems 452382
   */
  results: {
    version: "v10.3-admission-lineage-result-v1";
    recordId: string;
    contentSha256: string;
    polarity: "ai_side" | "human_side" | "unassigned";
    familyId: string;
    pairGroupId: string | null;
    split: "train" | "validation" | "test" | "unassigned";
    exactClusterId: string;
    nearClusterId: string;
    toolReceiptSha256: string;
    lineageSha256: string;
  }[];
  /**
   * @maxItems 452382
   */
  coveredRecordIds: string[];
  /**
   * @maxItems 452382
   */
  unresolvedRecordIds: string[];
  ledgerSha256: string;
}
