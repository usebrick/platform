import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, stat, symlink, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionInitialSourceIdsSha256,
  calibrationAdmissionSourceRegisterSha256,
  type CalibrationAdmissionRegisterDeltaV1,
  type CalibrationAdmissionSourceRegisterV1,
} from '@usebrick/core';
import {
  RegisterPublicationPendingError,
  publishRegisterGeneration,
  recoverRegisterGeneration,
} from '../../src/calibration/v103/admission-register-publication';

const roots: string[] = [];
const sha = (value: string): string => createHash('sha256').update(value).digest('hex');

function sourceEntries(extraSourceIds: readonly string[] = []) {
  const rows = [
    {
      sourceId: 'legacy-ai-slop-baseline', kind: 'material_source' as const, materialPartition: 'baseline' as const,
      contributesToAdditiveCounts: true, childMaterialSourceIds: [], registerEvidenceIds: ['evidence-baseline'], inventoryCandidateUnits: 58089,
    },
    ...Array.from({ length: 317 }, (_, index) => ({
      sourceId: `legacy-repo-${String(index).padStart(3, '0')}`, kind: 'material_source' as const, materialPartition: 'repository' as const,
      contributesToAdditiveCounts: true, childMaterialSourceIds: [], registerEvidenceIds: [`evidence-repo-${String(index).padStart(3, '0')}`], inventoryCandidateUnits: 1243 + (index < 262 ? 1 : 0),
    })),
    ...Array.from({ length: 10 }, (_, index) => ({
      sourceId: `benchmark-${String(index).padStart(2, '0')}`, kind: 'material_source' as const, materialPartition: 'non_selected' as const,
      contributesToAdditiveCounts: true, childMaterialSourceIds: [], registerEvidenceIds: [`evidence-benchmark-${String(index).padStart(2, '0')}`], inventoryCandidateUnits: 0,
    })),
    ...extraSourceIds.map((sourceId) => ({
      sourceId, kind: 'material_source' as const, materialPartition: 'non_selected' as const,
      contributesToAdditiveCounts: true, childMaterialSourceIds: [], registerEvidenceIds: [`evidence-${sourceId}`], inventoryCandidateUnits: 0,
    })),
  ];
  const aggregate = {
    sourceId: 'legacy-v5-inventory', kind: 'aggregate_inventory' as const, materialPartition: 'aggregate' as const,
    contributesToAdditiveCounts: false,
    childMaterialSourceIds: rows.filter((row) => row.inventoryCandidateUnits > 0).map((row) => row.sourceId).sort(),
    registerEvidenceIds: ['evidence-aggregate'], inventoryCandidateUnits: 452382,
  };
  return [...rows, aggregate].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

function register(generation: number, parentRegisterSha256?: string, appliedDeltaIds: readonly string[] = [], extraSourceIds: readonly string[] = []): CalibrationAdmissionSourceRegisterV1 {
  const entries = sourceEntries(extraSourceIds);
  const withoutHash = {
    version: 'v10.3-admission-source-register-v1' as const,
    generation,
    ...(parentRegisterSha256 === undefined ? {} : { parentRegisterSha256 }),
    initialSourceIdsSha256: calibrationAdmissionInitialSourceIdsSha256(entries.map((entry) => entry.sourceId)),
    appliedDeltaIds: [...appliedDeltaIds],
    rawDiscoveryPopulation: { declaredAi: 635830 as const, declaredHuman: 842520 as const, closedWorld: false as const },
    selectedCoverage: { total: 452382 as const, baselineMaterialUnits: 58089 as const, repositoryMaterialUnits: 394293 as const },
    entries,
  };
  return { ...withoutHash, registerSha256: calibrationAdmissionSourceRegisterSha256(withoutHash) };
}

function delta(sourceIds: readonly string[], bytesBySource: ReadonlyMap<string, Buffer>, parentRegisterSha256: string): CalibrationAdmissionRegisterDeltaV1 {
  const addedSources = sourceIds.map((sourceId) => ({
    sourceId,
    sourceGenerationSha256: sha256(bytesBySource.get(sourceId)!),
    registerEntrySha256: sha(`entry:${sourceId}`),
    sourceReviewSha256: sha(`review:${sourceId}`),
    sourceAcquisitionAuthorizationId: `auth-${sourceId}`,
    sourceAcquisitionReceiptId: `receipt-${sourceId}`,
    sourceAcquisitionReceiptSha256: sha(`acquisition:${sourceId}`),
    materializationReceiptId: `materialization-${sourceId}`,
    materializationReceiptSha256: sha(`materialization-bytes:${sourceId}`),
  })).sort((left, right) => left.sourceId.localeCompare(right.sourceId)) as CalibrationAdmissionRegisterDeltaV1['addedSources'];
  const withoutHash = {
    version: 'v10.3-admission-register-delta-v1' as const,
    deltaId: `delta-${sourceIds.join('-')}`,
    generation: 1,
    parentRegisterSha256,
    acquisitionRoundId: 'round-fixture-1',
    acquisitionRoundReceiptSha256: sha('round-receipt'),
    addedSources,
  };
  return { ...withoutHash, deltaSha256: sha256(Buffer.from(calibrationAdmissionCanonicalJson(withoutHash), 'utf8')) };
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function toolReceipt() {
  return {
    receiptId: 'tool-receipt-fixture',
    receiptSha256: sha('tool-receipt'),
    authorityIndexSha256: sha('tool-index'),
    publicationTransactionId: 'tool-publication-fixture',
  };
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'slopbrick-register-publication-'));
  roots.push(root);
  await mkdir(join(root, 'review', 'admission'), { recursive: true });
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('v10.3 register publication/recovery', () => {
  it('publishes one source atomically and preserves unknown files', async () => {
    const root = await setup();
    const base = register(0);
    const bytesBySource = new Map([['added-source', Buffer.from('{"source":"one"}\n', 'utf8')]]);
    const change = delta(['added-source'], bytesBySource, base.registerSha256);
    const next = register(1, base.registerSha256, [change.deltaId], ['added-source']);
    await writeFile(join(root, 'review', 'admission', 'keep.txt'), 'keep me');
    await writeFile(join(root, 'review', 'admission', 'source-register-v1.json'), calibrationAdmissionCanonicalJson(base), { flag: 'wx' });
    const result = await publishRegisterGeneration({ root, delta: change, nextRegister: next, sourceGenerations: [{ sourceId: 'added-source', bytes: bytesBySource.get('added-source')! }], invocationIntentId: sha('invocation'), toolReceipt: toolReceipt(), recoveryNonce: sha('nonce') });
    expect(result.complete).toBe(true);
    expect(await readFile(join(root, 'review', 'admission', 'keep.txt'), 'utf8')).toBe('keep me');
    expect(await readFile(join(root, 'review', 'admission', 'sources', 'added-source', 'current.json'), 'utf8')).toContain('added-source');
    expect(await stat(join(root, 'review', 'admission', 'register-generations', next.registerSha256, 'register.json'))).toBeTruthy();
    await expect(stat(result.lockPath)).rejects.toThrow();
    await expect(stat(result.transactionPath)).rejects.toThrow();
  });

  it('recovers a fault after source promotion and rejects a tampered journal', async () => {
    const root = await setup();
    const base = register(0);
    const bytesBySource = new Map([['added-source', Buffer.from('{"source":"recover"}\n', 'utf8')]]);
    const change = delta(['added-source'], bytesBySource, base.registerSha256);
    const next = register(1, base.registerSha256, [change.deltaId], ['added-source']);
    await writeFile(join(root, 'review', 'admission', 'source-register-v1.json'), calibrationAdmissionCanonicalJson(base));
    const nonce = sha('recovery');
    let pending: RegisterPublicationPendingError | undefined;
    try {
      await publishRegisterGeneration({ root, delta: change, nextRegister: next, sourceGenerations: [{ sourceId: 'added-source', bytes: bytesBySource.get('added-source')! }], invocationIntentId: sha('invocation-2'), toolReceipt: toolReceipt(), recoveryNonce: nonce, phaseHook: (phase) => { if (phase === 'source-generation-promoted') throw new Error('fault'); } });
      throw new Error('expected a pending publication');
    } catch (error) {
      expect(error).toBeInstanceOf(RegisterPublicationPendingError);
      pending = error as RegisterPublicationPendingError;
    }
    expect(pending?.result.recoveryRequired).toBe(true);
    const transactionBytes = JSON.parse(await readFile(pending!.result.transactionPath, 'utf8')) as Record<string, unknown>;
    await writeFile(pending!.result.transactionPath, JSON.stringify({ ...transactionBytes, nextRegisterSha256: sha('tampered') }));
    await expect(recoverRegisterGeneration({ root, recoveryNonce: nonce, toolReceipt: toolReceipt(), acknowledgeNoLiveWriter: true })).rejects.toThrow(/invalid|binding|transaction/i);
  });

  it('recovers the exact journal idempotently after a register-output fault', async () => {
    const root = await setup();
    const base = register(0);
    const bytesBySource = new Map([['added-source', Buffer.from('{"source":"idempotent"}\n', 'utf8')]]);
    const change = delta(['added-source'], bytesBySource, base.registerSha256);
    const next = register(1, base.registerSha256, [change.deltaId], ['added-source']);
    await writeFile(join(root, 'review', 'admission', 'source-register-v1.json'), calibrationAdmissionCanonicalJson(base));
    const nonce = sha('recovery-idempotent');
    let pending: RegisterPublicationPendingError | undefined;
    try {
      await publishRegisterGeneration({ root, delta: change, nextRegister: next, sourceGenerations: [{ sourceId: 'added-source', bytes: bytesBySource.get('added-source')! }], invocationIntentId: sha('invocation-3'), toolReceipt: toolReceipt(), recoveryNonce: nonce, phaseHook: (phase) => { if (phase === 'register-promoted') throw new Error('fault-register'); } });
      throw new Error('expected a pending publication');
    } catch (error) {
      expect(error).toBeInstanceOf(RegisterPublicationPendingError);
      pending = error as RegisterPublicationPendingError;
    }
    expect(pending?.result.recoveryRequired).toBe(true);
    const recovered = await recoverRegisterGeneration({ root, recoveryNonce: nonce, toolReceipt: toolReceipt(), acknowledgeNoLiveWriter: true });
    expect(recovered.complete).toBe(true);
    await expect(stat(recovered.lockPath)).rejects.toThrow();
    const second = await recoverRegisterGeneration({ root, recoveryNonce: nonce, toolReceipt: toolReceipt(), acknowledgeNoLiveWriter: true }).catch((error: unknown) => error);
    expect(second).toBeInstanceOf(Error);
  });

  it('publishes a two-source generation without mixing source pointers', async () => {
    const root = await setup();
    const base = register(0);
    const bytesBySource = new Map([
      ['added-source-a', Buffer.from('{"source":"a"}\n', 'utf8')],
      ['added-source-b', Buffer.from('{"source":"b"}\n', 'utf8')],
    ]);
    const change = delta(['added-source-a', 'added-source-b'], bytesBySource, base.registerSha256);
    const next = register(1, base.registerSha256, [change.deltaId], ['added-source-a', 'added-source-b']);
    await writeFile(join(root, 'review', 'admission', 'source-register-v1.json'), calibrationAdmissionCanonicalJson(base));
    const result = await publishRegisterGeneration({
      root,
      delta: change,
      nextRegister: next,
      sourceGenerations: [...bytesBySource.entries()].map(([sourceId, bytes]) => ({ sourceId, bytes })),
      invocationIntentId: sha('invocation-two'),
      toolReceipt: toolReceipt(),
      recoveryNonce: sha('nonce-two'),
    });
    expect(result.complete).toBe(true);
    for (const sourceId of bytesBySource.keys()) {
      const pointer = await readFile(join(root, 'review', 'admission', 'sources', sourceId, 'current.json'), 'utf8');
      expect(pointer).toContain(sourceId);
    }
  });

  it('rejects a symlinked admission ancestor before any publication mutation', async () => {
    const root = await setup();
    const outside = await mkdtemp(join(tmpdir(), 'slopbrick-register-outside-'));
    roots.push(outside);
    await symlink(outside, join(root, 'review', 'admission', 'sources'));
    await expect(publishRegisterGeneration({
      root,
      delta: delta(['added-source'], new Map([['added-source', Buffer.from('x')]]), sha('parent')),
      nextRegister: register(1, sha('parent'), ['delta-added-source'], ['added-source']),
      sourceGenerations: [{ sourceId: 'added-source', bytes: Buffer.from('x') }],
      invocationIntentId: sha('symlink-invocation'),
      toolReceipt: toolReceipt(),
      recoveryNonce: sha('symlink-nonce'),
    })).rejects.toThrow(/symlink/i);
  });

  it('refuses recovery when the expected current register changed', async () => {
    const root = await setup();
    const base = register(0);
    const bytes = Buffer.from('{"source":"cas"}\n', 'utf8');
    const change = delta(['added-source'], new Map([['added-source', bytes]]), base.registerSha256);
    const next = register(1, base.registerSha256, [change.deltaId], ['added-source']);
    await writeFile(join(root, 'review', 'admission', 'source-register-v1.json'), calibrationAdmissionCanonicalJson(base));
    const nonce = sha('cas-nonce');
    await expect(publishRegisterGeneration({
      root, delta: change, nextRegister: next, sourceGenerations: [{ sourceId: 'added-source', bytes }],
      invocationIntentId: sha('cas-invocation'), toolReceipt: toolReceipt(), recoveryNonce: nonce,
      phaseHook: (phase) => { if (phase === 'source-current-promoted') throw new Error('pause-before-register'); },
    })).rejects.toBeInstanceOf(RegisterPublicationPendingError);
    const changed = register(0, undefined, [], ['different-current']);
    await writeFile(join(root, 'review', 'admission', 'source-register-v1.json'), calibrationAdmissionCanonicalJson(changed));
    await expect(recoverRegisterGeneration({ root, recoveryNonce: nonce, toolReceipt: toolReceipt(), acknowledgeNoLiveWriter: true })).rejects.toThrow(/CAS|current register/i);
  });

  it('revalidates source bytes during recovery', async () => {
    const root = await setup();
    const base = register(0);
    const bytes = Buffer.from('{"source":"hash"}\n', 'utf8');
    const change = delta(['added-source'], new Map([['added-source', bytes]]), base.registerSha256);
    const next = register(1, base.registerSha256, [change.deltaId], ['added-source']);
    await writeFile(join(root, 'review', 'admission', 'source-register-v1.json'), calibrationAdmissionCanonicalJson(base));
    const nonce = sha('hash-nonce');
    await expect(publishRegisterGeneration({
      root, delta: change, nextRegister: next, sourceGenerations: [{ sourceId: 'added-source', bytes }],
      invocationIntentId: sha('hash-invocation'), toolReceipt: toolReceipt(), recoveryNonce: nonce,
      phaseHook: (phase) => { if (phase === 'source-generation-promoted') throw new Error('pause-after-source'); },
    })).rejects.toBeInstanceOf(RegisterPublicationPendingError);
    const generationPath = join(root, 'review', 'admission', 'sources', 'added-source', 'generations', sha256(bytes), 'source-generation.json');
    await writeFile(generationPath, Buffer.from('tampered\n'));
    await expect(recoverRegisterGeneration({ root, recoveryNonce: nonce, toolReceipt: toolReceipt(), acknowledgeNoLiveWriter: true })).rejects.toThrow(/hash mismatch/i);
  });

  it('revalidates the promoted current register before cleanup', async () => {
    const root = await setup();
    const base = register(0);
    const bytes = Buffer.from('{"source":"current-output"}\n', 'utf8');
    const change = delta(['added-source'], new Map([['added-source', bytes]]), base.registerSha256);
    const next = register(1, base.registerSha256, [change.deltaId], ['added-source']);
    await writeFile(join(root, 'review', 'admission', 'source-register-v1.json'), calibrationAdmissionCanonicalJson(base));
    const nonce = sha('current-output-nonce');
    await expect(publishRegisterGeneration({
      root, delta: change, nextRegister: next, sourceGenerations: [{ sourceId: 'added-source', bytes }],
      invocationIntentId: sha('current-output-invocation'), toolReceipt: toolReceipt(), recoveryNonce: nonce,
      phaseHook: (phase) => { if (phase === 'register-promoted') throw new Error('pause-after-current'); },
    })).rejects.toBeInstanceOf(RegisterPublicationPendingError);
    await writeFile(join(root, 'review', 'admission', 'source-register-v1.json'), calibrationAdmissionCanonicalJson(base));
    await expect(recoverRegisterGeneration({ root, recoveryNonce: nonce, toolReceipt: toolReceipt(), acknowledgeNoLiveWriter: true })).rejects.toThrow(/current register/i);
  });

  it('revalidates the promoted generation receipt before cleanup', async () => {
    const root = await setup();
    const base = register(0);
    const bytes = Buffer.from('{"source":"receipt-output"}\n', 'utf8');
    const change = delta(['added-source'], new Map([['added-source', bytes]]), base.registerSha256);
    const next = register(1, base.registerSha256, [change.deltaId], ['added-source']);
    await writeFile(join(root, 'review', 'admission', 'source-register-v1.json'), calibrationAdmissionCanonicalJson(base));
    const nonce = sha('receipt-output-nonce');
    await expect(publishRegisterGeneration({
      root, delta: change, nextRegister: next, sourceGenerations: [{ sourceId: 'added-source', bytes }],
      invocationIntentId: sha('receipt-output-invocation'), toolReceipt: toolReceipt(), recoveryNonce: nonce,
      phaseHook: (phase) => { if (phase === 'receipt-promoted') throw new Error('pause-after-receipt'); },
    })).rejects.toBeInstanceOf(RegisterPublicationPendingError);
    const transaction = JSON.parse(await readFile(join(root, 'review', 'admission', 'register-generation-transaction.json'), 'utf8')) as { state: { generationReceiptFinalRelativePath: string } };
    await writeFile(join(root, 'review', 'admission', transaction.state.generationReceiptFinalRelativePath), Buffer.from('{}\n'));
    await expect(recoverRegisterGeneration({ root, recoveryNonce: nonce, toolReceipt: toolReceipt(), acknowledgeNoLiveWriter: true })).rejects.toThrow(/receipt|output/i);
  });

  it('does not replace an indexed tool receipt during recovery', async () => {
    const root = await setup();
    const base = register(0);
    const bytes = Buffer.from('{"source":"tool-binding"}\n', 'utf8');
    const change = delta(['added-source'], new Map([['added-source', bytes]]), base.registerSha256);
    const next = register(1, base.registerSha256, [change.deltaId], ['added-source']);
    await writeFile(join(root, 'review', 'admission', 'source-register-v1.json'), calibrationAdmissionCanonicalJson(base));
    const nonce = sha('tool-binding-nonce');
    await expect(publishRegisterGeneration({
      root, delta: change, nextRegister: next, sourceGenerations: [{ sourceId: 'added-source', bytes }],
      invocationIntentId: sha('tool-binding-invocation'), toolReceipt: toolReceipt(), recoveryNonce: nonce,
      phaseHook: (phase) => { if (phase === 'tool-receipt-indexed') throw new Error('pause-after-tool'); },
    })).rejects.toBeInstanceOf(RegisterPublicationPendingError);
    await expect(recoverRegisterGeneration({
      root, recoveryNonce: nonce,
      toolReceipt: { receiptId: 'other-tool-receipt', receiptSha256: sha('other-tool'), authorityIndexSha256: sha('other-index'), publicationTransactionId: 'other-tool-publication' },
      acknowledgeNoLiveWriter: true,
    })).rejects.toThrow(/tool receipt binding/i);
  });

  it('cleans a lock-only crash without selecting a transaction', async () => {
    const root = await setup();
    const base = register(0);
    const bytes = Buffer.from('{"source":"lock-only"}\n', 'utf8');
    const change = delta(['added-source'], new Map([['added-source', bytes]]), base.registerSha256);
    const next = register(1, base.registerSha256, [change.deltaId], ['added-source']);
    await writeFile(join(root, 'review', 'admission', 'source-register-v1.json'), calibrationAdmissionCanonicalJson(base));
    const nonce = sha('lock-only-nonce');
    await expect(publishRegisterGeneration({
      root, delta: change, nextRegister: next, sourceGenerations: [{ sourceId: 'added-source', bytes }],
      invocationIntentId: sha('lock-only-invocation'), toolReceipt: toolReceipt(), recoveryNonce: nonce,
      phaseHook: (phase) => { if (phase === 'lock-fsynced') throw new Error('stop-after-lock'); },
    })).rejects.toThrow(/stop-after-lock/);
    // No transaction or proposal exists in this crash window.
    const recovered = await recoverRegisterGeneration({ root, recoveryNonce: nonce, toolReceipt: toolReceipt(), acknowledgeNoLiveWriter: true });
    expect(recovered.complete).toBe(true);
    await expect(stat(recovered.lockPath)).rejects.toThrow();
  });

  it('preserves unknown transaction files during cleanup', async () => {
    const root = await setup();
    const base = register(0);
    const bytes = Buffer.from('{"source":"unknown"}\n', 'utf8');
    const change = delta(['added-source'], new Map([['added-source', bytes]]), base.registerSha256);
    const next = register(1, base.registerSha256, [change.deltaId], ['added-source']);
    await writeFile(join(root, 'review', 'admission', 'source-register-v1.json'), calibrationAdmissionCanonicalJson(base));
    const nonce = sha('unknown-nonce');
    let pending: RegisterPublicationPendingError | undefined;
    try {
      await publishRegisterGeneration({
        root, delta: change, nextRegister: next, sourceGenerations: [{ sourceId: 'added-source', bytes }],
        invocationIntentId: sha('unknown-invocation'), toolReceipt: toolReceipt(), recoveryNonce: nonce,
        phaseHook: (phase) => { if (phase === 'register-promoted') throw new Error('pause-for-unknown'); },
      });
    } catch (error) { pending = error as RegisterPublicationPendingError; }
    expect(pending).toBeInstanceOf(RegisterPublicationPendingError);
    const unknownPath = join(root, 'review', 'admission', 'transactions', pending!.result.transactionId, 'unknown.txt');
    await writeFile(unknownPath, 'preserve me');
    await recoverRegisterGeneration({ root, recoveryNonce: nonce, toolReceipt: toolReceipt(), acknowledgeNoLiveWriter: true });
    expect(await readFile(unknownPath, 'utf8')).toBe('preserve me');
  });
});
