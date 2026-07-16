import { constants } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  inspectAdmissionPathSecurity,
  requireAdmissionPathSecurity,
} from '../../src/calibration/v103/admission-path-security';

describe('admission pathname security capability contract', () => {
  it('accepts a positive no-follow flag on a POSIX-like platform', () => {
    expect(inspectAdmissionPathSecurity({ platform: 'linux', noFollowFlag: 256 })).toEqual({
      supported: true,
      platform: 'linux',
      noFollowFlag: 256,
    });
  });

  it('fails closed when the primitive is missing', () => {
    expect(inspectAdmissionPathSecurity({ platform: 'linux', noFollowFlag: undefined })).toEqual({
      supported: false,
      platform: 'linux',
      reason: 'missing_o_nofollow',
    });
  });

  it('does not treat Windows reparse points as a POSIX fallback', () => {
    expect(inspectAdmissionPathSecurity({ platform: 'win32', noFollowFlag: constants.O_NOFOLLOW })).toEqual({
      supported: false,
      platform: 'win32',
      reason: 'unsupported_platform',
    });
  });

  it('returns the host flag when the current host supports the contract', () => {
    const status = inspectAdmissionPathSecurity();
    if (status.supported) {
      expect(requireAdmissionPathSecurity()).toBe(status.noFollowFlag);
    } else {
      expect(() => requireAdmissionPathSecurity()).toThrow(/unsupported|unavailable/i);
    }
  });
});
