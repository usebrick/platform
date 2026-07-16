import { constants } from 'node:fs';

/**
 * Capabilities required by the pathname-bound authority readers.  The reader
 * deliberately does not emulate `O_NOFOLLOW`: without it, a path can be
 * replaced by a symlink between the containment walk and the final open.
 */
export interface AdmissionPathSecurityCapabilities {
  readonly platform: string;
  readonly noFollowFlag: number | undefined;
}

export interface AdmissionPathSecurityStatus {
  readonly supported: boolean;
  readonly platform: string;
  readonly noFollowFlag?: number;
  readonly reason?: 'unsupported_platform' | 'missing_o_nofollow';
}

export function inspectAdmissionPathSecurity(
  capabilities: AdmissionPathSecurityCapabilities = {
    platform: process.platform,
    noFollowFlag: constants.O_NOFOLLOW,
  },
): AdmissionPathSecurityStatus {
  // Node exposes the flag on some non-POSIX builds as a compatibility value;
  // Windows reparse-point semantics are not equivalent to POSIX O_NOFOLLOW.
  if (capabilities.platform === 'win32') {
    return { supported: false, platform: capabilities.platform, reason: 'unsupported_platform' };
  }
  const noFollowFlag = capabilities.noFollowFlag;
  if (typeof noFollowFlag !== 'number' || !Number.isInteger(noFollowFlag) || noFollowFlag <= 0) {
    return { supported: false, platform: capabilities.platform, reason: 'missing_o_nofollow' };
  }
  return {
    supported: true,
    platform: capabilities.platform,
    noFollowFlag,
  };
}

/**
 * Return the required flag or fail closed with a platform-specific message.
 * Callers must not fall back to a plain pathname open.
 */
export function requireAdmissionPathSecurity(): number {
  const status = inspectAdmissionPathSecurity();
  if (!status.supported || status.noFollowFlag === undefined) {
    const reason = status.reason === 'unsupported_platform'
      ? 'Windows reparse-point semantics are not supported by this reader'
      : 'the O_NOFOLLOW primitive is unavailable';
    throw new Error(`admission authority file reads are unsupported on ${status.platform}: ${reason}`);
  }
  return status.noFollowFlag;
}
