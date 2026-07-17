import { describe, expect, it, vi } from 'vitest';

vi.mock('@usebrick/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@usebrick/core')>();
  return {
    ...actual,
    isCalibrationAdmissionCensusV103: () => true,
    isCalibrationAdmissionSearchResultBundleV1: () => true,
    isCalibrationAdmissionWitnessReviewBundleV1: () => true,
    calibrationAdmissionSearchReceiptSha256: (value: { readonly receiptId: string }) => value.receiptId,
    calibrationAdmissionToolReceiptSha256: (value: { readonly receiptSha256: string }) => value.receiptSha256,
  };
});

vi.mock('../../src/calibration/v103/admission-context', () => ({
  isVerifiedAdmissionContext: (value: unknown): boolean => typeof value === 'object' && value !== null && (value as { readonly __verified?: boolean }).__verified === true,
}));

vi.mock('../../src/calibration/v103/admission-census', () => ({
  buildAdmissionCensus: vi.fn(),
}));

vi.mock('../../src/calibration/v103/admission-witness-reopen', () => ({
  isVerifiedAdmissionWitnessPublication: (value: unknown): boolean => typeof value === 'object' && value !== null && (value as { readonly __verified?: boolean }).__verified === true,
}));

import { buildAdmissionCensus } from '../../src/calibration/v103/admission-census';
import {
  isVerifiedReadyAdmissionCensus,
  verifyReadyAdmissionCensus,
} from '../../src/calibration/v103/admission-ready-census';

const H = 'a'.repeat(64);
const P = 'b'.repeat(64);
const T = 'd'.repeat(64);

function fixture() {
  const context = { __verified: true, contextSha256: H } as never;
  const search = (gate: 'smoke' | 'canary') => ({
    gate,
    verifiedContextSha256: H,
    eligibilitySnapshotSha256: H,
    bundleSha256: `${gate === 'smoke' ? 'c' : 'd'}`.repeat(64),
    invocationIntents: [{ intentId: 'i' }],
    toolReceipts: [{ invocationIntentId: 'i', receiptSha256: T }],
    result: { kind: 'witness', witness: { witnessSha256: 'w'.repeat(64) } },
    searchReceipt: { eligibilitySnapshotSha256: H, toolReceiptSha256: T, receiptId: 'r' },
  });
  const smoke = search('smoke');
  const canary = search('canary');
  const review = {
    gate: 'smoke',
    verifiedContextSha256: H,
    eligibilitySnapshotSha256: H,
    bundleSha256: 'e'.repeat(64),
    searchResultBundle: smoke,
    witnessReviewReceipt: { decision: 'approved', witnessSha256: 'w'.repeat(64) },
  };
  const publication = { publicationCompletionSha256: P, publicationCompletionRelativePath: `review/admission/witnesses/smoke/publication-completions/${P}.json` };
  const census = {
    eligibilitySnapshotSha256: H,
    smoke: {
      ready: true,
      countReady: true,
      deficitVerifiedAi: 0,
      deficitVerifiedHuman: 0,
      gateFailures: [],
      witnessSha256: 'w'.repeat(64),
      searchResultBundleSha256: smoke.bundleSha256,
      searchResultBundleRelativePath: `review/admission/witnesses/smoke/search-results/${smoke.bundleSha256}.json`,
      searchResultPublicationCompletionSha256: P,
      searchResultPublicationCompletionRelativePath: `review/admission/witnesses/smoke/publication-completions/${P}.json`,
      witnessReviewBundleSha256: review.bundleSha256,
      witnessReviewBundleRelativePath: `review/admission/witnesses/smoke/witness-reviews/${review.bundleSha256}.json`,
      witnessReviewPublicationCompletionSha256: P,
      witnessReviewPublicationCompletionRelativePath: publication.publicationCompletionRelativePath,
    },
    canary: {
      ready: false,
      countReady: false,
      deficitVerifiedAi: 1,
      deficitVerifiedHuman: 1,
      gateFailures: ['missing'],
      searchResultBundleSha256: canary.bundleSha256,
      searchResultPublicationCompletionSha256: P,
      searchResultPublicationCompletionRelativePath: `review/admission/witnesses/canary/publication-completions/${P}.json`,
    },
  };
  const buildInput = {
    context,
    search: {
      smoke: { bundle: smoke, publicationCompletionSha256: P, publicationCompletionRelativePath: census.smoke.searchResultPublicationCompletionRelativePath },
      canary: { bundle: canary, publicationCompletionSha256: P, publicationCompletionRelativePath: census.canary.searchResultPublicationCompletionRelativePath },
    },
    witnessReviews: { smoke: review },
    witnessReviewPublications: { smoke: publication },
  } as never;
  const searchPublication = {
    __verified: true,
    gate: 'smoke',
    kind: 'search_result',
    bundle: smoke,
    reference: {
      bundleRelativePath: census.smoke.searchResultBundleRelativePath,
      publicationCompletionRelativePath: publication.publicationCompletionRelativePath,
      publicationCompletionSha256: P,
    },
  } as never;
  const witnessReviewPublication = {
    __verified: true,
    gate: 'smoke',
    kind: 'witness_review',
    bundle: review,
    reference: {
      bundleRelativePath: census.smoke.witnessReviewBundleRelativePath,
      publicationCompletionRelativePath: publication.publicationCompletionRelativePath,
      publicationCompletionSha256: P,
    },
  } as never;
  vi.mocked(buildAdmissionCensus).mockReturnValue({ ok: true, census, eligibilitySnapshotSha256: H } as never);
  return { context, census, review, buildInput, searchPublication, witnessReviewPublication };
}

describe('v10.3 ready census positive binding', () => {
  it('brands only the rebuilt gate and rejects a serialized result', async () => {
    const input = fixture();
    const result = await verifyReadyAdmissionCensus({
      context: input.context,
      census: input.census,
      gate: 'smoke',
      buildInput: input.buildInput,
      witnessReviewBundle: input.review,
      searchPublication: input.searchPublication,
      witnessReviewPublication: input.witnessReviewPublication,
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result.ready)).toBe(true);
    expect(result.ready.gate).toBe('smoke');
    expect(isVerifiedReadyAdmissionCensus(result.ready)).toBe(true);
    expect(isVerifiedReadyAdmissionCensus(JSON.parse(JSON.stringify(result.ready)))).toBe(false);
  });

  it('rejects a review publication that is not hash-addressed', async () => {
    const input = fixture();
    const broken = { ...input.buildInput, witnessReviewPublications: { smoke: { publicationCompletionSha256: P, publicationCompletionRelativePath: 'witnesses/smoke/review.json' } } } as never;
    const result = await verifyReadyAdmissionCensus({ context: input.context, census: input.census, gate: 'smoke', buildInput: broken, witnessReviewBundle: input.review, searchPublication: input.searchPublication, witnessReviewPublication: input.witnessReviewPublication });
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors.join('; ')).toContain('hash-addressed');
  });
});
