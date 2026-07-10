// AUTO-GENERATED from calibration-corpus-manifest.schema.json. Do not hand-edit.

export type Identifier = string;
export type HttpsUri = string;
export type File = {
  [k: string]: unknown;
} & {
  [k: string]: unknown;
} & {
  [k: string]: unknown;
} & {
  [k: string]: unknown;
} & {
  [k: string]: unknown;
} & {
  [k: string]: unknown;
} & {
  /**
   * Canonical value: <repositoryId>@<immutable commitSha>:<normalizedPath>. The semantic verifier checks this cross-record derivation.
   */
  sourceId: string;
  repositoryId: Identifier;
  familyId: Identifier;
  normalizedPath: string;
  contentSha256: Sha256;
  language: string;
  stratum: "production" | "test" | "generated" | "vendor" | "minified" | "example" | "other";
  clusterId: Identifier;
  /**
   * Optional reviewed human/AI benchmark pair identifier. The semantic verifier requires all non-excluded records in one pair group to use the same split.
   */
  pairGroupId?: string;
  label: "verified_ai" | "verified_human" | "mixed" | "quarantine";
  tier: "gold" | "silver" | "quarantine";
  split: "train" | "validation" | "test" | "mixed_evaluation" | "excluded";
  /**
   * Required only when split is excluded. Retains a countable, auditable explanation without making the record an eligible data cohort.
   */
  exclusionReason?: string;
  evidence: Evidence;
} & {
  /**
   * Canonical value: <repositoryId>@<immutable commitSha>:<normalizedPath>. The semantic verifier checks this cross-record derivation.
   */
  sourceId: string;
  repositoryId: Identifier;
  familyId: Identifier;
  normalizedPath: string;
  contentSha256: Sha256;
  language: string;
  stratum: "production" | "test" | "generated" | "vendor" | "minified" | "example" | "other";
  clusterId: Identifier;
  /**
   * Optional reviewed human/AI benchmark pair identifier. The semantic verifier requires all non-excluded records in one pair group to use the same split.
   */
  pairGroupId?: string;
  label: "verified_ai" | "verified_human" | "mixed" | "quarantine";
  tier: "gold" | "silver" | "quarantine";
  split: "train" | "validation" | "test" | "mixed_evaluation" | "excluded";
  /**
   * Required only when split is excluded. Retains a countable, auditable explanation without making the record an eligible data cohort.
   */
  exclusionReason?: string;
  evidence: Evidence;
};
export type Sha256 = string;
export type Evidence =
  | {
      kind: "generator_record";
      reference: HttpsUri;
      model: string;
      promptTaskId: string;
      generatedAt: string;
      humanEditStatus: "none" | "light" | "substantial" | "unknown";
    }
  | {
      kind: "benchmark";
      reference: HttpsUri;
      benchmarkId: string;
      benchmarkVersion: string;
    }
  | {
      kind: "manual_protocol";
      reference: HttpsUri;
      protocolId: string;
    };

/**
 * Immutable, provenance-backed corpus manifest for the SlopBrick v10.3 calibration protocol. Every consumer MUST validate this JSON Schema and then run the versioned @usebrick/core semantic verifier, which checks cross-record identity and leakage invariants JSON Schema cannot express. It records only reviewed corpus metadata; it does not assert that a corpus is valid for release until selection, execution, coverage, and review gates also pass.
 */
export interface SlopbrickCalibrationCorpusManifestV103 {
  /**
   * Manifest contract version, separate from the Repository Structure schema version.
   */
  version: "v10.3";
  generatedAt: string;
  methodVersion: string;
  leakageReview: {
    protocolVersion: string;
    reviewedAt: string;
    /**
     * @minItems 1
     */
    reviewerIds: [string, ...string[]];
    noCrossPolarityFamilyOrCluster: true;
  };
  /**
   * @minItems 1
   */
  repositories: [Repository, ...Repository[]];
  /**
   * @minItems 1
   */
  files: [File, ...File[]];
}
export interface Repository {
  repositoryId: Identifier;
  familyId: Identifier;
  originUrl: HttpsUri;
  /**
   * Immutable Git object id; branches, tags, and symbolic refs are forbidden.
   */
  commitSha: string;
  acquiredAt: string;
  license: string;
}
