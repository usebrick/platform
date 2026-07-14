import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  calibrationAdmissionPreWitnessBundleSha256,
  isCalibrationAdmissionPreWitnessBundleV1,
  validateCalibrationAdmissionPreWitnessBundleV1,
  type CalibrationAdmissionPreWitnessBundleV1,
} from '../src/index';

const fixturePath = new URL('./fixtures/schema/valid/calibration-admission-pre-witness-bundle.valid.json', import.meta.url);

function fixture(): CalibrationAdmissionPreWitnessBundleV1 {
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as CalibrationAdmissionPreWitnessBundleV1;
}

function rehash(value: unknown): CalibrationAdmissionPreWitnessBundleV1 {
  return {
    ...(value as Record<string, unknown>),
    preWitnessBundleSha256: calibrationAdmissionPreWitnessBundleSha256(value),
  } as CalibrationAdmissionPreWitnessBundleV1;
}

describe('v10.3 rich pre-witness bundle Core contract', () => {
  it('accepts the composed valid fixture and exposes a successful validation result', () => {
    const value = fixture();
    expect(isCalibrationAdmissionPreWitnessBundleV1(value)).toBe(true);
    expect(validateCalibrationAdmissionPreWitnessBundleV1(value)).toMatchObject({ ok: true, value });
  });

  it('requires the exact version and key set', () => {
    const value = fixture();
    expect(validateCalibrationAdmissionPreWitnessBundleV1({ ...value, version: 'wrong' }).ok).toBe(false);
    const { policy: _policy, ...missing } = value;
    expect(validateCalibrationAdmissionPreWitnessBundleV1(missing).ok).toBe(false);
    expect(validateCalibrationAdmissionPreWitnessBundleV1({ ...value, extra: true }).ok).toBe(false);
  });

  it('binds the canonical self-hash', () => {
    const value = fixture();
    expect(validateCalibrationAdmissionPreWitnessBundleV1({ ...value, preWitnessBundleSha256: 'f'.repeat(64) }).ok).toBe(false);
  });

  it('requires smoke then canary witness policies derived from the policy', () => {
    const value = fixture();
    const reversed = rehash({ ...value, witnessPolicies: [...value.witnessPolicies].reverse() as unknown as typeof value.witnessPolicies });
    expect(validateCalibrationAdmissionPreWitnessBundleV1(reversed).ok).toBe(false);
    const changed = structuredClone(value);
    changed.witnessPolicies[0] = { ...changed.witnessPolicies[0], constraints: [] } as unknown as typeof changed.witnessPolicies[0];
    expect(validateCalibrationAdmissionPreWitnessBundleV1(rehash(changed)).ok).toBe(false);
  });

  it('requires stable component arrays to be sorted and duplicate-free', () => {
    const value = fixture();
    const profiles = [...value.toolProfiles].reverse();
    expect(validateCalibrationAdmissionPreWitnessBundleV1(rehash({ ...value, toolProfiles: profiles })).ok).toBe(false);
    expect(validateCalibrationAdmissionPreWitnessBundleV1(rehash({ ...value, toolProfiles: [...value.toolProfiles, value.toolProfiles[0]!] as unknown as typeof value.toolProfiles })).ok).toBe(false);
  });

  it('rejects invalid referenced components even when the outer hash is refreshed', () => {
    const value = fixture();
    const invalidPolicy = { ...value.policy, policySha256: 'f'.repeat(64) };
    expect(validateCalibrationAdmissionPreWitnessBundleV1(rehash({ ...value, policy: invalidPolicy })).ok).toBe(false);
  });

  it('fails closed for malformed policy JSON without expanding witness constraints', () => {
    const value = fixture();
    const malformed = rehash({ ...value, policy: { malformed: true } });
    expect(() => validateCalibrationAdmissionPreWitnessBundleV1(malformed)).not.toThrow();
    expect(validateCalibrationAdmissionPreWitnessBundleV1(malformed).ok).toBe(false);
  });

  it('fails closed for undefined witness constraints and malformed record streams', () => {
    const value = fixture();
    const undefinedConstraints = {
      ...value,
      witnessPolicies: [{ ...value.witnessPolicies[0], constraints: undefined }, value.witnessPolicies[1]],
    } as unknown as CalibrationAdmissionPreWitnessBundleV1;
    expect(() => validateCalibrationAdmissionPreWitnessBundleV1(undefinedConstraints)).not.toThrow();
    expect(validateCalibrationAdmissionPreWitnessBundleV1(undefinedConstraints).ok).toBe(false);
    const undefinedStream = { ...value, admissionRecordStream: undefined } as unknown as CalibrationAdmissionPreWitnessBundleV1;
    expect(() => validateCalibrationAdmissionPreWitnessBundleV1(undefinedStream)).not.toThrow();
    expect(validateCalibrationAdmissionPreWitnessBundleV1(undefinedStream).ok).toBe(false);
  });

  it('fails closed for a throwing root proxy', () => {
    const value = fixture();
    const hostile = new Proxy(value, {
      get() {
        throw new Error('hostile getter');
      },
    });
    expect(() => validateCalibrationAdmissionPreWitnessBundleV1(hostile)).not.toThrow();
    expect(validateCalibrationAdmissionPreWitnessBundleV1(hostile).ok).toBe(false);
  });

  it('requires the exact admission record stream path and structural fields', () => {
    const value = fixture();
    expect(validateCalibrationAdmissionPreWitnessBundleV1(rehash({
      ...value,
      admissionRecordStream: { ...value.admissionRecordStream, relativePath: 'admission-records.jsonl' } as unknown as typeof value.admissionRecordStream,
    })).ok).toBe(false);
  });

  it('rejects witness-target assignments and decisions in the pre-witness partition', () => {
    const value = fixture();
    const assignment = JSON.parse(readFileSync(new URL('./fixtures/schema/valid/calibration-admission-blind-assignment.valid.json', import.meta.url), 'utf8')) as Record<string, unknown>;
    const decision = JSON.parse(readFileSync(new URL('./fixtures/schema/valid/calibration-admission-decision.valid.json', import.meta.url), 'utf8')) as Record<string, unknown>;
    const witnessTarget = { kind: 'witness' as const, witnessSha256: 'a'.repeat(64), eligibilitySnapshotSha256: 'b'.repeat(64), verifiedContextSha256: 'c'.repeat(64) };
    expect(validateCalibrationAdmissionPreWitnessBundleV1(rehash({
      ...value,
      preWitnessBlindAssignments: [{ ...assignment, target: witnessTarget }] as unknown as typeof value.preWitnessBlindAssignments,
    })).ok).toBe(false);
    expect(validateCalibrationAdmissionPreWitnessBundleV1(rehash({
      ...value,
      preWitnessDecisions: [{ ...decision, target: witnessTarget }] as unknown as typeof value.preWitnessDecisions,
    })).ok).toBe(false);
  });

  it('rejects witness blind receipts, search receipts, and witness-review objects', () => {
    const value = fixture();
    const receipt = JSON.parse(readFileSync(new URL('./fixtures/schema/valid/calibration-admission-blind-review-receipt.valid.json', import.meta.url), 'utf8')) as Record<string, unknown>;
    expect(validateCalibrationAdmissionPreWitnessBundleV1(rehash({
      ...value,
      preWitnessBlindReviewReceipts: [{ ...receipt, kind: 'witness_receipt' }] as unknown as typeof value.preWitnessBlindReviewReceipts,
    })).ok).toBe(false);
    expect(validateCalibrationAdmissionPreWitnessBundleV1(rehash({
      ...value,
      preWitnessBlindReviewReceipts: [{ version: 'v10.3-admission-search-receipt-v1' }] as unknown as typeof value.preWitnessBlindReviewReceipts,
    })).ok).toBe(false);
    expect(validateCalibrationAdmissionPreWitnessBundleV1(rehash({
      ...value,
      preWitnessBlindReviewReceipts: [{ version: 'v10.3-admission-witness-review-bundle-v1' }] as unknown as typeof value.preWitnessBlindReviewReceipts,
    })).ok).toBe(false);
  });
});
