import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  calibrationAdmissionRegisterDeltaSha256,
  calibrationRegisterGenerationLockSha256,
  calibrationRegisterGenerationReceiptSha256,
  calibrationRegisterGenerationTransactionSha256,
  isCalibrationAdmissionRegisterDeltaV1,
  isCalibrationRegisterGenerationLockV1,
  isCalibrationRegisterGenerationReceiptV1,
  isCalibrationRegisterGenerationTransactionV1,
  validateCalibrationRegisterGenerationGraph,
  type CalibrationAdmissionAddedSourceV1,
  type CalibrationAdmissionRegisterDeltaV1,
  type CalibrationRegisterGenerationLockV1,
  type CalibrationRegisterGenerationReceiptV1,
  type CalibrationRegisterGenerationTransactionV1,
} from '../src/index';

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');

function addedSource(sourceId: string): CalibrationAdmissionAddedSourceV1 {
  return {
    sourceId,
    sourceGenerationSha256: sha(`${sourceId}:generation`),
    registerEntrySha256: sha(`${sourceId}:entry`),
    sourceReviewSha256: sha(`${sourceId}:review`),
    sourceAcquisitionAuthorizationId: `auth-${sourceId}`,
    sourceAcquisitionReceiptId: `receipt-${sourceId}`,
    sourceAcquisitionReceiptSha256: sha(`${sourceId}:acquisition`),
    materializationReceiptId: `materialization-${sourceId}`,
    materializationReceiptSha256: sha(`${sourceId}:materialization`),
  };
}

function buildFixture(sourceIds: readonly string[] = ['alpha']): {
  delta: CalibrationAdmissionRegisterDeltaV1;
  lock: CalibrationRegisterGenerationLockV1;
  transaction: CalibrationRegisterGenerationTransactionV1;
  receipt: CalibrationRegisterGenerationReceiptV1;
} {
  const addedSources = sourceIds.map(addedSource).sort((left, right) => left.sourceId.localeCompare(right.sourceId)) as CalibrationAdmissionRegisterDeltaV1['addedSources'];
  const deltaWithoutHash = {
    version: 'v10.3-admission-register-delta-v1' as const,
    deltaId: 'delta-1',
    generation: 1,
    parentRegisterSha256: sha('parent-register'),
    acquisitionRoundId: 'round-1',
    acquisitionRoundReceiptSha256: sha('round-receipt'),
    addedSources,
  };
  const delta = { ...deltaWithoutHash, deltaSha256: calibrationAdmissionRegisterDeltaSha256(deltaWithoutHash) };
  const lockWithoutHash = {
    version: 'v10.3-register-generation-lock-v1' as const,
    lockId: 'lock-1',
    intendedTransactionId: 'tx-1',
    invocationIntentId: sha('invocation'),
    expectedCurrentRegisterSha256: delta.parentRegisterSha256,
    nextRegisterSha256: sha('next-register'),
    deltaId: delta.deltaId,
    recoveryNonce: sha('recovery-nonce'),
  };
  const lock = { ...lockWithoutHash, lockSha256: calibrationRegisterGenerationLockSha256(lockWithoutHash) };
  const sourceGenerations = addedSources.map((source) => ({
    sourceId: source.sourceId,
    proposalId: `proposal-${source.sourceId}`,
    generationSha256: source.sourceGenerationSha256,
    artifactSetSha256: sha(`${source.sourceId}:artifacts`),
    generationStagingRelativePath: `staging/${source.sourceId}/${source.sourceGenerationSha256}`,
    generationFinalRelativePath: `sources/${source.sourceId}/generations/${source.sourceGenerationSha256}/source-generation.json`,
    generationsParentRelativePath: `sources/${source.sourceId}/generations`,
    currentPointerTemporaryRelativePath: `sources/${source.sourceId}/current.tmp.json`,
    currentPointerFinalRelativePath: `sources/${source.sourceId}/current.json`,
  }));
  const transactionWithoutHash = {
    version: 'v10.3-register-generation-transaction-v1' as const,
    transactionId: lock.intendedTransactionId,
    lockSha256: lock.lockSha256,
    invocationIntentId: lock.invocationIntentId,
    expectedCurrentRegisterSha256: lock.expectedCurrentRegisterSha256,
    nextRegisterSha256: lock.nextRegisterSha256,
    deltaId: delta.deltaId,
    sourceGenerations: sourceGenerations as CalibrationRegisterGenerationTransactionV1['sourceGenerations'],
    immutableGenerationRelativePath: `register-generations/${lock.nextRegisterSha256}/register.json`,
    currentRegisterTemporaryRelativePath: 'register.current.tmp.json',
    state: {
      phase: 'complete' as const,
      toolReceiptId: 'tool-receipt-1',
      toolReceiptSha256: sha('tool-receipt'),
      toolAuthorityIndexSha256: sha('tool-index'),
      toolAuthorityPublicationTransactionId: 'tool-publication-1',
      generationReceiptId: 'generation-receipt-1',
      generationReceiptSha256: sha('generation-receipt'),
      generationReceiptTemporaryRelativePath: 'transactions/tx-1/generation-receipt.tmp.json',
      generationReceiptFinalRelativePath: 'register-generations/receipts/generation-receipt-1.json',
    },
  };
  const transaction = { ...transactionWithoutHash, transactionSha256: calibrationRegisterGenerationTransactionSha256(transactionWithoutHash) };
  const receiptWithoutHash = {
    version: 'v10.3-register-generation-receipt-v1' as const,
    receiptId: 'generation-receipt-1',
    generation: delta.generation,
    deltaId: delta.deltaId,
    sourceGenerationSha256s: sourceGenerations.map((source) => source.generationSha256) as CalibrationRegisterGenerationReceiptV1['sourceGenerationSha256s'],
    parentRegisterSha256: delta.parentRegisterSha256,
    nextRegisterSha256: lock.nextRegisterSha256,
    lockSha256: lock.lockSha256,
    transactionId: transaction.transactionId,
    toolReceiptSha256: sha('tool-receipt'),
  };
  const receipt = { ...receiptWithoutHash, receiptSha256: calibrationRegisterGenerationReceiptSha256(receiptWithoutHash) };
  // The complete state is the final cross-object receipt projection.  Keep
  // its fields bound to the receipt hash/ID after the receipt is derived.
  const completedTransaction = {
    ...transaction,
    state: {
      ...transaction.state,
      generationReceiptSha256: receipt.receiptSha256,
    },
  } as CalibrationRegisterGenerationTransactionV1;
  const finalTransaction = {
    ...completedTransaction,
    transactionSha256: calibrationRegisterGenerationTransactionSha256({ ...completedTransaction, transactionSha256: undefined }),
  } as CalibrationRegisterGenerationTransactionV1;
  const finalReceipt = { ...receipt, transactionId: finalTransaction.transactionId };
  return {
    delta,
    lock,
    transaction: finalTransaction,
    receipt: { ...finalReceipt, receiptSha256: calibrationRegisterGenerationReceiptSha256({ ...finalReceipt, receiptSha256: undefined }) },
  };
}

describe('v10.3 register-generation authority contracts', () => {
  it('accepts one- and two-source handoffs and binds the complete graph', () => {
    for (const sourceIds of [['alpha'], ['alpha', 'beta']] as const) {
      const fixture = buildFixture(sourceIds);
      expect(isCalibrationAdmissionRegisterDeltaV1(fixture.delta)).toBe(true);
      expect(isCalibrationRegisterGenerationLockV1(fixture.lock)).toBe(true);
      expect(isCalibrationRegisterGenerationTransactionV1(fixture.transaction)).toBe(true);
      expect(isCalibrationRegisterGenerationReceiptV1(fixture.receipt)).toBe(true);
      expect(validateCalibrationRegisterGenerationGraph(fixture.delta, fixture.lock, fixture.transaction, fixture.receipt)).toEqual({ ok: true, errors: [] });
    }
  });

  it('rejects delta self-hash, duplicate/missing source fields, and future-link mutations', () => {
    const fixture = buildFixture(['alpha', 'beta']);
    expect(isCalibrationAdmissionRegisterDeltaV1({ ...fixture.delta, deltaSha256: sha('tampered') })).toBe(false);
    expect(isCalibrationAdmissionRegisterDeltaV1({ ...fixture.delta, addedSources: [fixture.delta.addedSources[0]!, fixture.delta.addedSources[0]!] as CalibrationAdmissionRegisterDeltaV1['addedSources'], deltaSha256: calibrationAdmissionRegisterDeltaSha256({ ...fixture.delta, addedSources: [fixture.delta.addedSources[0]!, fixture.delta.addedSources[0]!] }) })).toBe(false);
    const missing = { ...fixture.delta.addedSources[0]! } as Record<string, unknown>;
    delete missing.sourceReviewSha256;
    expect(isCalibrationAdmissionRegisterDeltaV1({ ...fixture.delta, addedSources: [missing] as unknown as CalibrationAdmissionRegisterDeltaV1['addedSources'], deltaSha256: calibrationAdmissionRegisterDeltaSha256({ ...fixture.delta, addedSources: [missing] }) })).toBe(false);
    expect(validateCalibrationRegisterGenerationGraph(fixture.delta, fixture.lock, { ...fixture.transaction, nextRegisterSha256: fixture.delta.parentRegisterSha256, transactionSha256: calibrationRegisterGenerationTransactionSha256({ ...fixture.transaction, nextRegisterSha256: fixture.delta.parentRegisterSha256 }) }, fixture.receipt).ok).toBe(false);
  });

  it('rejects source-generation substitution between the delta and downstream receipt', () => {
    const fixture = buildFixture(['alpha', 'beta']);
    const substituted = sha('substituted-generation');
    const transaction = {
      ...fixture.transaction,
      sourceGenerations: fixture.transaction.sourceGenerations.map((source, index) => index === 0 ? { ...source, generationSha256: substituted } : source),
    } as CalibrationRegisterGenerationTransactionV1;
    const transactionWithHash = { ...transaction, transactionSha256: calibrationRegisterGenerationTransactionSha256({ ...transaction, transactionSha256: undefined }) };
    const receipt = {
      ...fixture.receipt,
      sourceGenerationSha256s: transactionWithHash.sourceGenerations.map((source) => source.generationSha256) as CalibrationRegisterGenerationReceiptV1['sourceGenerationSha256s'],
    };
    const receiptWithHash = { ...receipt, receiptSha256: calibrationRegisterGenerationReceiptSha256({ ...receipt, receiptSha256: undefined }) };
    expect(validateCalibrationRegisterGenerationGraph(fixture.delta, fixture.lock, transactionWithHash, receiptWithHash).ok).toBe(false);
  });

  it('requires complete receipt metadata and rejects pre-output or mismatched projections', () => {
    const fixture = buildFixture();
    const preOutput = { ...fixture.transaction, state: { phase: 'intent_fsynced' as const } };
    const preOutputWithHash = { ...preOutput, transactionSha256: calibrationRegisterGenerationTransactionSha256({ ...preOutput, transactionSha256: undefined }) };
    expect(validateCalibrationRegisterGenerationGraph(fixture.delta, fixture.lock, preOutputWithHash, fixture.receipt).ok).toBe(false);
    const mismatched = {
      ...fixture.transaction,
      state: { ...fixture.transaction.state, generationReceiptId: 'other-receipt' },
    } as CalibrationRegisterGenerationTransactionV1;
    const mismatchedWithHash = { ...mismatched, transactionSha256: calibrationRegisterGenerationTransactionSha256({ ...mismatched, transactionSha256: undefined }) };
    expect(validateCalibrationRegisterGenerationGraph(fixture.delta, fixture.lock, mismatchedWithHash, fixture.receipt).ok).toBe(false);
  });

  it('rejects unsafe paths, duplicate paths, and phase metadata omissions', () => {
    const fixture = buildFixture();
    const unsafePath = { ...fixture.transaction, immutableGenerationRelativePath: '../escape/register.json' };
    expect(isCalibrationRegisterGenerationTransactionV1({ ...unsafePath, transactionSha256: calibrationRegisterGenerationTransactionSha256(unsafePath) })).toBe(false);
    const duplicatePath = { ...fixture.transaction, sourceGenerations: [{ ...fixture.transaction.sourceGenerations[0]!, currentPointerFinalRelativePath: fixture.transaction.sourceGenerations[0]!.generationFinalRelativePath }] as CalibrationRegisterGenerationTransactionV1['sourceGenerations'] };
    expect(isCalibrationRegisterGenerationTransactionV1({ ...duplicatePath, transactionSha256: calibrationRegisterGenerationTransactionSha256(duplicatePath) })).toBe(false);
    const incompletePhase = { ...fixture.transaction, state: { phase: 'tool_receipt_indexed' as const } };
    expect(isCalibrationRegisterGenerationTransactionV1({ ...incompletePhase, transactionSha256: calibrationRegisterGenerationTransactionSha256(incompletePhase) })).toBe(false);
    const priorCollision = {
      ...fixture.transaction,
      sourceGenerations: [{ ...fixture.transaction.sourceGenerations[0]!, priorGenerationRelativePath: fixture.transaction.immutableGenerationRelativePath }] as CalibrationRegisterGenerationTransactionV1['sourceGenerations'],
    };
    expect(isCalibrationRegisterGenerationTransactionV1({ ...priorCollision, transactionSha256: calibrationRegisterGenerationTransactionSha256(priorCollision) })).toBe(false);
    const roleMismatch = {
      ...fixture.transaction,
      sourceGenerations: [{ ...fixture.transaction.sourceGenerations[0]!, generationFinalRelativePath: `sources/${fixture.transaction.sourceGenerations[0]!.sourceId}/other/${fixture.transaction.sourceGenerations[0]!.generationSha256}/source-review.json` }] as CalibrationRegisterGenerationTransactionV1['sourceGenerations'],
    };
    expect(isCalibrationRegisterGenerationTransactionV1({ ...roleMismatch, transactionSha256: calibrationRegisterGenerationTransactionSha256(roleMismatch) })).toBe(false);
    const extraGenerationPath = {
      ...fixture.transaction,
      sourceGenerations: [{ ...fixture.transaction.sourceGenerations[0]!, generationFinalRelativePath: `${fixture.transaction.sourceGenerations[0]!.generationFinalRelativePath}/extra` }] as CalibrationRegisterGenerationTransactionV1['sourceGenerations'],
    };
    expect(isCalibrationRegisterGenerationTransactionV1({ ...extraGenerationPath, transactionSha256: calibrationRegisterGenerationTransactionSha256(extraGenerationPath) })).toBe(false);
    const extraRegisterPath = { ...fixture.transaction, immutableGenerationRelativePath: `register-generations/${fixture.transaction.nextRegisterSha256}/nested/register.json` };
    expect(isCalibrationRegisterGenerationTransactionV1({ ...extraRegisterPath, transactionSha256: calibrationRegisterGenerationTransactionSha256(extraRegisterPath) })).toBe(false);
  });
});
