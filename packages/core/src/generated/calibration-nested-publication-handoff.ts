// AUTO-GENERATED from calibration-nested-publication-handoff.schema.json. Do not hand-edit.

/**
 * Transient parent-to-child publication handoff, including recursion-breaking tool-authority companions.
 */
export type CalibrationNestedPublicationHandoffV1 = {
  version: "v10.3-nested-publication-handoff-v1";
  parentTransactionId: Sha256;
  childSlot: Action;
  expectedCurrentStateSha256: Sha256;
  childLockId: Sha256;
  childLockSha256: Sha256;
  childTransactionId: Sha256;
  childTransactionIntentSha256: Sha256;
  childRecoveryNonce: Sha256;
  state: State;
  childKind: "tool_authority_infrastructure" | "profiled_publication";
  childAction: Action;
  toolAuthorityObjectSetSha256?: Sha256;
  childProfileId?: ProfileId;
  childInvocationIntentId?: Sha256;
  childInvocationIntentRelativePath?: RelativePath;
  childInvocationIntentSha256?: Sha256;
  childInvocationIntentAuthorityHandoffSha256?: Sha256;
  childInvocationIntentAuthorityIndexSha256?: Sha256;
  handoffSha256: Sha256;
} & (
  | {
      childKind: "tool_authority_infrastructure";
      childAction: "tool-authority:publish";
      toolAuthorityObjectSetSha256: Sha256;
      childProfileId?: unknown;
      childInvocationIntentId?: unknown;
      childInvocationIntentRelativePath?: unknown;
      childInvocationIntentSha256?: unknown;
      childInvocationIntentAuthorityHandoffSha256?: unknown;
      childInvocationIntentAuthorityIndexSha256?: unknown;
    }
  | {
      childKind: "profiled_publication";
      childAction: Action;
      childProfileId: ProfileId;
      childInvocationIntentId: Sha256;
      childInvocationIntentRelativePath: RelativePath;
      childInvocationIntentSha256: Sha256;
      childInvocationIntentAuthorityHandoffSha256: Sha256;
      childInvocationIntentAuthorityIndexSha256: Sha256;
      toolAuthorityObjectSetSha256?: unknown;
    }
);
export type Sha256 = string;
export type Action = string;
export type State =
  | {
      phase: "started_fsynced";
    }
  | {
      phase: "completed_fsynced";
      namedPrimaryOutputProjectionSha256: Sha256;
      nextAuthoritySha256: Sha256;
      childAuthoritySha256: Sha256;
      childReceipt: ChildReceipt;
    };
export type ChildReceipt =
  | {
      kind: "none_infrastructure";
    }
  | {
      kind: "profiled";
      receiptId: Sha256;
      receiptSha256: Sha256;
    };
export type ProfileId =
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
export type RelativePath = string;
