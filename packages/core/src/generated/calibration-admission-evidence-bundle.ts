// AUTO-GENERATED from calibration-admission-evidence-bundle.schema.json. Do not hand-edit.

export type Sha256 = string;

export interface CalibrationAdmissionEvidenceBundleV1 {
  version: "v10.3-admission-evidence-bundle-v1";
  policy: CalibrationAdmissionPolicyV1;
  /**
   * @minItems 2
   * @maxItems 2
   */
  witnessPolicies: [AdmissionWitnessPolicyV1, AdmissionWitnessPolicyV1];
  toolProfiles: CalibrationAdmissionToolProfileV1[];
  invocationIntents: CalibrationAdmissionInvocationIntentV1[];
  toolReceipts: CalibrationAdmissionToolReceiptV1[];
  toolAuthoritySnapshot: CalibrationAdmissionToolAuthoritySnapshotV1;
  evidenceIndex: CalibrationAdmissionEvidenceIndexV1;
  evidencePayloadSet: CalibrationAdmissionEvidencePayloadSetV1;
  approvedEvidenceAcquisitions: CalibrationApprovedEvidenceAcquisitionV1[];
  evidenceAcquisitionReceipts: CalibrationEvidenceAcquisitionReceiptV1[];
  evidenceAcquisitionEnvelopes: CalibrationEvidenceAcquisitionEnvelopeV1[];
  acquisitionAuthoritySnapshot: CalibrationAdmissionAcquisitionSnapshotV1;
  evidenceReceipts: CalibrationAdmissionEvidenceReceiptV1[];
  materializationReceipts: CalibrationAdmissionMaterializationReceiptV1[];
  bundleSha256: Sha256;
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
 * Durable search constraints derived losslessly from the v10.3 admission policy. Runtime validation recomputes the expansion and both self-hashes.
 */
export interface AdmissionWitnessPolicyV1 {
  version: "v10.3-admission-witness-policy-v1";
  policyId: "v10.3-admission-v1";
  gate: "smoke" | "canary";
  algorithm: "lexicographic-bnb-feasibility-v1";
  seed: "slopbrick-v10.3-admission-review-v1";
  maxSearchNodes: 10000000 | 50000000;
  /**
   * @minItems 1
   */
  constraints: [Constraint, ...Constraint[]];
  constraintsSha256: string;
  witnessPolicySha256: string;
}
export interface Constraint {
  constraintId: string;
  kind: "exact" | "minimum" | "maximum" | "same_split";
  integerValue?: number;
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
