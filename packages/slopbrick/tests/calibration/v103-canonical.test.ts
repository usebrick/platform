import { describe, expect, it } from 'vitest';
import type {
  CalibrationCorpusRepository,
  ReleaseArchiveMaterialization,
} from '@usebrick/core';

import {
  canonicalCorpusManifestSha256,
  stableCalibrationFileId,
} from '../../src/calibration/v103/canonical';

const COMMIT_SHA = 'a'.repeat(40);
const ASSET_SHA256 = 'c'.repeat(64);

function releaseMaterialization(
  overrides: Partial<ReleaseArchiveMaterialization> = {},
): ReleaseArchiveMaterialization {
  return {
    kind: 'release_archive',
    assetUrl: 'https://example.test/releases/source.zip',
    assetSha256: ASSET_SHA256,
    assetBytes: 4096,
    archiveFormat: 'zip',
    rootPrefix: 'source-root',
    extractionPolicy: 'safe-zip-v1',
    ...overrides,
  };
}

function repository(
  overrides: Partial<CalibrationCorpusRepository> = {},
): CalibrationCorpusRepository {
  return {
    repositoryId: 'release-repo',
    familyId: 'release-family',
    originUrl: 'https://example.test/release-repo',
    commitSha: COMMIT_SHA,
    acquiredAt: '2026-07-10T00:00:00Z',
    license: 'MIT',
    materialization: releaseMaterialization(),
    ...overrides,
  };
}

function file(overrides: Partial<{
  repositoryId: string;
  familyId: string;
  normalizedPath: string;
}> = {}) {
  return {
    repositoryId: 'release-repo',
    familyId: 'release-family',
    normalizedPath: 'src/main.ts',
    ...overrides,
  };
}

describe('Task 2 release artifact identity', () => {
  it('preserves the frozen Git-only file ID exactly', () => {
    const gitRepository = {
      repositoryId: 'ai-repo',
      familyId: 'ai-family',
      commitSha: COMMIT_SHA,
    };

    expect(stableCalibrationFileId(
      file({ repositoryId: 'ai-repo', familyId: 'ai-family' }),
      [gitRepository],
    )).toBe('sbf_16358504671821d0e9643d831764052abd7cfadf3d1cc989074612cd94d64b58');
  });

  it('keeps archive file identity stable across URL-only metadata changes while the manifest hash changes', () => {
    const originalRepository = repository();
    const movedRepository = repository({
      materialization: releaseMaterialization({ assetUrl: 'https://mirror.example.test/source.zip' }),
    });
    const originalManifest = {
      version: 'v10.3',
      repositories: [originalRepository],
      files: [{ sourceId: 'release-source' }],
    };
    const movedManifest = {
      ...originalManifest,
      repositories: [movedRepository],
    };

    expect(stableCalibrationFileId(file(), [movedRepository])).toBe(
      stableCalibrationFileId(file(), [originalRepository]),
    );
    expect(canonicalCorpusManifestSha256(movedManifest)).not.toBe(
      canonicalCorpusManifestSha256(originalManifest),
    );
  });

  it('changes file identity for every release materialization and source identity component', () => {
    const baseRepository = repository();
    const baseFile = file();
    const baseId = stableCalibrationFileId(baseFile, [baseRepository]);
    // Core currently admits one policy. Mutate a typed fixture at runtime to
    // prove a future policy version remains part of the stable identity.
    const changedPolicyMaterialization = releaseMaterialization();
    Object.defineProperty(changedPolicyMaterialization, 'extractionPolicy', {
      value: 'safe-zip-v2',
      enumerable: true,
    });
    const changedPolicy = repository({
      materialization: changedPolicyMaterialization,
    });
    const variants = [
      [file(), repository({ materialization: releaseMaterialization({ assetSha256: 'd'.repeat(64) }) })],
      [file(), changedPolicy],
      [file(), repository({ materialization: releaseMaterialization({ rootPrefix: 'other-root' }) })],
      [file(), repository({ commitSha: 'b'.repeat(40) })],
      [file({ repositoryId: 'other-repo' }), repository({ repositoryId: 'other-repo' })],
      [file({ familyId: 'other-family' }), repository({ familyId: 'other-family' })],
      [file({ normalizedPath: 'src/other.ts' }), repository()],
    ] as const;

    expect(variants.map(([candidateFile, candidateRepository]) => (
      stableCalibrationFileId(candidateFile, [candidateRepository])
    ))).toHaveLength(7);
    for (const [candidateFile, candidateRepository] of variants) {
      expect(stableCalibrationFileId(candidateFile, [candidateRepository])).not.toBe(baseId);
    }
  });

  it('does not bind URL, archive byte count, or acquisition metadata into file identity', () => {
    const baseId = stableCalibrationFileId(file(), [repository()]);
    const metadataOnly = repository({
      acquiredAt: '2026-07-11T00:00:00Z',
      materialization: releaseMaterialization({
        assetUrl: 'https://mirror.example.test/source.zip',
        assetBytes: 8192,
      }),
    });

    expect(stableCalibrationFileId(file(), [metadataOnly])).toBe(baseId);
  });
});
