import type { CalibrationNestedPublicationHandoffV1 } from './generated/calibration-nested-publication-handoff';
import {
  calibrationAdmissionSha256,
  isCalibrationNestedPublicationHandoffV1,
} from './calibration-admission-evidence';
import { isSha256 } from './calibration-admission-primitives';

type HandoffState = CalibrationNestedPublicationHandoffV1['state'];
type ProfiledHandoff = Extract<CalibrationNestedPublicationHandoffV1, { childKind: 'profiled_publication' }>;
type InfrastructureHandoff = Extract<CalibrationNestedPublicationHandoffV1, { childKind: 'tool_authority_infrastructure' }>;

type HandoffCommonInput = {
  parentTransactionId: string;
  /** The parent nonce is an input to child nonce derivation and is never persisted in the handoff. */
  parentRecoveryNonce: string;
  childSlot: string;
  expectedCurrentStateSha256: string;
  childLockId: string;
  childLockSha256: string;
  childTransactionId: string;
  childTransactionIntentSha256: string;
  state: HandoffState;
};

export type CalibrationNestedPublicationHandoffBuildInput = HandoffCommonInput & (
  | {
      childKind: 'tool_authority_infrastructure';
      childAction: 'tool-authority:publish';
      toolAuthorityObjectSetSha256: string;
    }
  | {
      childKind: 'profiled_publication';
      childAction: string;
      childProfileId: ProfiledHandoff['childProfileId'];
      childInvocationIntentId: ProfiledHandoff['childInvocationIntentId'];
      childInvocationIntentRelativePath: ProfiledHandoff['childInvocationIntentRelativePath'];
      childInvocationIntentSha256: ProfiledHandoff['childInvocationIntentSha256'];
      childInvocationIntentAuthorityHandoffSha256: ProfiledHandoff['childInvocationIntentAuthorityHandoffSha256'];
      childInvocationIntentAuthorityIndexSha256: ProfiledHandoff['childInvocationIntentAuthorityIndexSha256'];
    }
);

type ChildNonceInput = Pick<
  CalibrationNestedPublicationHandoffBuildInput,
  'parentTransactionId' | 'parentRecoveryNonce' | 'childSlot' | 'expectedCurrentStateSha256'
> & (
  | Pick<InfrastructureHandoff, 'childKind' | 'toolAuthorityObjectSetSha256'>
  | Pick<ProfiledHandoff, 'childKind' | 'childAction' | 'childProfileId' | 'childInvocationIntentSha256' | 'childInvocationIntentAuthorityIndexSha256'>
);

const CHILD_NONCE_DOMAIN = 'v10.3-child-recovery-nonce';

/**
 * Derive the child recovery nonce from the parent transaction and the exact
 * child authority selector. The parent nonce is deliberately not written to
 * the child handoff; it binds the transient record without adding a new wire
 * field to the Core schema.
 */
export function calibrationAdmissionNestedPublicationChildRecoveryNonce(
  input: ChildNonceInput,
): string {
  if (!isSha256(input.parentTransactionId) || !isSha256(input.parentRecoveryNonce) || !isSha256(input.expectedCurrentStateSha256)) {
    throw new TypeError('nested publication nonce inputs must use lowercase SHA-256 values');
  }

  if (input.childKind === 'tool_authority_infrastructure') {
    if (!isSha256(input.toolAuthorityObjectSetSha256)) throw new TypeError('tool authority object-set hash is invalid');
    return calibrationAdmissionSha256({
      domain: CHILD_NONCE_DOMAIN,
      parentTransactionId: input.parentTransactionId,
      parentRecoveryNonce: input.parentRecoveryNonce,
      childSlot: input.childSlot,
      expectedCurrentStateSha256: input.expectedCurrentStateSha256,
      childKind: input.childKind,
      toolAuthorityObjectSetSha256: input.toolAuthorityObjectSetSha256,
    });
  }

  if (!isSha256(input.childInvocationIntentSha256) || !isSha256(input.childInvocationIntentAuthorityIndexSha256)) {
    throw new TypeError('profiled invocation hashes are invalid');
  }
  return calibrationAdmissionSha256({
    domain: CHILD_NONCE_DOMAIN,
    parentTransactionId: input.parentTransactionId,
    parentRecoveryNonce: input.parentRecoveryNonce,
    childSlot: input.childSlot,
    expectedCurrentStateSha256: input.expectedCurrentStateSha256,
    childKind: input.childKind,
    childAction: input.childAction,
    childProfileId: input.childProfileId,
    childInvocationIntentSha256: input.childInvocationIntentSha256,
    childInvocationIntentAuthorityIndexSha256: input.childInvocationIntentAuthorityIndexSha256,
  });
}

/** Compute the handoff content address without its self-hash field. */
export function calibrationAdmissionNestedPublicationHandoffSha256(
  value: Omit<CalibrationNestedPublicationHandoffV1, 'handoffSha256'>,
): string {
  return calibrationAdmissionSha256(value);
}

/**
 * Build a schema-valid, self-hashed nested publication handoff. This is a
 * pure contract helper; it does not create locks, inspect the filesystem, or
 * imply that the outer authority materializer is available.
 */
export function buildCalibrationNestedPublicationHandoffV1(
  input: CalibrationNestedPublicationHandoffBuildInput,
): CalibrationNestedPublicationHandoffV1 {
  const { parentRecoveryNonce, ...body } = input;
  const childRecoveryNonce = calibrationAdmissionNestedPublicationChildRecoveryNonce(input);
  const withoutHash = {
    version: 'v10.3-nested-publication-handoff-v1' as const,
    ...body,
    childRecoveryNonce,
  } as Omit<CalibrationNestedPublicationHandoffV1, 'handoffSha256'>;
  const handoff = {
    ...withoutHash,
    handoffSha256: calibrationAdmissionNestedPublicationHandoffSha256(withoutHash),
  } as CalibrationNestedPublicationHandoffV1;

  if (!isCalibrationNestedPublicationHandoffV1(handoff)) {
    throw new TypeError('nested publication handoff does not satisfy the Core contract');
  }
  return handoff;
}
