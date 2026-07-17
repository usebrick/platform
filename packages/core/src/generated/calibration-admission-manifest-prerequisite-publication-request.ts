// AUTO-GENERATED from calibration-admission-manifest-prerequisite-publication-request.schema.json. Do not hand-edit.

export type Id = string;
export type ExpectedCurrentState =
  | {
      kind: "absent";
    }
  | {
      kind: "existing";
      bundleSha256: Sha256;
      currentSha256: Sha256;
    };
export type Sha256 = string;
export type SourceArtifact = {
  artifactId: Id;
  relativePath: Path;
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
  owner: string;
  mediaType: "text/markdown" | "application/json" | "application/gzip" | "application/javascript";
  schemaId: null | string;
  packageTarballArtifactId?: Id;
  packageMemberRelativePath?: Path;
  source: Source;
} & SourceArtifact1 & {
    artifactId: Id;
    relativePath: Path;
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
    owner: string;
    mediaType: "text/markdown" | "application/json" | "application/gzip" | "application/javascript";
    schemaId: null | string;
    packageTarballArtifactId?: Id;
    packageMemberRelativePath?: Path;
    source: Source;
  } & SourceArtifact1;
export type Path = string;
export type Source =
  | {
      sourceRoot: "platform_commit";
      normalizedRelativePath: Path;
      approvedCommitSha: CommitSha;
    }
  | {
      sourceRoot: "prerequisite_staging";
      normalizedRelativePath: Path;
      stagingSetSha256: Sha256;
    };
export type CommitSha = string;
export type SourceArtifact1 =
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
      packageMemberRelativePath: Path;
    };
export type Artifact = {
  artifactId: string;
  relativePath: string;
  bytes: number;
  sha256: string;
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
  packageTarballArtifactId?: string;
  packageMemberRelativePath?: string;
} & (
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
      packageTarballArtifactId: string;
      packageMemberRelativePath: string;
    }
) & {
    artifactId: string;
    relativePath: string;
    bytes: number;
    sha256: string;
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
    packageTarballArtifactId?: string;
    packageMemberRelativePath?: string;
  } & (
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
        packageTarballArtifactId: string;
        packageMemberRelativePath: string;
      }
  );

/**
 * No-clobber request to publish one prerequisite bundle and its source artifacts.
 */
export interface CalibrationAdmissionManifestPrerequisitePublicationRequestV1 {
  version: "v10.3-admission-manifest-prerequisite-publication-request-v1";
  requestId: Id;
  operation: "create" | "replace";
  expectedCurrentState: ExpectedCurrentState;
  /**
   * @minItems 1
   */
  sourceArtifacts: [SourceArtifact, ...SourceArtifact[]];
  stagingSet: CalibrationAdmissionManifestPrerequisiteStagingSetV1;
  bundle: CalibrationAdmissionManifestPrerequisiteBundleV1;
  requestSha256: Sha256;
}
/**
 * Hash-bound staging projection for prerequisite artifacts.
 */
export interface CalibrationAdmissionManifestPrerequisiteStagingSetV1 {
  version: "v10.3-admission-manifest-prerequisite-staging-set-v1";
  /**
   * @minItems 1
   */
  entries: [Entry, ...Entry[]];
  stagingSetSha256: string;
}
export interface Entry {
  artifactId: string;
  kind:
    | "release_plan"
    | "release_plan_approval"
    | "score_wire_closure_receipt"
    | "run_init_receipt"
    | "post_scan_receipt"
    | "packed_runtime_receipt"
    | "package_tarball"
    | "manifest_builder";
  mediaType: "text/markdown" | "application/json" | "application/gzip" | "application/javascript";
  normalizedRelativePath: string;
  bytes: number;
  sha256: string;
}
/**
 * Content-addressed prerequisite bundle for a witness-bound v10.3 admission manifest.
 */
export interface CalibrationAdmissionManifestPrerequisiteBundleV1 {
  version: "v10.3-admission-manifest-prerequisites-v1";
  bundleId: string;
  implementationCommitSha: string;
  manifestBuilder: {
    behaviorSha256: string;
    artifactId: string;
  };
  releaseMaterializationTasks1To6: {
    approvedCommitSha: string;
    planArtifactId: string;
    approvalReceiptArtifactId: string;
  };
  scoreWireClosure: {
    approvedCommitSha: string;
    closureReceiptArtifactId: string;
  };
  runLifecycleVerification: {
    approvedCommitSha: string;
    runInitReceiptArtifactId: string;
    postScanReceiptArtifactId: string;
  };
  /**
   * @minItems 2
   * @maxItems 2
   */
  packedRuntimes: never[];
  /**
   * @minItems 1
   */
  referencedArtifacts: [Artifact, ...Artifact[]];
  referencedArtifactSetSha256: string;
  bundleSha256: string;
}
