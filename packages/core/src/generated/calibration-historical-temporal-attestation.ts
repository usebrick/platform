// AUTO-GENERATED from calibration-historical-temporal-attestation.schema.json. Do not hand-edit.

export type Sha256 = string;
export type Id = string;
export type GitSha = string;
export type RelativePath = string;

/**
 * Git-history and independently observed exact-byte evidence for a historical human-provenance route.
 */
export interface CalibrationHistoricalTemporalAttestationV1 {
  version: "v10.3-historical-temporal-attestation-v1";
  attestationId: Sha256;
  repositoryId: Id;
  immutableCommitSha: GitSha;
  normalizedPath: RelativePath;
  blobSha: GitSha;
  completeCommitGraphSha256: Sha256;
  shallowRepository: false;
  graftsOrReplaceRefsPresent: false;
  introducedCommitSha: GitSha;
  lastChangedCommitSha: GitSha;
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
    exactBlobOrContentSha256: Sha256;
    /**
     * @minItems 1
     */
    evidenceIds: [Id, ...Id[]];
    /**
     * @minItems 1
     */
    evidenceReceiptIds: [Sha256, ...Sha256[]];
  };
  toolReceiptSha256: Sha256;
}
