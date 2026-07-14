import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  deriveAdmissionDisposition,
} from '../../src/calibration/v103/admission-disposition';
import {
  buildVerifiedAdmissionContext,
  isVerifiedAdmissionContext,
} from '../../src/calibration/v103/admission-context';
import {
  cleanupRuntimeFixtures,
  runtimeFixture,
} from './v103-admission-context-fixture';

describe('v10.3 verified admission disposition', () => {
  it('uses the durable record disposition and rejection reasons', async () => {
    const fixture = await runtimeFixture();
    const built = await buildVerifiedAdmissionContext(fixture.root, fixture.evidence);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(isVerifiedAdmissionContext(built.context)).toBe(true);
    expect(deriveAdmissionDisposition(built.context, fixture.recordId)).toEqual({
      disposition: 'quarantine',
      reasons: ['authorship_unproven'],
    });
    expect(deriveAdmissionDisposition(built.context, 'f'.repeat(64))).toEqual({
      disposition: 'quarantine',
      reasons: ['unknown_record_id'],
    });
  });

  it('rejects casts, clones, deserialization, and contexts from another module instance', async () => {
    const fixture = await runtimeFixture();
    const built = await buildVerifiedAdmissionContext(fixture.root, fixture.evidence);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(() => deriveAdmissionDisposition({} as never, fixture.recordId)).toThrow(/invalid verified admission context/i);
    expect(() => deriveAdmissionDisposition(structuredClone(built.context) as never, fixture.recordId)).toThrow(/invalid verified admission context/i);
    const deserialized = JSON.parse(JSON.stringify(built.context));
    expect(() => deriveAdmissionDisposition(deserialized as never, fixture.recordId)).toThrow(/invalid verified admission context/i);
    vi.resetModules();
    const crossModule = await import('../../src/calibration/v103/admission-context');
    const other = await crossModule.buildVerifiedAdmissionContext(fixture.root, fixture.evidence);
    expect(other.ok).toBe(false);
  });
});

afterEach(cleanupRuntimeFixtures);
