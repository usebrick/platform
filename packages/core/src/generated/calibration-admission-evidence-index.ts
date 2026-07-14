// AUTO-GENERATED from calibration-admission-evidence-index.schema.json. Do not hand-edit.

export type Id = string;
export type Locator =
  | {
      kind: "immutable_https";
      url: string;
      immutability: "commit_pinned_git_blob" | "content_addressed_release_asset";
    }
  | {
      kind: "materialized_file";
      materializationId: Id;
      normalizedPath: RelativePath;
    }
  | {
      kind: "local_unpublished";
      localEvidenceId: Id;
    };
export type RelativePath = string;
export type Sha256 = string;

export interface CalibrationAdmissionEvidenceIndexV1 {
  version: "v10.3-admission-evidence-index-v1";
  items: Item[];
  indexSha256: Sha256;
}
export interface Item {
  evidenceId: Id;
  kind:
    | "source_origin"
    | "license_terms"
    | "rights_chain"
    | "authorship_attestation"
    | "generation_record"
    | "provider_versioning_contract"
    | "review_protocol";
  locator: Locator;
  bytes: number;
  mediaType: string;
  sha256: Sha256;
  /**
   * @minItems 1
   */
  claimScopes: [string, ...string[]];
}
