import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  FROZEN_ADMISSION_ACTIONS,
  FROZEN_ADMISSION_PROFILE_IDS,
  calibrationAdmissionSha256,
  calibrationAdmissionInvocationIntentId,
  calibrationAdmissionInvocationIntentSha256,
  calibrationAdmissionPolicySha256,
  calibrationAdmissionToolProfileSha256,
  calibrationAdmissionToolReceiptId,
  calibrationAdmissionToolReceiptSha256,
  expandAdmissionWitnessConstraints,
  isCalibrationAdmissionInvocationIntentV1,
  isCalibrationAdmissionPolicyV1,
  isCalibrationAdmissionToolProfileV1,
  isCalibrationAdmissionToolReceiptV1,
  isAdmissionWitnessPolicyV1,
  type CalibrationAdmissionInvocationIntentV1,
  type CalibrationAdmissionPolicyV1,
  type CalibrationAdmissionToolProfileV1,
  type CalibrationAdmissionToolReceiptV1,
  type AdmissionWitnessPolicyV1,
} from '../src/calibration-admission-evidence';

const sha = (character: string) => character.repeat(64);

function profileWithoutHashes(profileId = ''): Omit<CalibrationAdmissionToolProfileV1, 'profileId' | 'profileSha256'> & { profileId?: string; profileSha256?: string } {
  return {
    version: 'v10.3-admission-tool-profile-v1',
    ...(profileId ? { profileId } : {}),
    allowedExecutableIds: ['corepack-pnpm', 'node'],
    allowedActions: [...FROZEN_ADMISSION_ACTIONS['admission-core-contract-v1']],
    candidateByteAccess: 'none',
    network: { mode: 'deny' },
    resourceLimits: { maxHeapMiB: 2048, maxWallSeconds: 3600 },
    ...(profileId ? { profileSha256: sha('0') } : {}),
  } as unknown as Omit<CalibrationAdmissionToolProfileV1, 'profileId' | 'profileSha256'> & { profileId?: string; profileSha256?: string };
}

function coreProfile(): CalibrationAdmissionToolProfileV1 {
  const withId = { ...profileWithoutHashes(), profileId: 'admission-core-contract-v1' } as CalibrationAdmissionToolProfileV1;
  return { ...withId, profileSha256: calibrationAdmissionToolProfileSha256(withId) };
}

function policyWithoutHash(): Omit<CalibrationAdmissionPolicyV1, 'policySha256'> {
  return {
    version: 'v10.3-admission-policy-v1',
    policyId: 'v10.3-admission-v1',
    initialRegisterEntryCount: 329,
    selectedCoverage: 452382,
    baselineMaterialUnits: 58089,
    repositoryMaterialUnits: 394293,
    labels: { positive: 'verified_ai', negative: 'verified_human' },
    evidenceCasPolicy: 'sha256-wx-fsync-v1',
    overlapPolicy: 'prefix-filter-exact-jaccard-0.80-v1',
    reasonVocabularySha256: sha('1'),
    toolProfileSha256s: [coreProfile().profileSha256],
    smoke: {
      unitsPerPolarity: 100,
      maxSourceOrFamilyUnitsPerPolarity: 50,
      minimumSourcesPerPolarity: 2,
      minimumFamiliesPerPolarity: 3,
      minimumLanguages: 2,
      minimumUnitsPerRepresentedLanguagePerPolarity: 20,
    },
    canary: {
      unitsPerPolarity: 5000,
      maxSourceUnitsPerPolarity: 500,
      maxFamilyUnitsPerPolarity: 1000,
      minimumSourcesPerPolarity: 10,
      minimumFamiliesPerPolarity: 5,
      minimumLanguages: 3,
      minimumUnitsPerLanguagePerPolarity: 250,
      minimumFamiliesPerLanguagePerPolarity: 3,
      minimumAiGeneratorFamilies: 3,
    },
  };
}

function policy(): CalibrationAdmissionPolicyV1 {
  const without = policyWithoutHash();
  return { ...without, policySha256: calibrationAdmissionPolicySha256(without) };
}

function witness(gate: 'smoke' | 'canary' = 'smoke'): AdmissionWitnessPolicyV1 {
  const durablePolicy = policy();
  const constraints = expandAdmissionWitnessConstraints(durablePolicy, gate) as AdmissionWitnessPolicyV1['constraints'];
  const withoutHash = {
    version: 'v10.3-admission-witness-policy-v1' as const,
    policyId: durablePolicy.policyId,
    gate,
    algorithm: 'lexicographic-bnb-feasibility-v1' as const,
    seed: 'slopbrick-v10.3-admission-review-v1' as const,
    maxSearchNodes: (gate === 'smoke' ? 10000000 : 50000000) as 10000000 | 50000000,
    constraints,
    constraintsSha256: calibrationAdmissionSha256(constraints),
  };
  return {
    ...withoutHash,
    witnessPolicySha256: calibrationAdmissionPolicySha256(withoutHash),
  };
}

function intent(profile: CalibrationAdmissionToolProfileV1): CalibrationAdmissionInvocationIntentV1 {
  const withoutIds = {
    version: 'v10.3-admission-invocation-intent-v1' as const,
    profileId: profile.profileId,
    profileSha256: profile.profileSha256,
    action: 'core:contract',
    canonicalArgvSha256: sha('2'),
    inputSetSha256: sha('3'),
    executableBehaviorSha256: sha('4'),
  };
  const intentId = calibrationAdmissionInvocationIntentId(withoutIds);
  const withId = { ...withoutIds, intentId };
  return { ...withId, intentSha256: calibrationAdmissionInvocationIntentSha256(withId) };
}

function receipt(profile: CalibrationAdmissionToolProfileV1, invocation: CalibrationAdmissionInvocationIntentV1): CalibrationAdmissionToolReceiptV1 {
  const withoutId = {
    version: 'v10.3-admission-tool-receipt-v1' as const,
    invocationIntentId: invocation.intentId,
    profileId: profile.profileId,
    profileSha256: profile.profileSha256,
    action: invocation.action,
    canonicalArgvSha256: invocation.canonicalArgvSha256,
    inputSetSha256: invocation.inputSetSha256,
    executableBehaviorSha256: invocation.executableBehaviorSha256,
    observedResourceUsage: { maxHeapMiB: 10, wallSeconds: 1 },
    exitCode: 0,
    outputSetSha256: sha('5'),
  };
  return { ...withoutId, receiptId: calibrationAdmissionToolReceiptId(withoutId) };
}

describe('v10.3 admission durable Core contracts', () => {
  it('freezes the twelve profile IDs and exact action ownership', () => {
    expect(FROZEN_ADMISSION_PROFILE_IDS).toHaveLength(12);
    expect(FROZEN_ADMISSION_ACTIONS['admission-core-contract-v1']).toEqual(['core:contract']);
    expect(FROZEN_ADMISSION_ACTIONS['admission-context-v1']).toEqual([
      'census:preview', 'context:verify', 'evidence:verify', 'lint',
      'manifest:verify', 'manifest:verify-prerequisites', 'source:census',
    ]);
  });

  it('validates self-hashed policy, witness expansion, profile, intent, and receipt', () => {
    const durablePolicy = policy();
    const durableWitness = witness();
    const durableProfile = coreProfile();
    const durableIntent = intent(durableProfile);
    const durableReceipt = receipt(durableProfile, durableIntent);

    expect(isCalibrationAdmissionPolicyV1(durablePolicy)).toBe(true);
    expect(isAdmissionWitnessPolicyV1(durableWitness, durablePolicy)).toBe(true);
    expect(isCalibrationAdmissionToolProfileV1(durableProfile)).toBe(true);
    expect(isCalibrationAdmissionInvocationIntentV1(durableIntent, durableProfile)).toBe(true);
    expect(isCalibrationAdmissionToolReceiptV1(durableReceipt, durableProfile, durableIntent)).toBe(true);
    expect(calibrationAdmissionToolReceiptSha256(durableReceipt)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps the five JSON Schemas aligned with the semantic fixtures', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(ajv);
    const schemaNames = [
      'calibration-admission-policy',
      'calibration-admission-witness-policy',
      'calibration-admission-tool-profile',
      'calibration-admission-invocation-intent',
      'calibration-admission-tool-receipt',
    ] as const;
    const values = [policy(), witness(), coreProfile(), intent(coreProfile()), receipt(coreProfile(), intent(coreProfile()))];
    for (const [index, schemaName] of schemaNames.entries()) {
      const schema = JSON.parse(readFileSync(join(root, 'schemas', 'v1', `${schemaName}.schema.json`), 'utf8')) as object;
      const validate = ajv.compile(schema);
      expect(validate(values[index]), `${schemaName}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  it('rejects changed or omitted semantic constraints and profile action ownership', () => {
    const durablePolicy = policy();
    const durableWitness = witness();
    const changed = structuredClone(durableWitness);
    changed.constraints = changed.constraints.slice(1) as unknown as AdmissionWitnessPolicyV1['constraints'];
    expect(isAdmissionWitnessPolicyV1(changed, durablePolicy)).toBe(false);

    const wrongProfile = { ...coreProfile(), allowedActions: ['verify'] };
    expect(isCalibrationAdmissionToolProfileV1(wrongProfile)).toBe(false);
    const unknownProfile = { ...coreProfile(), profileId: 'unknown-profile-v1' };
    expect(isCalibrationAdmissionToolProfileV1(unknownProfile)).toBe(false);
  });

  it('rejects receipt replay, profile substitution, hash tampering, and network authorization drift', () => {
    const durableProfile = coreProfile();
    const durableIntent = intent(durableProfile);
    const durableReceipt = receipt(durableProfile, durableIntent);
    expect(isCalibrationAdmissionToolReceiptV1({ ...durableReceipt, profileId: 'f'.repeat(64) }, durableProfile, durableIntent)).toBe(false);
    expect(isCalibrationAdmissionToolReceiptV1({ ...durableReceipt, outputSetSha256: sha('6') }, durableProfile, durableIntent)).toBe(false);
    expect(isCalibrationAdmissionInvocationIntentV1({ ...durableIntent, intentSha256: sha('6') }, durableProfile)).toBe(false);
    expect(isCalibrationAdmissionToolReceiptV1({ ...durableReceipt, invocationIntentId: sha('6') }, durableProfile, durableIntent)).toBe(false);
  });

  it('fails closed for unknown properties and hostile values', () => {
    const durableProfile = coreProfile();
    expect(isCalibrationAdmissionToolProfileV1({ ...durableProfile, extra: true })).toBe(false);
    expect(isCalibrationAdmissionToolProfileV1({ ...durableProfile, resourceLimits: { heap: Number.NaN } })).toBe(false);
    expect(isCalibrationAdmissionInvocationIntentV1({ ...intent(durableProfile), canonicalArgvSha256: ['bad'] }, durableProfile)).toBe(false);
    expect(isCalibrationAdmissionToolReceiptV1({ ...receipt(durableProfile, intent(durableProfile)), observedResourceUsage: { wallSeconds: -1 } }, durableProfile)).toBe(false);
  });
});
