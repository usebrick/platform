import { describe, expect, it } from 'vitest';

import {
  buildCalibrationNestedPublicationHandoffV1,
  calibrationAdmissionNestedPublicationChildRecoveryNonce,
  calibrationAdmissionNestedPublicationHandoffSha256,
  calibrationAdmissionSha256,
  isCalibrationNestedPublicationHandoffV1,
  type CalibrationNestedPublicationHandoffBuildInput,
} from '../src/index';

const hash = (character: string): string => character.repeat(64);

function common(parentRecoveryNonce = hash('b')) {
  return {
    parentTransactionId: hash('a'),
    parentRecoveryNonce,
    childSlot: 'intent-authority',
    expectedCurrentStateSha256: hash('c'),
    childLockId: hash('d'),
    childLockSha256: hash('e'),
    childTransactionId: hash('f'),
    childTransactionIntentSha256: hash('1'),
    state: { phase: 'started_fsynced' as const },
  };
}

function infrastructureInput(parentRecoveryNonce = hash('b')): CalibrationNestedPublicationHandoffBuildInput {
  return {
    ...common(parentRecoveryNonce),
    childKind: 'tool_authority_infrastructure',
    childAction: 'tool-authority:publish',
    toolAuthorityObjectSetSha256: hash('2'),
  };
}

function profiledInput(): CalibrationNestedPublicationHandoffBuildInput {
  return {
    ...common(),
    childSlot: 'output',
    childKind: 'profiled_publication',
    childAction: 'acquisition:publish',
    childProfileId: 'admission-acquisition-publication-v1',
    childInvocationIntentId: hash('3'),
    childInvocationIntentRelativePath: 'invocation-intents/output.json',
    childInvocationIntentSha256: hash('4'),
    childInvocationIntentAuthorityHandoffSha256: hash('5'),
    childInvocationIntentAuthorityIndexSha256: hash('6'),
  };
}

describe('v10.3 nested publication handoff builder', () => {
  it('builds a self-hashed infrastructure handoff with derived child nonce', () => {
    const input = infrastructureInput();
    const handoff = buildCalibrationNestedPublicationHandoffV1(input);

    expect(isCalibrationNestedPublicationHandoffV1(handoff)).toBe(true);
    expect(handoff.childRecoveryNonce).toBe(calibrationAdmissionNestedPublicationChildRecoveryNonce(input));
    expect(handoff.handoffSha256).toBe(calibrationAdmissionNestedPublicationHandoffSha256(handoffWithoutHash(handoff)));
    expect('childProfileId' in handoff).toBe(false);
  });

  it('builds the profiled branch without infrastructure-only fields', () => {
    const handoff = buildCalibrationNestedPublicationHandoffV1(profiledInput());

    expect(handoff.childKind).toBe('profiled_publication');
    expect(handoff.childAction).toBe('acquisition:publish');
    expect('toolAuthorityObjectSetSha256' in handoff).toBe(false);
    expect(isCalibrationNestedPublicationHandoffV1(handoff)).toBe(true);
  });

  it('supports completed state and keeps the receipt branch explicit', () => {
    const input = infrastructureInput();
    const handoff = buildCalibrationNestedPublicationHandoffV1({
      ...input,
      state: {
        phase: 'completed_fsynced',
        namedPrimaryOutputProjectionSha256: hash('7'),
        nextAuthoritySha256: hash('8'),
        childAuthoritySha256: hash('9'),
        childReceipt: { kind: 'none_infrastructure' },
      },
    });

    expect(handoff.state.phase).toBe('completed_fsynced');
    if (handoff.state.phase === 'completed_fsynced') {
      expect(handoff.state.childReceipt).toEqual({ kind: 'none_infrastructure' });
    }
  });

  it('rejects a nonce derivation input that is not a content address', () => {
    expect(() => calibrationAdmissionNestedPublicationChildRecoveryNonce({
      ...infrastructureInput('not-a-sha'),
    })).toThrow(/lowercase SHA-256/);
  });

  it('detects tampering after construction', () => {
    const handoff = buildCalibrationNestedPublicationHandoffV1(profiledInput());
    const tampered = { ...handoff, childAction: 'acquisition:authorize' };

    expect(isCalibrationNestedPublicationHandoffV1(tampered)).toBe(false);
    expect(calibrationAdmissionSha256(tampered)).not.toBe(handoff.handoffSha256);
  });
});

function handoffWithoutHash<T extends { handoffSha256: string }>(handoff: T): Omit<T, 'handoffSha256'> {
  const { handoffSha256: _ignored, ...body } = handoff;
  return body;
}
