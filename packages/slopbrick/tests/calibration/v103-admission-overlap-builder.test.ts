import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionNormalizerRegistrySha256,
  calibrationAdmissionOverlapPolarityBindingSha256,
  calibrationAdmissionOverlapPolicySha256,
  calibrationAdmissionOverlapUniverseRecordSha256,
  calibrationAdmissionOverlapUniverseSha256,
  isCalibrationAdmissionOverlapLedgerV1,
  type AdmissionNormalizerRegistryV1,
  type AdmissionOverlapPolicyV1,
  type AdmissionOverlapUniverseRecordV1,
  type AdmissionOverlapUniverseV1,
} from '@usebrick/core';

import {
  ADMISSION_LEXICAL_RUNTIME_BINDINGS,
  normalizeAdmissionBytes,
} from '../../src/calibration/v103/admission-normalizers';
import { buildAdmissionOverlapLedger } from '../../src/calibration/v103/admission-overlap';

const fixtureRoot = fileURLToPath(new URL('../../../core/tests/fixtures/schema/valid', import.meta.url));
function fixture<T>(name: string): T { return JSON.parse(readFileSync(join(fixtureRoot, `${name}.valid.json`), 'utf8')) as T; }
function sha256(value: Uint8Array | string): string { return createHash('sha256').update(value).digest('hex'); }

function boundRegistry(): AdmissionNormalizerRegistryV1 {
  const source = fixture<Record<string, unknown>>('calibration-admission-normalizer-registry');
  const entry = (source.entries as Array<Record<string, unknown>>)[0]!;
  const runtime = ADMISSION_LEXICAL_RUNTIME_BINDINGS[0]!;
  const value = {
    ...source,
    entries: [{ ...entry, implementationSha256: runtime.implementationSha256, fixturesSha256: runtime.fixturesSha256 }],
  };
  return { ...value, registrySha256: calibrationAdmissionNormalizerRegistrySha256(value) } as AdmissionNormalizerRegistryV1;
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

function record(
  candidateUnitId: string,
  bytes: Uint8Array,
  overlapSide: 'ai_side' | 'human_side' | 'unassigned',
  registry: AdmissionNormalizerRegistryV1,
  language = 'TypeScript',
  statusOverride?: 'unsupported' | 'unreadable',
): AdmissionOverlapUniverseRecordV1 {
  const normalized = normalizeAdmissionBytes(language, bytes, registry);
  const status = statusOverride ?? (normalized.ok ? 'covered' : normalized.status);
  const normalizerId = normalized.normalizerId;
  const base: Record<string, unknown> = {
    version: 'v10.3-overlap-universe-record-v1',
    candidateUnitId,
    materialSourceId: `source-${candidateUnitId}`,
    aggregateSourceIds: [`source-${candidateUnitId}`],
    locator: { kind: 'local_inventory_file', localSourceId: `source-${candidateUnitId}`, normalizedPath: `${candidateUnitId}.ts` },
    polarity: {
      intake: overlapSide === 'ai_side' ? 'declared_ai' : overlapSide === 'human_side' ? 'declared_human' : 'unassigned',
      overlapSide,
      bindingAuthority: 'legacy-selected-inventory',
      bindingSha256: '',
    },
    contentSha256: sha256(bytes),
    contentBytes: bytes.byteLength,
    language,
    normalizerId,
    normalizationStatus: status,
  };
  base.polarity = { ...(base.polarity as Record<string, unknown>), bindingSha256: calibrationAdmissionOverlapPolarityBindingSha256(base.polarity) };
  if (status === 'covered' && normalized.ok) {
    base.shingleSetSha256 = normalized.shingleSetSha256;
    base.shingleCount = normalized.shingleCount;
  }
  return { ...base, recordSha256: calibrationAdmissionOverlapUniverseRecordSha256(base) } as AdmissionOverlapUniverseRecordV1;
}

function universe(records: readonly AdmissionOverlapUniverseRecordV1[], registry: AdmissionNormalizerRegistryV1): AdmissionOverlapUniverseV1 {
  const jsonl = Buffer.from(records.map((entry) => `${calibrationAdmissionCanonicalJson(entry)}\n`).join(''), 'utf8');
  const covered = records.filter((entry) => entry.normalizationStatus === 'covered').length;
  const unsupported = records.filter((entry) => entry.normalizationStatus === 'unsupported').length;
  const unreadable = records.filter((entry) => entry.normalizationStatus === 'unreadable').length;
  const base = {
    version: 'v10.3-admission-overlap-universe-v1' as const,
    registerSha256: 'a'.repeat(64),
    recordsJsonlSha256: sha256(jsonl),
    selectedAggregateCoverage: records.length,
    baselineMaterialUnits: records.length,
    repositoryMaterialUnits: 0,
    newCandidateUnits: 0,
    covered,
    unsupported,
    unreadable,
    unresolvedCandidateUnitIds: records.filter((entry) => entry.normalizationStatus !== 'covered').map((entry) => entry.candidateUnitId),
    normalizerRegistrySha256: registry.registrySha256,
  };
  return { ...base, universeSha256: calibrationAdmissionOverlapUniverseSha256(base) };
}

async function* recordsStream(records: readonly AdmissionOverlapUniverseRecordV1[]): AsyncIterable<AdmissionOverlapUniverseRecordV1> {
  for (const entry of records) yield entry;
}

async function shardRows(root: string, relativePath: string): Promise<Record<string, unknown>[]> {
  const text = await readFile(join(root, relativePath), 'utf8');
  return text.trim().length === 0 ? [] : text.trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('Task 2A bounded overlap builder', () => {
  it('builds exact and near edges with symmetric adjacency and bounded clusters', async () => {
    const registry = boundRegistry();
    const bytes = new Map<string, Uint8Array>([
      ['unit-a', Buffer.from('a b c d e f g h i j', 'utf8')],
      ['unit-b', Buffer.from('a b c d e f g h i j', 'utf8')],
      ['unit-c', Buffer.from('a b c d e f g h i j k', 'utf8')],
    ]);
    const records = [
      record('unit-a', bytes.get('unit-a')!, 'ai_side', registry),
      record('unit-b', bytes.get('unit-b')!, 'human_side', registry),
      record('unit-c', bytes.get('unit-c')!, 'human_side', registry),
    ];
    const summary = universe(records, registry);
    const work = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-'));
    try {
      const result = await buildAdmissionOverlapLedger(summary, recordsStream(records), async (entry) => bytes.get(entry.candidateUnitId)!, work, policy);
      expect(result.errors).toEqual([]);
      expect(result.resourceReceipt.coverageComplete).toBe(true);
      expect(result.resourceReceipt.withinAllLimits).toBe(true);
      expect(isCalibrationAdmissionOverlapLedgerV1(result.ledger)).toBe(true);
      expect(result.ledger.coverageComplete).toBe(true);
      expect(result.ledger.edgeCount).toBe(3);
      expect(result.ledger.adjacencyRowCount).toBe(6);
      expect(result.ledger.crossSideEdgeCount).toBe(2);
      const edges = (await Promise.all(result.ledger.edgeShards.map((shard) => shardRows(work, shard.relativePath)))).flat();
      expect(edges.map((edge) => edge.kind).sort()).toEqual(['exact', 'near', 'near']);
      const adjacency = (await Promise.all(result.ledger.adjacencyShards.map((shard) => shardRows(work, shard.relativePath)))).flat();
      expect(adjacency).toHaveLength(6);
      expect(new Set(adjacency.map((row) => `${row.candidateUnitId}:${row.neighborCandidateUnitId}`)).size).toBe(6);
      const summaries = (await Promise.all(result.ledger.clusterSummaryShards.map((shard) => shardRows(work, shard.relativePath)))).flat();
      expect(summaries).toHaveLength(3);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it('returns an incomplete receipt for unsupported or unreadable rows without claiming coverage', async () => {
    const registry = boundRegistry();
    const bytes = new Map<string, Uint8Array>([
      ['unit-a', new Uint8Array([0xff, 0xfe])],
      ['unit-b', Buffer.from('print(1)', 'utf8')],
    ]);
    const records = [
      record('unit-a', bytes.get('unit-a')!, 'ai_side', registry, 'TypeScript', 'unreadable'),
      record('unit-b', bytes.get('unit-b')!, 'human_side', registry, 'Python', 'unsupported'),
    ];
    const summary = universe(records, registry);
    const work = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-incomplete-'));
    try {
      const result = await buildAdmissionOverlapLedger(summary, recordsStream(records), async (entry) => bytes.get(entry.candidateUnitId)!, work, policy, registry);
      expect(result.resourceReceipt.coverageComplete).toBe(false);
      expect(result.ledger.coverageComplete).toBe(false);
      expect(result.ledger.unresolvedCandidateUnitIds).toEqual(['unit-a', 'unit-b']);
      expect(result.errors).toEqual([]);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it('rejects a substituted canonical row even when IDs and status counts still match', async () => {
    const registry = boundRegistry();
    const originalBytes = Buffer.from('a b c d e f g h i j', 'utf8');
    const replacementBytes = Buffer.from('a b c d e f g h i z', 'utf8');
    const original = record('unit-a', originalBytes, 'ai_side', registry);
    const replacement = record('unit-a', replacementBytes, 'ai_side', registry);
    const peer = record('unit-b', originalBytes, 'human_side', registry);
    const summary = universe([original, peer], registry);
    const work = await mkdtemp(join(tmpdir(), 'slopbrick-overlap-substitution-'));
    try {
      const result = await buildAdmissionOverlapLedger(
        summary,
        recordsStream([replacement, peer]),
        async (entry) => entry.candidateUnitId === 'unit-a' ? replacementBytes : originalBytes,
        work,
        policy,
        registry,
      );
      expect(result.resourceReceipt.coverageComplete).toBe(false);
      expect(result.ledger.coverageComplete).toBe(false);
      expect(result.errors).toContain('records_jsonl_hash_mismatch');
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });
});
