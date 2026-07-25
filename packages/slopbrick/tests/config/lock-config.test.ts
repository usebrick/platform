import { describe, expect, it } from 'vitest';
import { validateConfig } from '../../src/config/validation';

const validWaiver = {
  findingIdentity: 'a'.repeat(64),
  owner: 'architecture-owner',
  reason: 'Temporary migration exception.',
  expiresAt: '2026-08-01T00:00:00.000Z',
};

describe('Lock repository configuration', () => {
  it('requires every waiver to carry an exact identity, owner, reason, and expiry', () => {
    expect(validateConfig({ lock: { waivers: [validWaiver] } })).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });

    const invalidWaivers = [
      { ...validWaiver, findingIdentity: 'not-an-identity' },
      { ...validWaiver, owner: '   ' },
      { ...validWaiver, reason: '' },
      { ...validWaiver, expiresAt: 'someday' },
      { ...validWaiver, extra: true },
    ];
    for (const waiver of invalidWaivers) {
      expect(validateConfig({ lock: { waivers: [waiver] } })).toMatchObject({
        valid: false,
        errors: expect.arrayContaining([
          expect.stringMatching(/^lock\.waivers\[0\]: /),
        ]),
      });
    }
  });
});
