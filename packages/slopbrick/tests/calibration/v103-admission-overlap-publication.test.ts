import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FROZEN_ADMISSION_PROFILE_IDS,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionNormalizerRegistrySha256,
  calibrationAdmissionOverlapGenerationArtifactSetSha256,
  calibrationAdmissionOverlapGenerationSha256,
  calibrationAdmissionOverlapIndexReceiptSha256,
  calibrationAdmissionOverlapLedgerSha256,
  calibrationAdmissionOverlapPolarityBindingSha256,
  calibrationAdmissionOverlapPolicySha256,
  calibrationAdmissionOverlapResourceReceiptId,
  calibrationAdmissionOverlapUniverseRecordSha256,
  calibrationAdmissionOverlapUniverseSha256,
  calibrationAdmissionSha256,
  type CalibrationAdmissionArtifactReceiptV1,
  type AdmissionNormalizerRegistryV1,
  type AdmissionOverlapPolicyV1,
  type AdmissionOverlapUniverseRecordV1,
  type AdmissionOverlapUniverseV1,
} from '@usebrick/core';
import { ADMISSION_LEXICAL_RUNTIME_BINDINGS, normalizeAdmissionBytes } from '../../src/calibration/v103/admission-normalizers';
import { buildAdmissionOverlapLedger } from '../../src/calibration/v103/admission-overlap';
import {
  OverlapPublicationContendedError,
  OverlapPublicationPendingError,
  OverlapPublicationPostCompletionError,
  publishAdmissionOverlap,
  recoverAdmissionOverlap,
  verifyOverlapArtifactRelations,
  verifyAdmissionOverlap,
} from '../../src/calibration/v103/admission-overlap-publication';

const fixtureRoot = fileURLToPath(new URL('../../../core/tests/fixtures/schema/valid', import.meta.url));
function fixture<T>(name: string): T { return JSON.parse(readFileSync(join(fixtureRoot, `${name}.valid.json`), 'utf8')) as T; }
function sha256(value: Uint8Array | string): string { return createHash('sha256').update(value).digest('hex'); }

function registry(): AdmissionNormalizerRegistryV1 {
  const source = fixture<Record<string, unknown>>('calibration-admission-normalizer-registry');
  const entry = (source.entries as Array<Record<string, unknown>>)[0]!;
  const runtime = ADMISSION_LEXICAL_RUNTIME_BINDINGS[0]!;
  const base = { ...source, entries: [{ ...entry, implementationSha256: runtime.implementationSha256, fixturesSha256: runtime.fixturesSha256 }] };
  return { ...base, registrySha256: calibrationAdmissionNormalizerRegistrySha256(base) } as AdmissionNormalizerRegistryV1;
}

const policyBase: Omit<AdmissionOverlapPolicyV1, 'policySha256'> = {
  version: 'v10.3-admission-overlap-policy-v1', method: 'prefix-filter-exact-jaccard-0.80-v1',
  maxUnitBytes: 33_554_432, maxShardBytes: 67_108_864, maxOpenFiles: 64,
  maxHeapBytes: 4_294_967_296, maxRssBytes: 6_442_450_944,
  maxWorkBytes: 214_748_364_800, maxWallMilliseconds: 86_400_000,
};
const policy: AdmissionOverlapPolicyV1 = { ...policyBase, policySha256: calibrationAdmissionOverlapPolicySha256(policyBase) };

function makeRecord(id: string, bytes: Uint8Array, side: 'ai_side' | 'human_side', normalizers: AdmissionNormalizerRegistryV1): AdmissionOverlapUniverseRecordV1 {
  const normalized = normalizeAdmissionBytes('TypeScript', bytes, normalizers);
  if (!normalized.ok) throw new Error('fixture normalization failed');
  const polarity = {
    intake: side === 'ai_side' ? 'declared_ai' as const : 'declared_human' as const,
    overlapSide: side,
    bindingAuthority: 'legacy-selected-inventory' as const,
    bindingSha256: '',
  };
  polarity.bindingSha256 = calibrationAdmissionOverlapPolarityBindingSha256(polarity);
  const base = {
    version: 'v10.3-overlap-universe-record-v1' as const,
    candidateUnitId: id,
    materialSourceId: `source-${id}`,
    aggregateSourceIds: [`source-${id}`],
    locator: { kind: 'local_inventory_file' as const, localSourceId: `source-${id}`, normalizedPath: `${id}.ts` },
    polarity,
    contentSha256: sha256(bytes), contentBytes: bytes.byteLength,
    language: 'TypeScript' as const, normalizerId: normalized.normalizerId,
    normalizationStatus: 'covered' as const,
    shingleSetSha256: normalized.shingleSetSha256, shingleCount: normalized.shingleCount,
  };
  return { ...base, recordSha256: calibrationAdmissionOverlapUniverseRecordSha256(base) };
}

function makeUniverse(records: readonly AdmissionOverlapUniverseRecordV1[], normalizers: AdmissionNormalizerRegistryV1): AdmissionOverlapUniverseV1 {
  const stream = Buffer.from(records.map((record) => `${calibrationAdmissionCanonicalJson(record)}\n`).join(''), 'utf8');
  const base = {
    version: 'v10.3-admission-overlap-universe-v1' as const,
    registerSha256: 'a'.repeat(64), recordsJsonlSha256: sha256(stream),
    selectedAggregateCoverage: records.length, baselineMaterialUnits: records.length,
    repositoryMaterialUnits: 0, newCandidateUnits: 0, covered: records.length,
    unsupported: 0, unreadable: 0, unresolvedCandidateUnitIds: [],
    normalizerRegistrySha256: normalizers.registrySha256,
  };
  return { ...base, universeSha256: calibrationAdmissionOverlapUniverseSha256(base) };
}

async function* stream(records: readonly AdmissionOverlapUniverseRecordV1[]): AsyncIterable<AdmissionOverlapUniverseRecordV1> {
  for (const record of records) yield record;
}

function toolAuthority(intent: string, receiptId: string) {
  const base = {
    version: 'v10.3-admission-tool-authority-snapshot-v1' as const,
    indexGenerationSha256: 'c'.repeat(64),
    profileIds: [...FROZEN_ADMISSION_PROFILE_IDS].sort(),
    invocationIntentIds: [intent], receiptIds: [receiptId],
  };
  return { ...base, snapshotSha256: calibrationAdmissionSha256(base) };
}

/**
 * Build one tiny replacement fixture and retain the complete immutable parent
 * tree.  Fault-matrix tests use this rather than rebuilding the corpus setup
 * independently so every phase is checked against the same CAS/parent and
 * unknown-file preservation contract.
 */
async function replacementFixture(prefix: string) {
  const normalizers = registry();
  const bytes = Buffer.from('a b c d e f g h i j', 'utf8');
  const records = [makeRecord('unit-a', bytes, 'ai_side', normalizers), makeRecord('unit-b', bytes, 'human_side', normalizers)];
  const universe = makeUniverse(records, normalizers);
  const root = await mkdtemp(join(tmpdir(), `${prefix}-`));
  const work = join(root, 'builder-output');
  const buildResult = await buildAdmissionOverlapLedger(universe, stream(records), async () => bytes, work, policy, normalizers);
  const baseline = await publishAdmissionOverlap({
    root, generationLocalRoot: work, buildResult, universe, policy, normalizerRegistry: normalizers,
    generation: 0, inputGenerationSha256: '4'.repeat(64), invocationIntentId: '1'.repeat(64),
    toolAuthoritySnapshot: toolAuthority('1'.repeat(64), '2'.repeat(64)),
    toolReceipt: { receiptId: '2'.repeat(64), receiptSha256: '3'.repeat(64), authorityIndexSha256: 'c'.repeat(64) },
    recoveryNonce: '5'.repeat(64),
  });
  const current = JSON.parse(await readFile(baseline.currentPath, 'utf8')) as { generationRelativePath: string };
  const generationDirectory = join(root, current.generationRelativePath);
  const generation = JSON.parse(await readFile(join(generationDirectory, 'generation.json'), 'utf8')) as { artifacts: Array<{ relativePath: string }> };
  const parentTree = [
    { relativePath: `${current.generationRelativePath}/generation.json`, bytes: await readFile(join(generationDirectory, 'generation.json')) },
    ...await Promise.all(generation.artifacts.map(async (artifact) => ({
      relativePath: `${current.generationRelativePath}/${artifact.relativePath}`,
      bytes: await readFile(join(generationDirectory, artifact.relativePath)),
    }))),
  ];
  const unknownPath = join(root, 'review/admission/global/overlap/unknown.keep');
  await writeFile(unknownPath, 'preserve this unknown file\n', { flag: 'wx' });
  return { normalizers, universe, root, work, buildResult, baseline, parentTree, unknownPath };
}

async function expectParentTreeUnchanged(root: string, parentTree: readonly { relativePath: string; bytes: Buffer }[]): Promise<void> {
  for (const entry of parentTree) expect(await readFile(join(root, entry.relativePath))).toEqual(entry.bytes);
}

describe('v10.3 overlap authority publication', () => {
  it('keeps verification read-only when no current generation exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-verify-'));
    try {
      const result = await verifyAdmissionOverlap(root);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain('overlap_current_missing');
      await expect(stat(join(root, 'review'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('stages, promotes, and validates one immutable generation', async () => {
    const normalizers = registry();
    const bytes = Buffer.from('a b c d e f g h i j', 'utf8');
    const records = [makeRecord('unit-a', bytes, 'ai_side', normalizers), makeRecord('unit-b', bytes, 'human_side', normalizers)];
    const universe = makeUniverse(records, normalizers);
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-authority-'));
    const work = join(root, 'builder-output');
    const intent = '1'.repeat(64);
    const receiptId = '2'.repeat(64);
    const toolReceipt = { receiptId, receiptSha256: '3'.repeat(64), authorityIndexSha256: 'c'.repeat(64) };
    try {
      const buildResult = await buildAdmissionOverlapLedger(universe, stream(records), async () => bytes, work, policy, normalizers);
      const result = await publishAdmissionOverlap({
        root, generationLocalRoot: work, buildResult, universe, policy, normalizerRegistry: normalizers,
        generation: 0, inputGenerationSha256: '4'.repeat(64), invocationIntentId: intent,
        toolAuthoritySnapshot: toolAuthority(intent, receiptId), toolReceipt, recoveryNonce: '5'.repeat(64),
      });
      expect(result.complete).toBe(true);
      expect(result.recoveryRequired).toBe(false);
      let current = JSON.parse(await readFile(result.currentPath, 'utf8')) as { generationSha256: string; generationRelativePath: string };
      expect(current.generationSha256).toBe(result.generationSha256);
      expect(current.generationRelativePath).toContain(result.generationSha256);
      await expect(readFile(result.lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(result.transactionPath)).rejects.toMatchObject({ code: 'ENOENT' });
      const generation = JSON.parse(await readFile(join(root, current.generationRelativePath, 'generation.json'), 'utf8')) as { generationSha256: string };
      expect(generation.generationSha256).toBe(result.generationSha256);
      const replacement = await publishAdmissionOverlap({
        root, generationLocalRoot: work, buildResult, universe, policy, normalizerRegistry: normalizers,
        generation: 1, inputGenerationSha256: '6'.repeat(64), invocationIntentId: intent,
        toolAuthoritySnapshot: toolAuthority(intent, receiptId), toolReceipt,
        operation: 'replace', expectedCurrentGenerationSha256: result.generationSha256, recoveryNonce: '7'.repeat(64),
      });
      expect(replacement.complete).toBe(true);
      current = JSON.parse(await readFile(replacement.currentPath, 'utf8')) as { generationSha256: string; generationRelativePath: string };
      expect(current.generationSha256).toBe(replacement.generationSha256);
      expect(current.generationSha256).not.toBe(result.generationSha256);
      await writeFile(join(root, current.generationRelativePath, 'orphan.txt'), 'unexpected');
      const orphanVerification = await verifyAdmissionOverlap(root);
      expect(orphanVerification.ok).toBe(false);
      expect(orphanVerification.errors).toContain('overlap_current_not_anchored');
      const forgedBase = { version: 'v10.3-admission-overlap-current-v1' as const, generation: 1, generationSha256: 'd'.repeat(64), generationRelativePath: 'review/admission/global/overlap/generations/' + 'd'.repeat(64) };
      await writeFile(result.currentPath, calibrationAdmissionCanonicalJson({ ...forgedBase, currentSha256: calibrationAdmissionSha256(forgedBase) }));
      const verification = await verifyAdmissionOverlap(root);
      expect(verification.ok).toBe(false);
      expect(verification.errors).toContain('overlap_current_not_anchored');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('recovers after the tool-receipt journal boundary', async () => {
    const normalizers = registry();
    const bytes = Buffer.from('a b c d e f g h i j', 'utf8');
    const records = [makeRecord('unit-a', bytes, 'ai_side', normalizers), makeRecord('unit-b', bytes, 'human_side', normalizers)];
    const universe = makeUniverse(records, normalizers);
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-recovery-'));
    const work = join(root, 'builder-output');
    const intent = '6'.repeat(64);
    const receiptId = '7'.repeat(64);
    const toolReceipt = { receiptId, receiptSha256: '8'.repeat(64), authorityIndexSha256: 'c'.repeat(64) };
    const nonce = '9'.repeat(64);
    let interrupted = false;
    try {
      const buildResult = await buildAdmissionOverlapLedger(universe, stream(records), async () => bytes, work, policy, normalizers);
      await expect(publishAdmissionOverlap({
        root, generationLocalRoot: work, buildResult, universe, policy, normalizerRegistry: normalizers,
        generation: 0, inputGenerationSha256: 'a'.repeat(64), invocationIntentId: intent,
        toolAuthoritySnapshot: toolAuthority(intent, receiptId), toolReceipt, recoveryNonce: nonce,
        phaseHook: async (phase) => { if (phase === 'tool-receipt-indexed' && !interrupted) { interrupted = true; throw new Error('fault'); } },
      })).rejects.toBeInstanceOf(OverlapPublicationPendingError);
      const recovered = await recoverAdmissionOverlap({ root, fromLock: true, recoveryNonce: nonce, toolReceipt, acknowledgeNoLiveWriter: true });
      expect(recovered.complete).toBe(true);
      expect(interrupted).toBe(true);
      await expect(readFile(recovered.lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(['lock-fsynced', 'transaction-fsynced'] as const)('recovers the %s prefix without a build rerun', async (faultPhase) => {
    const normalizers = registry();
    const bytes = Buffer.from('a b c d e f g h i j', 'utf8');
    const records = [makeRecord('unit-a', bytes, 'ai_side', normalizers), makeRecord('unit-b', bytes, 'human_side', normalizers)];
    const universe = makeUniverse(records, normalizers);
    const root = await mkdtemp(join(tmpdir(), `slopbrick-overlap-${faultPhase}-`));
    const work = join(root, 'builder-output');
    const intent = 'a'.repeat(64);
    const receiptId = 'b'.repeat(64);
    const toolReceipt = { receiptId, receiptSha256: 'c'.repeat(64), authorityIndexSha256: 'c'.repeat(64) };
    const nonce = 'e'.repeat(64);
    try {
      const buildResult = await buildAdmissionOverlapLedger(universe, stream(records), async () => bytes, work, policy, normalizers);
      await expect(publishAdmissionOverlap({
        root, generationLocalRoot: work, buildResult, universe, policy, normalizerRegistry: normalizers,
        generation: 0, inputGenerationSha256: 'f'.repeat(64), invocationIntentId: intent,
        toolAuthoritySnapshot: toolAuthority(intent, receiptId), toolReceipt, recoveryNonce: nonce,
        phaseHook: async (phase) => { if (phase === faultPhase) throw new Error('fault'); },
      })).rejects.toBeInstanceOf(OverlapPublicationPendingError);
      const recovered = await recoverAdmissionOverlap({ root, fromLock: true, recoveryNonce: nonce, toolReceipt, acknowledgeNoLiveWriter: true });
      expect(recovered.complete).toBe(true);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rejects recovery when a staged replacement generation skips its parent number', async () => {
    const normalizers = registry();
    const bytes = Buffer.from('a b c d e f g h i j', 'utf8');
    const records = [makeRecord('unit-a', bytes, 'ai_side', normalizers), makeRecord('unit-b', bytes, 'human_side', normalizers)];
    const universe = makeUniverse(records, normalizers);
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-generation-chain-'));
    const work = join(root, 'builder-output');
    const intent = '1'.repeat(64);
    const receiptId = '2'.repeat(64);
    const toolReceipt = { receiptId, receiptSha256: '3'.repeat(64), authorityIndexSha256: 'c'.repeat(64) };
    try {
      const buildResult = await buildAdmissionOverlapLedger(universe, stream(records), async () => bytes, work, policy, normalizers);
      const first = await publishAdmissionOverlap({
        root, generationLocalRoot: work, buildResult, universe, policy, normalizerRegistry: normalizers,
        generation: 0, inputGenerationSha256: '4'.repeat(64), invocationIntentId: intent,
        toolAuthoritySnapshot: toolAuthority(intent, receiptId), toolReceipt, recoveryNonce: '5'.repeat(64),
      });
      let pending: OverlapPublicationPendingError | undefined;
      try {
        await publishAdmissionOverlap({
          root, generationLocalRoot: work, buildResult, universe, policy, normalizerRegistry: normalizers,
          operation: 'replace', expectedCurrentGenerationSha256: first.generationSha256,
          generation: 1, inputGenerationSha256: '6'.repeat(64), invocationIntentId: intent,
          toolAuthoritySnapshot: toolAuthority(intent, receiptId), toolReceipt, recoveryNonce: '7'.repeat(64),
          phaseHook: async (phase) => { if (phase === 'generation-directory-staged-fsynced') throw new Error('fault'); },
        });
      } catch (error) {
        pending = error instanceof OverlapPublicationPendingError ? error : undefined;
      }
      expect(pending).toBeInstanceOf(OverlapPublicationPendingError);
      const generationPath = join(root, 'review/admission/global/overlap/staging-generation', pending!.result.transactionId, 'generation.json');
      const original = JSON.parse(await readFile(generationPath, 'utf8')) as Record<string, unknown>;
      const forgedBase = { ...original, generation: 2 };
      delete forgedBase.generationSha256;
      await writeFile(generationPath, calibrationAdmissionCanonicalJson({ ...forgedBase, generationSha256: calibrationAdmissionSha256(forgedBase) }));
      await expect(recoverAdmissionOverlap({ root, fromLock: true, recoveryNonce: '7'.repeat(64), toolReceipt, acknowledgeNoLiveWriter: true }))
        .rejects.toThrow('overlap_recovery_generation_number_mismatch');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('refuses recovery after the promoted phase if current no longer anchors the transaction generation', async () => {
    const normalizers = registry();
    const bytes = Buffer.from('a b c d e f g h i j', 'utf8');
    const records = [makeRecord('unit-a', bytes, 'ai_side', normalizers), makeRecord('unit-b', bytes, 'human_side', normalizers)];
    const universe = makeUniverse(records, normalizers);
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-current-anchor-'));
    const work = join(root, 'builder-output');
    const intent = '6'.repeat(64);
    const receiptId = '7'.repeat(64);
    const toolReceipt = { receiptId, receiptSha256: '8'.repeat(64), authorityIndexSha256: 'c'.repeat(64) };
    const nonce = '9'.repeat(64);
    try {
      const buildResult = await buildAdmissionOverlapLedger(universe, stream(records), async () => bytes, work, policy, normalizers);
      let pending: OverlapPublicationPendingError | undefined;
      try {
        await publishAdmissionOverlap({
          root, generationLocalRoot: work, buildResult, universe, policy, normalizerRegistry: normalizers,
          generation: 0, inputGenerationSha256: 'a'.repeat(64), invocationIntentId: intent,
          toolAuthoritySnapshot: toolAuthority(intent, receiptId), toolReceipt, recoveryNonce: nonce,
          phaseHook: async (phase) => { if (phase === 'current-output-projections-promoted') throw new Error('fault'); },
        });
      } catch (error) {
        pending = error instanceof OverlapPublicationPendingError ? error : undefined;
      }
      expect(pending).toBeInstanceOf(OverlapPublicationPendingError);
      await rm(pending!.result.currentPath);
      await expect(recoverAdmissionOverlap({ root, fromLock: true, recoveryNonce: nonce, toolReceipt, acknowledgeNoLiveWriter: true }))
        .rejects.toThrow('overlap_current_generation_mismatch');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rejects a forged staged descriptor at the tool boundary when it diverges from the primary journal', async () => {
    const normalizers = registry();
    const bytes = Buffer.from('a b c d e f g h i j', 'utf8');
    const records = [makeRecord('unit-a', bytes, 'ai_side', normalizers), makeRecord('unit-b', bytes, 'human_side', normalizers)];
    const universe = makeUniverse(records, normalizers);
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-primary-binding-'));
    const work = join(root, 'builder-output');
    const intent = 'b'.repeat(64);
    const receiptId = 'c'.repeat(64);
    const toolReceipt = { receiptId, receiptSha256: 'd'.repeat(64), authorityIndexSha256: 'c'.repeat(64) };
    const nonce = 'e'.repeat(64);
    try {
      const buildResult = await buildAdmissionOverlapLedger(universe, stream(records), async () => bytes, work, policy, normalizers);
      let pending: OverlapPublicationPendingError | undefined;
      try {
        await publishAdmissionOverlap({
          root, generationLocalRoot: work, buildResult, universe, policy, normalizerRegistry: normalizers,
          generation: 0, inputGenerationSha256: 'f'.repeat(64), invocationIntentId: intent,
          toolAuthoritySnapshot: toolAuthority(intent, receiptId), toolReceipt, recoveryNonce: nonce,
          phaseHook: async (phase) => { if (phase === 'tool-receipt-indexed') throw new Error('fault'); },
        });
      } catch (error) {
        pending = error instanceof OverlapPublicationPendingError ? error : undefined;
      }
      expect(pending).toBeInstanceOf(OverlapPublicationPendingError);
      const generationPath = join(root, 'review/admission/global/overlap/staging-generation', pending!.result.transactionId, 'generation.json');
      const original = JSON.parse(await readFile(generationPath, 'utf8')) as { artifacts: Array<Record<string, unknown>>; [key: string]: unknown };
      const artifacts = original.artifacts.map((artifact, index) => index === 0 ? { ...artifact, bytes: Number(artifact.bytes) + 1 } : artifact);
      const forgedBase: Record<string, unknown> = { ...original, artifacts, artifactSetSha256: calibrationAdmissionSha256(artifacts) };
      delete forgedBase.generationSha256;
      await writeFile(generationPath, calibrationAdmissionCanonicalJson({ ...forgedBase, generationSha256: calibrationAdmissionSha256(forgedBase) }));
      await expect(recoverAdmissionOverlap({ root, fromLock: true, recoveryNonce: nonce, toolReceipt, acknowledgeNoLiveWriter: true }))
        .rejects.toThrow('overlap_recovery_primary_output_set_mismatch');
      const snapshotBase: Record<string, unknown> = { ...original.toolAuthoritySnapshot, invocationIntentIds: ['0'.repeat(64)] };
      delete snapshotBase.snapshotSha256;
      const forgedSnapshot = { ...snapshotBase, snapshotSha256: calibrationAdmissionSha256(snapshotBase) };
      const snapshotGenerationBase: Record<string, unknown> = { ...original, toolAuthoritySnapshot: forgedSnapshot };
      delete snapshotGenerationBase.generationSha256;
      await writeFile(generationPath, calibrationAdmissionCanonicalJson({ ...snapshotGenerationBase, generationSha256: calibrationAdmissionSha256(snapshotGenerationBase) }));
      await expect(recoverAdmissionOverlap({ root, fromLock: true, recoveryNonce: nonce, toolReceipt, acknowledgeNoLiveWriter: true }))
        .rejects.toThrow('overlap_recovery_tool_snapshot_mismatch');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('does not promote current when a promoted generation tree is damaged before recovery', async () => {
    const normalizers = registry();
    const bytes = Buffer.from('a b c d e f g h i j', 'utf8');
    const records = [makeRecord('unit-a', bytes, 'ai_side', normalizers), makeRecord('unit-b', bytes, 'human_side', normalizers)];
    const universe = makeUniverse(records, normalizers);
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-final-tree-'));
    const work = join(root, 'builder-output');
    const intent = '1'.repeat(64);
    const receiptId = '2'.repeat(64);
    const toolReceipt = { receiptId, receiptSha256: '3'.repeat(64), authorityIndexSha256: 'c'.repeat(64) };
    const nonce = '4'.repeat(64);
    try {
      const buildResult = await buildAdmissionOverlapLedger(universe, stream(records), async () => bytes, work, policy, normalizers);
      let pending: OverlapPublicationPendingError | undefined;
      try {
        await publishAdmissionOverlap({
          root, generationLocalRoot: work, buildResult, universe, policy, normalizerRegistry: normalizers,
          generation: 0, inputGenerationSha256: '5'.repeat(64), invocationIntentId: intent,
          toolAuthoritySnapshot: toolAuthority(intent, receiptId), toolReceipt, recoveryNonce: nonce,
          phaseHook: async (phase) => { if (phase === 'generation-directory-promoted') throw new Error('fault'); },
        });
      } catch (error) {
        pending = error instanceof OverlapPublicationPendingError ? error : undefined;
      }
      expect(pending).toBeInstanceOf(OverlapPublicationPendingError);
      const generationPath = join(root, 'review/admission/global/overlap/generations', pending!.result.generationSha256, 'generation.json');
      const generation = JSON.parse(await readFile(generationPath, 'utf8')) as { artifacts: Array<{ relativePath: string }> };
      await rm(join(root, 'review/admission/global/overlap/generations', pending!.result.generationSha256, generation.artifacts[0]!.relativePath));
      await expect(recoverAdmissionOverlap({ root, fromLock: true, recoveryNonce: nonce, toolReceipt, acknowledgeNoLiveWriter: true }))
        .rejects.toThrow('overlap_generation_missing');
      await expect(readFile(pending!.result.currentPath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rejects replacement recovery when the immutable parent tree is damaged', async () => {
    const normalizers = registry();
    const bytes = Buffer.from('a b c d e f g h i j', 'utf8');
    const records = [makeRecord('unit-a', bytes, 'ai_side', normalizers), makeRecord('unit-b', bytes, 'human_side', normalizers)];
    const universe = makeUniverse(records, normalizers);
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-parent-tree-'));
    const work = join(root, 'builder-output');
    const intent = '6'.repeat(64);
    const receiptId = '7'.repeat(64);
    const toolReceipt = { receiptId, receiptSha256: '8'.repeat(64), authorityIndexSha256: 'c'.repeat(64) };
    try {
      const buildResult = await buildAdmissionOverlapLedger(universe, stream(records), async () => bytes, work, policy, normalizers);
      const first = await publishAdmissionOverlap({
        root, generationLocalRoot: work, buildResult, universe, policy, normalizerRegistry: normalizers,
        generation: 0, inputGenerationSha256: '9'.repeat(64), invocationIntentId: intent,
        toolAuthoritySnapshot: toolAuthority(intent, receiptId), toolReceipt, recoveryNonce: 'a'.repeat(64),
      });
      let pending: OverlapPublicationPendingError | undefined;
      try {
        await publishAdmissionOverlap({
          root, generationLocalRoot: work, buildResult, universe, policy, normalizerRegistry: normalizers,
          operation: 'replace', expectedCurrentGenerationSha256: first.generationSha256,
          generation: 1, inputGenerationSha256: 'b'.repeat(64), invocationIntentId: intent,
          toolAuthoritySnapshot: toolAuthority(intent, receiptId), toolReceipt, recoveryNonce: 'c'.repeat(64),
          phaseHook: async (phase) => { if (phase === 'generation-directory-staged-fsynced') throw new Error('fault'); },
        });
      } catch (error) {
        pending = error instanceof OverlapPublicationPendingError ? error : undefined;
      }
      expect(pending).toBeInstanceOf(OverlapPublicationPendingError);
      const parentPath = join(root, 'review/admission/global/overlap/generations', first.generationSha256, 'generation.json');
      const parent = JSON.parse(await readFile(parentPath, 'utf8')) as { artifacts: Array<{ relativePath: string }> };
      await rm(join(root, 'review/admission/global/overlap/generations', first.generationSha256, parent.artifacts[0]!.relativePath));
      await expect(recoverAdmissionOverlap({ root, fromLock: true, recoveryNonce: 'c'.repeat(64), toolReceipt, acknowledgeNoLiveWriter: true }))
        .rejects.toThrow('overlap_recovery_parent_generation_not_anchored');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('authenticates lockless complete recovery before deleting its transaction', async () => {
    const normalizers = registry();
    const bytes = Buffer.from('a b c d e f g h i j', 'utf8');
    const records = [makeRecord('unit-a', bytes, 'ai_side', normalizers), makeRecord('unit-b', bytes, 'human_side', normalizers)];
    const universe = makeUniverse(records, normalizers);
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-orphan-recovery-'));
    const work = join(root, 'builder-output');
    const intent = 'd'.repeat(64);
    const receiptId = 'e'.repeat(64);
    const toolReceipt = { receiptId, receiptSha256: 'f'.repeat(64), authorityIndexSha256: 'c'.repeat(64) };
    const nonce = '1'.repeat(64);
    let pending: OverlapPublicationPendingError | undefined;
    try {
      const buildResult = await buildAdmissionOverlapLedger(universe, stream(records), async () => bytes, work, policy, normalizers);
      try {
        await publishAdmissionOverlap({
          root, generationLocalRoot: work, buildResult, universe, policy, normalizerRegistry: normalizers,
          generation: 0, inputGenerationSha256: '2'.repeat(64), invocationIntentId: intent,
          toolAuthoritySnapshot: toolAuthority(intent, receiptId), toolReceipt, recoveryNonce: nonce,
          phaseHook: async (phase) => { if (phase === 'complete') throw new Error('fault'); },
        });
      } catch (error) {
        pending = error instanceof OverlapPublicationPendingError ? error : undefined;
      }
      expect(pending).toBeInstanceOf(OverlapPublicationPendingError);
      await rm(pending!.result.lockPath);
      await expect(recoverAdmissionOverlap({ root, transactionId: 'wrong', recoveryNonce: nonce, toolReceipt, acknowledgeNoLiveWriter: true }))
        .rejects.toThrow('overlap_orphan_transaction_selector_mismatch');
      await expect(readFile(pending!.result.transactionPath)).resolves.toBeTruthy();
      await expect(recoverAdmissionOverlap({ root, transactionId: pending!.result.transactionId, recoveryNonce: '3'.repeat(64), toolReceipt, acknowledgeNoLiveWriter: true }))
        .rejects.toThrow('overlap_orphan_recovery_nonce_mismatch');
      await expect(readFile(pending!.result.transactionPath)).resolves.toBeTruthy();
      const wrongToolReceipt = { receiptId: 'g'.repeat(64), receiptSha256: '4'.repeat(64), authorityIndexSha256: 'c'.repeat(64) };
      await expect(recoverAdmissionOverlap({ root, transactionId: pending!.result.transactionId, recoveryNonce: nonce, toolReceipt: wrongToolReceipt, acknowledgeNoLiveWriter: true }))
        .rejects.toThrow('overlap_orphan_tool_receipt_mismatch');
      await expect(readFile(pending!.result.transactionPath)).resolves.toBeTruthy();
      const recovered = await recoverAdmissionOverlap({ root, transactionId: pending!.result.transactionId, recoveryNonce: nonce, toolReceipt, acknowledgeNoLiveWriter: true });
      expect(recovered.complete).toBe(true);
      await expect(readFile(pending!.result.transactionPath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('recovers through the lock-only path after the durable transaction unlink boundary', async () => {
    const normalizers = registry();
    const bytes = Buffer.from('a b c d e f g h i j', 'utf8');
    const records = [makeRecord('unit-a', bytes, 'ai_side', normalizers), makeRecord('unit-b', bytes, 'human_side', normalizers)];
    const universe = makeUniverse(records, normalizers);
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-transaction-unlink-'));
    const work = join(root, 'builder-output');
    const intent = '5'.repeat(64);
    const receiptId = '6'.repeat(64);
    const toolReceipt = { receiptId, receiptSha256: '7'.repeat(64), authorityIndexSha256: 'c'.repeat(64) };
    const nonce = '8'.repeat(64);
    let pending: OverlapPublicationPendingError | undefined;
    try {
      const buildResult = await buildAdmissionOverlapLedger(universe, stream(records), async () => bytes, work, policy, normalizers);
      try {
        await publishAdmissionOverlap({
          root, generationLocalRoot: work, buildResult, universe, policy, normalizerRegistry: normalizers,
          generation: 0, inputGenerationSha256: '9'.repeat(64), invocationIntentId: intent,
          toolAuthoritySnapshot: toolAuthority(intent, receiptId), toolReceipt, recoveryNonce: nonce,
          phaseHook: async (phase) => { if (phase === 'transaction-unlinked') throw new Error('fault'); },
        });
      } catch (error) {
        pending = error instanceof OverlapPublicationPendingError ? error : undefined;
      }
      expect(pending).toBeInstanceOf(OverlapPublicationPendingError);
      await expect(readFile(pending!.result.transactionPath)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(pending!.result.lockPath)).resolves.toBeTruthy();
      const recovered = await recoverAdmissionOverlap({ root, fromLock: true, recoveryNonce: nonce, toolReceipt, acknowledgeNoLiveWriter: true });
      expect(recovered.complete).toBe(true);
      await expect(readFile(pending!.result.lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it.each([
    'primary-outputs-staged-fsynced',
    'generations-parent-fsynced',
    'current-output-projections-staged-fsynced',
    'current-generation-promoted',
    'output-directories-fsynced',
    'cleanup-fsynced',
  ] as const)('recovers a replacement after the %s durable boundary without damaging the parent tree', async (faultPhase) => {
    const fixture = await replacementFixture(`slopbrick-overlap-fault-${faultPhase}`);
    const intent = '7'.repeat(64);
    const receiptId = '8'.repeat(64);
    const toolReceipt = { receiptId, receiptSha256: '9'.repeat(64), authorityIndexSha256: 'c'.repeat(64) };
    const nonce = 'a'.repeat(64);
    let pending: OverlapPublicationPendingError | undefined;
    try {
      try {
        await publishAdmissionOverlap({
          root: fixture.root, generationLocalRoot: fixture.work, buildResult: fixture.buildResult,
          universe: fixture.universe, policy, normalizerRegistry: fixture.normalizers,
          operation: 'replace', expectedCurrentGenerationSha256: fixture.baseline.generationSha256,
          generation: 1, inputGenerationSha256: 'b'.repeat(64), invocationIntentId: intent,
          toolAuthoritySnapshot: toolAuthority(intent, receiptId), toolReceipt, recoveryNonce: nonce,
          phaseHook: async (phase) => { if (phase === faultPhase) throw new Error('fault'); },
        });
      } catch (error) {
        pending = error instanceof OverlapPublicationPendingError ? error : undefined;
      }
      expect(pending).toBeInstanceOf(OverlapPublicationPendingError);
      const recovered = await recoverAdmissionOverlap({
        root: fixture.root, fromLock: true, recoveryNonce: nonce, toolReceipt, acknowledgeNoLiveWriter: true,
      });
      expect(recovered.complete).toBe(true);
      expect(recovered.generationSha256).toBe(pending!.result.generationSha256);
      const verification = await verifyAdmissionOverlap(fixture.root);
      expect(verification.ok).toBe(true);
      expect(verification.generationSha256).toBe(recovered.generationSha256);
      expect(recovered.generationSha256).not.toBe(fixture.baseline.generationSha256);
      await expectParentTreeUnchanged(fixture.root, fixture.parentTree);
      await expect(readFile(fixture.unknownPath, 'utf8')).resolves.toBe('preserve this unknown file\n');
      await expect(readFile(recovered.lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(recovered.transactionPath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('treats lock-unlinked as a post-completion hook and preserves both generations', async () => {
    const fixture = await replacementFixture('slopbrick-overlap-lock-unlinked');
    const intent = 'd'.repeat(64);
    const receiptId = 'e'.repeat(64);
    const toolReceipt = { receiptId, receiptSha256: 'f'.repeat(64), authorityIndexSha256: 'c'.repeat(64) };
    const nonce = '1'.repeat(64);
    let postCompletion: OverlapPublicationPostCompletionError | undefined;
    try {
      try {
        await publishAdmissionOverlap({
          root: fixture.root, generationLocalRoot: fixture.work, buildResult: fixture.buildResult,
          universe: fixture.universe, policy, normalizerRegistry: fixture.normalizers,
          operation: 'replace', expectedCurrentGenerationSha256: fixture.baseline.generationSha256,
          generation: 1, inputGenerationSha256: '2'.repeat(64), invocationIntentId: intent,
          toolAuthoritySnapshot: toolAuthority(intent, receiptId), toolReceipt, recoveryNonce: nonce,
          phaseHook: async (phase) => { if (phase === 'lock-unlinked') throw new Error('post-completion hook fault'); },
        });
      } catch (error) {
        postCompletion = error instanceof OverlapPublicationPostCompletionError ? error : undefined;
      }
      expect(postCompletion).toBeInstanceOf(OverlapPublicationPostCompletionError);
      expect(postCompletion!.result).toMatchObject({ complete: true, recoveryRequired: false, status: 'post-completion' });
      await expect(readFile(postCompletion!.result.lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(postCompletion!.result.transactionPath)).rejects.toMatchObject({ code: 'ENOENT' });
      const verification = await verifyAdmissionOverlap(fixture.root);
      expect(verification.ok).toBe(true);
      expect(verification.generationSha256).toBe(postCompletion!.result.generationSha256);
      expect(postCompletion!.result.generationSha256).not.toBe(fixture.baseline.generationSha256);
      await expectParentTreeUnchanged(fixture.root, fixture.parentTree);
      await expect(readFile(fixture.unknownPath, 'utf8')).resolves.toBe('preserve this unknown file\n');
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('serializes concurrent replacement writers and rejects a stale expected-current CAS', async () => {
    const fixture = await replacementFixture('slopbrick-overlap-two-writer');
    const winnerIntent = '3'.repeat(64);
    const winnerReceiptId = '4'.repeat(64);
    const winnerToolReceipt = { receiptId: winnerReceiptId, receiptSha256: '5'.repeat(64), authorityIndexSha256: 'c'.repeat(64) };
    const winnerNonce = '6'.repeat(64);
    const loserIntent = '7'.repeat(64);
    const loserReceiptId = '8'.repeat(64);
    const loserToolReceipt = { receiptId: loserReceiptId, receiptSha256: '9'.repeat(64), authorityIndexSha256: 'c'.repeat(64) };
    const loserNonce = 'a'.repeat(64);
    const loserRequest = {
      root: fixture.root, generationLocalRoot: fixture.work, buildResult: fixture.buildResult,
      universe: fixture.universe, policy, normalizerRegistry: fixture.normalizers,
      operation: 'replace' as const, expectedCurrentGenerationSha256: fixture.baseline.generationSha256,
      generation: 1, inputGenerationSha256: 'b'.repeat(64), invocationIntentId: loserIntent,
      toolAuthoritySnapshot: toolAuthority(loserIntent, loserReceiptId), toolReceipt: loserToolReceipt,
      recoveryNonce: loserNonce,
    };
    let loserError: unknown;
    try {
      const winner = await publishAdmissionOverlap({
        root: fixture.root, generationLocalRoot: fixture.work, buildResult: fixture.buildResult,
        universe: fixture.universe, policy, normalizerRegistry: fixture.normalizers,
        operation: 'replace', expectedCurrentGenerationSha256: fixture.baseline.generationSha256,
        generation: 1, inputGenerationSha256: 'c'.repeat(64), invocationIntentId: winnerIntent,
        toolAuthoritySnapshot: toolAuthority(winnerIntent, winnerReceiptId), toolReceipt: winnerToolReceipt,
        recoveryNonce: winnerNonce,
        phaseHook: async (phase) => {
          if (phase !== 'lock-fsynced') return;
          try { await publishAdmissionOverlap(loserRequest); } catch (error) { loserError = error; }
        },
      });
      expect(winner.complete).toBe(true);
      expect(loserError).toBeInstanceOf(OverlapPublicationContendedError);
      const loser = (loserError as OverlapPublicationContendedError).result;
      expect(loser).toMatchObject({ complete: false, recoveryRequired: false, status: 'contended' });
      expect(loser.transactionId).not.toBe(winner.transactionId);
      await expect(readFile(loser.transactionPath)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(loser.lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(stat(join(fixture.root, 'review/admission/global/overlap/generations', loser.generationSha256))).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(publishAdmissionOverlap(loserRequest)).rejects.toThrow('overlap_replace_expected_current_mismatch');
      const verification = await verifyAdmissionOverlap(fixture.root);
      expect(verification.ok).toBe(true);
      expect(verification.generationSha256).toBe(winner.generationSha256);
      expect(verification.generationSha256).not.toBe(loser.generationSha256);
      await expectParentTreeUnchanged(fixture.root, fixture.parentTree);
      await expect(readFile(fixture.unknownPath, 'utf8')).resolves.toBe('preserve this unknown file\n');
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('accepts the published envelope authority joins', async () => {
    const fixture = await replacementFixture('slopbrick-overlap-relations-valid');
    try {
      const current = JSON.parse(await readFile(fixture.baseline.currentPath, 'utf8')) as { generationRelativePath: string };
      const generation = JSON.parse(await readFile(join(fixture.root, current.generationRelativePath, 'generation.json'), 'utf8')) as Record<string, unknown>;
      const index = JSON.parse(await readFile(join(fixture.root, current.generationRelativePath, 'index.json'), 'utf8')) as Record<string, unknown>;
      const resource = JSON.parse(await readFile(join(fixture.root, current.generationRelativePath, 'overlap-resource-receipt.json'), 'utf8')) as Record<string, unknown>;
      const ledger = JSON.parse(await readFile(join(fixture.root, current.generationRelativePath, 'overlap-ledger.json'), 'utf8')) as Record<string, unknown>;
      expect(verifyOverlapArtifactRelations({ generation, index, resource, ledger })).toEqual({ ok: true, errors: [] });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('rejects mismatched authority hashes and completion/count joins', async () => {
    const fixture = await replacementFixture('slopbrick-overlap-relations-joins');
    try {
      const current = JSON.parse(await readFile(fixture.baseline.currentPath, 'utf8')) as { generationRelativePath: string };
      const generation = JSON.parse(await readFile(join(fixture.root, current.generationRelativePath, 'generation.json'), 'utf8')) as Record<string, unknown>;
      const index = JSON.parse(await readFile(join(fixture.root, current.generationRelativePath, 'index.json'), 'utf8')) as Record<string, unknown>;
      const resource = JSON.parse(await readFile(join(fixture.root, current.generationRelativePath, 'overlap-resource-receipt.json'), 'utf8')) as Record<string, unknown>;
      const ledger = JSON.parse(await readFile(join(fixture.root, current.generationRelativePath, 'overlap-ledger.json'), 'utf8')) as Record<string, unknown>;

      const changedIndexBase = { ...index, universeSha256: 'f'.repeat(64) };
      const changedIndex = { ...changedIndexBase, receiptSha256: calibrationAdmissionOverlapIndexReceiptSha256(changedIndexBase) };
      const changedResourceBase = { ...resource, recordCount: Number(resource.recordCount) + 1 };
      const changedResource = { ...changedResourceBase, receiptId: calibrationAdmissionOverlapResourceReceiptId(changedResourceBase) };
      const changedLedgerBase = { ...ledger, indexReceiptSha256: 'e'.repeat(64), coverageComplete: false };
      const changedLedger = { ...changedLedgerBase, ledgerSha256: calibrationAdmissionOverlapLedgerSha256(changedLedgerBase) };

      const result = verifyOverlapArtifactRelations({
        generation,
        index: changedIndex,
        resource: changedResource,
        ledger: changedLedger,
      });
      expect(result.ok).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        'overlap_relation_authority_hash_mismatch',
        'overlap_relation_index_ledger_mismatch',
        'overlap_relation_coverage_mismatch',
        'overlap_relation_completion_mismatch',
        'overlap_relation_count_mismatch',
      ]));
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('rejects invalid envelope self-hashes and a substituted envelope path set', async () => {
    const fixture = await replacementFixture('slopbrick-overlap-relations-shape');
    try {
      const current = JSON.parse(await readFile(fixture.baseline.currentPath, 'utf8')) as { generationRelativePath: string };
      const generation = JSON.parse(await readFile(join(fixture.root, current.generationRelativePath, 'generation.json'), 'utf8')) as Record<string, unknown>;
      const index = JSON.parse(await readFile(join(fixture.root, current.generationRelativePath, 'index.json'), 'utf8')) as Record<string, unknown>;
      const resource = JSON.parse(await readFile(join(fixture.root, current.generationRelativePath, 'overlap-resource-receipt.json'), 'utf8')) as Record<string, unknown>;
      const ledger = JSON.parse(await readFile(join(fixture.root, current.generationRelativePath, 'overlap-ledger.json'), 'utf8')) as Record<string, unknown>;
      const invalidHash = verifyOverlapArtifactRelations({
        generation,
        index: { ...index, receiptSha256: '0'.repeat(64) },
        resource,
        ledger,
      });
      expect(invalidHash.ok).toBe(false);
      expect(invalidHash.errors).toContain('overlap_relation_index_invalid');

      const withoutIndexBase = {
        ...generation,
        artifacts: (generation.artifacts as readonly Record<string, unknown>[]).filter((artifact) => artifact.relativePath !== 'index.json'),
      };
      const withoutIndex = {
        ...withoutIndexBase,
        generationSha256: calibrationAdmissionOverlapGenerationSha256(withoutIndexBase),
      };
      const missingEnvelope = verifyOverlapArtifactRelations({ generation: withoutIndex, index, resource, ledger });
      expect(missingEnvelope.ok).toBe(false);
      expect(missingEnvelope.errors).toContain('overlap_relation_envelope_missing:index.json');

      const substitutedArtifactBase = {
        ...generation,
        artifacts: (generation.artifacts as readonly Record<string, unknown>[]).map((artifact) => artifact.relativePath === 'index.json'
          ? { ...artifact, sha256: 'f'.repeat(64) }
          : artifact),
      };
      const substitutedArtifact = {
        ...substitutedArtifactBase,
        artifactSetSha256: calibrationAdmissionOverlapGenerationArtifactSetSha256(substitutedArtifactBase.artifacts as CalibrationAdmissionArtifactReceiptV1[]),
      };
      const substitutedGenerationBase = { ...substitutedArtifact };
      delete (substitutedGenerationBase as Record<string, unknown>).generationSha256;
      const substitutedGeneration = {
        ...substitutedGenerationBase,
        generationSha256: calibrationAdmissionOverlapGenerationSha256(substitutedGenerationBase),
      };
      const bindingMismatch = verifyOverlapArtifactRelations({ generation: substitutedGeneration, index, resource, ledger });
      expect(bindingMismatch.ok).toBe(false);
      expect(bindingMismatch.errors).toContain('overlap_relation_envelope_binding:index.json');
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it('checks envelope relations for an explicitly selected non-current generation', async () => {
    const fixture = await replacementFixture('slopbrick-overlap-relations-selected');
    try {
      const replacement = await publishAdmissionOverlap({
        root: fixture.root, generationLocalRoot: fixture.work, buildResult: fixture.buildResult,
        universe: fixture.universe, policy, normalizerRegistry: fixture.normalizers,
        operation: 'replace', expectedCurrentGenerationSha256: fixture.baseline.generationSha256,
        generation: 1, inputGenerationSha256: '6'.repeat(64), invocationIntentId: '1'.repeat(64),
        toolAuthoritySnapshot: toolAuthority('1'.repeat(64), '2'.repeat(64)),
        toolReceipt: { receiptId: '2'.repeat(64), receiptSha256: '3'.repeat(64), authorityIndexSha256: 'c'.repeat(64) },
        recoveryNonce: '7'.repeat(64),
      });
      const current = JSON.parse(await readFile(replacement.currentPath, 'utf8')) as { generationRelativePath: string };
      const currentDirectory = join(fixture.root, current.generationRelativePath);
      const generation = JSON.parse(await readFile(join(currentDirectory, 'generation.json'), 'utf8')) as Record<string, unknown>;
      const index = JSON.parse(await readFile(join(currentDirectory, 'index.json'), 'utf8')) as Record<string, unknown>;
      const changedIndexBase = { ...index, universeSha256: 'f'.repeat(64) };
      const changedIndex = { ...changedIndexBase, receiptSha256: calibrationAdmissionOverlapIndexReceiptSha256(changedIndexBase) };
      const changedIndexBytes = Buffer.from(calibrationAdmissionCanonicalJson(changedIndex), 'utf8');
      const changedArtifacts = (generation.artifacts as readonly Record<string, unknown>[]).map((artifact) => artifact.relativePath === 'index.json'
        ? { ...artifact, bytes: changedIndexBytes.byteLength, sha256: sha256(changedIndexBytes) }
        : artifact);
      const clonedGenerationBase = {
        ...generation,
        artifacts: changedArtifacts,
        artifactSetSha256: calibrationAdmissionOverlapGenerationArtifactSetSha256(changedArtifacts),
      };
      const clonedGeneration = {
        ...clonedGenerationBase,
        generationSha256: calibrationAdmissionOverlapGenerationSha256(clonedGenerationBase),
      };
      const cloneDirectory = join(fixture.root, 'review/admission/global/overlap/generations', clonedGeneration.generationSha256 as string);
      await cp(currentDirectory, cloneDirectory, { recursive: true });
      await writeFile(join(cloneDirectory, 'index.json'), changedIndexBytes);
      await writeFile(join(cloneDirectory, 'generation.json'), calibrationAdmissionCanonicalJson(clonedGeneration));

      const result = await verifyAdmissionOverlap(fixture.root, clonedGeneration.generationSha256 as string);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain('overlap_relation_authority_hash_mismatch');
      await rm(cloneDirectory, { recursive: true, force: true });
      const missing = await verifyAdmissionOverlap(fixture.root, clonedGeneration.generationSha256 as string);
      expect(missing.ok).toBe(false);
      expect(missing.errors).toContain('overlap_generation_missing');
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });
});
