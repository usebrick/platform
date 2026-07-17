// AUTO-GENERATED from calibration-admission-manifest-build-receipt.schema.json. Do not hand-edit.

export type Id = string;
export type ManifestId = "v10.3-admission-smoke" | "v10.3-admission-canary";
export type Sha256 = string;
export type Path = string;
/**
 * Transient parent-to-child publication handoff, including recursion-breaking tool-authority companions.
 */
export type CalibrationNestedPublicationHandoffV1 = {
  version: "v10.3-nested-publication-handoff-v1";
  parentTransactionId: string;
  childSlot: string;
  expectedCurrentStateSha256: string;
  childLockId: string;
  childLockSha256: string;
  childTransactionId: string;
  childTransactionIntentSha256: string;
  childRecoveryNonce: string;
  state:
    | {
        phase: "started_fsynced";
      }
    | {
        phase: "completed_fsynced";
        namedPrimaryOutputProjectionSha256: string;
        nextAuthoritySha256: string;
        childAuthoritySha256: string;
        childReceipt:
          | {
              kind: "none_infrastructure";
            }
          | {
              kind: "profiled";
              receiptId: string;
              receiptSha256: string;
            };
      };
  childKind: "tool_authority_infrastructure" | "profiled_publication";
  childAction: string;
  toolAuthorityObjectSetSha256?: string;
  childProfileId?:
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
  childInvocationIntentId?: string;
  childInvocationIntentRelativePath?: string;
  childInvocationIntentSha256?: string;
  childInvocationIntentAuthorityHandoffSha256?: string;
  childInvocationIntentAuthorityIndexSha256?: string;
  handoffSha256: string;
} & (
  | {
      childKind: "tool_authority_infrastructure";
      childAction: "tool-authority:publish";
      toolAuthorityObjectSetSha256: string;
      childProfileId?: unknown;
      childInvocationIntentId?: unknown;
      childInvocationIntentRelativePath?: unknown;
      childInvocationIntentSha256?: unknown;
      childInvocationIntentAuthorityHandoffSha256?: unknown;
      childInvocationIntentAuthorityIndexSha256?: unknown;
    }
  | {
      childKind: "profiled_publication";
      childAction: string;
      childProfileId:
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
      childInvocationIntentId: string;
      childInvocationIntentRelativePath: string;
      childInvocationIntentSha256: string;
      childInvocationIntentAuthorityHandoffSha256: string;
      childInvocationIntentAuthorityIndexSha256: string;
      toolAuthorityObjectSetSha256?: unknown;
    }
);
export type ExpectedCurrentState =
  | {
      kind: "absent";
    }
  | {
      kind: "existing";
      generationSha256: Sha256;
    };

/**
 * Build receipt binding one witness-bound admission manifest to its prerequisite and tool evidence.
 */
export interface CalibrationAdmissionManifestBuildReceiptV1 {
  version: "v10.3-admission-manifest-build-receipt-v1";
  receiptId: Id;
  manifestId: ManifestId;
  manifestSha256: Sha256;
  manifestRelativePath: "manifest.json";
  prerequisiteBundleSha256: Sha256;
  prerequisiteBundleRelativePath: Path;
  prerequisitePublicationCompletionSha256: Sha256;
  prerequisitePublicationCompletionRelativePath: Path;
  prerequisitePublicationRequestSha256: Sha256;
  prerequisitePublicationRequestRelativePath: Path;
  manifestBuilderBehaviorSha256: Sha256;
  packedRuntimeReceiptSetSha256: Sha256;
  readyCensusSha256: Sha256;
  witnessReviewBundleSha256: Sha256;
  invocationIntentId: Sha256;
  toolReceiptSha256: Sha256;
  nestedHandoff: CalibrationNestedPublicationHandoffV1;
  expectedCurrentState: ExpectedCurrentState;
  transactionId: Id;
  receiptSha256: Sha256;
}
