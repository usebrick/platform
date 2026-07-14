import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  FROZEN_ADMISSION_ACTIONS,
  FROZEN_ADMISSION_PROFILE_IDS,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionEvidenceBundleSha256,
  calibrationAdmissionEvidenceIndexSha256,
  calibrationAdmissionEvidencePayloadSetSha256,
  calibrationAdmissionPolicySha256,
  calibrationAdmissionSha256,
  calibrationAdmissionToolProfileSha256,
  expandAdmissionWitnessConstraints,
  isCalibrationAdmissionEvidenceCasTransactionV1,
  isCalibrationEvidenceCasPrimaryCompletionV1,
  type CalibrationAdmissionEvidenceBundleV1,
  type CalibrationAdmissionPolicyV1,
  type AdmissionWitnessPolicyV1,
} from '@usebrick/core';

import {
  admissionEvidenceCasRelativePath,
  admissionEvidenceCasTransactionId,
  putAdmissionEvidenceCas,
  readAdmissionEvidenceCasBytes,
  recoverAdmissionEvidenceCas,
} from '../../src/calibration/v103/admission-evidence-cas';
import {
  buildVerifiedAdmissionEvidenceContext,
  isVerifiedAdmissionEvidenceContext,
} from '../../src/calibration/v103/admission-evidence-context';

const roots: string[] = [];
const sha = (value: string) => value.repeat(64);

function profiles() {
  const accessReadOnly = new Set([
    'admission-context-v1',
    'admission-static-ledgers-v1',
    'admission-census-v1',
    'admission-manifest-v1',
    'admission-source-node-v1',
    'admission-source-parquet-v1',
    'admission-git-acquire-v1',
    'admission-release-acquire-v1',
    'admission-evidence-acquire-v1',
  ]);
  const network = (profileId: string) => profileId === 'admission-git-acquire-v1'
    ? { mode: 'exact_authorized_https' as const, transport: 'git' as const }
    : profileId === 'admission-release-acquire-v1'
      ? { mode: 'exact_authorized_https' as const, transport: 'release_asset' as const }
      : profileId === 'admission-evidence-acquire-v1'
        ? { mode: 'exact_authorized_https' as const, transport: 'evidence' as const }
        : { mode: 'deny' as const };
  return FROZEN_ADMISSION_PROFILE_IDS.map((profileId) => {
    const withoutHash = {
    version: 'v10.3-admission-tool-profile-v1' as const,
    profileId,
    allowedExecutableIds: ['corepack-pnpm', 'node'],
    allowedActions: [...FROZEN_ADMISSION_ACTIONS[profileId]],
    candidateByteAccess: accessReadOnly.has(profileId) ? 'read_only' as const : 'none' as const,
    network: network(profileId),
    resourceLimits: { maxHeapMiB: 2048, maxWallSeconds: 3600 },
    };
    return { ...withoutHash, profileSha256: calibrationAdmissionToolProfileSha256(withoutHash) };
  });
}

function policy(): CalibrationAdmissionPolicyV1 {
  const admissionProfiles = profiles();
  const withoutHash = {
    version: 'v10.3-admission-policy-v1' as const,
    policyId: 'v10.3-admission-v1' as const,
    initialRegisterEntryCount: 329 as const,
    selectedCoverage: 452382 as const,
    baselineMaterialUnits: 58089 as const,
    repositoryMaterialUnits: 394293 as const,
    labels: { positive: 'verified_ai' as const, negative: 'verified_human' as const },
    evidenceCasPolicy: 'sha256-wx-fsync-v1' as const,
    overlapPolicy: 'prefix-filter-exact-jaccard-0.80-v1' as const,
    reasonVocabularySha256: sha('a'),
    toolProfileSha256s: admissionProfiles.map((profile) => profile.profileSha256).sort(),
    smoke: {
      unitsPerPolarity: 100 as const,
      maxSourceOrFamilyUnitsPerPolarity: 50 as const,
      minimumSourcesPerPolarity: 2 as const,
      minimumFamiliesPerPolarity: 3 as const,
      minimumLanguages: 2 as const,
      minimumUnitsPerRepresentedLanguagePerPolarity: 20 as const,
    },
    canary: {
      unitsPerPolarity: 5000 as const,
      maxSourceUnitsPerPolarity: 500 as const,
      maxFamilyUnitsPerPolarity: 1000 as const,
      minimumSourcesPerPolarity: 10 as const,
      minimumFamiliesPerPolarity: 5 as const,
      minimumLanguages: 3 as const,
      minimumUnitsPerLanguagePerPolarity: 250 as const,
      minimumFamiliesPerLanguagePerPolarity: 3 as const,
      minimumAiGeneratorFamilies: 3 as const,
    },
  };
  return { ...withoutHash, policySha256: calibrationAdmissionPolicySha256(withoutHash) };
}

function witness(durablePolicy: CalibrationAdmissionPolicyV1, gate: 'smoke' | 'canary'): AdmissionWitnessPolicyV1 {
  const withoutHash = {
    version: 'v10.3-admission-witness-policy-v1' as const,
    policyId: durablePolicy.policyId,
    gate,
    algorithm: 'lexicographic-bnb-feasibility-v1' as const,
    seed: 'slopbrick-v10.3-admission-review-v1' as const,
    maxSearchNodes: (gate === 'smoke' ? 10000000 : 50000000) as 10000000 | 50000000,
    constraints: expandAdmissionWitnessConstraints(durablePolicy, gate),
    constraintsSha256: '',
  };
  const withConstraintsHash = { ...withoutHash, constraintsSha256: calibrationAdmissionSha256(withoutHash.constraints) };
  return { ...withConstraintsHash, witnessPolicySha256: calibrationAdmissionPolicySha256(withConstraintsHash) };
}

function emptyBundle(): CalibrationAdmissionEvidenceBundleV1 {
  const durablePolicy = policy();
  const toolAuthorityWithoutHash = {
    version: 'v10.3-admission-tool-authority-snapshot-v1' as const,
    indexGenerationSha256: sha('d'),
    profileIds: profiles().map((profile) => profile.profileId).sort(),
    invocationIntentIds: [] as string[],
    receiptIds: [] as string[],
  };
  const toolAuthoritySnapshot = { ...toolAuthorityWithoutHash, snapshotSha256: calibrationAdmissionSha256(toolAuthorityWithoutHash) };
  const acquisitionAuthorityWithoutHash = {
    version: 'v10.3-admission-acquisition-snapshot-v1' as const,
    indexGenerationSha256: sha('e'),
    artifactKeys: [] as string[],
  };
  const acquisitionAuthoritySnapshot = { ...acquisitionAuthorityWithoutHash, snapshotSha256: calibrationAdmissionSha256(acquisitionAuthorityWithoutHash) };
  const evidenceIndexWithoutHash = { version: 'v10.3-admission-evidence-index-v1' as const, items: [] as never[], indexSha256: '' };
  const evidenceIndex = { ...evidenceIndexWithoutHash, indexSha256: calibrationAdmissionEvidenceIndexSha256(evidenceIndexWithoutHash) };
  const payloadSetWithoutHash = { version: 'v10.3-admission-evidence-payload-set-v1' as const, casPolicy: 'sha256-wx-fsync-v1' as const, payloads: [] as never[], payloadSetSha256: '' };
  const evidencePayloadSet = { ...payloadSetWithoutHash, payloadSetSha256: calibrationAdmissionEvidencePayloadSetSha256(payloadSetWithoutHash) };
  const withoutHash = {
    version: 'v10.3-admission-evidence-bundle-v1' as const,
    policy: durablePolicy,
    witnessPolicies: [witness(durablePolicy, 'canary'), witness(durablePolicy, 'smoke')] as [AdmissionWitnessPolicyV1, AdmissionWitnessPolicyV1],
    toolProfiles: profiles(),
    invocationIntents: [],
    toolReceipts: [],
    toolAuthoritySnapshot,
    evidenceIndex,
    evidencePayloadSet,
    approvedEvidenceAcquisitions: [],
    evidenceAcquisitionReceipts: [],
    evidenceAcquisitionEnvelopes: [],
    acquisitionAuthoritySnapshot,
    evidenceReceipts: [],
    materializationReceipts: [],
    bundleSha256: '',
  };
  return { ...withoutHash, bundleSha256: calibrationAdmissionEvidenceBundleSha256(withoutHash) } as CalibrationAdmissionEvidenceBundleV1;
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'slopbrick-admission-evidence-'));
  roots.push(root);
  return root;
}

async function recoveryOptions(root: string, transactionId: string) {
  const transaction = JSON.parse(await readFile(join(root, 'evidence-cas', 'transactions', `${transactionId}.json`), 'utf8')) as { readonly recoveryNonce: string };
  return { recoveryNonce: transaction.recoveryNonce, acknowledgeNoLiveWriter: true as const };
}

async function findTransactionId(root: string): Promise<string> {
  const entries = await readdir(join(root, 'evidence-cas', 'transactions'));
  const transaction = entries.find((entry) => entry.endsWith('.json') && !entry.endsWith('.network.json'));
  if (!transaction) throw new Error('CAS transaction journal was not created');
  return transaction.slice(0, -'.json'.length);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('v10.3 offline admission evidence context', () => {
  it('publishes a hash-derived CAS object idempotently and rehashes reads', async () => {
    const root = await temporaryRoot();
    const bytes = Buffer.from('offline-evidence', 'utf8');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const first = await putAdmissionEvidenceCas({ root, bytes, authorizationId: 'auth-1' });
    const second = await putAdmissionEvidenceCas({ root, bytes, authorizationId: 'auth-1' });

    expect(first.finalRelativePath).toBe(admissionEvidenceCasRelativePath(digest));
    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(true);
    expect(await readAdmissionEvidenceCasBytes(root, digest)).toEqual(bytes);
    expect(await readFile(join(root, first.finalRelativePath))).toEqual(bytes);
  });

  it('derives a stable transaction identity from immutable CAS intent', async () => {
    const firstRoot = await temporaryRoot();
    const secondRoot = await temporaryRoot();
    const bytes = Buffer.from('deterministic-cas-identity', 'utf8');
    const first = await putAdmissionEvidenceCas({ root: firstRoot, bytes, authorizationId: 'auth-deterministic' });
    const second = await putAdmissionEvidenceCas({ root: secondRoot, bytes, authorizationId: 'auth-deterministic' });
    expect(first.transactionId).toMatch(/^[a-f0-9]{64}$/);
    expect(second.transactionId).toBe(first.transactionId);
    const transaction = JSON.parse(await readFile(join(firstRoot, 'evidence-cas', 'transactions', `${first.transactionId}.json`), 'utf8')) as Record<string, unknown>;
    expect(admissionEvidenceCasTransactionId({
      authorizationId: String(transaction.authorizationId),
      reservationSha256: String(transaction.reservationSha256),
      evidenceId: String(transaction.evidenceId),
      finalRelativePath: String(transaction.finalRelativePath),
      temporaryRelativePath: String(transaction.temporaryRelativePath),
      expectedBytes: Number(transaction.expectedBytes),
      expectedSha256: String(transaction.expectedSha256),
      invocationIntentId: String(transaction.invocationIntentId),
      recoveryNonce: String(transaction.recoveryNonce),
    })).toBe(first.transactionId);
  });

  it('rejects a self-rehashed transaction whose immutable intent changed', async () => {
    const root = await temporaryRoot();
    await expect(putAdmissionEvidenceCas({
      root,
      bytes: 'tampered-cas-intent',
      authorizationId: 'auth-tampered-cas-intent',
      phaseHook: (phase) => { if (phase === 'temporary-fsynced') throw new Error('stop-cas-intent'); },
    })).rejects.toThrow('stop-cas-intent');
    const transactionId = await findTransactionId(root);
    const transactionPath = join(root, 'evidence-cas', 'transactions', `${transactionId}.json`);
    const transaction = JSON.parse(await readFile(transactionPath, 'utf8')) as Record<string, unknown>;
    const { transactionSha256: _oldTransactionSha256, ...withoutHash } = { ...transaction, expectedBytes: Number(transaction.expectedBytes) + 1 };
    const tampered = { ...withoutHash, transactionSha256: calibrationAdmissionSha256(withoutHash) };
    await writeFile(transactionPath, calibrationAdmissionCanonicalJson(tampered));
    await expect(recoverAdmissionEvidenceCas(root, transactionId, await recoveryOptions(root, transactionId)))
      .rejects.toThrow(/transaction id .*immutable intent/i);
  });

  it('rejects an idempotent retry when the occupied CAS object bytes changed', async () => {
    const root = await temporaryRoot();
    const first = await putAdmissionEvidenceCas({ root, bytes: 'occupied-cas', authorizationId: 'auth-idempotent-collision' });
    await writeFile(join(root, first.finalRelativePath), 'tampered-cas');
    await expect(putAdmissionEvidenceCas({
      root,
      bytes: 'occupied-cas',
      authorizationId: 'auth-idempotent-collision',
    })).rejects.toThrow(/final bytes mismatch|collision/i);
  });

  it('recovers a transaction after an interruption before final publication', async () => {
    const root = await temporaryRoot();
    const bytes = Buffer.from('recover-me', 'utf8');
    await expect(putAdmissionEvidenceCas({
      root,
      bytes,
      authorizationId: 'auth-recover',
      phaseHook: (phase) => {
        if (phase === 'temporary-fsynced') throw new Error('simulated interruption');
      },
    })).rejects.toThrow('simulated interruption');

    const transactionId = await findTransactionId(root);
    const recovered = await recoverAdmissionEvidenceCas(root, transactionId, await recoveryOptions(root, transactionId));
    expect(recovered.recovered).toBe(true);
    expect(await readAdmissionEvidenceCasBytes(root, recovered.sha256)).toEqual(bytes);
  });

  it('does not reuse a transaction journal for a different authorization', async () => {
    const root = await temporaryRoot();
    const first = await putAdmissionEvidenceCas({ root, bytes: 'first', authorizationId: 'auth-first' });
    await expect(putAdmissionEvidenceCas({ root, bytes: 'first', transactionId: first.transactionId, authorizationId: 'auth-second' })).rejects.toThrow(/transaction id .*immutable intent/i);
  });

  it('persists a Core-schema-valid transaction at every durable CAS phase', async () => {
    const phaseCases: Array<{ readonly name: string; readonly expectedPhase: string; readonly stop: (phase: string) => boolean }> = [
      { name: 'intent', expectedPhase: 'intent_fsynced', stop: (phase) => phase === 'intent-fsynced' },
      { name: 'observation', expectedPhase: 'network_observation_fsynced', stop: (phase) => phase === 'network-observation-fsynced' },
      {
        name: 'temporary',
        expectedPhase: 'temporary_fsynced',
        stop: (() => {
          let updates = 0;
          return (phase: string) => phase === 'transaction-fsynced' && ++updates === 1;
        })(),
      },
      { name: 'promoted', expectedPhase: 'temporary_fsynced', stop: (phase) => phase === 'object-promoted' },
      { name: 'directories', expectedPhase: 'object_promoted', stop: (phase) => phase === 'cas-directories-fsynced' },
      { name: 'temporary-removed', expectedPhase: 'cas_directories_fsynced', stop: (phase) => phase === 'temporary-removed' },
      { name: 'primary', expectedPhase: 'temporary_removed', stop: (phase) => phase === 'primary-completion-fsynced' },
      {
        name: 'complete',
        expectedPhase: 'cas_complete_waiting_metadata',
        stop: (() => {
          let updates = 0;
          return (phase: string) => phase === 'transaction-fsynced' && ++updates === 5;
        })(),
      },
    ];

    for (const testCase of phaseCases) {
      const root = await temporaryRoot();
      await expect(putAdmissionEvidenceCas({
        root,
        bytes: `phase-${testCase.name}`,
        authorizationId: `auth-phase-${testCase.name}`,
        phaseHook: (phase) => {
          if (testCase.stop(phase)) throw new Error(`stop-${testCase.name}`);
        },
      })).rejects.toThrow(`stop-${testCase.name}`);

      const transactionId = await findTransactionId(root);
      const transactionPath = join(root, 'evidence-cas', 'transactions', `${transactionId}.json`);
      const transaction = JSON.parse(await readFile(transactionPath, 'utf8')) as unknown;
      expect(isCalibrationAdmissionEvidenceCasTransactionV1(transaction)).toBe(true);
      expect((transaction as { readonly state: { readonly phase: string } }).state.phase).toBe(testCase.expectedPhase);
    }
  });

  it('recovers after representative durable phase interruptions', async () => {
    const interruptions = ['temporary-fsynced', 'object-promoted', 'cas-directories-fsynced', 'temporary-removed', 'primary-completion-fsynced'] as const;

    for (const interruption of interruptions) {
      const root = await temporaryRoot();
      const bytes = Buffer.from(`recover-${interruption}`, 'utf8');
      await expect(putAdmissionEvidenceCas({
        root,
        bytes,
        authorizationId: `auth-recover-${interruption}`,
        phaseHook: (phase) => {
          if (phase === interruption) throw new Error(`interrupt-${interruption}`);
        },
      })).rejects.toThrow(`interrupt-${interruption}`);

      const transactionId = await findTransactionId(root);
      const recovered = await recoverAdmissionEvidenceCas(root, transactionId, await recoveryOptions(root, transactionId));
      expect(recovered.recovered).toBe(true);
      expect(await readAdmissionEvidenceCasBytes(root, recovered.sha256)).toEqual(bytes);
      const transaction = JSON.parse(await readFile(join(root, 'evidence-cas', 'transactions', `${transactionId}.json`), 'utf8')) as unknown;
      expect(isCalibrationAdmissionEvidenceCasTransactionV1(transaction)).toBe(true);
      expect((transaction as { readonly state: { readonly phase: string } }).state.phase).toBe('cas_complete_waiting_metadata');
    }
  });

  it('rejects substituted CAS temporary bytes before linking and permits a clean retry', async () => {
    const root = await temporaryRoot();
    const bytes = Buffer.from('expected-temporary-bytes', 'utf8');
    await expect(putAdmissionEvidenceCas({
      root,
      bytes,
      authorizationId: 'auth-temp-substitution',
      phaseHook: (phase) => {
        if (phase === 'temporary-fsynced') throw new Error('stop-temp-substitution');
      },
    })).rejects.toThrow('stop-temp-substitution');

    const transactionId = await findTransactionId(root);
    const temporaryPath = join(root, 'evidence-cas', 'transactions', `${transactionId}.tmp`);
    const transaction = JSON.parse(await readFile(join(root, 'evidence-cas', 'transactions', `${transactionId}.json`), 'utf8')) as { readonly expectedSha256: string };
    await writeFile(temporaryPath, 'substituted-temporary');
    await expect(recoverAdmissionEvidenceCas(root, transactionId, await recoveryOptions(root, transactionId))).rejects.toThrow(/temporary bytes mismatch/i);
    await expect(readAdmissionEvidenceCasBytes(root, transaction.expectedSha256)).rejects.toThrow();

    await writeFile(temporaryPath, bytes);
    const recovered = await recoverAdmissionEvidenceCas(root, transactionId, await recoveryOptions(root, transactionId));
    expect(recovered.recovered).toBe(true);
    expect(await readAdmissionEvidenceCasBytes(root, transaction.expectedSha256)).toEqual(bytes);
  });

  it('rejects symlinked CAS network observations during write and recovery', async () => {
    const root = await temporaryRoot();
    const outside = await temporaryRoot();
    await writeFile(join(outside, 'observation.json'), calibrationAdmissionCanonicalJson({ outside: true }));
    await expect(putAdmissionEvidenceCas({
      root,
      bytes: 'observation-write-symlink',
      authorizationId: 'auth-observation-write-symlink',
      phaseHook: async (phase) => {
        if (phase === 'intent-fsynced') {
          const transactionId = await findTransactionId(root);
          await symlink(join(outside, 'observation.json'), join(root, 'evidence-cas', 'transactions', `${transactionId}.network.json`));
        }
      },
    })).rejects.toThrow(/regular file|escapes/i);

    const recoveryRoot = await temporaryRoot();
    await expect(putAdmissionEvidenceCas({
      root: recoveryRoot,
      bytes: 'observation-recovery-symlink',
      authorizationId: 'auth-observation-recovery-symlink',
      phaseHook: (phase) => {
        if (phase === 'network-observation-fsynced') throw new Error('stop-observation-recovery-symlink');
      },
    })).rejects.toThrow('stop-observation-recovery-symlink');
    const recoveryId = await findTransactionId(recoveryRoot);
    const recoveryObservationPath = join(recoveryRoot, 'evidence-cas', 'transactions', `${recoveryId}.network.json`);
    await rm(recoveryObservationPath);
    await symlink(join(outside, 'observation.json'), recoveryObservationPath);
    await expect(recoverAdmissionEvidenceCas(recoveryRoot, recoveryId, await recoveryOptions(recoveryRoot, recoveryId))).rejects.toThrow(/regular file|escapes/i);
  });

  it('rejects a tampered primary completion during recovery', async () => {
    const root = await temporaryRoot();
    const result = await putAdmissionEvidenceCas({
      root,
      bytes: 'tamper-primary',
      authorizationId: 'auth-primary-tamper',
    });
    const primaryPath = join(root, result.primaryCompletionRelativePath);
    const primary = JSON.parse(await readFile(primaryPath, 'utf8')) as Record<string, unknown>;
    expect(isCalibrationEvidenceCasPrimaryCompletionV1(primary)).toBe(true);
    await writeFile(primaryPath, JSON.stringify({ ...primary, observedBytes: Number(primary.observedBytes) + 1 }));

    await expect(recoverAdmissionEvidenceCas(root, result.transactionId, await recoveryOptions(root, result.transactionId))).rejects.toThrow(/primary completion is invalid/i);
    expect(isCalibrationEvidenceCasPrimaryCompletionV1(JSON.parse(await readFile(primaryPath, 'utf8')))).toBe(false);
  });

  it('requires an explicit recovery nonce and no-live-writer acknowledgement', async () => {
    const root = await temporaryRoot();
    const recoveryNonce = sha('a');
    const options = { recoveryNonce, acknowledgeNoLiveWriter: true as const };
    await expect(putAdmissionEvidenceCas({
      root,
      bytes: 'recovery-authority',
      authorizationId: 'auth-recovery-authority',
      recoveryNonce: options.recoveryNonce,
      phaseHook: (phase) => {
        if (phase === 'temporary-fsynced') throw new Error('stop-recovery-authority');
      },
    })).rejects.toThrow('stop-recovery-authority');

    const recoveredTransactionId = await findTransactionId(root);
    const untypedRecovery = recoverAdmissionEvidenceCas as unknown as (root: string, transactionId: string, options?: unknown) => Promise<unknown>;
    await expect(untypedRecovery(root, recoveredTransactionId)).rejects.toThrow(/no-live-writer acknowledgement/i);
    await expect(untypedRecovery(root, recoveredTransactionId, {
      recoveryNonce: options.recoveryNonce,
      acknowledgeNoLiveWriter: false,
    })).rejects.toThrow(/no-live-writer acknowledgement/i);
    await expect(untypedRecovery(root, recoveredTransactionId, {
      recoveryNonce: sha('b'),
      acknowledgeNoLiveWriter: true,
    })).rejects.toThrow(/nonce mismatch/i);
    await expect(recoverAdmissionEvidenceCas(root, recoveredTransactionId, options)).resolves.toMatchObject({ recovered: true });
  });

  it('binds a recomputed primary completion to its recovered transaction', async () => {
    const root = await temporaryRoot();
    const result = await putAdmissionEvidenceCas({
      root,
      bytes: 'primary-transaction-binding',
      authorizationId: 'auth-primary-binding',
    });
    const transactionPath = join(root, 'evidence-cas', 'transactions', `${result.transactionId}.json`);
    const transaction = JSON.parse(await readFile(transactionPath, 'utf8')) as Record<string, unknown>;
    const state = transaction.state as Record<string, unknown>;
    const primaryPath = join(root, String(state.primaryCompletionRelativePath));
    const primary = JSON.parse(await readFile(primaryPath, 'utf8')) as Record<string, unknown>;
    const { primaryCompletionSha256: _oldPrimarySha, ...tamperedWithoutHash } = { ...primary, transactionId: 'txn-other-binding' };
    const tamperedPrimarySha = calibrationAdmissionSha256(tamperedWithoutHash);
    const tamperedPrimary = { ...tamperedWithoutHash, primaryCompletionSha256: tamperedPrimarySha };
    const tamperedPrimaryPath = join(root, 'evidence-cas', 'completions', `${tamperedPrimarySha}.json`);
    await writeFile(tamperedPrimaryPath, calibrationAdmissionCanonicalJson(tamperedPrimary));

    const nextState = {
      ...state,
      primaryCompletionRelativePath: `evidence-cas/completions/${tamperedPrimarySha}.json`,
      primaryCompletionSha256: tamperedPrimarySha,
    };
    const { transactionSha256: _oldTransactionSha, ...transactionWithoutHash } = { ...transaction, state: nextState };
    const nextTransaction = { ...transactionWithoutHash, transactionSha256: calibrationAdmissionSha256(transactionWithoutHash) };
    await writeFile(transactionPath, calibrationAdmissionCanonicalJson(nextTransaction));

    await expect(recoverAdmissionEvidenceCas(root, result.transactionId, await recoveryOptions(root, result.transactionId)))
      .rejects.toThrow(/primary completion transactionId mismatch/i);
  });

  it('makes recovery idempotent after the first recovery completion', async () => {
    const root = await temporaryRoot();
    const options = { recoveryNonce: sha('c'), acknowledgeNoLiveWriter: true as const };
    await expect(putAdmissionEvidenceCas({
      root,
      bytes: 'repeat-recovery',
      authorizationId: 'auth-recovery-repeat',
      recoveryNonce: options.recoveryNonce,
      phaseHook: (phase) => {
        if (phase === 'temporary-fsynced') throw new Error('stop-recovery-repeat');
      },
    })).rejects.toThrow('stop-recovery-repeat');

    const transactionId = await findTransactionId(root);
    const first = await recoverAdmissionEvidenceCas(root, transactionId, options);
    const second = await recoverAdmissionEvidenceCas(root, transactionId, options);
    expect(first.recovered).toBe(true);
    expect(second.recovered).toBe(true);
    expect(second.primaryCompletionSha256).toBe(first.primaryCompletionSha256);
    expect(await readAdmissionEvidenceCasBytes(root, second.sha256)).toEqual(Buffer.from('repeat-recovery'));
  });

  it('cleans the losing transaction journal for a same-authorization race', async () => {
    const root = await temporaryRoot();
    // Pre-create the CAS root so this race exercises the authorization
    // reservation boundary rather than two writers racing on mkdir itself.
    const raceDigest = createHash('sha256').update('same-authorization').digest('hex');
    await mkdir(join(root, 'evidence-cas', 'sha256', raceDigest.slice(0, 2)), { recursive: true });
    await mkdir(join(root, 'evidence-cas', 'transactions'), { recursive: true });
    await mkdir(join(root, 'evidence-cas', 'reservations'), { recursive: true });
    await mkdir(join(root, 'evidence-cas', 'completions'), { recursive: true });
    const outcomes = await Promise.allSettled([
      putAdmissionEvidenceCas({ root, bytes: 'same-authorization', authorizationId: 'auth-race', invocationIntentId: sha('a') }),
      putAdmissionEvidenceCas({ root, bytes: 'same-authorization', authorizationId: 'auth-race', invocationIntentId: sha('b') }),
    ]);
    const fulfilled = outcomes.filter((outcome): outcome is PromiseFulfilledResult<{ readonly transactionId: string }> => outcome.status === 'fulfilled');
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String((rejected[0] as PromiseRejectedResult).reason)).toMatch(/reservation collision/i);

    const entries = await readdir(join(root, 'evidence-cas', 'transactions'));
    const transactionIds = entries.filter((entry) => entry.endsWith('.json') && !entry.endsWith('.network.json')).map((entry) => entry.slice(0, -'.json'.length)).sort();
    expect(transactionIds).toEqual([fulfilled[0]!.value.transactionId]);
  });

  it('rejects a symlinked CAS root instead of following it', async () => {
    const root = await temporaryRoot();
    const outside = await temporaryRoot();
    await symlink(outside, join(root, 'evidence-cas'));
    await expect(putAdmissionEvidenceCas({ root, bytes: 'no-follow' })).rejects.toThrow(/not a directory|escapes/i);
  });

  it('verifies a fixed bundle and rejects a cloned context brand', async () => {
    const root = await temporaryRoot();
    const bundle = emptyBundle();
    await writeFile(join(root, 'evidence-bundle.json'), calibrationAdmissionCanonicalJson(bundle));

    const result = await buildVerifiedAdmissionEvidenceContext(root);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isVerifiedAdmissionEvidenceContext(result.context)).toBe(true);
    expect(isVerifiedAdmissionEvidenceContext(structuredClone(result.context))).toBe(false);
    expect(Object.isFrozen(result.context)).toBe(true);
    expect(result.context.verifiedEvidenceIds).toEqual([]);
  });

  it('rejects a symlinked fixed bundle path instead of following it', async () => {
    const root = await temporaryRoot();
    const outside = await temporaryRoot();
    await writeFile(join(outside, 'evidence-bundle.json'), calibrationAdmissionCanonicalJson(emptyBundle()));
    await symlink(join(outside, 'evidence-bundle.json'), join(root, 'evidence-bundle.json'));
    const result = await buildVerifiedAdmissionEvidenceContext(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toMatch(/regular file|symlink|unable to read/i);
  });

  it('requires the requested profile and invocation intent to exist in the bundle', async () => {
    const root = await temporaryRoot();
    await writeFile(join(root, 'evidence-bundle.json'), calibrationAdmissionCanonicalJson(emptyBundle()));
    const result = await buildVerifiedAdmissionEvidenceContext(root, {
      expectedProfileId: 'admission-context-v1',
      expectedInvocationIntentId: sha('1'),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('\n')).toMatch(/invocation intent .*not present/i);
  });

  it('accepts the canonical v10.3 project root and resolves review/admission', async () => {
    const root = await temporaryRoot();
    const admission = join(root, 'review', 'admission');
    await mkdir(admission, { recursive: true });
    await writeFile(join(admission, 'evidence-bundle.json'), calibrationAdmissionCanonicalJson(emptyBundle()));
    const result = await buildVerifiedAdmissionEvidenceContext(root);
    expect(result.ok).toBe(true);
  });

  it('fails closed when the bundle hash or root input is invalid', async () => {
    const root = await temporaryRoot();
    await writeFile(join(root, 'evidence-bundle.json'), JSON.stringify({ version: 'bad' }));
    const result = await buildVerifiedAdmissionEvidenceContext(root);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('\n')).toMatch(/bundle/i);
    await expect(readAdmissionEvidenceCasBytes(root, 'not-a-sha')).rejects.toThrow(/SHA-256/i);
    await expect(buildVerifiedAdmissionEvidenceContext(root, { bundle: emptyBundle() })).resolves.toMatchObject({ ok: false });
  });
});
