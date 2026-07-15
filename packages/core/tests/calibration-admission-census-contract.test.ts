import { describe, expect, it } from 'vitest';
import {
  calibrationAdmissionCohortWitnessSha256,
  calibrationAdmissionInfeasibilityCertificateSha256,
  calibrationAdmissionSearchReceiptSha256,
  calibrationAdmissionSearchResultBundleId,
  calibrationAdmissionSearchResultBundleSha256,
  calibrationAdmissionSha256,
  calibrationAdmissionWitnessReviewReceiptSha256,
  validateCalibrationAdmissionCohortWitnessV1,
  validateCalibrationAdmissionInfeasibilityCertificateV1,
  validateCalibrationAdmissionSearchReceiptV1,
  validateCalibrationAdmissionSearchResultBundleV1,
  validateCalibrationAdmissionWitnessReviewReceiptV1,
} from '../src/index';

const H = 'a'.repeat(64);

function id(n: number): string {
  return n.toString(16).padStart(64, '0');
}

function counts(units: readonly Record<string, unknown>[], field: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const unit of units) {
    const value = String(unit[field]);
    result[value] = (result[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function witness(gate: 'smoke' | 'canary' = 'smoke') {
  const perPolarity = gate === 'smoke' ? 100 : 5000;
  const units = Array.from({ length: perPolarity * 2 }, (_, index) => {
    const label = index < perPolarity ? 'verified_ai' : 'verified_human';
    const polarityIndex = index % perPolarity;
    const unit: Record<string, unknown> = {
      recordId: id(index + 1),
      contentClusterId: id(10_000 + index),
      label,
      language: polarityIndex % 2 === 0 ? 'typescript' : 'python',
      materialSourceId: id(20_000 + Math.floor(polarityIndex / 25)),
      repositoryId: id(30_000 + Math.floor(polarityIndex / 25)),
      familyId: id(40_000 + Math.floor(polarityIndex / 20)),
      split: (polarityIndex % 3 === 0 ? 'train' : polarityIndex % 3 === 1 ? 'validation' : 'test'),
      selectionKey: `${label}:${polarityIndex.toString().padStart(6, '0')}`,
    };
    return unit;
  });
  const proof = {
    verifiedAi: perPolarity,
    verifiedHuman: perPolarity,
    languageCountsSha256: calibrationAdmissionSha256(counts(units, 'language')),
    sourceCountsSha256: calibrationAdmissionSha256(counts(units, 'materialSourceId')),
    familyCountsSha256: calibrationAdmissionSha256(counts(units, 'familyId')),
    pairSplitChecksSha256: calibrationAdmissionSha256([]),
  };
  const value = {
    version: 'v10.3-admission-cohort-witness-v1' as const,
    gate,
    policyId: 'v10.3-admission-v1' as const,
    algorithm: 'lexicographic-bnb-feasibility-v1' as const,
    seed: 'slopbrick-v10.3-admission-review-v1',
    eligibilitySnapshotSha256: H,
    verifiedContextSha256: H,
    units,
    constraintProof: proof,
  };
  return { ...value, witnessSha256: calibrationAdmissionCohortWitnessSha256(value) };
}

function infeasibility(overrides: Record<string, unknown> = {}) {
  const value = {
    version: 'v10.3-admission-infeasibility-v1' as const,
    gate: 'smoke' as const,
    eligibilitySnapshotSha256: H,
    verifiedContextSha256: H,
    algorithm: 'lexicographic-bnb-feasibility-v1' as const,
    proven: true,
    proofKind: 'capacity_cut' as const,
    violatedConstraints: ['minimum_sources'],
    ...overrides,
  };
  return { ...value, certificateSha256: calibrationAdmissionInfeasibilityCertificateSha256(value) };
}

function searchBundle() {
  const value = witness();
  const receiptBody = {
    version: 'v10.3-admission-search-receipt-v1' as const,
    gate: 'smoke' as const,
    witnessPolicySha256: H,
    eligibilitySnapshotSha256: H,
    candidateOrderSha256: H,
    visitedNodes: 1,
    prunedNodes: 0,
    terminal: 'witness' as const,
    terminalArtifactSha256: value.witnessSha256,
    toolReceiptSha256: H,
  };
  const searchReceipt = { ...receiptBody, receiptId: calibrationAdmissionSearchReceiptSha256(receiptBody) };
  const bundleBody = {
    version: 'v10.3-admission-search-result-bundle-v1' as const,
    gate: 'smoke' as const,
    verifiedContextSha256: H,
    eligibilitySnapshotSha256: H,
    invocationIntents: [],
    toolReceipts: [],
    result: { kind: 'witness' as const, witness: value },
    searchReceipt,
  };
  const bundleId = calibrationAdmissionSearchResultBundleId(bundleBody);
  return { ...bundleBody, bundleId, bundleSha256: calibrationAdmissionSearchResultBundleSha256({ ...bundleBody, bundleId }) };
}

function reviewReceipt() {
  const value = {
    version: 'v10.3-admission-witness-review-receipt-v1' as const,
    witnessSha256: H,
    eligibilitySnapshotSha256: H,
    verifiedContextSha256: H,
    blindReviewReceiptId: 'b'.repeat(64),
    independentlyRegeneratedWitnessSha256s: [H, H] as [string, string],
    regenerationToolReceiptSha256s: ['c'.repeat(64), 'd'.repeat(64)] as [string, string],
    constraintChecksSha256: 'e'.repeat(64),
    constraintCheckToolReceiptSha256: 'f'.repeat(64),
    reviewerDecisionIds: ['1'.repeat(64), '2'.repeat(64)] as [string, string],
    decision: 'approved' as const,
  };
  return { ...value, receiptId: calibrationAdmissionWitnessReviewReceiptSha256(value) };
}

describe('Task 3A witness and census contracts', () => {
  it('accepts a deterministic diverse smoke witness and its canonical self-hash', () => {
    const value = witness();
    expect(validateCalibrationAdmissionCohortWitnessV1(value)).toEqual({ ok: true, errors: [] });
  });

  it('rejects witness mutations that preserve the outer hash', () => {
    const value = witness();
    const mutated = { ...value, units: [...value.units].reverse() };
    expect(validateCalibrationAdmissionCohortWitnessV1(mutated).ok).toBe(false);
    expect(validateCalibrationAdmissionCohortWitnessV1({ ...value, witnessSha256: H }).ok).toBe(false);
  });

  it('accepts proven certificates and rejects an unproven certificate claiming exhaustive proof', () => {
    expect(validateCalibrationAdmissionInfeasibilityCertificateV1(infeasibility())).toEqual({ ok: true, errors: [] });
    const invalid = infeasibility({ proven: false, proofKind: 'exhaustive_search' });
    expect(validateCalibrationAdmissionInfeasibilityCertificateV1(invalid).ok).toBe(false);
  });

  it('keeps search-limit certificates explicitly non-proven', () => {
    const value = infeasibility({ proven: false, proofKind: 'indeterminate_search_limit' });
    expect(validateCalibrationAdmissionInfeasibilityCertificateV1(value)).toEqual({ ok: true, errors: [] });
  });

  it('binds a search result bundle to its witness and receipt hashes', () => {
    const value = searchBundle();
    expect(validateCalibrationAdmissionSearchReceiptV1(value.searchReceipt)).toEqual({ ok: true, errors: [] });
    expect(validateCalibrationAdmissionSearchResultBundleV1(value)).toEqual({ ok: true, errors: [] });
    expect(validateCalibrationAdmissionSearchResultBundleV1({
      ...value,
      searchReceipt: { ...value.searchReceipt, eligibilitySnapshotSha256: 'b'.repeat(64) },
    }).ok).toBe(false);
  });

  it('allows two independent regenerations to be byte-identical while requiring distinct tool and decision receipts', () => {
    const value = reviewReceipt();
    expect(validateCalibrationAdmissionWitnessReviewReceiptV1(value)).toEqual({ ok: true, errors: [] });
    expect(validateCalibrationAdmissionWitnessReviewReceiptV1({
      ...value,
      regenerationToolReceiptSha256s: ['c'.repeat(64), 'c'.repeat(64)],
      receiptId: calibrationAdmissionWitnessReviewReceiptSha256({
        ...value,
        regenerationToolReceiptSha256s: ['c'.repeat(64), 'c'.repeat(64)],
      }),
    }).ok).toBe(false);
  });
});
