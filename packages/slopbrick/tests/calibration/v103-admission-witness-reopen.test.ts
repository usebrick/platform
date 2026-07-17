import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildCalibrationNestedPublicationHandoffV1,
  calibrationAdmissionInvocationIntentId,
  calibrationAdmissionInvocationIntentSha256,
  calibrationAdmissionSearchReceiptSha256,
  calibrationAdmissionSearchResultBundleId,
  calibrationAdmissionSearchResultBundleSha256,
  calibrationAdmissionSha256,
  calibrationAdmissionToolReceiptId,
  calibrationAdmissionToolReceiptSha256,
  type CalibrationAdmissionSearchResultBundleV1,
  type CalibrationAdmissionToolReceiptV1,
} from '@usebrick/core';
import { searchAdmissionWitness } from '../../src/calibration/v103/admission-cohort-witness';
import { publishAdmissionWitness } from '../../src/calibration/v103/admission-witness-publication';
import { openAdmissionWitnessPublication, isVerifiedAdmissionWitnessPublication } from '../../src/calibration/v103/admission-witness-reopen';

const H = 'a'.repeat(64);
const id = (value: unknown): string => calibrationAdmissionSha256(value);

function bundle(): CalibrationAdmissionSearchResultBundleV1 {
  const result = searchAdmissionWitness({ gate: 'smoke', eligibilitySnapshotSha256: H, verifiedContextSha256: H, candidates: [] });
  if (result.kind !== 'infeasibility') throw new Error('fixture should produce an infeasibility certificate');
  const intentBody = {
    version: 'v10.3-admission-invocation-intent-v1' as const,
    profileId: 'admission-census-v1' as const,
    profileSha256: H,
    action: 'witness:search',
    canonicalArgvSha256: id('argv'),
    inputSetSha256: id('input'),
    executableBehaviorSha256: id('behavior'),
  };
  const intentWithId = { ...intentBody, intentId: calibrationAdmissionInvocationIntentId(intentBody) };
  const intent = { ...intentWithId, intentSha256: calibrationAdmissionInvocationIntentSha256(intentWithId) };
  const receiptBody = {
    version: 'v10.3-admission-tool-receipt-v1' as const,
    invocationIntentId: intent.intentId,
    profileId: intent.profileId,
    profileSha256: intent.profileSha256,
    action: intent.action,
    canonicalArgvSha256: intent.canonicalArgvSha256,
    inputSetSha256: intent.inputSetSha256,
    executableBehaviorSha256: intent.executableBehaviorSha256,
    observedResourceUsage: { rssBytes: 1 },
    exitCode: 0,
    outputSetSha256: result.certificate.certificateSha256,
  };
  const receipt: CalibrationAdmissionToolReceiptV1 = { ...receiptBody, receiptId: calibrationAdmissionToolReceiptId(receiptBody) };
  const searchReceiptBody = {
    version: 'v10.3-admission-search-receipt-v1' as const,
    gate: 'smoke' as const,
    witnessPolicySha256: H,
    eligibilitySnapshotSha256: H,
    candidateOrderSha256: id([]),
    visitedNodes: result.visitedNodes,
    prunedNodes: result.prunedNodes,
    terminal: result.terminal,
    terminalArtifactSha256: result.certificate.certificateSha256,
    toolReceiptSha256: calibrationAdmissionToolReceiptSha256(receipt),
  };
  const searchReceipt = { ...searchReceiptBody, receiptId: calibrationAdmissionSearchReceiptSha256(searchReceiptBody) };
  const body = {
    version: 'v10.3-admission-search-result-bundle-v1' as const,
    gate: 'smoke' as const,
    verifiedContextSha256: H,
    eligibilitySnapshotSha256: H,
    invocationIntents: [intent],
    toolReceipts: [receipt],
    result: { kind: 'infeasibility' as const, certificate: result.certificate },
    searchReceipt,
  };
  const withId = { ...body, bundleId: calibrationAdmissionSearchResultBundleId(body) };
  return { ...withId, bundleSha256: calibrationAdmissionSearchResultBundleSha256(withId) };
}

async function publicationRequest(root: string, publishedBundle: CalibrationAdmissionSearchResultBundleV1) {
  const recoveryNonce = id({
    domain: 'v10.3-admission-witness-publication-recovery-nonce-v1',
    gate: 'smoke',
    kind: 'search_result',
    bundleSha256: publishedBundle.bundleSha256,
    invocationIntentId: H,
  });
  const transactionId = id({
    domain: 'v10.3-admission-witness-publication-transaction-v1',
    gate: 'smoke',
    kind: 'search_result',
    invocationIntentId: H,
    bundleSha256: publishedBundle.bundleSha256,
    recoveryNonce,
    expectedRoutingReferenceState: { kind: 'absent' },
  });
  const handoff = buildCalibrationNestedPublicationHandoffV1({
    parentTransactionId: transactionId,
    parentRecoveryNonce: recoveryNonce,
    childSlot: 'witness-publication',
    expectedCurrentStateSha256: H,
    childLockId: id('child-lock'),
    childLockSha256: id('child-lock-bytes'),
    childTransactionId: id('child-transaction'),
    childTransactionIntentSha256: id('child-intent'),
    state: { phase: 'started_fsynced' },
    childKind: 'tool_authority_infrastructure',
    childAction: 'tool-authority:publish',
    toolAuthorityObjectSetSha256: id('child-authority'),
  });
  const receipt = publishedBundle.toolReceipts[0]!;
  return {
    root,
    gate: 'smoke' as const,
    kind: 'search_result' as const,
    bundle: publishedBundle,
    invocationIntentId: H,
    namedPrimaryOutputProjectionSha256: id('projection'),
    publicationToolReceipt: { receiptId: id('publication-receipt'), receiptSha256: id('publication-receipt-bytes'), authorityIndexSha256: id('authority-index') },
    requiredToolReceipts: [{ receiptId: receipt.receiptId, receiptSha256: calibrationAdmissionToolReceiptSha256(receipt) }],
    nestedHandoff: handoff,
    recoveryNonce,
  };
}

describe('v10.3 witness publication reopener', () => {
  it('reopens only the exact hash-addressed bundle and completion', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-witness-reopen-'));
    try {
      const publishedBundle = bundle();
      const published = await publishAdmissionWitness(await publicationRequest(root, publishedBundle));
      const reference = JSON.parse(await readFile(published.routingReferencePath, 'utf8')) as unknown;

      const verified = await openAdmissionWitnessPublication({ root, gate: 'smoke', kind: 'search_result', reference });
      expect(verified.bundle.bundleSha256).toBe(published.bundleSha256);
      expect(verified.completion.completionSha256).toBe(published.publicationCompletionSha256);
      expect(Object.isFrozen(reference)).toBe(false);
      expect(Object.isFrozen(verified)).toBe(true);
      expect(isVerifiedAdmissionWitnessPublication(verified)).toBe(true);
      expect(isVerifiedAdmissionWitnessPublication(JSON.parse(JSON.stringify(verified)))).toBe(false);

      await writeFile(published.publicationCompletionPath, '{}');
      await expect(openAdmissionWitnessPublication({ root, gate: 'smoke', kind: 'search_result', reference })).rejects.toThrow(/canonical|invalid|hash/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a route that is not hash-addressed', async () => {
    await expect(openAdmissionWitnessPublication({ root: '/does/not/exist', gate: 'smoke', kind: 'search_result', reference: { version: 'v10.3-admission-witness-routing-reference-v1' } })).rejects.toThrow(/reference|invalid/i);
  });
});
