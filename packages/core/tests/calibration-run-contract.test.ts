import { describe, expect, it } from 'vitest';
import {
  calibrationCheckoutMapSha256,
  isCalibrationCheckoutMapV103,
  isCalibrationRunManifestV103,
} from '../src/calibration-run';

const sha = (character: string) => character.repeat(64);

function checkoutMap() {
  return {
    version: 'v10.3', runId: 'smoke-001',
    entries: [
      { repositoryId: 'ai-repo', commitSha: 'a'.repeat(40), checkoutPath: '/private/corpus/ai-repo' },
      { repositoryId: 'human-repo', commitSha: 'b'.repeat(40), checkoutPath: '/private/corpus/human-repo' },
    ],
  };
}

function runManifest() {
  return {
    version: 'v10.3', runId: 'smoke-001', createdAt: '2026-07-10T00:00:00Z',
    git: { sha: 'c'.repeat(40), dirty: false }, package: { name: 'slopbrick', version: '0.44.0' },
    runtime: { node: 'v22.16.0', pnpm: '10.12.1', platform: 'darwin', arch: 'arm64' }, schemaVersion: 'v10.3', methodVersion: 'v10.3.0',
    inputHashes: { registrySha256: sha('1'), signalTableSha256: sha('2'), configSha256: sha('3'), corpusManifestSha256: sha('4'), selectionSha256: sha('5'), checkoutMapSha256: calibrationCheckoutMapSha256(checkoutMap()) },
    selection: { seed: 'smoke-seed', policy: { eligibleLabels: ['verified_ai', 'verified_human'], eligibleTiers: ['gold'], eligibleStrata: ['production'], maxPerStratum: 50 } },
    expected: { fileIdsByPolarity: { verified_ai: ['sbf_a'], verified_human: ['sbf_b'] }, chunkIdsByPolarity: { verified_ai: ['chunk-ai-001'], verified_human: ['chunk-human-001'] } },
    settings: { includeRuleIds: ['ai/comment-ratio'], excludeRuleIds: [], maxFileBytes: 1_000_000, chunkSize: 50, chunkTimeoutMs: 120_000, retryTimeoutMs: 240_000, workerCount: 2 },
    commandArgs: ['cal:scan', '--run', 'smoke-001'],
  };
}

describe('v10.3 calibration run and checkout-map contracts', () => {
  it('accepts a complete path-free run manifest and local-only checkout map', () => {
    expect(isCalibrationCheckoutMapV103(checkoutMap())).toBe(true);
    expect(isCalibrationRunManifestV103(runManifest())).toBe(true);
    expect(JSON.stringify(runManifest())).not.toContain('/private/corpus');
  });

  it('rejects canonical path leaks, duplicate checkouts, and overlapping filters', () => {
    const withPath = runManifest() as Record<string, unknown>;
    withPath.checkoutPath = '/private/corpus/leak';
    expect(isCalibrationRunManifestV103(withPath)).toBe(false);
    const duplicate = checkoutMap(); duplicate.entries.push({ ...duplicate.entries[0]! });
    expect(isCalibrationCheckoutMapV103(duplicate)).toBe(false);
    const overlap = runManifest(); (overlap.settings.excludeRuleIds as string[]) = ['ai/comment-ratio'];
    expect(isCalibrationRunManifestV103(overlap)).toBe(false);
  });

  it.each([
    '--out=/private/corpus/output',
    'file:///private/corpus/output',
    '{"out":"/private/corpus/output"}',
    '--out=C:\\private\\corpus\\output',
  ])('rejects absolute paths embedded in canonical command arguments: %s', (argument) => {
    const run = runManifest();
    run.commandArgs = ['cal:scan', argument];
    expect(isCalibrationRunManifestV103(run)).toBe(false);
  });

  it('rejects expected file or chunk identities that cross polarity', () => {
    const fileLeak = runManifest();
    fileLeak.expected.fileIdsByPolarity.verified_human = ['sbf_a'];
    expect(isCalibrationRunManifestV103(fileLeak)).toBe(false);
    const chunkLeak = runManifest();
    chunkLeak.expected.chunkIdsByPolarity.verified_human = ['chunk-ai-001'];
    expect(isCalibrationRunManifestV103(chunkLeak)).toBe(false);
  });

  it('rejects embedded absolute paths in any canonical run field', () => {
    const run = runManifest();
    run.runtime.platform = 'metadata=/private/corpus';
    expect(isCalibrationRunManifestV103(run)).toBe(false);
  });
});
