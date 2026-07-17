// AUTO-GENERATED from calibration-admission-manifest-prerequisites.schema.json. Do not hand-edit.

export type Id = string;
export type CommitSha = string;
export type Sha256 = string;
export type Artifact = {
  artifactId: Id;
  relativePath: RelativePath;
  bytes: number;
  sha256: Sha256;
  kind:
    | "release_plan"
    | "release_plan_approval"
    | "score_wire_closure_receipt"
    | "run_init_receipt"
    | "post_scan_receipt"
    | "packed_runtime_receipt"
    | "package_tarball"
    | "manifest_builder";
  owner:
    | "release_asset_plan"
    | "score_wire_gate"
    | "run_lifecycle_gate"
    | "packed_runtime_matrix"
    | "admission_manifest_builder";
  mediaType: "text/markdown" | "application/json" | "application/gzip" | "application/javascript";
  schemaId: null | string;
  packageTarballArtifactId?: Id;
  packageMemberRelativePath?: RelativePath;
} & Artifact1 & {
    artifactId: Id;
    relativePath: RelativePath;
    bytes: number;
    sha256: Sha256;
    kind:
      | "release_plan"
      | "release_plan_approval"
      | "score_wire_closure_receipt"
      | "run_init_receipt"
      | "post_scan_receipt"
      | "packed_runtime_receipt"
      | "package_tarball"
      | "manifest_builder";
    owner:
      | "release_asset_plan"
      | "score_wire_gate"
      | "run_lifecycle_gate"
      | "packed_runtime_matrix"
      | "admission_manifest_builder";
    mediaType: "text/markdown" | "application/json" | "application/gzip" | "application/javascript";
    schemaId: null | string;
    packageTarballArtifactId?: Id;
    packageMemberRelativePath?: RelativePath;
  } & Artifact1;
export type RelativePath = string;
export type Artifact1 =
  | {
      kind?: "release_plan";
      owner?: "release_asset_plan";
      mediaType?: "text/markdown";
      schemaId?: null;
    }
  | {
      kind?: "release_plan_approval";
      owner?: "release_asset_plan";
      mediaType?: "application/json";
      schemaId?: "https://usebrick.dev/schemas/v1/calibration-release-prerequisite-approval.schema.json";
    }
  | {
      kind?: "score_wire_closure_receipt";
      owner?: "score_wire_gate";
      mediaType?: "application/json";
      schemaId?: "https://usebrick.dev/schemas/v1/calibration-score-wire-closure-receipt.schema.json";
    }
  | {
      kind?: "run_init_receipt" | "post_scan_receipt";
      owner?: "run_lifecycle_gate";
      mediaType?: "application/json";
      schemaId?: "https://usebrick.dev/schemas/v1/calibration-run-lifecycle-receipt.schema.json";
    }
  | {
      kind?: "packed_runtime_receipt";
      owner?: "packed_runtime_matrix";
      mediaType?: "application/json";
      schemaId?: "https://usebrick.dev/schemas/v1/calibration-packed-runtime-receipt.schema.json";
    }
  | {
      kind?: "package_tarball";
      owner?: "packed_runtime_matrix";
      mediaType?: "application/gzip";
      schemaId?: null;
    }
  | {
      kind?: "manifest_builder";
      owner?: "admission_manifest_builder";
      mediaType?: "application/javascript";
      schemaId?: null;
      packageTarballArtifactId: Id;
      packageMemberRelativePath: RelativePath;
    };

/**
 * Content-addressed prerequisite bundle for a witness-bound v10.3 admission manifest.
 */
export interface CalibrationAdmissionManifestPrerequisiteBundleV1 {
  version: "v10.3-admission-manifest-prerequisites-v1";
  bundleId: Id;
  implementationCommitSha: CommitSha;
  manifestBuilder: {
    behaviorSha256: Sha256;
    artifactId: Id;
  };
  releaseMaterializationTasks1To6: {
    approvedCommitSha: CommitSha;
    planArtifactId: Id;
    approvalReceiptArtifactId: Id;
  };
  scoreWireClosure: {
    approvedCommitSha: CommitSha;
    closureReceiptArtifactId: Id;
  };
  runLifecycleVerification: {
    approvedCommitSha: CommitSha;
    runInitReceiptArtifactId: Id;
    postScanReceiptArtifactId: Id;
  };
  /**
   * @minItems 2
   * @maxItems 2
   */
  packedRuntimes: [{ nodeMajor: 22; tarballArtifactId: Id; receiptArtifactId: Id }, { nodeMajor: 24; tarballArtifactId: Id; receiptArtifactId: Id }];
  /**
   * @minItems 1
   */
  referencedArtifacts: [Artifact, ...Artifact[]];
  referencedArtifactSetSha256: Sha256;
  bundleSha256: Sha256;
}
