import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
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
import {
  AdmissionWitnessPublicationPendingError,
  publishAdmissionWitness,
  recoverAdmissionWitnessPublication,
} from '../../src/calibration/v103/admission-witness-publication';

const H = 'a'.repeat(64);

function id(value: string): string { return calibrationAdmissionSha256(value); }

function searchBundle(): CalibrationAdmissionSearchResultBundleV1 {
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

function request(root: string, bundle = searchBundle(), phaseHook?: (phase: string) => void) {
  const nonce = id({ domain: 'nonce', bundleSha256: bundle.bundleSha256 });
  const transactionId = id({
    domain: 'v10.3-admission-witness-publication-transaction-v1',
    gate: 'smoke',
    kind: 'search_result',
    invocationIntentId: H,
    bundleSha256: bundle.bundleSha256,
    recoveryNonce: nonce,
    expectedRoutingReferenceState: { kind: 'absent' },
  });
  const nestedHandoff = buildCalibrationNestedPublicationHandoffV1({
    parentTransactionId: transactionId,
    parentRecoveryNonce: nonce,
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
  const receipt = bundle.toolReceipts[0]!;
  return {
    root,
    gate: 'smoke' as const,
    kind: 'search_result' as const,
    bundle,
    invocationIntentId: H,
    namedPrimaryOutputProjectionSha256: id('projection'),
    publicationToolReceipt: { receiptId: id('publication-receipt'), receiptSha256: id('publication-receipt-bytes'), authorityIndexSha256: id('authority-index') },
    requiredToolReceipts: [{ receiptId: receipt.receiptId, receiptSha256: calibrationAdmissionToolReceiptSha256(receipt) }],
    nestedHandoff,
    recoveryNonce: nonce,
    ...(phaseHook === undefined ? {} : { phaseHook }),
  };
}

describe('v10.3 witness publication', () => {
  it('publishes bundle, completion, and routing reference with no journals left', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-witness-pub-'));
    const result = await publishAdmissionWitness(request(root));
    expect(result.complete).toBe(true);
    expect(await stat(result.bundlePath)).toBeDefined();
    expect(await stat(result.publicationCompletionPath)).toBeDefined();
    expect(await stat(result.routingReferencePath)).toBeDefined();
    await expect(stat(result.lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(result.transactionPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('replays the same bytes idempotently and preserves unrelated files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-witness-idempotent-'));
    const unrelated = join(root, 'review', 'admission', 'witnesses', 'smoke', 'keep.txt');
    const first = await publishAdmissionWitness(request(root));
    await writeFile(unrelated, 'keep');
    const second = await publishAdmissionWitness(request(root));
    expect(second.transactionId).toBe(first.transactionId);
    expect(await readFile(unrelated, 'utf8')).toBe('keep');
  });

  it('leaves a recoverable journal at a fault boundary and resumes once', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-witness-recovery-'));
    const base = request(root);
    const faulted = { ...base, phaseHook: (phase: string) => { if (phase === 'completion-promoted') throw new Error('fault'); } };
    await expect(publishAdmissionWitness(faulted)).rejects.toBeInstanceOf(AdmissionWitnessPublicationPendingError);
    const recovered = await recoverAdmissionWitnessPublication({ ...base, acknowledgeNoLiveWriter: true, fromLock: true });
    expect(recovered.complete).toBe(true);
    await expect(stat(recovered.lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('recovers after routing promotion without rebinding to the promoted route', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-witness-routing-recovery-'));
    const base = request(root);
    const faulted = { ...base, phaseHook: (phase: string) => { if (phase === 'routing-reference-promoted') throw new Error('fault'); } };
    await expect(publishAdmissionWitness(faulted)).rejects.toBeInstanceOf(AdmissionWitnessPublicationPendingError);
    const recovered = await recoverAdmissionWitnessPublication({ ...base, acknowledgeNoLiveWriter: true, transactionId: base.nestedHandoff.parentTransactionId });
    expect(recovered.complete).toBe(true);
    await expect(stat(recovered.lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('cleans a lock-only journal only with the explicit recovery acknowledgement', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-witness-lock-only-'));
    const base = request(root);
    const faulted = { ...base, phaseHook: (phase: string) => { if (phase === 'lock-fsynced') throw new Error('fault'); } };
    await expect(publishAdmissionWitness(faulted)).rejects.toBeInstanceOf(AdmissionWitnessPublicationPendingError);
    const recovered = await recoverAdmissionWitnessPublication({ ...base, acknowledgeNoLiveWriter: true, fromLock: true });
    expect(recovered.status).toBe('lock-only');
    expect(recovered.complete).toBe(false);
    await expect(stat(recovered.lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a different bundle at the fixed routing projection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-witness-collision-'));
    await publishAdmissionWitness(request(root));
    const changed = searchBundle();
    const altered = { ...changed, eligibilitySnapshotSha256: id('different') };
    expect(altered.bundleSha256).toBe(changed.bundleSha256);
    await expect(publishAdmissionWitness(request(root, altered))).rejects.toThrow(/bundle|routing|transaction/);
  });
});
