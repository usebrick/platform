import { describe, expect, it } from 'vitest';

import { admissionPublicationFailureJson } from '../../src/calibration/v103/admission-cli-output';

describe('v10.3 admission CLI publication output', () => {
  it('preserves the recovery nonce in pending stderr payloads', () => {
    const recoveryNonce = 'a'.repeat(64);
    const payload = JSON.parse(admissionPublicationFailureJson(
      'rebuild:pre-witness',
      'publication_pending',
      {
        complete: false,
        recoveryRequired: true,
        transactionId: 'b'.repeat(64),
        recoveryNonce,
        lockPath: 'review/admission/authority/rebuild.lock',
      },
      'publication paused at a durable boundary',
    )) as Record<string, unknown>;

    expect(payload).toMatchObject({
      ok: false,
      command: 'rebuild:pre-witness',
      code: 'publication_pending',
      complete: false,
      recoveryRequired: true,
      recoveryNonce,
      errors: ['publication paused at a durable boundary'],
    });
  });

  it('keeps result fields while replacing stale error arrays', () => {
    const payload = JSON.parse(admissionPublicationFailureJson(
      'witness:publish-search',
      'publication_contended',
      { recoveryNonce: 'c'.repeat(64), errors: ['old diagnostic'] },
      'another writer owns the lock',
    )) as Record<string, unknown>;

    expect(payload).toMatchObject({
      recoveryNonce: 'c'.repeat(64),
      errors: ['another writer owns the lock'],
    });
  });
});
