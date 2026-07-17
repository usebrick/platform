import { describe, expect, it } from 'vitest';

import {
  isVerifiedReadyAdmissionCensus,
  verifyReadyAdmissionCensus,
} from '../../src/calibration/v103/admission-ready-census';

describe('v10.3 private ready census gate', () => {
  it('fails closed before reading a schema-valid census when the context is not branded', async () => {
    const result = await verifyReadyAdmissionCensus({
      context: {},
      census: {},
      gate: 'smoke',
      buildInput: {},
      witnessReviewBundle: {},
    } as never);

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors).toContain('verified admission context is required');
  });

  it('never accepts a forged brand or a deserialized ready object', () => {
    expect(isVerifiedReadyAdmissionCensus({})).toBe(false);
    expect(isVerifiedReadyAdmissionCensus(JSON.parse(JSON.stringify({ ready: true })))).toBe(false);
  });
});
