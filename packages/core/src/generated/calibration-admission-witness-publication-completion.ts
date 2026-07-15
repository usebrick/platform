// AUTO-GENERATED from calibration-admission-witness-publication-completion.schema.json. Do not hand-edit.

export type Sha256 = string;
export type RelativePath = string;
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

/**
 * Durable, self-hashed completion marker for a witness bundle publication.
 */
export interface CalibrationAdmissionWitnessPublicationCompletionV1 {
  version: "v10.3-admission-witness-publication-completion-v1";
  gate: "smoke" | "canary";
  kind: "search_result" | "witness_review";
  parentTransactionId: Sha256;
  invocationIntentId: Sha256;
  bundleRelativePath: RelativePath;
  bundleSha256: Sha256;
  namedPrimaryOutputProjectionSha256: Sha256;
  requiredToolReceiptIds: Sha256[];
  requiredToolReceiptSha256s: Sha256[];
  publicationToolReceiptId: Sha256;
  publicationToolReceiptSha256: Sha256;
  toolAuthorityIndexSha256: Sha256;
  nestedHandoff: CalibrationNestedPublicationHandoffV1;
  completionSha256: Sha256;
}
