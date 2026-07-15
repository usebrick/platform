import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  calibrationAdmissionOverlapResourceReceiptId,
  type AdmissionOverlapResourceReceiptV1,
} from '@usebrick/core';

import {
  validateRealScaleOverlapResourceReceipt,
  type RealScaleOverlapResourceExpectation,
} from '../../src/calibration/v103/admission-real-scale-receipt';

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');

function receipt(overrides: Partial<AdmissionOverlapResourceReceiptV1> = {}): AdmissionOverlapResourceReceiptV1 {
  const body: Omit<AdmissionOverlapResourceReceiptV1, 'receiptId'> = {
    version: 'v10.3-overlap-resource-receipt-v1',
    universeSha256: sha('universe'),
    recordsJsonlSha256: sha('records'),
    overlapPolicySha256: sha('policy'),
    realContentDistributionSha256: sha('distribution'),
    recordCount: 452_382,
    tokenCount: 12,
    shingleCount: 34,
    configuredLimits: {
      maxUnitBytes: 33_554_432,
      maxHeapBytes: 4_294_967_296,
      maxRssBytes: 6_442_450_944,
      maxWorkBytes: 214_748_364_800,
      maxOpenFiles: 64,
      maxShardBytes: 67_108_864,
      maxWallMilliseconds: 86_400_000,
    },
    observed: {
      maxUnitBytes: 100,
      maxHeapBytes: 200,
      maxRssBytes: 300,
      maxWorkBytes: 400,
      maxOpenFiles: 2,
      maxShardBytes: 500,
      wallMilliseconds: 600,
    },
    coverageComplete: true,
    withinAllLimits: true,
    toolReceiptSha256: sha('tool'),
    ...overrides,
  };
  return { ...body, receiptId: calibrationAdmissionOverlapResourceReceiptId(body) };
}

const expected: RealScaleOverlapResourceExpectation = {
  recordCount: 452_382,
  universeSha256: sha('universe'),
  recordsJsonlSha256: sha('records'),
};

describe('v10.3 real-scale overlap resource receipt gate', () => {
  it('accepts a complete receipt bound to the exact selected corpus stream', () => {
    expect(validateRealScaleOverlapResourceReceipt(receipt(), expected)).toEqual({ ok: true, errors: [] });
  });

  it.each([
    ['record count', { recordCount: 452_381 }],
    ['universe hash', { universeSha256: sha('other-universe') }],
    ['records hash', { recordsJsonlSha256: sha('other-records') }],
    ['coverage', { coverageComplete: false }],
    ['limits', { withinAllLimits: false }],
    ['sentinel distribution', { realContentDistributionSha256: sha('no-covered-content') }],
  ])('rejects %s drift', (_label, patch) => {
    const result = validateRealScaleOverlapResourceReceipt(receipt(patch), expected);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects a malformed Core receipt before applying the scale binding', () => {
    const result = validateRealScaleOverlapResourceReceipt({ recordCount: 452_382 }, expected);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes('Core'))).toBe(true);
  });
});
