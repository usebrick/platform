import { describe, expect, it, vi } from 'vitest';

import {
  calibrationAdmissionSha256,
  calibrationAdmissionToolReceiptSha256,
} from '@usebrick/core';

const resolveAuthority = vi.hoisted(() => vi.fn());

vi.mock('../../src/calibration/v103/admission-publication', () => ({
  resolveAdmissionToolAuthorityReceipt: resolveAuthority,
}));

vi.mock('../../src/calibration/v103/admission-witness-reopen', () => ({
  isVerifiedAdmissionWitnessPublication: (value: unknown): boolean => typeof value === 'object' && value !== null && (value as { readonly __verified?: boolean }).__verified === true,
}));

vi.mock('../../src/calibration/v103/admission-witness-review', () => ({
  validateAdmissionWitnessSearchResultBundle: () => ({ ok: true, witnessSha256: 'w'.repeat(64), errors: [] }),
  buildAdmissionWitnessReviewBundle: () => ({ ok: true, bundle: {} }),
}));

import {
  isVerifiedAdmissionWitnessPublicationAuthority,
  openAdmissionWitnessPublicationAuthority,
} from '../../src/calibration/v103/admission-witness-authority';

const H = 'a'.repeat(64);
const sha = (value: string): string => calibrationAdmissionSha256(value);

function fixture() {
  const requiredReceipt = {
    receiptId: sha('required-id'),
    profileId: 'admission-census-v1',
    action: 'witness:search',
    invocationIntentId: sha('required-intent'),
  } as never;
  const requiredReceiptSha256 = calibrationAdmissionToolReceiptSha256(requiredReceipt);
  const publicationReceipt = {
    receiptId: sha('publication-id'),
    profileId: 'admission-census-v1',
    action: 'witness:publish-search',
    invocationIntentId: sha('publication-intent'),
    outputSetSha256: sha('projection'),
  } as never;
  const publicationReceiptSha256 = calibrationAdmissionToolReceiptSha256(publicationReceipt);
  const authorityIndex = {
    receipts: [
      { receiptId: requiredReceipt.receiptId, sha256: requiredReceiptSha256 },
      { receiptId: publicationReceipt.receiptId, sha256: publicationReceiptSha256 },
    ],
  } as never;
  const search = {
    gate: 'smoke',
    verifiedContextSha256: H,
    eligibilitySnapshotSha256: H,
    toolReceipts: [requiredReceipt],
    searchReceipt: { toolReceiptSha256: requiredReceiptSha256 },
  } as never;
  const completion = {
    toolAuthorityIndexSha256: H,
    publicationToolReceiptId: publicationReceipt.receiptId,
    publicationToolReceiptSha256: publicationReceiptSha256,
    invocationIntentId: publicationReceipt.invocationIntentId,
    namedPrimaryOutputProjectionSha256: publicationReceipt.outputSetSha256,
    requiredToolReceiptIds: [requiredReceipt.receiptId],
    requiredToolReceiptSha256s: [requiredReceiptSha256],
  } as never;
  const publication = {
    __verified: true,
    gate: 'smoke',
    kind: 'search_result',
    bundle: search,
    completion,
  } as never;
  const resolveResult = (receipt: typeof requiredReceipt | typeof publicationReceipt) => ({
    authorityIndex,
    profile: { profileId: 'admission-census-v1' },
    invocationIntent: { intentId: receipt.invocationIntentId },
    receipt,
    snapshot: { indexGenerationSha256: H },
    authorityIndexSha256: H,
    receiptSha256: calibrationAdmissionToolReceiptSha256(receipt),
  } as never);
  resolveAuthority.mockImplementation(async (input: { readonly receiptId: string }) => input.receiptId === publicationReceipt.receiptId
    ? resolveResult(publicationReceipt)
    : resolveResult(requiredReceipt));
  return { publication, requiredReceipt, publicationReceipt };
}

describe('v10.3 witness publication authority join', () => {
  it('binds publication and required receipts to one indexed generation', async () => {
    const input = fixture();
    const verified = await openAdmissionWitnessPublicationAuthority({ authorityRoot: '/authority', publication: input.publication });
    expect(verified.publicationReceipt.receipt.receiptId).toBe(input.publicationReceipt.receiptId);
    expect(verified.requiredReceipts).toHaveLength(1);
    expect(Object.isFrozen(verified)).toBe(true);
    expect(isVerifiedAdmissionWitnessPublicationAuthority(verified)).toBe(true);
    expect(isVerifiedAdmissionWitnessPublicationAuthority(JSON.parse(JSON.stringify(verified)))).toBe(false);
  });

  it('fails closed when the completion selects an authority receipt absent from the indexed generation', async () => {
    const input = fixture();
    const broken = {
      ...input.publication,
      completion: {
        ...input.publication.completion,
        requiredToolReceiptIds: [sha('missing')],
        requiredToolReceiptSha256s: [sha('missing-hash')],
      },
    } as never;
    await expect(openAdmissionWitnessPublicationAuthority({ authorityRoot: '/authority', publication: broken })).rejects.toThrow(/not indexed|closed/i);
  });
});
