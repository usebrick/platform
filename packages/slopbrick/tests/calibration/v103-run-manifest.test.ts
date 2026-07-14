import { describe, expect, it } from 'vitest';
import { createV103RunManifest, verifyV103RunInputs } from '../../src/calibration/v103/run-manifest';

const sha = (character: string) => character.repeat(64);

describe('v10.3 run-manifest integration', () => {
  it('creates a path-free canonical run manifest and validates its separate checkout map hash', () => {
    const checkoutMap = { version: 'v10.3', runId: 'smoke-001', entries: [
      { repositoryId: 'ai-repo', commitSha: 'a'.repeat(40), checkoutPath: '/private/corpus/ai-repo' },
      { repositoryId: 'human-repo', commitSha: 'b'.repeat(40), checkoutPath: '/private/corpus/human-repo' },
    ] };
    const run = createV103RunManifest({
      runId: 'smoke-001', createdAt: '2026-07-10T00:00:00Z', git: { sha: 'c'.repeat(40), dirty: false }, package: { name: 'slopbrick', version: '0.44.0' }, runtime: { node: 'v22.16.0', pnpm: '10.12.1', platform: 'darwin', arch: 'arm64' }, schemaVersion: 'v10.3', methodVersion: 'v10.3.0',
      inputHashes: { registrySha256: sha('1'), signalTableSha256: sha('2'), configSha256: sha('3'), corpusManifestSha256: sha('4'), selectionSha256: sha('5') },
      selection: { seed: 'smoke-seed', policy: { eligibleLabels: ['verified_ai', 'verified_human'], eligibleTiers: ['gold'], eligibleStrata: ['production'], maxPerStratum: 50 } },
      expected: { fileIdsByPolarity: { verified_ai: ['sbf_a'], verified_human: ['sbf_b'] }, chunkIdsByPolarity: { verified_ai: ['chunk-ai-001'], verified_human: ['chunk-human-001'] } },
      settings: { includeRuleIds: ['ai/comment-ratio'], excludeRuleIds: [], maxFileBytes: 1_000_000, chunkSize: 50, chunkTimeoutMs: 120_000, retryTimeoutMs: 240_000, workerCount: 2 }, commandArgs: ['cal:scan', '--run', 'smoke-001'],
    }, checkoutMap);
    expect(JSON.stringify(run)).not.toContain('/private/corpus');
    expect(verifyV103RunInputs(run, checkoutMap)).toEqual({ ok: true });
    expect(verifyV103RunInputs(run, { ...checkoutMap, entries: [{ ...checkoutMap.entries[0]!, checkoutPath: '/different/checkout' }, checkoutMap.entries[1]!] })).toMatchObject({ ok: false });
  });

  it('freezes release materialization bindings through the complete checkout-map hash', () => {
    const checkoutMap = { version: 'v10.3' as const, runId: 'release-run', entries: [
      {
        repositoryId: 'release-repo', commitSha: 'a'.repeat(40), checkoutPath: '/private/corpus/release-repo',
        materialization: { kind: 'release_archive' as const, assetSha256: 'b'.repeat(64), extractionPolicy: 'safe-zip-v1' as const },
      },
    ] };
    const run = createV103RunManifest({
      runId: 'release-run', createdAt: '2026-07-10T00:00:00Z', git: { sha: 'c'.repeat(40), dirty: false }, package: { name: 'slopbrick', version: '0.44.0' }, runtime: { node: 'v22.16.0', pnpm: '10.12.1', platform: 'darwin', arch: 'arm64' }, schemaVersion: 'v10.3', methodVersion: 'v10.3.1',
      inputHashes: { registrySha256: sha('1'), signalTableSha256: sha('2'), configSha256: sha('3'), corpusManifestSha256: sha('4'), selectionSha256: sha('5') },
      selection: { seed: 'release-seed', policy: { eligibleLabels: ['verified_ai'], eligibleTiers: ['gold'], eligibleStrata: ['production'], maxPerStratum: 1 } },
      expected: { fileIdsByPolarity: { verified_ai: ['sbf_a'], verified_human: ['sbf_b'] }, chunkIdsByPolarity: { verified_ai: ['chunk-ai'], verified_human: ['chunk-human'] } },
      settings: { includeRuleIds: [], excludeRuleIds: [], maxFileBytes: 1_000_000, chunkSize: 1, chunkTimeoutMs: 1_000, retryTimeoutMs: 2_000, workerCount: 1 }, commandArgs: ['cal:scan', '--run=release-run'],
    }, checkoutMap);
    expect(verifyV103RunInputs(run, checkoutMap)).toEqual({ ok: true });
    expect(verifyV103RunInputs(run, { ...checkoutMap, entries: [{ ...checkoutMap.entries[0]!, materialization: { ...checkoutMap.entries[0]!.materialization, assetSha256: 'd'.repeat(64) } }] })).toMatchObject({ ok: false });
    expect(verifyV103RunInputs(run, { ...checkoutMap, entries: [{ ...checkoutMap.entries[0]!, materialization: { ...checkoutMap.entries[0]!.materialization, extractionPolicy: 'safe-zip-v1' } }] })).toEqual({ ok: true });
  });
});
