import { createHash } from 'node:crypto';
import { readFile, symlink, writeFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionNormalizerRegistrySha256,
  calibrationAdmissionOverlapPolarityBindingSha256,
  calibrationAdmissionOverlapPolicySha256,
  calibrationAdmissionOverlapUniverseRecordSha256,
  calibrationAdmissionOverlapUniverseSha256,
  isCalibrationAdmissionOverlapCheckpointV1,
  type AdmissionNormalizerRegistryV1,
  type AdmissionOverlapPolicyV1,
  type AdmissionOverlapUniverseRecordV1,
  type AdmissionOverlapUniverseV1,
} from '@usebrick/core';

import { ADMISSION_LEXICAL_RUNTIME_BINDINGS, normalizeAdmissionBytes } from '../../src/calibration/v103/admission-normalizers';
import {
  buildAdmissionOverlapLedger,
  type AdmissionOverlapBuildOptions,
} from '../../src/calibration/v103/admission-overlap';

const sha256 = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex');

function registry(): AdmissionNormalizerRegistryV1 {
  const base = {
    version: 'v10.3-admission-normalizers-v1' as const,
    entries: [{
      language: 'TypeScript',
      normalizerId: 'normalizer-typescript-v1',
      implementationSha256: ADMISSION_LEXICAL_RUNTIME_BINDINGS[0]!.implementationSha256,
      fixturesSha256: ADMISSION_LEXICAL_RUNTIME_BINDINGS[0]!.fixturesSha256,
      utf8Policy: 'strict' as const,
      shingleSize: 5 as const,
    }],
  };
  return { ...base, registrySha256: calibrationAdmissionNormalizerRegistrySha256(base) };
}

const policyBase: Omit<AdmissionOverlapPolicyV1, 'policySha256'> = {
  version: 'v10.3-admission-overlap-policy-v1',
  method: 'prefix-filter-exact-jaccard-0.80-v1',
  maxUnitBytes: 33_554_432,
  maxShardBytes: 67_108_864,
  maxOpenFiles: 64,
  maxHeapBytes: 4_294_967_296,
  maxRssBytes: 6_442_450_944,
  maxWorkBytes: 214_748_364_800,
  maxWallMilliseconds: 86_400_000,
};
const policy: AdmissionOverlapPolicyV1 = { ...policyBase, policySha256: calibrationAdmissionOverlapPolicySha256(policyBase) };

function makeRecord(id: string, bytes: Uint8Array, side: 'ai_side' | 'human_side', normalizers: AdmissionNormalizerRegistryV1): AdmissionOverlapUniverseRecordV1 {
  const normalized = normalizeAdmissionBytes('TypeScript', bytes, normalizers);
  if (!normalized.ok) throw new Error('fixture normalization failed');
  const polarity = {
    intake: side === 'ai_side' ? 'declared_ai' as const : 'declared_human' as const,
    overlapSide: side,
    bindingAuthority: 'legacy-selected-inventory',
    bindingSha256: '',
  };
  const boundPolarity = { ...polarity, bindingSha256: calibrationAdmissionOverlapPolarityBindingSha256(polarity) };
  const base = {
    version: 'v10.3-overlap-universe-record-v1' as const,
    candidateUnitId: id,
    materialSourceId: `source-${id}`,
    aggregateSourceIds: [`source-${id}`],
    locator: { kind: 'local_inventory_file' as const, localSourceId: `source-${id}`, normalizedPath: `${id}.ts` },
    polarity: boundPolarity,
    contentSha256: sha256(bytes),
    contentBytes: bytes.byteLength,
    language: 'TypeScript',
    normalizerId: normalized.normalizerId,
    normalizationStatus: 'covered' as const,
    shingleSetSha256: normalized.shingleSetSha256,
    shingleCount: normalized.shingleCount,
  };
  return { ...base, recordSha256: calibrationAdmissionOverlapUniverseRecordSha256(base) };
}

function makeFixture(): { records: readonly AdmissionOverlapUniverseRecordV1[]; universe: AdmissionOverlapUniverseV1; normalizers: AdmissionNormalizerRegistryV1; bytes: Map<string, Uint8Array> } {
  const normalizers = registry();
  const bytes = new Map([
    ['unit-a', Buffer.from('a b c d e f g h i j', 'utf8')],
    ['unit-b', Buffer.from('a b c d e f g h i j', 'utf8')],
  ]);
  const records = [makeRecord('unit-a', bytes.get('unit-a')!, 'ai_side', normalizers), makeRecord('unit-b', bytes.get('unit-b')!, 'human_side', normalizers)];
  const jsonl = Buffer.from(records.map((record) => `${calibrationAdmissionCanonicalJson(record)}\n`).join(''), 'utf8');
  const base = {
    version: 'v10.3-admission-overlap-universe-v1' as const,
    registerSha256: 'a'.repeat(64),
    recordsJsonlSha256: sha256(jsonl),
    selectedAggregateCoverage: records.length,
    baselineMaterialUnits: records.length,
    repositoryMaterialUnits: 0,
    newCandidateUnits: 0,
    covered: records.length,
    unsupported: 0,
    unreadable: 0,
    unresolvedCandidateUnitIds: [],
    normalizerRegistrySha256: normalizers.registrySha256,
  };
  return { records, universe: { ...base, universeSha256: calibrationAdmissionOverlapUniverseSha256(base) }, normalizers, bytes };
}

async function* recordsStream(records: readonly AdmissionOverlapUniverseRecordV1[]): AsyncIterable<AdmissionOverlapUniverseRecordV1> {
  for (const record of records) yield record;
}

describe('Task 2A overlap checkpoint/resume', () => {
  it('persists one hash-bound checkpoint for each completed overlap phase', async () => {
    const fixture = makeFixture();
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-checkpoint-'));
    try {
      const result = await buildAdmissionOverlapLedger(
        fixture.universe,
        recordsStream(fixture.records),
        async (record) => fixture.bytes.get(record.candidateUnitId)!,
        root,
        policy,
        fixture.normalizers,
        { invocationIntentId: 'b'.repeat(64) } satisfies AdmissionOverlapBuildOptions,
      );
      expect(result.errors).toEqual([]);
      expect(result.resourceReceipt.coverageComplete).toBe(true);
      expect(result.resourceReceipt.withinAllLimits).toBe(true);
      expect(result.resourceReceipt.observed.maxWorkBytes).toBeLessThanOrEqual(result.resourceReceipt.configuredLimits.maxWorkBytes);
      expect(result.indexReceipt.checkpoints.map((checkpoint) => checkpoint.phase)).toEqual(['postings', 'candidate_pairs', 'exact_edges', 'clusters']);
      for (const checkpoint of result.indexReceipt.checkpoints) {
        expect(isCalibrationAdmissionOverlapCheckpointV1(checkpoint)).toBe(true);
        const bytes = await readFile(join(root, 'checkpoints', `${checkpoint.checkpointId}.json`));
        expect(JSON.parse(bytes.toString('utf8'))).toEqual(checkpoint);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('resumes a completed cluster checkpoint without reading the input stream or source bytes', async () => {
    const fixture = makeFixture();
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-resume-'));
    try {
      const options: AdmissionOverlapBuildOptions = { invocationIntentId: 'c'.repeat(64) };
      const first = await buildAdmissionOverlapLedger(fixture.universe, recordsStream(fixture.records), async (record) => fixture.bytes.get(record.candidateUnitId)!, root, policy, fixture.normalizers, options);
      const terminal = first.indexReceipt.checkpoints.at(-1)!;
      const resumed = await buildAdmissionOverlapLedger(
        fixture.universe,
        (async function* (): AsyncIterable<AdmissionOverlapUniverseRecordV1> { throw new Error('stream must not be consumed during terminal resume'); })(),
        async () => { throw new Error('bytes must not be resolved during terminal resume'); },
        root,
        policy,
        fixture.normalizers,
        { ...options, resumeFromCheckpoint: terminal },
      );
      expect(resumed.errors).toEqual([]);
      expect(resumed.ledger.ledgerSha256).toBe(first.ledger.ledgerSha256);
      expect(resumed.indexReceipt.receiptSha256).toBe(first.indexReceipt.receiptSha256);
      expect(resumed.resourceReceipt.receiptId).toBe(first.resourceReceipt.receiptId);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a checkpoint bound to a different invocation intent before reading inputs', async () => {
    const fixture = makeFixture();
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-checkpoint-mismatch-'));
    try {
      const first = await buildAdmissionOverlapLedger(fixture.universe, recordsStream(fixture.records), async (record) => fixture.bytes.get(record.candidateUnitId)!, root, policy, fixture.normalizers, { invocationIntentId: 'd'.repeat(64) });
      const terminal = first.indexReceipt.checkpoints.at(-1)!;
      await expect(buildAdmissionOverlapLedger(
        fixture.universe,
        (async function* (): AsyncIterable<AdmissionOverlapUniverseRecordV1> { throw new Error('stream must not be consumed after checkpoint mismatch'); })(),
        async () => { throw new Error('bytes must not be resolved after checkpoint mismatch'); },
        root,
        policy,
        fixture.normalizers,
        { invocationIntentId: 'e'.repeat(64), resumeFromCheckpoint: terminal },
      )).rejects.toThrow('checkpoint_invocation_intent_mismatch');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a sidecar whose receipt self-hash no longer matches the recovered result', async () => {
    const fixture = makeFixture();
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-resume-tamper-'));
    try {
      const options: AdmissionOverlapBuildOptions = { invocationIntentId: 'f'.repeat(64) };
      const first = await buildAdmissionOverlapLedger(
        fixture.universe,
        recordsStream(fixture.records),
        async (record) => fixture.bytes.get(record.candidateUnitId)!,
        root,
        policy,
        fixture.normalizers,
        options,
      );
      const terminal = first.indexReceipt.checkpoints.at(-1)!;
      const sidecarPath = join(root, 'checkpoints', 'result.json');
      const sidecar = JSON.parse((await readFile(sidecarPath)).toString('utf8')) as {
        result: { ledger: { coverageComplete: boolean } };
      };
      sidecar.result.ledger.coverageComplete = !sidecar.result.ledger.coverageComplete;
      await writeFile(sidecarPath, `${calibrationAdmissionCanonicalJson(sidecar)}\n`, 'utf8');

      await expect(buildAdmissionOverlapLedger(
        fixture.universe,
        (async function* (): AsyncIterable<AdmissionOverlapUniverseRecordV1> { throw new Error('stream must not be consumed after sidecar tamper'); })(),
        async () => { throw new Error('bytes must not be resolved after sidecar tamper'); },
        root,
        policy,
        fixture.normalizers,
        { ...options, resumeFromCheckpoint: terminal },
      )).rejects.toThrow('checkpoint_result_invalid');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a substituted sidecar symlink during terminal recovery', async () => {
    const fixture = makeFixture();
    const root = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-resume-symlink-'));
    try {
      const options: AdmissionOverlapBuildOptions = { invocationIntentId: 'a'.repeat(64) };
      const first = await buildAdmissionOverlapLedger(
        fixture.universe,
        recordsStream(fixture.records),
        async (record) => fixture.bytes.get(record.candidateUnitId)!,
        root,
        policy,
        fixture.normalizers,
        options,
      );
      const terminal = first.indexReceipt.checkpoints.at(-1)!;
      const sidecarPath = join(root, 'checkpoints', 'result.json');
      const sidecarCopy = join(root, 'checkpoints', 'result-copy.json');
      await writeFile(sidecarCopy, await readFile(sidecarPath));
      await rm(sidecarPath);
      await symlink('result-copy.json', sidecarPath);

      await expect(buildAdmissionOverlapLedger(
        fixture.universe,
        (async function* (): AsyncIterable<AdmissionOverlapUniverseRecordV1> { throw new Error('stream must not be consumed after symlink substitution'); })(),
        async () => { throw new Error('bytes must not be resolved after symlink substitution'); },
        root,
        policy,
        fixture.normalizers,
        { ...options, resumeFromCheckpoint: terminal },
      )).rejects.toThrow('generation_local_symlink_component');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
